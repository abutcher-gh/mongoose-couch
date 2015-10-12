'use strict';

let mongoose = require('./lib/index');

mongoose.connect('http://localhost', process.env.COUCH_PORT || 5984, {
  cache: process.env.NO_CACHE ? false : true,
});

let NamedEntitySchema = new mongoose.Schema({
   name: { type: String },
   displayName: { type: String },
}, {
   /**
    * Custom views.
    */
   views: {
      names: { map: function (doc) { if ('name' in doc) emit(doc.name.toLowerCase(), doc); }, ver: 1, asDefaultIndex: true },
      displayNames: { map: function (doc) { if ('displayName' in doc) emit(doc.displayName.replace(/\s/g,'').toLowerCase(), doc); }, ver: 1 },
   }
});
let NamedEntity = mongoose.model('NamedEntity', NamedEntitySchema);

let UserSchema = new mongoose.Schema({
   name: { type: String, index: true },
   displayName: { type: String, index: true },
   age: { type: Number },
});

let GroupSchema = new mongoose.Schema({
   name: { type: String, index: true },
   displayName: { type: String },
   members: [{ type: String, ref: 'NamedEntity' }],
}, {
   /**
    * By default, mongoose-couch will create an index comprising the
    * model discriminator and the field requested.  I.e. '$kind' and
    * 'name' in this case.  This option forces the default plain
    * '$kind'-only index (effectively indexed by '$kind' and '_id') to
    * be created too.
    */
   forcePlainDiscriminatorIndex: true,

   /**
    * Custom views.  Note that mongoose-couch will inject a
    * discriminator early-out check at the start of the given match
    * function such that only documents pertaining to this kind will
    * be part of the index.
    */
   views: {
      displayNames: { map: function (doc) { emit(doc.displayName.replace(/\s/g,'').toLowerCase(), doc); }, ver: 1 },
   }
});

/**
 * This will get a default '$kind'-only index.
 */
let DemoListSchema = new mongoose.Schema({
   displayName: { type: String },
   list: [{ type: String, ref: 'NamedEntity' }],
});

let User = NamedEntity.discriminator('User', UserSchema);
let Group = NamedEntity.discriminator('Group', GroupSchema);
let DemoList = NamedEntity.discriminator('DemoList', DemoListSchema);

let async = require('async');

async.series([
   (next) => NamedEntity.find({}).remove(next),
   (next) => {
      async.parallel([
         (done) => new NamedEntity({_id: '100', displayName: 'Just a display name'}).save(done),
         (done) => new User({_id: '101', name: 'bob', displayName: 'Robert the Bruce'}).save(done),
         (done) => new Group({_id: '102', name: 'group1', displayName: 'A group', members: ['100', '101']}).save(done),
         (done) => new DemoList({_id: '103', name: 'list1', displayName: 'A demo list', list: ['101', '102']}).save(done),
         ], next);
   },
   (next) => {
      // Custom views
      NamedEntity.findWithView('$root/names', {}, (err, docs) => console.log('NamedEntityByName', err, docs));
      NamedEntity.findWithView('$root/displayNames', {}, (err, docs) => console.log('NamedEntityByDisplayName', err, docs));
      Group.findWithView('groups/displayNames', {}, (err, docs) => console.log('GroupsByDisplayName[CUSTOM]', err, docs));

      // Implicit views
      User.findWithView('users/byName', {}, (err, docs) => console.log('UserByName', err, docs));
      User.findWithView('users/byDisplayName', {}, (err, docs) => console.log('UserByDisplayName', err, docs));
      Group.findWithView('groups/byName', {}, (err, docs) => console.log('GroupByName', err, docs));
      Group.findWithView('groups/by_id', {}, (err, docs) => console.log('GroupById', err, docs));
      DemoList.findWithView('demolists/by_id', {}, (err, docs) => console.log('DemoList', err, docs));

      // Test default views via Model.find.
      NamedEntity.find({}, (err, docs) => console.log('NamedEntity:ALL', err, docs));
      User.find({}, (err, docs) => console.log('User:ALL', err, docs));
      Group.find({}, (err, docs) => console.log('Group:ALL', err, docs));
      DemoList.find({}, (err, docs) => console.log('DemoList:ALL', err, docs));
   },
]);
