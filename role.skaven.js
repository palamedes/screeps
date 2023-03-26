const $actions = require('actions');
// const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    if (rat.memory.role === 'slave') {
      $actions.trackTileVisits(rat);
      let maxSlaves = Memory.rooms[rat.room.name].maxSlaves;
      let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      let repairTargets = Memory.tickCount % 10 ? $actions.repair.getRepairTargets(rat) : null;

      // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn

      // Disabling renew for now while I get creep versioning working..
      // @TODO Consider rat versions after level 5.. dont bother until level 5.
      if (rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room.controller.level >= 5) {
        // let room = Game.spawns[Object.keys(Game.spawns)[0]].room;
        // const spawn = Game.spawns[rat.memory.spawn];
        if (Game.rooms[rat.memory.homeRoom].energyAvailable > 100) {
          rat.memory.task = 'renew';
          rat.say('⌛');
        }
      }

      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // If rat has less than 20% free capacity (80% full) then go do some work.
        if ((rat.store.getFreeCapacity() / rat.store.getCapacity()) < 0.2) {

          // Construction comes first...
          if (roleSkaven.shouldWeBuild(rat, slaves, maxSlaves)) {
            rat.memory.task = 'build';
            rat.memory.slept = 0;
            rat.say('🚧');
          }

          // Repair comes second... If we have 50% or more rats, and we have 20% or less repairing
          else if (repairTargets && repairTargets.length > 0 && slaves.length >= (maxSlaves/2) && $actions.numActive('repair') <= (maxSlaves*0.2)) {
            rat.memory.task = 'repair';
            rat.memory.slept = 0;
            rat.say('🔧');
          }

          // Upgrade comes third...
          else if (roleSkaven.shouldWeUpgrade(rat, slaves, maxSlaves)) {
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

  // Should we build something? If we have 50% or more rats, and we don't have more than 50% doing the work
  shouldWeBuild: (rat, slaves, maxSlaves) => {
    const constructionTargets = Memory.tickCount % 5 ? rat.room.find(FIND_CONSTRUCTION_SITES) : null;
    if (constructionTargets && constructionTargets.length > 0) {
      // Do we have 50% or more max rats?
      const enoughSlaves = slaves.length >= (maxSlaves/2);
      // Are less than 50% of them doing the work?
      const notEnoughActive = $actions.numActive('build') <= (maxSlaves*0.5);
      // Are we full energy?
      console.log('room energy: ' + rat.room.energyAvailable + ' max: ' + emory.rooms[rat.room.name].maxEnergy);
      const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy) return true;
    }
    return false;
  },

  // Should we upgrade the controller?
  shouldWeUpgrade: (rat, slaves, maxSlaves) => {
    const upgradeTarget = rat.room.controller;
    if (upgradeTarget) {
      // if the rat has been sleeping on the job, go make him upgrade..
      if (rat.memory.slept > 5) return true;
      // Do we have 80% of max slaves?
      const enoughSlaves = slaves.length >= (maxSlaves*0.8);
      // Are less than 25% doing the work?
      const notEnoughActive = $actions.numActive('upgrade') <= (maxSlaves*0.25);
      // Are we full energy?
      const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy) return true;
    }
    return false;
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
