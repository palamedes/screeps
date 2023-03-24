const roleSkaven = require('role.skaven');
const structures = require('structures');

// let startCPU = Game.cpu.getUsed();
//   CODE HERE
// let endCPU = Game.cpu.getUsed();
// let resCPU = Math.round(((endCPU-startCPU) * 1000) *1000)/10000
// console.log(resCPU);

let utility = require('utility');
module.exports.loop = function () {

  Memory.tickCount = Memory.tickCount || 0; Memory.tickCount++;

  Memory.maxSlaves = 8;
  Memory.maxOgres = 0;

  // @TODO have this main loop iterate trhough each game spawns and do all of them as if they were their own group

  // Get our data
  let room = Game.spawns[Object.keys(Game.spawns)[0]].room;
  let energyAvailable = room.energyAvailable;
  let energyAvailableComment = 'Room "'+Game.spawns[Object.keys(Game.spawns)[0]].room.name+'" has ' + room.energyAvailable + ' energy';
  let slave  = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
  let ogres  = _.filter(Game.creeps, (rat) => rat.memory.role === 'ogre');

  // Log Output
  let statusUpdate = energyAvailableComment + ' ~ Slaves: ' + slave.length;
  if (ogres.length > 0) { statusUpdate += ', Ogres: ' + ogres.length; }

  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}

  // If we have less than x harvesters, add more
  let extensions = Game.spawns[Object.keys(Game.spawns)[0]].room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
  let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
  let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
  let maxEnergyCapacity = extensionCapacity + spawnCapacity;
  // Spawn a skaven slave
  if ((slave.length < 2 || (slave.length < Memory.maxSlaves && energyAvailable >= maxEnergyCapacity)) && energyAvailable >= 200) {
    statusUpdate += roleSkaven.summonSkaven(energyAvailable, { roomBound: Game.spawns[Object.keys(Game.spawns)[0]].room.name });
  }
  // Spawn a rat ogre
  if (ogres < Memory.maxOgres && ogres.length === Memory.maxOgres && energyAvailable >= maxEnergyCapacity) {
    statusUpdate += roleSkaven.summonRatOgre(energyAvailable, { roomBound: Game.spawns[Object.keys(Game.spawns)[0]].room.name });
  }
  // Work the rats
  for(let name in Game.creeps) { var rat = Game.creeps[name]; roleSkaven.skitter(rat); }

  // Work Towers
  structures.tower.run();
  // structures.findHabitrail();

  // Report what's up..
  console.log(statusUpdate);
}