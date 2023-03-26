const $actions = require('actions');
// const utility = require('utility');
/** Skaven! */
var roleSkaven = {

  skitter: rat => {
    if (rat.memory.role === 'slave') {
      $actions.trackTileVisits(rat);
      let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn
      if (rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room.controller.level >= 5) {
        if (Game.rooms[rat.memory.homeRoom].energyAvailable > 100) {
          rat.memory.task = 'renew'; rat.say('⌛');
        }
      }
      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // If rat has less than 20% free capacity (80% full) then go do some work.
        if ((rat.store.getFreeCapacity() / rat.store.getCapacity()) < 0.2) {
          // Construction comes first...
          if (roleSkaven.shouldWeBuild(rat, slaves)) {
            rat.memory.task = 'build'; rat.memory.slept = 0; rat.say('🚧');
          }
          // Repair comes second...
          else if (roleSkaven.shouldWeRepair(rat, slaves)) {
            rat.memory.task = 'repair'; rat.memory.slept = 0; rat.say('🔧');
          }
          // Upgrade comes third...
          else if (roleSkaven.shouldWeUpgrade(rat, slaves)) {
            rat.memory.task = 'upgrade'; rat.memory.slept = 0; rat.say('🛠️');
          }
          // No work to do, go store...
          else {
            rat.memory.task = 'store'; rat.say('🔋');
          }
        // Go harvest
        } else {
          rat.memory.task = 'harvest'; rat.memory.myTargetId = null; rat.memory.slept = 0; rat.say('⚡');
        }
      }
      // Okay rat... Do something..
      $actions.skitter(rat);
    }
  },

  // Should we build something? If we have 50% or more rats, and we don't have more than 50% doing the work
  shouldWeBuild: (rat, slaves) => {
    const constructionTargets = Memory.tickCount % 5 ? rat.room.find(FIND_CONSTRUCTION_SITES) : null;
    if (constructionTargets && constructionTargets.length > 0) {
      // Do we have 50% or more max rats?
      const enoughSlaves = slaves.length >= (Memory.rooms[rat.room.name].maxSlaves/2);
      // Are less than 50% of them doing the work?
      const notEnoughActive = $actions.numActive('build') <= (Memory.rooms[rat.room.name].maxSlaves*0.5);
      // Are we full energy?
      const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy) return true;
    }
    return false;
  },

  // Should we upgrade the controller?
  shouldWeUpgrade: (rat, slaves) => {
    const upgradeTarget = rat.room.controller;
    if (upgradeTarget) {
      // if the rat has been sleeping on the job, go make him upgrade..
      if (rat.memory.slept > 5) return true;
      // Do we have 80% of max slaves?
      const enoughSlaves = slaves.length >= (Memory.rooms[rat.room.name].maxSlaves*0.8);
      // Are less than 25% doing the work?
      const notEnoughActive = $actions.numActive('upgrade') <= (Memory.rooms[rat.room.name].maxSlaves*0.25);
      // Are we full energy?
      const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy) return true;
    }
    return false;
  },

  // Should we repair something?
  //If we have 50% or more rats, and we have 20% or less repairing
  //repairTargets && repairTargets.length > 0 && slaves.length >= (maxSlaves/2) && $actions.numActive('repair') <= (maxSlaves*0.2)
  shouldWeRepair: (rat, slaves) => {
    const repairTargets = Memory.tickCount % 10 ? $actions.repair.getRepairTargets(rat) : null;
    if (repairTargets && repairTargets.length > 0) {
      // Do we have 50% or more rats?
      const enoughSlaves = slaves.length >= (Memory.rooms[rat.room.name].maxSlaves/2);
      // Are less than 25% doing the work?
      const notEnoughActive = $actions.numActive('repair') <= (Memory.rooms[rat.room.name].maxSlaves*0.25)
      // Are there no towers repairing?
      const noTowers = Object.values(Game.structures).filter(structure => structure.structureType === STRUCTURE_TOWER).length > 0;
      // Decide
      if (enoughSlaves && notEnoughActive && noTowers) return true;
    }
    return false;
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonSlave: (energy, memory) => {
    if (energy >= 300) { $actions.summonSkavenSlave(energy, memory); return ' ~ Spawning new Slave ('+energy+')' } else { return ''; }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonHarvester: (energy, memory) => {
    if (energy >= 300) { $actions.summonSkavenHarvester(energy, memory); return ' ~ Spawning new Harvester ('+energy+')' } else { return ''; }
  },

  // Spawn us a rat ~ Standard Skaven worker rat
  summonRatOgre: (energy, memory) => {
    if (energy >= 600) { $actions.summonRatOgre(energy, memory); return ' ~ Spawning new Rat Ogre ('+energy+')'; } else { return ''; }
  },

}
module.exports = roleSkaven;
