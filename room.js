require('room.memory');
require('room.profile');
require('room.observe');
require('room.orient');
require('room.decide');
require('room.act');

Room.prototype.tick = function () {
  this.initMemory();
  this.profile();
  this.observe();
  this.orient();
  this.decide();
  this.act();
};
