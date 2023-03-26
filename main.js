const roleSkaven = require('role.skaven');
const rooms = require('rooms');

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

  let statusUpdate = "";
  // @TODO have this main loop iterate trhough each game spawns and do all of them as if they were their own group
  // Iterate through each room we are in
  for (let i in Memory.roomsList) {

    // let spawn = Game.spawns[Object.keys(Game.spawns)[i]]
    let roomName = Memory.roomsList[i];
    let room = Game.rooms[roomName];
    // Setup the room if it hasn't been yet
    let mem = rooms.setMemory(room);

    statusUpdate = 'Room "'+room.name+'" has ' + room.energyAvailable + ' energy';
    let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave') ;
    let ogres  = _.filter(Game.creeps, (rat) => rat.memory.role === 'ogre');
    statusUpdate += (slaves.length > 0) ? ' ~ Slaves: ' + slaves.length + '/' + Memory.rooms[room.name].maxSlaves : '';
    statusUpdate += (ogres.length > 0) ? ', Ogres: ' + ogres.length : '';

    // Get the data we need to determine if we need more slaves
    let energyHolders = room.find(FIND_MY_STRUCTURES, { filter: { structureType: [STRUCTURE_EXTENSION, STRUCTURE_SPAWN] } });
    Memory.rooms[roomName].maxEnergy = _.sum(energyHolders, (holder) => holder.energyCapacity);
    let controllerLevel = room.controller.level
 console.log(room.name);
    let numSucklePoints = () => { return Object.values(Memory.rooms[room.name].sources).reduce((acc, val) => acc + val.length, 0); }
    // Rejigger max slaves for this room based on the number of suckle points..
    Memory.rooms[room.name].maxSlaves = numSucklePoints() * 2;


    // Spawn a skaven slave
    if ((slaves.length < 2 || (slaves.length < mem.maxSlaves && room.energyAvailable >= Memory.rooms[room.name].maxEnergy)) && room.energyAvailable >= 200) {
      statusUpdate += roleSkaven.summonSkaven(room.energyAvailable, { homeRoom: room.name, version: room.controller.level });
    }
    // Spawn a rat ogre
    if (ogres < Memory.maxOgres && ogres.length === mem.maxOgres && room.energyAvailable >= Memory.rooms[room.name].maxEnergy) {
      statusUpdate += roleSkaven.summonRatOgre(room.energyAvailable, { homeRoom: room.name, version: room.controller.level });
    }

    // Based on the status of the room
    rooms.run(room);
  }

  // Set the max number of slaves for a room to the room controller size

  // If we have less than x harvesters, add more

  // Work the rats
  for(let name in Game.creeps) { var rat = Game.creeps[name]; roleSkaven.skitter(rat); }

  // Report what's up..
  console.log(statusUpdate);
}