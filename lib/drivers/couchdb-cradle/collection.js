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

function NativeCollection() {
  this.collection = null;
  MongooseCollection.apply(this, arguments);
}

/*!
 * Inherit from abstract Collection.
 */

NativeCollection.prototype.__proto__ = MongooseCollection.prototype;

/**
 * Called when the connection opens.
 *
 * @api private
 */

NativeCollection.prototype.onOpen = function () {
  var self = this;
  if(self.conn && self.conn.db) {
    var collection = self.conn.db.database(self.name);
    self.collection = collection;
    self.ensureDb();
  }
  MongooseCollection.prototype.onOpen.call(self);
};

/**
 * Called when the connection closes
 *
 * @api private
 */

NativeCollection.prototype.onClose = function () {
  MongooseCollection.prototype.onClose.call(this);
};

/**
 * Checks for db existence, creates if necessary
 */

NativeCollection.prototype.ensureDb = function(callback) {
  var self = this;
  var db = this.conn.db.database(self.name);
  db.exists(function(err, exists) {
    if(exists) return callback && callback();
    db.create(callback);
  });
}

/**
 * Adds model level views to a ddoc
 */

NativeCollection.prototype.ensureIndex = function (views) {
  //TODO: implement ddoc for models/test
  var self = this;
  self.ensureDb(function() {
    self.conn.db.database(self.name).save('_design/' + self.name, {
      language: 'javascript',
      views: views
    });
  });
}

/**
 * Inserts a doc
 */

NativeCollection.prototype.insert = function (doc, opts, callback) {
  this.collection.save(doc, callback);
};

/**
 * inserts docs in bulk
 */

NativeCollection.prototype.bulkInsert = function (docs, callback) {
  //TODO:Test Case
  this.collection.save(docs, callback);
};

/**
 * removes a doc
 */

NativeCollection.prototype.remove = function (_id, _rev, callback) {
  this.collection.remove(_id, _rev, callback);
};

/**
 * removes docs in bulk
 */

NativeCollection.prototype.bulkRemove = function (docs, callback) {
  //TODO:Test Case
  docs.forEach(function (doc) {
    doc._deleted = true;
  });

  this.collection.save(docs, callback);
};

/**
 * Finds one doc using a view
 */

NativeCollection.prototype.findOneWithView = function (view, opts, callback) {
  //TODO:Test Case
  opts.limit = 1;
  this.collection.view(view, opts, function (err, res) {
    if (err) {
      return callback(err);
    }
    var singleDoc = {};
    res.forEach(function (doc) {
      singleDoc = doc;
    });
    callback(null, singleDoc);
  });
};

/**
 * Finds using a view
 */

NativeCollection.prototype.findWithView = function (view, opts, callback) {
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

NativeCollection.prototype.findById = function (ids, callback) {
  //TODO:Test Case
  var self = this;
  var idArray = Array.isArray(ids);
  ids = (idArray) ? ids : [ids];

  this.collection.get(ids, function (err, res) {
    if (err) {
      return callback(err);
    }

    var docs = [];
    res.forEach(function (doc) {
      docs.push(doc);
    });

    callback(null, (idArray) ? docs : docs[0]);
  });
};

/**
 * Allows temporary views
 */

NativeCollection.prototype.mapReduce = function (doc, opts, callback) {
  //TODO:Test Case
  this.collection.temporaryView(doc, opts, callback);
};


/*!
 * Module exports.
 */

module.exports = NativeCollection;
