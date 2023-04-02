console.log('Code Reloaded!');
require('creep');
require('creep.move');
require('creep.task.store');
require('creep.task.harvest');
require('creep.skaven');
require('creep.skaven.slave');
require('creep.skaven.runner');

require('room');
require('room.summon.slave');

// let startCPU = Game.cpu.getUsed();
//   CODE HERE
// let endCPU = Game.cpu.getUsed();
// let resCPU = Math.round(((endCPU-startCPU) * 1000) *1000)/10000
// console.log(resCPU);

let utility = require('utility');
module.exports.loop = function () {
  // Delete memory of old dead creeps
  for(var name in Memory.creeps) { if(!Game.creeps[name]) { delete Memory.creeps[name]; }}
  // Get all our rooms (this should just be 1 room at the start of the game.. the rest will be added later)
  Memory.roomsList = Memory.roomsList || _.uniq(_.map(Game.spawns, (spawn) => spawn.room.name));

  // Define some universal values
  const slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave') ;
  const runners = _.filter(Game.creeps, (rat) => rat.memory.role === 'runner') ;

  // Iterate through each room we are in
  for (let i in Memory.roomsList) {
    const roomName = Memory.roomsList[i], room = Game.rooms[roomName], mem = room.setMemory(room);
    const spawns = room.find(FIND_MY_SPAWNS);
    const extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    const containers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_CONTAINER } });
    const totalSpawnsCapacity = _.sum(spawns, (s) => s.energyCapacity);
    const totalExtensionsCapacity = _.sum(extensions, (e) => e.energyCapacity);
    Memory.rooms[roomName].maxEnergy = totalSpawnsCapacity + totalExtensionsCapacity;
    Memory.rooms[roomName].containerAvailability = _.sum(containers, (c) => c.store.getFreeCapacity(RESOURCE_ENERGY));
    Memory.rooms[roomName].numSucklePoints = Object.values(Memory.rooms[room.name].sources).reduce((acc, val) => acc + val.length, 0);
    Memory.rooms[room.name].maxSlaves = (Memory.rooms[room.name].numSucklePoints * 2) + Memory.rooms[room.name].numSucklePoints;
    // At RCL 5+ we need to start being smarter about our rats and who does what work.
    if (room.controller.level >= 5) Memory.rooms[room.name].maxSlaves = 5;
    // Spawn something if we need to
    Creep.summonSkavenSlave(room, slaves);      // Spawn a Skaven Slave
    Creep.summonSkavenRunner(room, runners);    // Spawn a Skaven Gutter Runner
    // Run the room..
    room.run();
  }

  // Run the rats!
  for(let name in Game.creeps) { Game.creeps[name].run(slaves, runners); }
}