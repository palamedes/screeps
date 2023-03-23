/** Skaven Actions
 * These are all the possible actions any Skaven can do so that we can access it from a single "brain" file.
 */

const sHarvest  = require('skaven.harvest');
const sBuild    = require('skaven.build');
const sStore    = require('skaven.store');
const sRepair   = require('skaven.repair');
const sUpgrade  = require('skaven.upgrade');
const sRenew    = require('skaven.renew');

let skavenActions = {
  harvest:  sHarvest,
  build:    sBuild,
  store:    sStore,
  repair:   sRepair,
  upgrade:  sUpgrade,
  renew:    sRenew,

  // What ever we have decided to do.. go do that.
  skitter: rat => {
    if (rat.memory.task === 'harvest')  { skavenActions.harvest.using(rat); }
    if (rat.memory.task === 'build')    { skavenActions.build.using(rat); }
    if (rat.memory.task === 'repair')   { skavenActions.repair.using(rat); }
    if (rat.memory.task === 'upgrade')  { skavenActions.upgrade.using(rat); }
    if (rat.memory.task === 'store')    { skavenActions.store.using(rat); }
    if (rat.memory.task === 'renew')    { skavenActions.renew.using(rat); }
  },
  // Number of rats actively doing a give task
  numActive: task => {
    return _.filter(Game.creeps, rat => rat.memory.task === task).length;
  },
  // Spawn us a skaven slave
  summonSkavenSlave: (energy, memory) => {
    let ratName = 'Slave-' + Game.time;
    let ratSpawn = Object.keys(Game.spawns)[0];
    let ratBrain = { memory: { role: 'slave', spawn: ratSpawn, task: null, slept: 0, attempted: 0, ...memory } };
    // Calculate the number of body parts based on energySize
    let numWork  = Math.floor(energy * 0.50 / 100); // 50% of the energy to work
    energy = energy - numWork * 100;
    let numCarry = Math.floor(energy * 0.50 / 50); // 50% of the remaining energy to carry
    energy = energy - numCarry * 50;
    let numMove  = Math.floor(energy / 50); // 100% remaining to move
    energy = energy - numMove * 50;
    let numTough = Math.floor(energy / 10); // Any amount left over, add toughness
    // Build the array of body parts based on the calculated numbers
    let ratParts = [];
    for (let i = 0; i < numWork; i++)   { ratParts.push(WORK); }
    for (let i = 0; i < numCarry; i++)  { ratParts.push(CARRY); }
    for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE); }
    for (let i = 0; i < numTough; i++)  { ratParts.push(TOUGH); }
    Game.spawns[ratSpawn].spawnCreep(ratParts, ratName, ratBrain);
  },
  // Spawn us a rat ogre
  summonRatOgre: (energy, memory) => {
    let ratName = 'RatOgre-' + Game.time;
    let ratBrain = { memory: { role: 'ogre', task: null, slept: 0, attempted: 0, ...memory } };
    // Calculate the number of body parts based on energySize
    let numAttack  = Math.floor(energy * 0.60 / 80); // 60% of the energy to attack
    energy = energy - numAttack * 80;
    let numMove  = Math.floor(energy * 0.70 / 50); // 70% remaining to move
    energy = energy - numMove * 50;
    let numTough = Math.floor(energy / 10); // Any amount left over, add toughness
    // Build the array of body parts based on the calculated numbers
    let ratParts = [];
    for (let i = 0; i < numAttack; i++)   { ratParts.push(ATTACK); }
    for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE); }
    for (let i = 0; i < numTough; i++)  { ratParts.push(TOUGH); }
    Game.spawns[Object.keys(Game.spawns)[0]].spawnCreep(ratParts, ratName, ratBrain);
  },
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

module.exports = skavenActions;
