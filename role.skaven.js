const $actions = require('actions');
// const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    if (rat.memory.role === 'slave') {
      $actions.trackTileVisits(rat);
      let maxSlaves = Memory.maxSlaves;
      let slave = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      let constructionTargets = Memory.tickCount % 5 ? rat.room.find(FIND_CONSTRUCTION_SITES) : null;
      let repairTargets = Memory.tickCount % 10 ? $actions.repair.getRepairTargets(rat) : null;
      let upgradeTarget = rat.room.controller;

      // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn
      if (rat.ticksToLive <= 50 && rat.memory.task !== 'renew') {
        // let room = Game.spawns[Object.keys(Game.spawns)[0]].room;
        // const spawn = Game.spawns[rat.memory.spawn];
        console.log(Game.rooms[rat.memory.roomBound].energyAvailable)
        if (Game.rooms[rat.memory.roomBound].energyAvailable > 100) {
          rat.memory.task = 'renew';
          rat.say('⌛');
        }
      }
      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // If rat has less than 20% free capacity (80% full) then go do some work.
        if (rat.store.getFreeCapacity() / rat.store.getCapacity() < 0.2) {
          // Construction comes first... If we have 50% or more rats, and we don't have more than 50% doing the work
          if (constructionTargets && constructionTargets.length > 0 && slave.length >= (maxSlaves/2) && $actions.numActive('build') <= (maxSlaves*0.5)) {
            rat.memory.task = 'build';
            rat.memory.slept = 0;
            rat.say('🚧');
          }
          // Repair comes second... If we have 50% or more rats, and we have 20% or less repairing
          else if (repairTargets && repairTargets.length > 0 && slave.length >= (maxSlaves/2) && $actions.numActive('repair') <= (maxSlaves*0.2)) {
            rat.memory.task = 'repair';
            rat.memory.slept = 0;
            rat.say('🔧');
          }
          // Upgrade comes third... But only if we have 80% of max slaves and then only 20% can do the work..
          // or if we have slept a while.. Meaning there is nothing else to do.. go upgrade.
          else if (upgradeTarget && ((slave.length >= (maxSlaves*0.8) && $actions.numActive('upgrade') <= (maxSlaves*0.2)) || rat.memory.slept > 5)) {
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
      $actions.skitter(rat);
    }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonSkaven: (energy, memory) => {
    if (energy >= 300) { $actions.summonSkavenSlave(energy, memory); return ' ~ Spawning new Skaven ('+energy+')' } else { return ''; }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRatOgre: (energy, memory) => {
    if (energy >= 600) { $actions.summonRatOgre(energy, memory); return ' ~ Spawning new Rat Ogre ('+energy+')'; } else { return ''; }
  },

}
module.exports = roleSkaven;
