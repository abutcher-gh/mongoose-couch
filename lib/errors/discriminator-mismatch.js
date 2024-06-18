/*!
 * Module dependencies.
 */

var MongooseError = require('../error');

/**
 * DiscriminatorMismatch Error constructor.
 *
 * @param {String} expected
 * @param {String} actual
 * @inherits MongooseError
 * @api private
 */

function DiscriminatorMismatch (expected, actual) {
  MongooseError.call(this, 'Unexpected type ' + actual + '; expecting ' + expected);
  Error.captureStackTrace(this, arguments.callee);
  this.name = 'DiscriminatorMismatch';
  this.expected = expected;
  this.actual = actual;
};

/*!
 * Inherits from MongooseError.
 */

DiscriminatorMismatch.prototype.__proto__ = MongooseError.prototype;

/*!
 * exports
 */

module.exports = DiscriminatorMismatch;
