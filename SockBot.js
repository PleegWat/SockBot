/*jslint node: true, indent: 4 */
(function () {
    'use strict';
    var fs = require('fs'),
        async = require('async'),
        config = require('./configuration');
    var browser,
        notifications,
        sockModules = [];

    async.waterfall([

        function (cb) {
            fs.readdir('./sock_modules/', cb);
        },
        function (files, cb) {
            files.filter(function (name) {
                return name[0] !== '.' && /[.]js$/.test(name);
            }).forEach(function (name) {
                var module = require('./sock_modules/' + name);
                if (isNaN(module.priority)) {
                    module.priority = 50;
                }
                if ((!module.configuration || module.configuration.enabled) &&
                    module.name !== 'NotifyPrint') {
                    console.warn('Ingoring module: `' + (module.name || name) +
                        '` Does not default to disabled');
                } else {
                    sockModules.push(module);
                    console.log('Loaded module: ' +
                        module.name + ' v' + module.version);
                }
            });
            sockModules.sort(function (a, b) {
                return a.priority - b.priority;
            });
            cb();
        },
        function (cb) {
            config = config.loadConfiguration(sockModules, process.argv[2]);
            browser = require('./discourse');
            notifications = require('./notifications');
            sockModules = sockModules.filter(function (module) {
                return config.modules[module.name].enabled;
            });
            cb();
        },
        function (cb) {
            browser.begin(function () {
                cb();
            });
        },
        function (cb) {
            if (!config.user) {
                // login failed. what can we do?
                throw 'Login failed';
            }
            console.log('Logged in as: ' + config.user.username);
            sockModules.forEach(function (module) {
                if (typeof module.begin !== 'function') {
                    return;
                }
                console.log('Starting module: ' + module.name);
                module.begin(browser, config);
            });
            notifications.begin(sockModules);
            cb();
        }
    ]);
}());
