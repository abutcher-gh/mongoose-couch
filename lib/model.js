/*!
 * Module dependencies.
 */

var Document = require('./document')
    , Schema = require('./schema')
    , Types = require('./schema/index')
    , utils = require('./utils')
    , EventEmitter = require('events').EventEmitter
    , Promise = require('./promise')
    , tick = utils.tick
    , async = require('async')

/**
 * Model constructor
 *
 * @param {Object} doc values to with which to create the document
 * @inherits Document
 * @event `error`: If listening to this Model event, it is emitted when a document was saved without passing a callback and an `error` occurred. If not listening, the event bubbles to the connection used to create this Model.
 * @event `index`: Emitted after `Model#ensureIndexes` completes. If an error occurred it is passed with the event.
 * @api public
 */

function Model(doc, fields, skipId) {
  Document.call(this, doc, fields, skipId);
};

/*!
 * Inherits from Document.
 *
 * All Model.prototype features are available on
 * top level (non-sub) documents.
 */

Model.prototype.__proto__ = Document.prototype;

/**
 * Connection the model uses.
 *
 * @api public
 * @property db
 */

Model.prototype.db;
Model.prototype.couch = Model.prototype.db;

/**
 * Collection the model uses.
 *
 * @api public
 * @property collection
 */

Model.prototype.collection;
Model.prototype.database = Model.prototype.collection;

/**
 * The name of the model
 *
 * @api public
 * @property modelName
 */

Model.prototype.modelName;

/*!
 * Handles doc.save() callbacks
 */

function handleSave(promise, self) {
  return tick(function handleSave(err, result) {
    if (err) {
      // If the initial insert fails provide a second chance.
      // (If we did this all the time we would break updates)
      if (self.$__.inserting) {
        self.isNew = true;
        self.emit('isNew', true);
      }
      promise.error(err);
      promise = self = null;
      return;
    }

    var numAffected = 1;

    self._id = result.id;
    self._rev = result.rev;

    self.emit('save', self, numAffected);
    promise.complete(self, numAffected);
    promise = self = null;
  });
}

/**
 * Saves this document.
 *
 * ####Example:
 *
 *     product.sold = Date.now();
 *     product.save(function (err, product) {
 *       if (err) ..
 *     })
 *
 * The `fn` callback is optional. If no `fn` is passed and validation fails, the validation error will be emitted on the connection used to create this model.
 *
 *     var db = mongoose.createConnection(..);
 *     var schema = new Schema(..);
 *     var Product = db.model('Product', schema);
 *
 *     db.on('error', handleError);
 *
 * However, if you desire more local error handling you can add an `error` listener to the model and handle errors there instead.
 *
 *     Product.on('error', handleError);
 *
 * @param {Function} [fn] optional callback
 * @api public
 * @see middleware http://mongoosejs.com/docs/middleware.html
 */

Model.prototype.save = function save(fn) {
  var promise = new Promise(fn)
      , complete = handleSave(promise, this)
      , options = {}

  if (this.schema.options.safe) {
    options.safe = this.schema.options.safe;
  }

  if (this.isNew) {
    // send entire doc
    var obj = this.toObject({ depopulate: 1 });
    this.collection.insert(obj, options, complete);
    this._reset();
    this.isNew = false;
    this.emit('isNew', false);
    // Make it possible to retry the insert
    this.$__.inserting = true;

  } else {
    // Make sure we don't treat it as a new object on error,
    // since it already exists
    this.$__.inserting = false;

    var obj = this.toObject({ depopulate: 1 });
    this.collection.insert(obj, options, complete);
    this._reset();

    this.emit('isNew', false);
  }
};


/**
 * Removes this document from the db.
 *
 * ####Example:
 *
 *     product.remove(function (err, product) {
 *       if (err) return handleError(err);
 *       Product.findById(product._id, function (err, product) {
 *         console.log(product) // null
 *       })
 *     })
 *
 * @param {Function} [fn] optional callback
 * @api public
 */

Model.prototype.remove = function remove(fn) {
  if (this.$__.removing) {
    this.$__.removing.addBack(fn);
    return this;
  }

  var promise = this.$__.removing = new Promise(fn)
      , self = this;

  this.collection.remove(this._id, this._rev, tick(function (err) {
    if (err) {
      promise.error(err);
      promise = self = self.$__.removing = where = options = null;
      return;
    }
    self.emit('remove', self);
    promise.complete();
    promise = self = where = options = null;
  }));

  return this;
};

/**
 * Register hooks override
 *
 * @api private
 */

Model.prototype._registerHooks = function registerHooks() {
  Document.prototype._registerHooks.call(this);
};

/**
 * Returns another Model instance.
 *
 * ####Example:
 *
 *     var doc = new Tank;
 *     doc.model('User').findById(id, callback);
 *
 * @param {String} name model name
 * @api public
 */

Model.prototype.model = function model(name) {
  return this.db.model(name);
};

/**
 * Adds a discriminator type.
 *
 * ####Example:
 *
 *     function BaseSchema() {
 *       Schema.apply(this, arguments);
 *
 *       this.add({
 *         name: String,
 *         createdAt: Date
 *       });
 *     }
 *     util.inherits(BaseSchema, Schema);
 *
 *     var PersonSchema = new BaseSchema();
 *     var BossSchema = new BaseSchema({ department: String });
 *
 *     var Person = mongoose.model('Person', PersonSchema);
 *     var Boss = Person.discriminator('Boss', BossSchema);
 *
 * @param {String} name   discriminator model name
 * @param {Schema} schema discriminator model schema
 * @api public
 */

Model.discriminator = function discriminator (name, schema) {
  if (!(schema instanceof Schema)) {
    throw new Error("You must pass a valid discriminator Schema");
  }

  if (this.schema.discriminatorMapping && !this.schema.discriminatorMapping.isRoot) {
    throw new Error("Discriminator \"" + name + "\" can only be a discriminator of the root model");
  }

  var key = this.schema.options.discriminatorKey;
  if (schema.path(key)) {
    throw new Error("Discriminator \"" + name + "\" cannot have field with name \"" + key + "\"");
  }

  // merges base schema into new discriminator schema and sets new type field.
  (function mergeSchemas(schema, baseSchema) {
    // Ignore certain options from derived schema.
    ['collection', 'autoIndex', 'disableCache'].forEach(function(opt) {
      if (opt in baseSchema.options)
        schema.options[opt] = baseSchema.options[opt];
    });
    // Throw error if options are invalid.
    (function validateOptions(a, b) {
      a = utils.clone(a);
      utils.merge(a, b, /*keepExisting=*/true);
      ['toJSON', 'toObject', 'views', 'updates', 'lists', 'forcePlainDiscriminatorIndex'].forEach(function(opt) {
        if (b[opt])
          a[opt] = b[opt];
        else
          delete a[opt];
      });

      if (!utils.deepEqual(a, b)) {
        throw new Error("Only toJSON, toObject, views, updates, lists and forcePlainDiscriminatorIndex are customizable on discriminator schemas");
      }
    })(schema.options, baseSchema.options);

    // Support overriding field specifiers in discriminated schemas
    // individually merging options but keeping indexing specifiers
    // distinct and overriding conversion functions.
    var views = schema.options.views
      , updates = schema.options.updates
      , lists = schema.options.lists
      , forcePlainDiscriminatorIndex = schema.options.forcePlainDiscriminatorIndex
      , toJSON = schema.options.toJSON
      , toObject = schema.options.toObject
      ;

    delete schema.options.views;
    delete schema.options.updates;
    delete schema.options.lists;
    delete schema.options.forcePlainDiscriminatorIndex;
    utils.merge(schema, baseSchema, /*keepExisting=*/true);
    if (views)
      schema.options.views = views;
    else
      delete schema.options.views;
    if (updates)
      schema.options.updates = updates;
    else
      delete schema.options.updates;
    if (lists)
      schema.options.lists = lists;
    else
      delete schema.options.lists;
    if (forcePlainDiscriminatorIndex)
      schema.options.forcePlainDiscriminatorIndex = forcePlainDiscriminatorIndex;
    else
      delete schema.options.forcePlainDiscriminatorIndex;

    var obj = {};
    obj[key] = { type: String, default: name };
    schema.add(obj);
    schema.discriminatorMapping = { key: key, value: name, isRoot: false };

    schema.callQueue = baseSchema.callQueue.concat(schema.callQueue);
    schema._requiredpaths = undefined; // reset just in case Schema#requiredPaths() was called on either schema
  })(schema, this.schema);

  if (!this.discriminators) {
    this.discriminators = {};
  }

  if (!this.schema.discriminatorMapping) {
    this.schema.discriminatorMapping = { key: key, value: null, isRoot: true };
  }

  if (this.discriminators[name]) {
    throw new Error("Discriminator with name \"" + name + "\" already exists");
  }

  this.discriminators[name] = this.db.model(name, schema, this.collection.name);
  this.discriminators[name].prototype.__proto__ = this.prototype;

  return this.discriminators[name];
};

// Model (class) features

/*!
 * Give the constructor the ability to emit events.
 */

for (var i in EventEmitter.prototype)
  Model[i] = EventEmitter.prototype[i];

/**
 * Called when the model compiles.
 *
 * @api private
 */

Model.init = function init() {
  if (this.schema.options.autoIndex) {
    this.ensureIndexes();
  }

  this.schema.emit('init', this);
};

/**
 * Sends `ensureIndex` commands to mongo for each index declared in the schema.
 *
 * ####Example:
 *
 *     Event.ensureViews(function (err) {
 *       if (err) return handleError(err);
 *     });
 *
 * After completion, an `index` event is emitted on this `Model` passing an error if one occurred.
 *
 * ####Example:
 *
 *     var eventSchema = new Schema({
 *         thing: { type: 'string' }
 *       },
 *       {
 *         database: 'example',
 *         views: { 'dang': { map : function..., reduce: function... } }
 *     })
 *     var Event = mongoose.model('Event', eventSchema);
 *
 *     Event.on('index', function (err) {
 *       if (err) console.error(err); // error occurred during index creation
 *     })
 *
 * _NOTE: It is not recommended that you run this in production. View creation may impact database performance depending on your load. Use with caution._
 *
 * @param {Function} [cb] optional callback
 * @api public
 */

Model.ensureIndexes = function ensureIndexes(cb) {
  var indexes = this.schema.indexes();
  var defaultView;
  var customViews = this.schema.options.views;
  /** Handle explicit views. */
  if (customViews !== undefined) {
    for (var k in customViews)
      if (customViews[k].asDefaultIndex) {
        if (defaultView)
          throw new Error(this.modelName + ": More than one custom index defined as default.");
        if (this.schema.discriminatorMapping !== undefined)
          defaultView = utils.toCollectionName(this.schema.discriminatorMapping.value) + '/' + k;
        else
          defaultView = '$root/' + k;
      }
  }
  /** Handle implied indexes. */
  var designDoc = '$root';
  var discriminatorEarlyOut = '';
  if (this.schema.discriminatorMapping !== undefined
      && !this.schema.discriminatorMapping.isRoot) {
    designDoc = utils.toCollectionName(this.schema.discriminatorMapping.value);
    discriminatorEarlyOut =
      "if (doc['"+this.schema.discriminatorMapping.key+"'] !== '"+this.schema.discriminatorMapping.value+"') return;";
    if ((indexes.length === 0 && !defaultView) ||
        this.schema.options.forcePlainDiscriminatorIndex) {
      indexes = indexes.concat([[{'_id': 1}]]);
      defaultView = designDoc + '/by_id';
    }
    else
      for (var fieldName in indexes[0][0]) // loop just to extract key/value pair (only one iteration)
        defaultView = designDoc + '/by' + fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  }

  var customUpdates = this.schema.options.updates;
  var customLists = this.schema.options.lists;

  if (!indexes.length && !customViews && !customUpdates && !customLists) {
    return cb && process.nextTick(cb);
  }

  ++this.collection.ensuringIndexes;

  this.defaultView = defaultView;

  var self = this;

  function done(err) {
    self.emit('index', err);
    if (--self.collection.ensuringIndexes === 0)
       self.collection.doQueue();
    cb && cb(err);
  }

  function hasEquivalentFunctions(a, b) {
    if (a === undefined && b === undefined)
      return true;
    if (a === undefined || b === undefined)
      return false;
    for (e in a)
      if (!(e in b) || a[e].toString() !== b[e].toString())
        return false;
    return true;
  }

  var schema = this.schema;

  self.collection.findById('_design/' + designDoc, function (err, design) {
    design = design || {};
    if (!design.views)
      design.views = {};
    var views = design.views;
    var modified = false;
    if (!hasEquivalentFunctions(design.updates, customUpdates)) {
      modified = true;
      if (customUpdates)
        design.updates = customUpdates;
      else
        delete design.updates;
    }
    if (customLists) {
      // List functions attributed to discriminated models are
      // prefixed with an overridden getRow function that skips
      // documents not matching the appropriate $kind.
      if (discriminatorEarlyOut.length) {
        var listDiscriminatorHandler = `
          var getDiscriminatedRow = function() {
            var row; while ((row = getRow())) {
              if (row.value.${schema.discriminatorMapping.key} === '${schema.discriminatorMapping.value}')
                break;
            }
            return row;
          };`.replace(/^\s+/g, '').replace('\n',' ');
        for (var l in customLists)
          customLists[l] = customLists[l].toString()
            .replace('getRow','getDiscriminatedRow')
            .replace('{','{'+listDiscriminatorHandler);
      }
    }
    if (!hasEquivalentFunctions(design.lists, customLists)) {
      modified = true;
      if (customLists)
        design.lists = customLists;
      else
        delete design.lists;
    }

    var customViewNames = [];
    var indexViewNames = [];

    function maybeUpdateIndex(name, spec) {
      var viewName;
      if (spec)
        customViewNames.push((viewName = name));
      else
        indexViewNames.push((viewName = 'by' + name.charAt(0).toUpperCase() + name.slice(1)));
      var def = {};
      if (spec) {
        if (spec.map)
          def.map = discriminatorEarlyOut? spec.map.toString().replace('{', '{'+discriminatorEarlyOut) : spec.map;
        if (spec.reduce)
          def.reduce = spec.reduce;
      }
      else {
        var keyModifier = self.schema.tree[name].index;
        if (typeof keyModifier !== 'string')
          keyModifier = '';
        def.map = 'function(doc){'+discriminatorEarlyOut+'emit(doc.'+name+keyModifier+',doc);}';
      }
      if (!hasEquivalentFunctions(views[viewName], def)) {
        views[viewName] = def;
        modified = true;
      }
    }

    for (var i in indexes) {
      var fieldSpec = indexes[i][0];
      for (fieldName in fieldSpec) // loop just to extract key/value pair (only one iteration)
        maybeUpdateIndex(fieldName);
    }

    for (var viewName in customViews)
      maybeUpdateIndex(viewName, customViews[viewName]);

    if (customViewNames.length === 0
        && indexViewNames.length === 0
        && design.views) {
      delete design.views;
      modified = true;
    }
    else {
      for (viewName in design.views) {
        if (customViewNames.indexOf(viewName) === -1
            && indexViewNames.indexOf(viewName) === -1) {
          delete design.views[viewName];
          modified = true;
        }
      }
    }

    if (modified) {
      design._id = '_design/' + designDoc;
      self.collection.insert(design, null, done);
    }
    else
      process.nextTick(done);
  });
}

/**
 * Schema the model uses.
 *
 * @property schema
 * @receiver Model
 * @api public
 */

Model.schema;

/*!
 * Connection instance the model uses.
 *
 * @property db
 * @receiver Model
 * @api public
 */

Model.db;

/*!
 * Collection the model uses.
 *
 * @property collection
 * @receiver Model
 * @api public
 */

Model.collection;

/**
 * Base Mongoose instance the model uses.
 *
 * @property base
 * @receiver Model
 * @api public
 */

Model.base;

/**
 * Registered discriminators for this model.
 *
 * @property discriminators
 * @receiver Model
 * @api public
 */

Model.discriminators;

/**
 * Removes documents from the collection.
 *
 * ####Example:
 *
 *     Comment.remove({ title: 'baby born from alien father' }, function (err) {
 *
 *     });
 *
 * ####Note:
 *
 * To remove documents without waiting for a response from MongoDB, do not pass a `callback`, then call `exec` on the returned [Query](#query-js):
 *
 *     var query = Comment.remove({ _id: id });
 *     query.exec();
 *
 * ####Note:
 *
 * This method sends a remove command directly to MongoDB, no Mongoose documents are involved. Because no Mongoose documents are involved, _no middleware (hooks) are executed_.
 *
 * @param {Object} conditions
 * @param {Function} [callback]
 * @return {Query}
 * @api public
 */

Model.remove = function remove(docs, callback) {
  this.collection.bulkRemove(docs, callback);
};

/**
 * find [[options [manipulator]] callback]
 * Hack to pacify client interface.
 * Ignores manipulator.
 * Returns a wrapper that only supports 'remove' with a callback.
 * if callback given, fetch full objects
 */

function response_to_input_refs(a) {
   for(var i = 0, j = 0, e = a.length; i < e; ++i) {
      if (a[i].id[0] === '_')
         continue;
      var o = a[i];
      o._id = o.id; delete o.id; delete o.key;
      o._rev = o.value.rev; delete o.value;
      a[j++] = o;
   };
   a.length = j;
}

function response_to_input_full(a) {
   for(var i = 0, j = 0, e = a.length; i < e; ++i) {
      if (a[i].id[0] === '_')
         continue;
      a[j++] = a[i].doc;
   };
   a.length = j;
}

function is_empty(o) {
  var k;
  for (k in o)
    return false;
  return true;
}


Model.find = function find(options, manipulator, callback) {
  var self = this;
  switch (arguments.length) {
     case 1:
       if (typeof options === 'function')
       {
          callback = options;
          options = undefined;
       }
       break;
     case 2:
       callback = manipulator;
       break;
     case 0:
     case 3:
       break;
     default:
       throw new Error('Invalid arguments');
  }
  var search = new Promise(callback);
  if (options !== undefined && !is_empty(options))
     options = {body: options};
  var find = self.defaultView
    ? self.collection.findWithView.bind(self.collection, self.defaultView)
    : self.collection.all.bind(self.collection)
    ;
  // If fetching directly from cradle, some transformation is required
  // here.  If going through a view (defaultView is defined) then
  // findWithView does that transformation already.
  var transform = function (x) { return x; };
  if (callback !== undefined) {
    if (options === undefined)
       options = {};
    options.include_docs = true;
    if (!self.defaultView)
      transform = response_to_input_full;
  }
  else if (!self.defaultView)
    transform = response_to_input_refs;

  find(options, function(err, objs){
     if (err)
        return search.reject(err);
     transform(objs);
     return search.fulfill(objs);
  });
  if(callback !== undefined)
     return search;
  var onReject = function(err) {
     console.log("Find operation failed but error was not caught.", err);
  };
  search.onReject(function(err) {
     onReject(err);
  });
  return {
     onReject: function(f) { onReject = f; return this; },
     remove: function(callback) {
        search.then(function(objs) {
           self.collection.bulkRemove(objs, callback);
        }, function(err) {
           callback(err);
        }).end(function(err) {
           callback(err);
        });
     }
  };
};

/**
 * Finds documents using a view
 *
 * ####Examples:
 *
 *     MyModel.findWithView();
 *
 *
 * @param {Object} conditions
 * @param {Object} [fields] optional fields to select
 * @param {Object} [options] optional
 * @param {Function} [callback]
 * @return {Query}
 * @see field selection #query_Query-select
 * @see promise #promise-js
 * @api public
 */

Model.findWithView = function findWithView(view, options, callback) {
  var self = this;
  if ('function' != typeof callback) {
    callback = options;
    options = {};
  }

  this.collection.findWithView(view, options, function (err, docs) {
    if (err) {
      return callback(err);
    }
    self.hydrate(docs, callback);
  });
};

/**
 * Finds documents using a view
 *
 * ####Examples:
 *
 *     MyModel.findOneWithView();
 *
 *
 * @param {Object} conditions
 * @param {Object} [fields] optional fields to select
 * @param {Object} [options] optional
 * @param {Function} [callback]
 * @return {Query}
 * @see field selection #query_Query-select
 * @see promise #promise-js
 * @api public
 */

Model.findOneWithView = function findOneWithView(view, options, callback) {
  var self = this;
  if ('function' != typeof callback) {
    callback = options;
    options = {};
  }

  this.collection.findOneWithView(view, options, function (err, doc) {
    if (err) {
      return callback(err);
    }
    if (doc)
       self.hydrate(doc, callback);
    else
       callback(null, doc);
  });
};

/**
 * Finds a single document by id.
 *
 * The `id` is cast based on the Schema before sending the command.
 *
 * ####Example:
 *
 *     // find adventure by id and execute immediately
 *     Adventure.findById(id, function (err, adventure) {});
 *
 *     // same as above
 *     Adventure.findById(id).exec(callback);
 *
 *     // select only the adventures name and length
 *     Adventure.findById(id, 'name length', function (err, adventure) {});
 *
 *     // same as above
 *     Adventure.findById(id, 'name length').exec(callback);
 *
 *     // include all properties except for `length`
 *     Adventure.findById(id, '-length').exec(function (err, adventure) {});
 *
 *     // passing options (in this case return the raw js objects, not mongoose documents by passing `lean`
 *     Adventure.findById(id, 'name', { lean: true }, function (err, doc) {});
 *
 *     // same as above
 *     Adventure.findById(id, 'name').lean().exec(function (err, doc) {});
 *
 * @param {ObjectId|HexId} id objectid, or a value that can be casted to one
 * @param {Object} [fields] optional fields to select
 * @param {Object} [options] optional
 * @param {Function} [callback]
 * @return {Query}
 * @see field selection #query_Query-select
 * @see lean queries #query_Query-lean
 * @api public
 */

Model.findById = function findById(ids, options, callback) {
  if ('function' != typeof callback) {
    callback = options;
    options = {};
  }

  var self = this;
  this.collection.findById(ids, options, function (err, docs) {
    if (err) {
      return callback(err);
    }
    self.hydrate(docs, callback);
  });
};

/*!
 * hydrates documents
 *
 * @param {Document} documents
 */

Model.hydrate = function (docs, callback) {
  var self = this;
  var docArray = Array.isArray(docs);
  docs = (docArray) ? docs : [docs];

  var arr = [];
  var count = docs.length;
  var len = count;
  var i = 0;
  for (; i < len; ++i) {
    arr[i] = new self(docs[i], true);
    arr[i].init(docs[i], function (err) {
      if (err) return callback(err, null);
      --count || arr;
    });
  }

  callback(null, (docArray) ? arr : arr[0]);
};

/**
 * Executes a mapReduce command.
 *
 * ####options:
 *
 *     http://wiki.apache.org/couchdb/HTTP_view_API#Querying_Options
 *
 * ####Example:
 *
 *     var o = {};
 *     o.map = function () { emit(this.name, 1) }
 *     o.reduce = function (k, vals) { return vals.length }
 *     User.mapReduce(o, {}, function (err, res) {
 *        console.log(res);
 *     })
 *
 * @param {Object} o an object specifying map-reduce options
 * @param {Object} o an object specifying view options
 * @param {Function} callback
 * @see http://wiki.apache.org/couchdb/HTTP_view_API
 * @api public
 */

Model.mapReduce = function mapReduce(doc, opts, callback) {
  if ('function' != typeof callback) throw new Error('missing callback');

  this.collection.mapReduce(doc, opts, function (err, res) {
    callback(err, res);
  });
}

/**
 * Run the given CouchDB update handler with the given parameters.
 * Forwards to cradle:
 *    https://github.com/flatiron/cradle#update-handlers
 */

Model.update = function update(handlerName, id, query, body, callback) {
  this.collection.collection.update(handlerName, id, query, body, callback);
};

Model.list = function list(handlerName, query, callback) {
  this.collection.collection.list(handlerName, query, callback);
};



/**
 * Finds the schema for `path`. This is different than
 * calling `schema.path` as it also resolves paths with
 * positional selectors (something.$.another.$.path).
 *
 * @param {String} path
 * @return {Schema}
 * @api private
 */

Model._getSchema = function _getSchema(path) {
  var schema = this.schema
      , pathschema = schema.path(path);

  if (pathschema)
    return pathschema;

  // look for arrays
  return (function search(parts, schema) {
    var p = parts.length + 1
        , foundschema
        , trypath

    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        if (foundschema.caster) {

          // array of Mixed?
          if (foundschema.caster instanceof Types.Mixed) {
            return foundschema.caster;
          }

          // Now that we found the array, we need to check if there
          // are remaining document paths to look up for casting.
          // Also we need to handle array.$.path since schema.path
          // doesn't work for that.
          if (p !== parts.length) {
            if ('$' === parts[p]) {
              // comments.$.comments.$.title
              return search(parts.slice(p + 1), foundschema.schema);
            } else {
              // this is the last path of the selector
              return search(parts.slice(p), foundschema.schema);
            }
          }
        }
        return foundschema;
      }
    }
  })(path.split('.'), schema)
}

/*!
 * Compiler utility.
 *
 * @param {String} name model name
 * @param {Schema} schema
 * @param {String} collectionName
 * @param {Connection} connection
 * @param {Mongoose} base mongoose instance
 */

Model.compile = function compile(name, schema, collectionName, connection, base) {
  // generate new class
  function model(doc, fields, skipId) {
    if (!(this instanceof model))
      return new model(doc, fields, skipId);
    Model.call(this, doc, fields, skipId);
  };

  model.modelName = name;
  model.__proto__ = Model;
  model.prototype.__proto__ = Model.prototype;
  model.prototype.db = connection;
  model.prototype._setSchema(schema);
  model.discriminators = model.prototype.discriminators = undefined;

  model.prototype.collection = connection.collection(collectionName, schema.options);

  // apply methods
  for (var i in schema.methods)
    model.prototype[i] = schema.methods[i];

  // apply statics
  for (var i in schema.statics)
    model[i] = schema.statics[i];

  // apply named scopes
  if (schema.namedScopes) schema.namedScopes.compile(model);

  model.model = model.prototype.model;
  model.options = model.prototype.options;
  model.db = model.prototype.db;
  model.schema = model.prototype.schema;
  model.collection = model.prototype.collection;
  model.base = base;

  return model;
};

/*!
 * Subclass this model with `conn`, `schema`, and `collection` settings.
 *
 * @param {Connection} conn
 * @param {Schema} [schema]
 * @param {String} [collection]
 * @return {Model}
 */

Model.__subclass = function subclass(conn, schema, collection) {
  // subclass model using this connection and collection name
  var model = this;

  var Model = function Model(doc, fields, skipId) {
    if (!(this instanceof Model)) {
      return new Model(doc, fields, skipId);
    }
    model.call(this, doc, fields, skipId);
  }

  Model.__proto__ = model;
  Model.prototype.__proto__ = model.prototype;
  Model.db = Model.prototype.db = conn;

  var s = 'string' != typeof schema
      ? schema
      : model.prototype.schema;

  if (!collection) {
    collection = model.prototype.schema.get('collection')
        || utils.toCollectionName(model.modelName);
  }

  Model.prototype.collection = conn.collection(collection, schema.options);
  Model.collection = Model.prototype.collection;
  Model.init();
  return Model;
}

/**
 * Shortcut for creating a new Document that is automatically saved to the db if valid.
 *
 * ####Example:
 *
 *     // pass individual docs
 *     Candy.create({ type: 'jelly bean' }, { type: 'snickers' }, function (err, jellybean, snickers) {
 *       if (err) // ...
 *     });
 *
 *     // pass an array
 *     var array = [{ type: 'jelly bean' }, { type: 'snickers' }];
 *     Candy.create(array, function (err, candies) {
 *       if (err) // ...
 *
 *       var jellybean = candies[0];
 *       var snickers = candies[1];
 *       // ...
 *     });
 *
 *     // callback is optional; use the returned promise if you like:
 *     var promise = Candy.create({ type: 'jawbreaker' });
 *     promise.then(function (jawbreaker) {
 *       // ...
 *     })
 *
 * @param {Array|Object...} doc(s)
 * @param {Function} [fn] callback
 * @return {Promise}
 * @api public
 */

Model.create = function create (doc, fn) {
  var args
    , cb;

  if (Array.isArray(doc)) {
    args = doc;
    cb = fn;
  } else {
    var last = arguments[arguments.length - 1];
    if ('function' == typeof last) {
      cb = last;
      args = utils.args(arguments, 0, arguments.length - 1);
    } else {
      args = utils.args(arguments);
    }
  }

  var promise = new Promise(cb);
  var ModelConstructor = this;
  if (args.length === 0) {
    process.nextTick(function() {
      promise.fulfill.apply(promise, null);
    });
    return promise;
  }

  var toExecute = [];
  args.forEach(function(doc) {
    toExecute.push(function(callback) {
      (new ModelConstructor(doc)).save(function(error, doc) {
        callback(error, doc);
      });
    });
  });

  async.parallel(toExecute, function(error, savedDocs) {
    if (error) {
      return promise.reject(error);
    }

    if (doc instanceof Array) {
      promise.fulfill.call(promise, savedDocs);
    } else {
      promise.fulfill.apply(promise, savedDocs);
    }
  });

  return promise;
};

/*!
 * Module exports.
 */

module.exports = exports = Model;
