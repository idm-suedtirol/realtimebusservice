'use strict';

const raven = require('raven');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require("fs");

const logger = require('./logger');
const config = require('../config');

const HttpError = require("./HttpError");

if (!('toJSON' in Error.prototype)) {
    Object.defineProperty(Error.prototype, 'toJSON', {
        value: function () {
            let alt = {};

            Object.getOwnPropertyNames(this).forEach(function (key) {
                alt[key] = this[key];
            }, this);

            return alt;
        },
        configurable: true,
        writable: true
    });
}

Array.prototype.clear = function () {
    while (this.length) {
        this.pop();
    }
};


module.exports.pointFromGeoArray = function (jsonArray) {
    if (jsonArray.type === 'Point') {
        return `POINT(${jsonArray.coordinates[0]} ${jsonArray.coordinates[1]})`;
    } else {
        throw new Error(`Geometry type '${jsonArray.type}' is not supported.`);
    }
};

module.exports.sortObject = function (o) {
    let sorted = {}, key, a = [];

    for (key in o) {
        if (o.hasOwnProperty(key)) {
            a.push(key);
        }
    }

    a.sort();

    for (key = 0; key < a.length; key++) {
        sorted[a[key]] = o[a[key]];
    }

    return sorted;
};

module.exports.getZoneForLine = function (line) {
    return [
        1001, 1003, 1005, 1006, 1071, 1072, 1008, 1009, 1101, 1102, 1011,
        1012, 1014, 110, 111, 112, 116, 117, 1153, 183, 201, 202
    ].includes(line) ? 'BZ' : 'ME'
};


// =================================================== REQUESTS ========================================================

module.exports.getLanguage = function (req) {
    let lang = req.get("X-Language").substring(0, 2);

    if (lang !== 'it' && lang !== 'de' && lang !== 'en') {
        return config.lang_default;
    }

    return lang;
};


// ==================================================== ERRORS =========================================================

module.exports.startErrorReporting = function () {
    if (!config.enable_error_reporting) {
        logger.warn("Raven error reporting is disabled");
        return
    }

    try {
        raven.config('https://405c5b47fe2c4573949031e156954ed3:d701aea274ea4f8599cfa60b29b76185@sentry.io/192719').install();

        logger.warn("Enabled Raven error reporting");
    } catch (error) {
        logger.error("Failed to set up raven")
    }
};

module.exports.handleError = function (error) {
    if (!config.enable_error_reporting) {
        return;
    }

    raven.captureException(error);
};

module.exports.respondWithError = function (res, error) {

    if (error instanceof HttpError) {
        res.status(error.status).jsonp({success: false, error: error});

        if (error.message.startsWith("Parameter '")) {
            return;
        }

        exports.handleError(error);

        return;
    }

    exports.handleError(error);

    res.status(500).jsonp({success: false, error: error})
};


// ================================================== PARAMETERS =======================================================

module.exports.checkForParam = function (res, value, name) {
    if (exports.isEmpty(value)) {
        exports.respondWithError(res, new HttpError(`Required param '${name}' is missing`));
        return false;
    }

    return true;
};

module.exports.checkForParamThrows = function (value, name) {
    if (exports.isEmpty(value)) {
        throw new HttpError(`Required param '${name}' is missing`);
    }
};

module.exports.checkIfParamIsNumber = function (res, value, name) {
    if (!exports.isNumber(value)) {
        exports.respondWithError(res, new HttpError(`Parameter '${name}' must be of type 'number', was '${value}'`));
        return false;
    }

    return true;
};

module.exports.throwTypeError = function (name, type, value) {
    throw(`Parameter '${name}' must be of type '${type}', was '${value}'`)
};


// ================================================ TYPE VALIDATION ====================================================

module.exports.isEmpty = function (field) {
    // noinspection EqualityComparisonWithCoercionJS
    return field == null;
};

module.exports.isEmptyArray = function (array) {
    // noinspection EqualityComparisonWithCoercionJS
    return array == null || array.length === 0
};

module.exports.isEmptyString = function (field) {
    if (typeof field !== 'string') {
        return true;
    }

    return field.length === 0
};


module.exports.isNumber = function (toTest) {
    return !isNaN(parseFloat(toTest)) && isFinite(toTest);
};

module.exports.isArray = function (array) {
    // noinspection EqualityComparisonWithCoercionJS
    return array != null && Array.isArray(array)
};