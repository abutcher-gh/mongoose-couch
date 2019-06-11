/*!
 * Module dependencies.
 */

var MongooseCollection = require('../../collection');
var fs = require('fs');
var fsp = require('fs').promises;
var uuid = require('node-uuid');

/**
 * A [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) collection implementation.
 *
 * All methods methods from the [node-mongodb-native](https://github.com/mongodb/node-mongodb-native) driver are copied and wrapped in queue management.
 *
 * @inherits Collection
 * @api private
 */

function FlatFileCollection() {
  this.rootdir = null;
  MongooseCollection.apply(this, arguments);
}

/*!
 * Inherit from abstract Collection.
 */

FlatFileCollection.prototype.__proto__ = MongooseCollection.prototype;

/**
 * Called when the connection opens.
 *
 * @api private
 */

FlatFileCollection.prototype.onOpen = function (context) {
  if(this.conn && this.conn.db) {
    this.rootdir = context.path;
  }
  MongooseCollection.prototype.onOpen.call(this);
};

/**
 * Called when the connection closes
 *
 * @api private
 */

FlatFileCollection.prototype.onClose = function () {
  MongooseCollection.prototype.onClose.call(this);
};

/**
 * Checks for db existence, creates if necessary.
 *
 * @api private
 */

FlatFileCollection.prototype.ensureDb = function(callback) {
  this.context = {
    path: `${this.conn.db.rootdir}/${this.name}`
  };
  const designPath = `${this.context.path}/_design`;
  fs.access(designPath, err => {
    if (err) 
      fs.mkdir(designPath, {recursive: true}, err => {
        if (err)
          throw new Error(err);
        callback(this.context);
      });
    else
      callback(this.context);
  });
};

/**
 * Inserts a doc
 */

FlatFileCollection.prototype.insert = function (doc, opts, callback) {
  if (this.maybeQueueCall('insert', false, arguments))
    return;
  const _id = doc._id || uuid();
  const content = Object.assign({_id}, doc);
  fs.writeFile(`${this.rootdir}/${_id}`, JSON.stringify(content), err => {
    if (err)
      callback(err);
    else
      callback(null, content);
  });
};

/**
 * removes a doc
 */

FlatFileCollection.prototype.remove = function (_id, _rev, callback) {
  if (this.maybeQueueCall('remove', false, arguments))
    return;
  fs.unlink(`${this.rootdir}/${_id}`, callback);
};

/**
 * removes docs in bulk
 */

FlatFileCollection.prototype.bulkRemove = function (docs, callback) {
  if (this.maybeQueueCall('bulkRemove', false, arguments))
    return;
  let remaining = docs.length;
  if (remaining === 0)
    return process.nextTick(() => callback(null, docs));
  let n = 0;
  const handler = err => {
    if (!err) --remaining;
    if (++n == docs.length) {
      if (remaining != 0)
        callback(new Error(`Failed to remove ${remaining} doc(s)`));
      else
        callback();
    }
  };
  for (const doc of docs)
    this.remove(doc._id, null, handler);
};
/**
 * Finds one doc using a view
 */

FlatFileCollection.prototype.findOneWithView = function (view, opts, callback) {
  if (this.maybeQueueCall('findOneWithView', false, arguments))
    return;
  if (!view.startsWith('$root/by'))
    callback(new Error('Only $root/byField views are supported to search via the key "field" having value opts.key'));
  const field = view.substr(8).toLowerCase(); // XXX: assume field is lowercase
  this.all({include_docs: true}, (err, res) => {
    if (err)
      return callback(err);
    const e = res.filter(e => e.doc[field] === opts.key)[0];
    return callback(null, e && e.doc);
  });
};

/**
 * Finds with ids
 */

FlatFileCollection.prototype.findById = function (id, opts, callback) {
  if (this.maybeQueueCall('findById', false, arguments))
    return;
  if (Array.isArray(id))
    throw new SyntaxError('FlatFileCollection.findById only accepts a single id');

  if (arguments.length == 2) {
     callback = opts;
     opts = undefined;
  }

  fs.readFile(`${this.rootdir}/${id}`, (err, content) => {
    if (err)
      callback({error: 'not_found', reason: err});
    else
      try {
        callback(null, JSON.parse(content));
      }
      catch (e) {
        callback(e);
      }
  });
};

FlatFileCollection.prototype.all = function (options, callback) {
  if (this.maybeQueueCall('all', false, arguments))
    return;

  if (arguments.length == 1)
  {
     callback = options;
     options = undefined;
  }

  fsp.readdir(this.rootdir, {withFileTypes: true}).then(files => {
    files = files.filter(file => file.isFile());
    if (options && options.include_docs) {
      try {
        callback(null, files.map(file => {
          const doc = JSON.parse(fs.readFileSync(`${this.rootdir}/${file.name}`));
          return {id: file.name, doc};
        }));
      }
      catch (e) {
        callback(e);
      }
    }
    else {
      callback(null, files.map(file => {
        return {id: file.name, value: {rev: null}}; }));
    }
  });
};

module.exports = FlatFileCollection;
