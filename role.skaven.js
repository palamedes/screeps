const skavenActions = require('skaven.actions');
// const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    if (rat.memory.role === 'slave') {
      skavenActions.trackTileVisits(rat);
      let maxSkaven = Memory.maxSkaven;
      let slave = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      let constructionTargets = rat.room.find(FIND_CONSTRUCTION_SITES);
      let repairTargets = skavenActions.repair.getRepairTargets(rat);
      let upgradeTarget = rat.room.controller;
      // If our ticks to live is down to 200, stop what you're doing and go solve that.
      if (rat.ticksToLive <= 100 && rat.memory.task !== 'renew') {
        rat.memory.task = 'renew';
        rat.say('⌛');
      }
      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // If rat has less than 20% free capacity (80% full) then go do some work.
        if (rat.store.getFreeCapacity() / rat.store.getCapacity() < 0.2) {
          // Construction comes first... If we have 50% or more rats, and we don't have more than 50% doing the work
          if (constructionTargets.length > 0 && slave.length >= (maxSkaven/2) && skavenActions.numActive('build') <= (maxSkaven*0.5)) {
            rat.memory.task = 'build';
            rat.memory.slept = 0;
            rat.say('🚧');
          }
          // Repair comes second... If we have 50% or more rats, and we have 20% or less repairing
          else if (repairTargets.length > 0 && slave.length >= (maxSkaven/2) && skavenActions.numActive('repair') <= (maxSkaven*0.2)) {
            rat.memory.task = 'repair';
            rat.memory.slept = 0;
            rat.say('🔧');
          }
          // Upgrade comes third... But only if we have 80% of max slaves and then only 20% can do the work..
          // or if we have slept a while.. Meaning there is nothing else to do.. go upgrade.
          else if (upgradeTarget && ((slave.length >= (maxSkaven*0.8) && skavenActions.numActive('upgrade') <= (maxSkaven*0.2)) || rat.memory.slept > 5)) {
            rat.memory.task = 'upgrade';
            rat.memory.slept = 0;
            rat.say('🛠️');
          }
          else {
            rat.memory.task = 'store';
            // rat.memory.slept = 0; // NO.  This is a fail through task, don't reset sleep.
            rat.say('🔋');
          }
          //
        } else {
          rat.memory.task = 'harvest';
          rat.memory.myTargetId = null;
          rat.memory.slept = 0;
          rat.say('⚡');
        }
      }
      // Okay rat... Do something..
      skavenActions.skitter(rat);
    }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonSkaven: (energy, memory) => {
    if (energy >= 300) { skavenActions.summonSkavenSlave(energy, memory); return ' ~ Spawning new Skaven ('+energy+')' } else { return ''; }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRatOgre: (energy, memory) => {
    if (energy >= 600) { skavenActions.summonRatOgre(energy, memory); return ' ~ Spawning new Rat Ogre ('+energy+')'; } else { return ''; }
  },

}
module.exports = roleSkaven;
