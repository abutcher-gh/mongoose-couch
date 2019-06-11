/*!
 * Module dependencies.
 */

var MongooseConnection = require('../../connection')

/**
 * A [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) connection implementation.
 *
 * @inherits Connection
 * @api private
 */

function FlatFileConnection() {
  MongooseConnection.apply(this, arguments);
};

/*!
 * Inherits from Connection.
 */

FlatFileConnection.prototype.__proto__ = MongooseConnection.prototype;

/**
 * Opens the connection to MongoDB.
 *
 * @param {Function} fn
 * @return {Connection} this
 * @api private
 */

FlatFileConnection.prototype.doOpen = function (fn) {
  [this.db] = this.connectionOpts;
  fn();

  return this;
};

/**
 * Closes the connection
 *
 * @param {Function} fn
 * @return {Connection} this
 * @api private
 */

FlatFileConnection.prototype.doClose = function (fn) {
  this.collections = {};
  this.models = {};
  this.connectionOpts = null;
  this.name = null;
  delete(this.db);
  delete(this._events)

  fn && fn();
  return this;
}

/*!
 * Module exports.
 */

module.exports = FlatFileConnection;
