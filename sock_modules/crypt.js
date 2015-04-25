/*jslint node: true, indent: 4, regexp: true */
/* vim: set ts=4 et: */

/**
 * Crypt module. Encrypts or decrypts posts based on user commands, or
 * randomly.
 *
 * The crypt module mainly works with encryption functions, which are
 * commonly defined inline and wrapped with cryptCmd() to turn them into
 * SockBot command handlers.
 *
 * Encryption functions have the following arguments:
 * @param {String} s - The text to encrypt
 * @param {Object} payload - The command arguments and other properties
 * @param {function} callback - The callback to notify when processing is
 *                              complete.
 *
 * The continuation callback passed to an encryption function has the
 * following arguments:
 * @param {String} err - An error message if encryption failed
 * @param {String} msg - The encrypted text
 * @param {String} log - The entry to append to the post's processing log
 *
 * @module crypt
 * @author PleegWat
 */
'use strict';
var discourse;

/**
 * Description, for help text.
 * @type {String}
 */
exports.description = 'Encryptor';

/**
 * The config for the module
 * @type {Object}
 */
exports.configuration = {
    /**
     * Should the module be enabled?
     * @type {Boolean}
     */
    enabled: false
};

/**
 * The name of this sock module
 * @type {String}
 */
exports.name = 'Crypt';

/**
 * The priority of the sock module
 * @type {Number}
 */
exports.priority = undefined;

/**
 * The version of this module
 * @type {String}
 */
exports.version = '0.1.0';

/**
 * Each command is an encryption mechanism and has the following properties:
 * - handler:        A SockBot command handler, likely from cryptCmd()
 * - defaults:       Default values of parameters
 * - params:         Named parameters for this function
 * - randomPickable: If true, random encryption can select this function.
 *                   NOTE: random currently does not support parameters.
 * - description:    A description of this function for the help
 *
 * @type {Object}
 */
exports.commands = {
    /**
     * ROT13 "encryption"
     * @type {Object}
     */
    rot13: {
        handler: cryptCmd(function(s, payload, callback) {
            callback(null,
                s.replace( /[A-Za-z]/g, function(c) {
                    return String.fromCharCode(c.charCodeAt(0)
                        + (c.toUpperCase() <= 'M' ? 13 : -13 ));
                })
            );
        }),
        defaults: {},
        params: [],
        randomPickable: true,
        description: 'Rot13 encoding.'
    },
    /**
     * Reverse the string
     * @type {Object}
     */
    reverse: {
        handler: cryptCmd(function(s, payload, callback) {
            callback(null, s.split('').reverse().join(''));
        }),
        defaults: {},
        params: [],
        randomPickable: true,
        description: 'Reverse input.'
    },
    /**
     * XOR with block chaining
     * @type {Object}
     */
    xorbc: {
        handler: cryptCmd(xorbc(false)),
        defaults: {key: '42', iv: false},
        params: ['[key', '[iv'],
        description: 'XOR with block chaining.'
    },
    /**
     * Reverse XOR with block chaining
     * @type {Object}
     */
    rxorbc: {
        handler: cryptCmd(xorbc(true)),
        defaults: {key: '42', iv: false},
        params: ['[key', '[iv'],
        description: 'reverse XOR with block chaining.'
    },
    /**
     * Random other command
     * @type {Object}
     */
    random: {
        handler: function(payload, callback) {
            var keys = Object.keys(exports.commands).filter(function(k) {
                return exports.commands[k].randomPickable;
            });
            var id = Math.floor(keys.length * Math.random());
            payload.$command = 'random:' + keys[id];
            exports.commands[keys[id]].handler(payload, callback);
        },
        defaults: {},
        params: [],
        description: 'Random encryption.'
    }
};

/**
 * Helper to chain encryptions
 * @param  {function} handler - An encryption function
 * @return {function} A SockBot command handler which updates the current draft.
 */
function cryptCmd(handler) {
    return function(payload, callback) {
        discourse.log('Encrypt ' + (payload.$draft ? 'draft' : 'post')
                + ' with ' + payload.$command);
        handler(payload.$draft || payload.$post.cleaned,
                payload,
                function(err, msg, log) {
                    callback(err, {
                        replaceMsg: true,
                        msg: msg,
                        log: [log || payload.$command]
                    });
                });
    };
}

/**
 * xorbc implementation. Homegrown and weak as shit but who cares
 * @param  {boolean} decrypt - Whether to use the encrypt or decrypt version of
 *                             the algorithm.
 * @return {function} An encryption function
 */
function xorbc(decrypt) {
    return function(s, payload, callback) {
        /* Key is always passed as argument. */
        var key = toCharCodes(payload.key);
        /* IV is passed, or zero */
        var iv = payload.iv ? toCharCodes(payload.iv) : zeroArray(key.length);
        if (key.length !== iv.length) {
            return callback('Key and IV must be the same length');
        }
        var log = payload.$command + '(key: ' + JSON.stringify(key)
                + ', iv: ' + JSON.stringify(iv) + ')';
        callback(null,
            toCharCodes(s).map( function(c, i) {
                /* Calculate key for this byte */
                var o = i % key.length,
                    k = key[o] ^ iv[o];
                /* Next block IV is this block's plaintext */
                if (decrypt) {
                    iv[o] = c ^ k;
                    return iv[o];
                } else {
                    iv[o] = c;
                    return iv[o] ^ k;
                }
            }).map( function(c) {
                return String.fromCharCode(c);
            }).join(''),
            log
        );
    };
}

/**
 * Convert string to array of character codes
 * @param  {string} s - The string
 * @return {Array} an array of character codes
 */
function toCharCodes(s) {
    return s.split('').map(function(c) {
        return c.charCodeAt(0);
    });
}

/**
 * Create array with constant value
 * @param  {Number} l - The length of the array to make
 * @return {Array} an array of all 0s
 */
function zeroArray(l) {
    var a = [];
    for (var i = 0; i < l; i++) {
        a.push(0);
    }
    return a;
}

/**
 * Use a random encryption when PMed/mentioned/replied without command
 * @param {string} type - The type of event. Only responds if this is
 *                        'private_message', 'mentioned', or 'replied'.
 * @param {string} notification - The notification to respond to
 * @param {string} topic - Unused.
 * @param {string} post - The post the notification was for
 * @param {function} callback - The callback to notify when processing is
 *                              complete.
 */
exports.onNotify = function (type, notification, topic, post, callback) {
    if (!post || !post.cleaned ||
        ['private_message', 'mentioned', 'replied'].indexOf(type) === -1) {
        return callback();
    }
    discourse.log('Randomly encrypting post');

    exports.commands.random.handler({
        $post: post,
        $type: type,
        $command: 'random'
    }, function(_, msg) {
        var text = msg.msg + '\n\n<small>Filed under: ' + msg.log.join(' → ');
        discourse.createPost(notification.topic_id,
            notification.post_number, text, function() {
                callback(true);
            });
    });
};


/**
 * Bootstrap the module
 * @param  {string} browser - discourse.
 * @param  {object} config - The configuration to use
 */
exports.begin = function begin(browser) {
    discourse = browser;
};
