const skavenActions = require('skaven.actions');
const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    let maxSkaven = Memory.maxSkaven;
    let skaven = _.filter(Game.creeps, (rat) => rat.memory.role === 'skaven');
    let constructionTargets = rat.room.find(FIND_CONSTRUCTION_SITES);
    let repairTargets = skavenActions.repair.getRepairTargets(rat);
    let upgradeTarget = rat.room.controller;
    // Determine what we should be doing...
    if (!rat.memory.task) {
      // If they have no free capacity for energy, then go do some work.
      if (rat.store.getFreeCapacity() === 0) {
        // Construction comes first... If we have 5 or more rats, and we dont have more than 4 doing the work
        if (constructionTargets.length > 0 && skaven.length >= (maxSkaven/2) && skavenActions.numActive('build') <= (maxSkaven*0.4)) {
          rat.memory.task = 'build';
          rat.say('🚧Build');
        }
        // Repair comes second... If we have 5 or more rats, and we have 2 or less doing the work.
        else if (repairTargets.length > 0 && skaven.length >= (maxSkaven/2) && skavenActions.numActive('repair') <= (maxSkaven*0.2)) {
          rat.memory.task = 'repair';
          rat.say('🔧Repair');
        }
        // Upgrade comes third... But only if we have 80% of max skaven and then only 40% can do the work
        else if (upgradeTarget && skaven.length >= (maxSkaven*0.8) && skavenActions.numActive('upgrade') <= (maxSkaven*0.4)) {
          rat.memory.task = 'upgrade';
          rat.say('🔧Upgrade');
        }
        else {
          rat.memory.task = 'store';
          rat.say('⚡Store');
        }
      } else {
        rat.memory.task = 'harvest';
        rat.memory.myTargetId = null;
        rat.say('⛏️Harvest');
      }
    }
    // Okay rat... Do something..
    skavenActions.skitter(rat);
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRat: (energy, memory) => {
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
}
module.exports = roleSkaven;
