/*!
 * Module dependencies.
 */

var MongooseCollection = require('../../collection')
    , cradle = require('cradle')
    , utils = require('../../utils')

/**
 * A [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) collection implementation.
 *
 * All methods methods from the [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) driver are copied and wrapped in queue management.
 *
 * @inherits Collection
 * @api private
 */

function CradleCollection() {
  this.collection = null;
  MongooseCollection.apply(this, arguments);
}

/*!
 * Inherit from abstract Collection.
 */

CradleCollection.prototype.__proto__ = MongooseCollection.prototype;

/**
 * Called when the connection opens.
 *
 * @api private
 */

CradleCollection.prototype.onOpen = function (db) {
  if(this.conn && this.conn.db) {
    this.collection = db
  }
  MongooseCollection.prototype.onOpen.call(this);
};

/**
 * Called when the connection closes
 *
 * @api private
 */

CradleCollection.prototype.onClose = function () {
  MongooseCollection.prototype.onClose.call(this);
};

/**
 * Checks for db existence, creates if necessary.
 *
 * @api private
 */

CradleCollection.prototype.ensureDb = function(callback) {
  var self = this;
  var db = this.conn.db.database(self.name, {disableCache: this.opts.disableCache});
  db.exists(function(err, exists) {
    if(exists) return callback && callback(db);
    db.create(callback.bind(null, db));
  });
};

/**
 * Inserts a doc
 */

CradleCollection.prototype.insert = function (doc, opts, callback) {
  if (this.maybeQueueCall('insert', false, arguments))
    return;
  this.collection.save(doc, callback);
};

/**
 * inserts docs in bulk
 */

CradleCollection.prototype.bulkInsert = function (docs, callback) {
  if (this.maybeQueueCall('bulkInsert', false, arguments))
    return;
  //TODO:Test Case
  this.collection.save(docs, callback);
};

/**
 * removes a doc
 */

CradleCollection.prototype.remove = function (_id, _rev, callback) {
  if (this.maybeQueueCall('remove', false, arguments))
    return;
  this.collection.remove(_id, _rev, callback);
};

/**
 * removes docs in bulk
 */

CradleCollection.prototype.bulkRemove = function (docs, callback) {
  if (this.maybeQueueCall('bulkRemove', false, arguments))
    return;
  //TODO:Test Case
  docs.forEach(function (doc) {
    doc._deleted = true;
  });

  var self = this;
  self.collection.save(docs, function(err, res) {
     if (!err)
        res.forEach(function(doc) {
           if (doc.ok === true)
              self.collection.cache.purge(doc.key);
        });
     return callback(err, res);
  });
};

/**
 * Finds one doc using a view
 */

CradleCollection.prototype.findOneWithView = function (view, opts, callback) {
  if (this.maybeQueueCall('findOneWithView', true, arguments))
    return;
  //TODO:Test Case
  opts.limit = 1;
  this.collection.view(view, opts, function (err, res) {
    if (err) {
      return callback(err);
    }
    callback(null, res.length? res[0].value : undefined);
  });
};

/**
 * Finds using a view
 */

CradleCollection.prototype.findWithView = function (view, opts, callback) {
  if (this.maybeQueueCall('findWithView', true, arguments))
    return;
  //TODO:Test Case
  this.collection.view(view, opts, function (err, res) {
    if (err) {
      return callback(err);
    }

    var docs = [];

    res.forEach(function (doc) {
      var d;
      if(doc.value) d = doc.value;
      if(doc.doc) d = doc.doc;
      docs.push(d || doc);
    });

    callback(null, docs);
  });
};

/**
 * Finds with ids
 */

CradleCollection.prototype.findById = function (ids, opts, callback) {
  if (this.maybeQueueCall('findById', false, arguments))
    return;
  //TODO:Test Case
  var self = this;
  var idArray = Array.isArray(ids);

  if (arguments.length == 2) {
     callback = opts;
     opts = undefined;
  }

  this.collection.get(ids, function (err, res) {
    if (err) {
      return callback(err);
    }
    // XXX: res.slice() to shallow copy if necessary

    if(opts !== undefined && '_deleted' in res && !opts.returnDeleted) {
      return callback(new(cradle.CouchError)({ 'error': 'not_found',
                                               'reason': 'deleted'
                                             }));
    }

    callback(null, res);
  });
};

CradleCollection.prototype.all = function (options, callback) {
  if (this.maybeQueueCall('all', false, arguments))
    return;
  //TODO:Test Case
  var self = this;
  if (arguments.length == 1)
  {
     callback = options;
     options = undefined;
  }

  this.collection.all(options, function (err, res) {
    if (err) {
      return callback(err);
    }
    callback(null, res);
  });
};

/**
 * Allows temporary views
 */

CradleCollection.prototype.mapReduce = function (doc, opts, callback) {
  if (this.maybeQueueCall('mapReduce', true, arguments))
    return;
  //TODO:Test Case
  this.collection.temporaryView(doc, opts, callback);
};


/*!
 * Module exports.
 */

module.exports = CradleCollection;
