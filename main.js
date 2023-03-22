const roleSkaven = require('role.skaven');

let utility = require('utility');
module.exports.loop = function () {

  let gameRoomID = 'W24S37';
  let numSkaven = 10;

  // Get our data
  let room = Game.rooms[gameRoomID];
  let energyAvailable = Game.rooms[gameRoomID].energyAvailable;
  let energyAvailableComment = 'Room "'+gameRoomID+'" has ' + room.energyAvailable + ' energy';
  let skaven = _.filter(Game.creeps, (rat) => rat.memory.role === 'skaven');

  // Log Output
  let statusUpdate = energyAvailableComment + ' ~ Skaven: ' + skaven.length;

  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}

  // If we have less than x harvesters, add more
  let extensions = Game.spawns[Object.keys(Game.spawns)[0]].room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
  let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
  let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
  let maxEnergyCapacity = extensionCapacity + spawnCapacity;

  if (skaven.length < 2 || (skaven.length < numSkaven && energyAvailable >= maxEnergyCapacity)) {
    statusUpdate += ' ~ Spawning new skaven ('+energyAvailable+')';
    roleSkaven.summonRat(energyAvailable, { roomBound: gameRoomID });
  }

  // Work the creeps
  for(let name in Game.creeps) { var rat = Game.creeps[name]; roleSkaven.skitter(rat); }
  // Report what's up..
  console.log(statusUpdate);
}