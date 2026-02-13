require('warren.memory');
require('warren.profile');
require('warren.observe');
require('warren.orient');
require('warren.decide');
require('warren.act');

Room.prototype.tick = function () {
  this.initMemory();
  this.profile();
  this.observe();
  this.orient();
  this.decide();
  this.act();
};
