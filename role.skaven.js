const $actions = require('actions');

/** Skaven! */
var roleSkaven = {

  skitter: rat => {

    if (rat.memory.role === 'slave') {

      let slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
      // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn
      if (rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room.controller.level >= 4 && rat.memory.renews > 0) {
        if (Game.rooms[rat.memory.homeRoom].energyAvailable > 100) { rat.setTask('renew'); }
      }


      // Rat needs to decide what it should be doing..
      if (!rat.memory.task) {
        // Harvester: if this rat can't carry, then he's a harvester.. go do that.
        if (rat.cannotCarry()) { rat.setTask('harvest'); }

        // Hauler: If rat has less than 40% free capacity ( at least 60% full ) then go store it until empty
        else if (rat.cannotWork() && (rat.store.getFreeCapacity() / rat.store.getCapacity()) < 0.4) {
          rat.setTask('storeUntilEmpty');
        }

        // If rat has less than 80% free capacity ( at least 20% energy ) then go do some work.. Else harvest.
        else if (rat.canWork() && rat.canCarry() && (rat.store.getFreeCapacity() / rat.store.getCapacity()) < 0.8) {
          // Upgrade Controller
          if (roleSkaven.shouldWeUpgrade(rat, slaves)) { rat.setTask('upgrade'); }
          // Construction
          else if (roleSkaven.shouldWeBuild(rat, slaves)) { rat.setTask('build'); }
          // Repair
          else if (roleSkaven.shouldWeRepair(rat, slaves)) { rat.setTask('repair'); }
          else {
            if (roleSkaven.shouldWeUpgradeAnyway(rat)) {
              rat.setTask('upgrade');
            } else {
              rat.setTask('store');
            }
          }
        } else {
          rat.setTask('harvest');
        }
      }
      // Okay rat... Do something..
      $actions.skitter(rat);
    }
  },

  // Should we store power?
  shouldWeStore: (rat, slaves) => {

  },

  // Should we build something?
  // If we have 50% or more rats, and we don't have more than 50% doing the work
  shouldWeBuild: (rat, slaves) => {
    const constructionTargets = Memory.tickCount % 5 ? rat.room.find(FIND_CONSTRUCTION_SITES) : null;
    if (constructionTargets && constructionTargets.length > 0 && rat.canCarry() && rat.canWork()) {
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
  // Are we bored? Do we have enough slaves? Do we not have enough active? Are we full everywhere?
  shouldWeUpgrade: (rat, slaves) => {
    const upgradeTarget = rat.room.controller;
    if (upgradeTarget && rat.canCarry() && rat.canWork()) {
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
  // While I'm not the designated Upgrader there is no construction, nothing to repair, and the extensions, spawns and towers are full..
  shouldWeUpgradeAnyway: rat => {
    const fullEnergy = rat.room.energyAvailable === Memory.rooms[rat.room.name].maxEnergy;
    return fullEnergy && rat.canWork()
  },

  // Should we repair something?
  // If we have 50% or more rats, and we have 20% or less repairing and there are no towers...
  shouldWeRepair: (rat, slaves) => {
    const repairTargets = Memory.tickCount % 10 ? $actions.repair.getRepairTargets(rat) : null;
    if (repairTargets && repairTargets.length > 0 && rat.canCarry() && rat.canWork()) {
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

  // Should we renew?
  // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn

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
