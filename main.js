const roleSkaven = require('role.skaven');

let utility = require('utility');
module.exports.loop = function () {

  Memory.maxSkaven = 10;
  Memory.maxOgres = 1;

  // Get our data
  let room = Game.spawns[Object.keys(Game.spawns)[0]].room;
  let energyAvailable = room.energyAvailable;
  let energyAvailableComment = 'Room "'+Game.spawns[Object.keys(Game.spawns)[0]].room.name+'" has ' + room.energyAvailable + ' energy';
  let skaven = _.filter(Game.creeps, (rat) => rat.memory.role === 'skaven');
  let ogres = _.filter(Game.creeps, (rat) => rat.memory.role === 'ogre');

  // Log Output
  let statusUpdate = energyAvailableComment + ' ~ Slaves: ' + skaven.length;
  if (ogres.length > 0) {
    statusUpdate += ', Ogres: ' + orgres.length;
  }

  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}

  // If we have less than x harvesters, add more
  let extensions = Game.spawns[Object.keys(Game.spawns)[0]].room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
  let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
  let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
  let maxEnergyCapacity = extensionCapacity + spawnCapacity;
  // Spawn a skaven
  if ((skaven.length < 2 || (skaven.length < Memory.maxSkaven && energyAvailable >= maxEnergyCapacity)) && energyAvailable >= 200) {
    statusUpdate += ' ~ Spawning new Skaven ('+energyAvailable+')';
    roleSkaven.summonSkaven(energyAvailable, { roomBound: Game.spawns[Object.keys(Game.spawns)[0]].room.name });
  }
  // Spawn a rat ogre
  if (ogres < Memory.maxOgres && skaven.length === Memory.maxSkaven && energyAvailable >= maxEnergyCapacity) {
    statusUpdate += ' ~ Spawning new Rat Ogre ('+energyAvailable+')';
    roleSkaven.summonRatOgre(energyAvailable, { roomBound: Game.spawns[Object.keys(Game.spawns)[0]].room.name });
  }
  // Work the rats
  for(let name in Game.creeps) { var rat = Game.creeps[name]; roleSkaven.skitter(rat); }
  // Report what's up..
  console.log(statusUpdate);
}