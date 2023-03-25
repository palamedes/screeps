const roleSkaven = require('role.skaven');
const structures = require('structures');

// let startCPU = Game.cpu.getUsed();
//   CODE HERE
// let endCPU = Game.cpu.getUsed();
// let resCPU = Math.round(((endCPU-startCPU) * 1000) *1000)/10000
// console.log(resCPU);

let utility = require('utility');
module.exports.loop = function () {

  // Track tick count ~ we can use this to do things on certain ticks to lower CPU costs
  Memory.tickCount = Memory.tickCount || 0; Memory.tickCount++;
  Memory.maxSlaves = Memory.maxSlaves || 8;
  Memory.maxOgres = 0;

  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}
  // Get all our rooms.
  Memory.rooms = Memory.rooms || _.uniq(_.map(Game.spawns, (spawn) => spawn.room.name));

  // @TODO have this main loop iterate trhough each game spawns and do all of them as if they were their own group
  // Iterate through each room we are in
  for (let i in Object.keys(Game.spawns)) {
    // Get our data
    let spawn = Game.spawns[Object.keys(Game.spawns)[i]]
    let room = spawn.room;
    let statusUpdate = 'Room "'+room.name+'" has ' + room.energyAvailable + ' energy';
    let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave') ;
    let ogres  = _.filter(Game.creeps, (rat) => rat.memory.role === 'ogre');

    statusUpdate += (slaves.length > 0) ? ' ~ Slaves: ' + slaves.length : '';
    statusUpdate += (ogres.length > 0) ? ', Ogres: ' + ogres.length : '';

    // Get the data we need to determine if we need more slaves
    let extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
    let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
    let maxEnergyCapacity = extensionCapacity + spawnCapacity;
    let controllerLevel = room.controller.level

    // Rejigger max slaves for this room based on the level of the room


    // Spawn a skaven slave
    if ((slave.length < 2 || (slave.length < Memory.maxSlaves && room.energyAvailable >= maxEnergyCapacity)) && room.energyAvailable >= 200) {
      statusUpdate += roleSkaven.summonSkaven(room.energyAvailable, { homeRoom: room.name, version: room.controller.level });
    }
    // Spawn a rat ogre
    if (ogres < Memory.maxOgres && ogres.length === Memory.maxOgres && room.energyAvailable >= maxEnergyCapacity) {
      statusUpdate += roleSkaven.summonRatOgre(room.energyAvailable, { homeRoom: room.name, version: room.controller.level });
    }

  }

  // Set the max number of slaves for a room to the room controller size

  // If we have less than x harvesters, add more

  // Work the rats
  for(let name in Game.creeps) { var rat = Game.creeps[name]; roleSkaven.skitter(rat); }

  // Work Towers
  structures.tower.run();
  // structures.findHabitrail();

  structures.drawBaseplan();

  // Report what's up..
  console.log(statusUpdate);
}