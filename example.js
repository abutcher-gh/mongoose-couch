var mongoose = require('./lib/index');
var Schema = mongoose.Schema;
var cradle = require('cradle');

mongoose.connect('http://localhost', 5984, {
  cache: process.env.NO_CACHE ? false : true,
  raw: false
});

var AccountSchema = new Schema({
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9-]+$/
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  },
  hash: {
    type: String
  },
  apiKey: {
    type: String,
    unique: true
  },
  roles: {
    type: [String],
    required: true,
    'default': ['lead']
  }
}, {
  collection: 'testy-mcgee',
  autoIndex: false, // manually set up any secondary indices (none in this example)
});

// XXX: Note: This is not a "good practice" example, just a demo;
// XXX: both this and the schema step on each others toes somewhat.
// XXX: This would be better as a 'virtual' field without
// XXX: schema-enforced constraints (the constrains are unnecessary as
// XXX: this "setter" ensures that they are met anyway!).
AccountSchema.path('slug').set(function(v) {
  v = v.toLowerCase().replace(/[^0-9a-z-]+/g, '-');
  this._id = v;
  return v;
});


module.exports = Account = mongoose.model('Account', AccountSchema);

Account.schema.post('save', function(doc) {
  console.log("SAVE.OK:\n", doc);
});
Account.schema.post('remove', function(doc) {
  console.log("REMOVE.OK:\n", doc);
});

var account = new Account({
  slug: 'Munk Test',
  email: 'wut@wut.com',
  roles: ['lead']
});

console.log("NEW ACCOUNT:\n", account);

Account.findById(account._id, function(err, res) {
  console.log("INITIAL ASYNC FIND:\n", err || res);
});

Account.find({}).remove(function(err, res) {

  console.log("BULK-REMOVE:\n", err || res);

  Account.findById(account._id, function(err, res) {
    console.log("POST BULK-REMOVE FIND:\n", err || res);

    process.nextTick(function() {

      account.save(function(err) {
        console.log("SAVE.1 err =:\n", err);

        account.roles.push('admin');
        account.save(function(err) {
          console.log("SAVE.2:\n", err);

          Account.findById(account._id, function(err, res) {
            console.log("FIND BY ID AFTER SAVE.2:\n", err || res);
          });

          Account.find(function(err, res) {
            console.log("FIND:\n", err || res);
          });

          Account.findById(account._id, function(err, res) {
            console.log("FIND BY ID AT END:\n", err || res);
          });
        });
      });
    });
  });
});
