/**
 * Abstract Collection constructor
 *
 * This is the base class that drivers inherit from and implement.
 *
 * @param {String} name name of the collection
 * @param {Connection} conn A MongooseConnection instance
 * @param {Object} opts optional collection options
 * @api public
 */

function Collection (name, conn, opts) {
  this.opts = opts;
  this.name = name;
  this.conn = conn;
  this.queue = [];
  this.buffer = opts.bufferCommands;
  this.ensuringDb = false;
  this.ensuringIndexes = 0;
};

/**
 * The collection name
 *
 * @api public
 * @property name
 */

Collection.prototype.name;

/**
 * The Connection instance
 *
 * @api public
 * @property conn
 */

Collection.prototype.conn;

/**
 * Called when the database connects
 *
 * @api private
 */

Collection.prototype.onOpen = function () {
  var self = this;
  this.buffer = false;
  this.ensuringDb = false;
  self.doQueue();
};

/**
 * Called when the database disconnects
 *
 * @api private
 */

Collection.prototype.onClose = function () {
  if (this.opts.bufferCommands) {
    this.buffer = true;
    this.ensuringDb = false;
  }
};

/**
 * Potentially queues a method for later execution when its database
 * connection opens.
 *
 * @param {Function|String} fn a function or method name to queue.
 * @param {Boolean} waitForIndexes queue if indexes are being created.
 * @param {Array} args arguments to pass to the method when executed.
 * @api private
 * @return {Boolean} true if the call was deferred, false if the
 * caller should execute it themselves.  See callOrDeferUntilOpen for
 * a public alternative.
 */

Collection.prototype.maybeQueueCall = function (fn, waitForIndexes, args) {
  if (this.buffer || (waitForIndexes && !!this.ensuringIndexes)) {
    if (typeof fn === 'string')
      fn = this[fn];
    this.queue.push([fn, waitForIndexes, args]);
    if (!this.ensuringDb) {
      this.ensuringDb = true;
      this.ensureDb(this.onOpen.bind(this));
    }
    return true;
  }
  return false;
};

/**
 * Calls a function or queues the call for later execution when its
 * database connection opens and indexes are created.
 *
 * @param {Function} fn(immediate) a function to call (immediate is
 * true if the call was not queued).
 * @param {Boolean} dontWaitForIndexes execute immediately even if
 * indexes are still being created.
 * @api public
 */

Collection.prototype.callOrDeferUntilOpen = function (fn, dontWaitForIndexes) {
  if (!this.maybeQueueCall(fn, !dontWaitForIndexes))
    fn.call(this, true);
};

/**
 * Executes all queued methods and clears the queue.
 *
 * @api private
 */

Collection.prototype.doQueue = function () {
  var indexing = !!this.ensuringIndexes;
  var queue = this.queue;
  this.queue = [];
  for (var i = 0, l = queue.length; i < l; i++){
    var e = queue[i];
    if (e[1] && indexing)
       this.queue.push(e);
    else
       e[0].apply(this, e[2]);
  }
  return this;
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.ensureIndex = function(index){
  throw new Error('Collection#ensureIndex unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.findAndModify = function(){
  throw new Error('Collection#findAndModify unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.findOne = function(){
  throw new Error('Collection#findOne unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.find = function(){
  throw new Error('Collection#find unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.insert = function(){
  throw new Error('Collection#insert unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.save = function(){
  throw new Error('Collection#save unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.update = function(){
  throw new Error('Collection#update unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.getIndexes = function(){
  throw new Error('Collection#getIndexes unimplemented by driver');
};

/**
 * Abstract method that drivers must implement.
 */

Collection.prototype.mapReduce = function(){
  throw new Error('Collection#mapReduce unimplemented by driver');
};

/*!
 * Module exports.
 */

module.exports = Collection;
