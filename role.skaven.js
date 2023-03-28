const $actions = require('actions');

/** Skaven! */
var roleSkaven = {

  skitter: rat => {

    if (rat.memory.role === 'slave') {

      let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn
      if (rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room.controller.level >= 4 && rat.memory.renews > 0) {
        if (Game.rooms[rat.memory.homeRoom].energyAvailable > 100) {
          rat.memory.renews--;
          rat.memory.task = 'renew'; rat.say('⌛');
        }
      }
      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // if this rat can't carry, then he's a harvester.. go do that.
        if (rat.body.filter(part => part.type === CARRY).length === 0) {
          rat.memory.task = 'harvest'; rat.memory.myTargetId = null; rat.memory.slept = 0; rat.say('⚡');
        }
        // If rat has less than 90% free capacity (10% full) then go do some work.. Else harvest.
        if ((rat.store.getFreeCapacity() / rat.store.getCapacity()) < 0.9) {
          // Upgrade Controller
          if (roleSkaven.shouldWeUpgrade(rat, slaves)) {
            rat.memory.task = 'upgrade'; rat.memory.slept = 0; rat.say('🛠️');
          }
          // Construction
          else if (roleSkaven.shouldWeBuild(rat, slaves)) {
            rat.memory.task = 'build'; rat.memory.slept = 0; rat.say('🚧');
          }
          // Repair
          else if (roleSkaven.shouldWeRepair(rat, slaves)) {
            rat.memory.task = 'repair'; rat.memory.slept = 0; rat.say('🔧');
          }
          // I'm not the designated Upgrader, There is no construction and there is nothing to repair..
          // Go store the power, unless it's full.. then go upgrade anyway.
          else {
            if (rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy &&
                Memory.rooms[rat.room.name].containerAvailability === 0) {
              rat.memory.task = 'upgrade'; rat.memory.slept = 0; rat.say('🛠️');
            } else {
              rat.memory.task = 'store'; rat.say('🔋');
            }
          }
        } else {
          rat.memory.task = 'harvest'; rat.memory.myTargetId = null; rat.memory.slept = 0; rat.say('⚡');
        }
      }
      // Okay rat... Do something..
      $actions.skitter(rat);
    }
  },

  // Should we store power?
  shouldWeStore: (rat, slaves) => {

  },

  // Should we build something? If we have 50% or more rats, and we don't have more than 50% doing the work
  shouldWeBuild: (rat, slaves) => {
    const canWork = rat.body.filter(part => part.type === WORK).length > 0
    const canCarry = rat.body.filter(part => part.type === CARRY).length > 0;
    const constructionTargets = Memory.tickCount % 5 ? rat.room.find(FIND_CONSTRUCTION_SITES) : null;
    if (constructionTargets && constructionTargets.length > 0 && canCarry && canWork) {
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
    const canWork = rat.body.filter(part => part.type === WORK).length > 0
    const canCarry = rat.body.filter(part => part.type === CARRY).length > 0;
    const upgradeTarget = rat.room.controller;
    if (upgradeTarget && canCarry && canWork) {
      // if the rat has been sleeping on the job, go make him upgrade..
      if (rat.memory.slept > 2) return true;
      // Do we have 80% of max slaves?
      const enoughSlaves = slaves.length >= (Memory.rooms[rat.room.name].maxSlaves*0.8);
      // Are less than 25% doing the work?
      const notEnoughActive = $actions.numActive('upgrade') < (Memory.rooms[rat.room.name].maxSlaves * 0.25);
      // Is No one upgrading?!
      const noSlavesUpgrading = $actions.numActive('upgrade') === 0;
      // Are we full energy?
      const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy && noSlavesUpgrading) return true;
    }
    return false;
  },

  // Should we repair something?
  //If we have 50% or more rats, and we have 20% or less repairing
  //repairTargets && repairTargets.length > 0 && slaves.length >= (maxSlaves/2) && $actions.numActive('repair') <= (maxSlaves*0.2)
  shouldWeRepair: (rat, slaves) => {
    const canWork = rat.body.filter(part => part.type === WORK).length > 0
    const canCarry = rat.body.filter(part => part.type === CARRY).length > 0;
    const repairTargets = Memory.tickCount % 10 ? $actions.repair.getRepairTargets(rat) : null;
    if (repairTargets && repairTargets.length > 0 && canCarry && canWork) {
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

  // Spawn us a rat ~ Standard Skaven Slave worker rat
  summonSlave: (room, memory) => {
    if (room.energyAvailable >= 300) {
      $actions.summonSkavenSlave(room, memory);
      return ' ~ Spawning new Slave ('+room.energyAvailable+')'
    } else { return ''; }
  },

  // // Spawn us a rat ~ Standard Skaven worker rat
  // summonRatOgre: (energy, memory) => {
  //   if (energy >= 600) { $actions.summonRatOgre(energy, memory); return ' ~ Spawning new Rat Ogre ('+energy+')'; } else { return ''; }
  // },

}
module.exports = roleSkaven;
