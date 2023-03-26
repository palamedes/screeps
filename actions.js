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

  // What ever we have decided to do.. go do that.
  skitter: rat => {
    if (rat.memory.task === 'harvest')  { $actions.harvest.using(rat); }
    if (rat.memory.task === 'store')    { $actions.store.using(rat); }
    if (rat.memory.task === 'renew')    { if (!$actions.renew.using(rat))   { $actions.sleep(rat); } }
    if (rat.memory.task === 'upgrade')  { if (!$actions.upgrade.using(rat)) { $actions.sleep(rat); } }
    if (rat.memory.task === 'build')    { if (!$actions.build.using(rat))   { $actions.sleep(rat); } }
    if (rat.memory.task === 'repair')   { if (!$actions.repair.using(rat))  { $actions.sleep(rat); } }
  },

  sleep: rat => {
    rat.memory.myTargetId = null;
    rat.memory.task = null;
    rat.memory.slept++;
  },

  // Number of rats actively doing a give task
  numActive: task => {
    return _.filter(Game.creeps, rat => rat.memory.task === task).length;
  },

  // Commonly used memory items for Skaven
  defaultMemory: () => {
    return { task: null, slept: 0, taskAttempt: 0, moveAttempt: 0 }
  },

  // Spawn us a skaven slave ~ Slaves are "do it all" workers, move, carry, work.. But they are dynamic in that
  // if we have more than 2 we summon specialized harvesters with no carry capacity to just stand and suckle.
  summonSkavenSlave: (room, memory) => {
    // Get our slaves and then get the number of them that don't have the ability to carry anything.
    const slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
    const numHarvesters = _.filter(slaves, (slave) => !slave.body.some((part) => part.type === CARRY)).length;

    const ratName = 'Slave-' + Game.time + '-' + room.energyAvailable;
    const ratSpawn = room.find(FIND_MY_SPAWNS)[0]
    const ratBrain = { memory: { role: 'slave', spawn: ratSpawn, ...$actions.defaultMemory(), ...memory } };

    let percentWork = 0.5, percentCarry = 0.50;
    // If we have more than 2 slaves already, and we don't have as many dedicated harvesters as we need.. get one
    if (slaves.length >= 2 && numHarvesters < Memory.rooms[room.name].numSucklePoints) {
      percentWork = 0.75; percentCarry = 0;
    }

    let energy = room.energyAvailable;
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
  trackTileVisits: rat => {
    if (!Memory.tileVisits) { Memory.tileVisits = {}; }
    if (!Memory.tileVisits[rat.pos.x]) { Memory.tileVisits[rat.pos.x] = {}; }
    if (!Memory.tileVisits[rat.pos.x][rat.pos.y]) { Memory.tileVisits[rat.pos.x][rat.pos.y] = 0; }
    Memory.tileVisits[rat.pos.x][rat.pos.y]++;
  },

  // Get the most visited tile
  getMostVisitedTile: () => {
    let mostVisited = {x: null, y: null, count: 0};
    for (let x in Memory.tileVisits) {
      for (let y in Memory.tileVisits[x]) {
        let count = Memory.tileVisits[x][y];
        if (count > mostVisited.count) {
          mostVisited.x = x;
          mostVisited.y = y;
          mostVisited.count = count;
        }
      }
    }
    return mostVisited;
  }
};

module.exports = $actions;
