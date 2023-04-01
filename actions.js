/** Skaven Actions
 * These are all the possible actions any Skaven can do so that we can access it from a single "brain" file.
 */

const sHarvest  = require('skaven.harvest');
const sBuild    = require('skaven.build');
const sStore    = require('skaven.store');
const sRepair   = require('skaven.repair');
const sUpgrade  = require('skaven.upgrade');
const sRenew    = require('skaven.renew');

let $actions = {
  harvest:  sHarvest,
  build:    sBuild,
  store:    sStore,
  repair:   sRepair,
  upgrade:  sUpgrade,
  renew:    sRenew,

  // // What ever we have decided to do.. go do that.
  // skitter: rat => {
  //   if (rat.memory.task === 'harvest')  { $actions.harvest.using(rat); }
  //   if (rat.memory.task === 'store')    { if (!$actions.store.using(rat))   { rat.sleep(); } }
  //   if (rat.memory.task === 'storeUntilEmpty') { $actions.store.using(rat); }
  //   if (rat.memory.task === 'renew')    { if (!$actions.renew.using(rat))   { rat.sleep(); } }
  //   if (rat.memory.task === 'upgrade')  { if (!$actions.upgrade.using(rat)) { rat.sleep(); } }
  //   if (rat.memory.task === 'build')    { if (!$actions.build.using(rat))   { rat.sleep(); } }
  //   if (rat.memory.task === 'repair')   { if (!$actions.repair.using(rat))  { rat.sleep(); } }
  // },

  // Number of rats actively doing a give task
  // numActive: task => {
  //   return _.filter(Game.creeps, rat => rat.memory.task === task).length;
  // },

  // Commonly used memory items for Skaven
  // defaultMemory: () => {
  //   return { task: null, slept: 0, taskAttempt: 0, moveAttempt: 0 }
  // },

  // Spawn us a skaven slave ~ Slaves are "do it all" workers, move, carry, work.. But they are dynamic in that
  // if we have more than 2 we summon specialized harvesters with no carry capacity to just stand and suckle.
  summonSkavenSlave: (room, memory) => {
    // Get our slaves and then get the number of them that don't have the ability to carry anything.
    const slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
    const numHaulers = _.filter(Game.creeps, rat => rat.body.every(part => part.type !== WORK)).length;
    const numHarvesters = _.filter(slaves, (slave) => !slave.body.some((part) => part.type === CARRY)).length;

    const ratName = 'Slave-' + Game.time + '-' + room.energyAvailable;
    const ratSpawn = room.find(FIND_MY_SPAWNS)[0];

    let renews = 0;
    let energy = room.energyAvailable;
    let percentWork = 0.5, percentCarry = 0.50;

    // If we have more than 2 slaves already, and we don't have as many dedicated harvesters as we need..
    // Summon a dedicated harvester -- which is a rat that can't carry.
    if (slaves.length >= 2 && numHarvesters < Memory.rooms[room.name].numSucklePoints) {
      percentWork = 0.85; percentCarry = 0; energy = energy > 1000 ? 1000 : energy; renews = (energy === 1000) ? 50 : 0;
    }

    // If we have more than 2 slaves already, and we have the max number of harvesters, and less haulers than harvesters..
    // Summon a dedicated hauler -- which is a rat that can't work.
    if (slaves.length >= 2 && numHarvesters >= 2 && numHaulers < numHarvesters-1) {
      percentWork = 0; percentCarry = 0.60; energy = energy > 1500 ? 1500 : energy;
      renews = (energy - 200) / (1500 - 200) * 20;
    }

    // Setup the rat brain
    const ratBrain = { memory: { role: 'slave', renews: renews, spawn: { id: ratSpawn.id, name: ratSpawn.name }, task: null, slept: 0, taskAttempt: 0, moveAttempt: 0, ...memory } };
    // Calculate the number of body parts based on energySize
    const numWork  = Math.floor(energy * percentWork / 100); // 50% of the energy to work
    energy = energy - numWork * 100;
    const numCarry = Math.floor(energy * percentCarry / 50); // 50% of the remaining energy to carry
    energy = energy - numCarry * 50;
    const numMove  = Math.floor(energy / 50); // 100% remaining to move
    energy = energy - numMove * 50;
    let numTough = Math.floor(energy / 10); // Any amount left over, add toughness

    // Build the array of body parts based on the calculated numbers
    let ratParts = [];
    for (let i = 0; i < numWork; i++)   { ratParts.push(WORK); }
    for (let i = 0; i < numCarry; i++)  { ratParts.push(CARRY); }
    for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE); }
    for (let i = 0; i < numTough; i++)  { ratParts.push(TOUGH); }
    ratSpawn.spawnCreep(ratParts, ratName, ratBrain);
  },

  // // Spawn us a rat ogre
  // summonRatOgre: (energy, memory) => {
  //   let ratName = 'RatOgre-' + Game.time;
  //   let ratSpawn = Object.keys(Game.spawns)[0];
  //   let ratBrain = { memory: { role: 'ogre', spawn: ratSpawn, ...$actions.defaultMemory(), ...memory } };
  //   // Calculate the number of body parts based on energySize
  //   let numAttack  = Math.floor(energy * 0.60 / 80); // 60% of the energy to attack
  //   energy = energy - numAttack * 80;
  //   let numMove  = Math.floor(energy * 0.70 / 50); // 70% remaining to move
  //   energy = energy - numMove * 50;
  //   let numTough = Math.floor(energy / 10); // Any amount left over, add toughness
  //   // Build the array of body parts based on the calculated numbers
  //   let ratParts = [];
  //   for (let i = 0; i < numAttack; i++) { ratParts.push(ATTACK); }
  //   for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE); }
  //   for (let i = 0; i < numTough; i++)  { ratParts.push(TOUGH); }
  //   Game.spawns[Object.keys(Game.spawns)[0]].spawnCreep(ratParts, ratName, ratBrain);
  // },

  // Track tile visits by rats, so we can determine how frequently they go there.
  // trackTileVisits: rat => {
  //   if (!Memory.tileVisits) { Memory.tileVisits = {}; }
  //   if (!Memory.tileVisits[rat.pos.x]) { Memory.tileVisits[rat.pos.x] = {}; }
  //   if (!Memory.tileVisits[rat.pos.x][rat.pos.y]) { Memory.tileVisits[rat.pos.x][rat.pos.y] = 0; }
  //   Memory.tileVisits[rat.pos.x][rat.pos.y]++;
  // },

  // Get the most visited tile
  // getMostVisitedTile: () => {
  //   let mostVisited = {x: null, y: null, count: 0};
  //   for (let x in Memory.tileVisits) {
  //     for (let y in Memory.tileVisits[x]) {
  //       let count = Memory.tileVisits[x][y];
  //       if (count > mostVisited.count) {
  //         mostVisited.x = x;
  //         mostVisited.y = y;
  //         mostVisited.count = count;
  //       }
  //     }
  //   }
  //   return mostVisited;
  // },

  // Find us the nearest available spawn for the room this rat is in
  // getAvailableSpawn: rat => {
  //   const spawns = rat.room.find(FIND_MY_STRUCTURES, {
  //     filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  //   });
  //   return spawns.length > 0 ? rat.pos.findClosestByRange(spawns) : false;
  // }

};

module.exports = $actions;
