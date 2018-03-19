const colors = require('colors');
const util = require('util');

const DEBUG = 10;
const INFO = 20;
const WARNING = 30;
const ERROR = 40;

let level = ERROR;

let _indent = 0;

function _log (lvl, stream, clr, pref, args) {
    if (lvl >= level) {
        let argStr = [];
        for (let arg of args) {
            if (typeof arg !== 'string') {
                arg = util.inspect(arg);
            }
            argStr.push(arg);
        }
        let indent = '';
        for (let i = 0; i < (_indent * 4); i++) {
            indent += ' ';
        }
        stream.write(`[${new Date().toISOString()}] ${clr(pref)} ${indent}${argStr.join(' ')}\n`);
    }
}

function debug (...args) {
    _log(DEBUG, process.stdout, colors.blue, 'DBG', args);
}

function info (...args) {
    _log(INFO, process.stdout, colors.cyan, 'INF', args);
}

function warning (...args) {
    _log(WARNING, process.stderr, colors.yellow, 'WRN', args);
}

function error (...args) {
    _log(ERROR, process.stderr, colors.red, 'ERR', args);
}

module.exports = {
    DEBUG: DEBUG,
    INFO: INFO,
    WARNING: WARNING,
    ERROR: ERROR,

    dbg: debug,
    debug: debug,
    inf: info,
    info: info,
    wrn: warning,
    warn: warning,
    wning: warning,
    warning: warning,
    err: error,
    error: error,

    setLevel: function (lvl) {
        level = lvl;
    },
    indent: function() {
        _indent++;
    },
    dedent: function() {
        _indent--;
    }
};
