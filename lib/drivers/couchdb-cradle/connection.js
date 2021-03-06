/*!
 * Module dependencies.
 */

var MongooseConnection = require('../../connection')
    , cradle = require('cradle');

/**
 * A [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) connection implementation.
 *
 * @inherits Connection
 * @api private
 */

function CradleConnection() {
  MongooseConnection.apply(this, arguments);
};

/*!
 * Inherits from Connection.
 */

CradleConnection.prototype.__proto__ = MongooseConnection.prototype;

/**
 * Opens the connection to MongoDB.
 *
 * @param {Function} fn
 * @return {Connection} this
 * @api private
 */

CradleConnection.prototype.doOpen = function (fn) {
  var server = new (Function.prototype.bind.apply(cradle.Connection, Array.prototype.concat.apply([null], this.connectionOpts)));
  this.db = server;
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

CradleConnection.prototype.doClose = function (fn) {
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

module.exports = CradleConnection;
