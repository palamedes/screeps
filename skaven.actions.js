const sHarvest  = require('skaven.harvest');
const sBuild    = require('skaven.build');
const sStore    = require('skaven.store');
const sRepair   = require('skaven.repair');
const sUpgrade  = require('skaven.upgrade');

let skavenActions = {
  harvest:  sHarvest,
  build:    sBuild,
  store:    sStore,
  repair:   sRepair,
  upgrade:  sUpgrade,

  // What ever we have decided to do.. go do that.
  skitter: rat => {
    if (rat.memory.task === 'harvest')  { skavenActions.harvest.using(rat); }
    if (rat.memory.task === 'build')    { skavenActions.build.using(rat); }
    if (rat.memory.task === 'repair')   { skavenActions.repair.using(rat); }
    if (rat.memory.task === 'upgrade')  { skavenActions.upgrade.using(rat); }
    if (rat.memory.task === 'store')    { skavenActions.store.using(rat); }
  },
  // Number of rats actively doing a give task
  numActive: task => {
    return _.filter(Game.creeps, rat => rat.memory.task === task).length;
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonSkaven: (energy, memory) => {
    if (energy < 200) { return false; }
    let ratName = 'Skaven-' + Game.time;
    let ratBrain = { memory: { role: 'skaven', task: null, slept: 0, attempted: 0, ...memory } };
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

    Game.spawns["Toiletduck's Nest"].spawnCreep(ratParts, ratName, ratBrain);
  },

};

module.exports = skavenActions;
