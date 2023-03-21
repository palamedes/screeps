const skavenActions = require('skaven.actions');
const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    let skaven = _.filter(Game.creeps, (rat) => rat.memory.role === 'skaven');
    let constructionTargets = rat.room.find(FIND_CONSTRUCTION_SITES);
    let repairTargets = skavenActions.repair.getRepairTargets(rat);
    let upgradeTarget = rat.room.controller;
    // Determine what we should be doing...
    if (!rat.memory.task) {
      // If they have no free capacity for energy, then go do some work.
      if (rat.store.getFreeCapacity() === 0) {
        // Construction comes first... If we have 5 or more rats, and we dont have more than 4 doing the work
        if (constructionTargets.length > 0 && skaven.length >= 5 && skavenActions.numActive('build') <= 4) {
          rat.memory.task = 'build';
          rat.say('🚧Build');
        }
        // Repair comes second... If we have 5 or more rats, and we have 2 or less doing the work.
        else if (repairTargets.length > 0 && skaven.length >= 5 && skavenActions.numActive('repair') <= 2) {
          rat.say('🔧Repair');
          rat.memory.task = 'repair';
        }
        // Upgrade comes third... But only if we have 8 or more rats and only 4 at most are doing it.
        else if (upgradeTarget && skaven.length >= 8 && skavenActions.numActive('upgrade') <= 4) {
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
  summonRat: (energySize, memory) => {
    let ratName = 'Skaven-' + Game.time;
    let ratBrain = { memory: { role: 'skaven', task: null, slept: 0, attempted: 0, ...memory } };
    // Calculate the number of body parts based on energySize
    let numWork  = Math.floor(energySize * 0.50 / BODYPART_COST[WORK]);
    let numCarry = Math.floor(energySize * 0.25 / BODYPART_COST[CARRY]);
    let numMove  = Math.floor(energySize * 0.25 / BODYPART_COST[MOVE]);
    // Build the array of body parts based on the calculated numbers
    let costs = 0;
    let ratParts = [];
    for (let i = 0; i < numWork; i++)   { ratParts.push(WORK);  costs += BODYPART_COST[WORK]; }
    for (let i = 0; i < numCarry; i++)  { ratParts.push(CARRY); costs += BODYPART_COST[CARRY] }
    for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE);  costs += BODYPART_COST[MOVE] }
    // Any amount left over, add toughness
    let numTough = Math.floor((energySize-costs) / BODYPART_COST[TOUGH]);
    for (let i = 0; i < numTough; i++) { ratParts.push(TOUGH); }

    console.log(ratParts);

    // Game.spawns["Toiletduck's Nest"].spawnCreep(ratParts, ratName, ratBrain);
  },
}
module.exports = roleSkaven;
