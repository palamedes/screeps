let roleUpgrader = require('role.upgrader');
let roleSkaven = require('role.skaven');
let utility = require('utility');
module.exports.loop = function () {

  let gameRoomID = 'W24S37';

  let numSkaven = 6;
  let numUpgraders = 8;

  // Get our data
  let room = Game.rooms[gameRoomID];
  let energyAvailable = Game.rooms[gameRoomID].energyAvailable;
  let energyAvailableComment = 'Room "'+gameRoomID+'" has ' + room.energyAvailable + ' energy';
  let skaven = _.filter(Game.creeps, (creep) => creep.memory.role == 'skaven');
  let upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');

  // Log Output
  let statusUpdate = energyAvailableComment + ' ~ Skaven: ' + skaven.length + ' ~ Upgraders: ' + upgraders.length;

  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}

  // If we have less than x harvesters, add more
  if (skaven.length < numSkaven && energyAvailable >= 300) {
    statusUpdate += ' ~ Spawning new skaven'
    roleSkaven.summonRat('skaven', energyAvailable);
  }

  // If we have less than 1 upgrader, add one
  else if (upgraders.length < numUpgraders && energyAvailable >= 300) {
    statusUpdate += ' ~ Spawning new upgrader'
    roleSkaven.summonRat('upgrader', energyAvailable);
  }

  console.log(statusUpdate);

  // Work the creeps
  for(let name in Game.creeps) { var creep = Game.creeps[name];
    if(creep.memory.role == 'skaven')       { roleSkaven.skitter(creep); }
    if(creep.memory.role == 'upgrader')     { roleUpgrader.run(creep); }
  }


//    utility.getMaxEnergyCapacity(room);

}