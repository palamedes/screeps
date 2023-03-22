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
    if (rat.memory.role === 'skaven') {
      // Determine what we should be doing...
      if (!rat.memory.task) {
        // If they have no free capacity for energy, then go do some work.
        if (rat.store.getFreeCapacity() === 0) {
          // Construction comes first... If we have 50% or more rats, and we don't have more than 50% doing the work
          if (constructionTargets.length > 0 && skaven.length >= (maxSkaven/2) && skavenActions.numActive('build') <= (maxSkaven*0.5)) {
            rat.memory.task = 'build';
            rat.memory.slept = 0;
            rat.say('🚧Build');
          }
          // Repair comes second... If we have 50% or more rats, and we have 20% or less repairing
          else if (repairTargets.length > 0 && skaven.length >= (maxSkaven/2) && skavenActions.numActive('repair') <= (maxSkaven*0.2)) {
            rat.memory.task = 'repair';
            rat.memory.slept = 0;
            rat.say('🔧Repair');
          }
          // Upgrade comes third... But only if we have 80% of max skaven and then only 20% can do the work..
          // or if we have slept a while.. Meaning there is nothing else to do.. go upgrade.
          else if (upgradeTarget && ((skaven.length >= (maxSkaven*0.8) && skavenActions.numActive('upgrade') <= (maxSkaven*0.2)) || rat.memory.slept > 8)) {
            rat.memory.task = 'upgrade';
            rat.memory.slept = 0;
            rat.say('🔧Upgrade');
          }
          else {
            rat.memory.task = 'store';
            rat.memory.slept = 0;
            rat.say('⚡Store');
          }
        } else {
          rat.memory.task = 'harvest';
          rat.memory.myTargetId = null;
          rat.memory.slept = 0;
          rat.say('⛏️Harvest');
        }
      }
      // Okay rat... Do something..
      skavenActions.skitter(rat);
    }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonSkaven: (energy, memory) => {
    if (energy >= 300) { skavenActions.summonSkaven(energy, memory); return ' ~ Spawning new Skaven ('+energy+')' } else { return ''; }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRatOgre: (energy, memory) => {
    if (energy >= 600) { skavenActions.summonRatOgre(energy, memory); return ' ~ Spawning new Rat Ogre ('+energy+')'; } else { return ''; }
  },


}
module.exports = roleSkaven;
