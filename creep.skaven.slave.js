Creep.prototype.skaven = {slave: {}};

// Skitter!  Have the slave decide what he should be doing, and then go and do it..
Creep.prototype.skaven.slave.skitter = function(slaves) {

  // If our ticks to live is down to 50, stop what you're doing and go solve that by renewing at your spawn
  if (this.ticksToLive <= 50 && this.memory.task !== 'renew' && this.room.controller.level >= 4 && this.memory.renews > 0) {
    if (Game.rooms[this.memory.homeRoom].energyAvailable > 100) { this.setTask('renew'); }
  }

  // Rat needs to decide what it should be doing..
  if (!this.memory.task) {
    // Harvester: if this rat can't carry, then he's a harvester.. go do that.
    if (this.isHarvester()) { this.setTask('harvest'); }

    // Hauler: If rat has less than 40% free capacity ( at least 60% full ) then go store it until empty
    else if (this.isHauler() && (this.store.getFreeCapacity() / this.store.getCapacity()) < 0.4) {
      this.setTask('store');
    }

    // If rat has less than 80% free capacity ( at least 20% energy ) then go do some work.. Else harvest.
    else if (this.isWorker() && (this.store.getFreeCapacity() / this.store.getCapacity()) < 0.8) {
      // Upgrade Controller
      if (this.skaven.slave.shouldWeUpgrade.bind(this)(slaves)) { this.setTask('upgrade'); }
      // Construction
      else if (this.skaven.slave.shouldWeBuild.bind(this)(slaves)) { this.setTask('buildTarget'); }
      // Repair
      else if (this.skaven.slave.shouldWeRepair.bind(this)(slaves)) { this.setTask('repair'); }
      // Store (or Upgrade anyway if bored)
      else {
        if (this.skaven.slave.shouldWeUpgradeAnyway.bind(this)() && !this.carryingNonEnergyResource()) {
          this.setTask('upgrade');
        } else {
          this.setTask('store');
        }
      }
    } else {
      this.setTask('harvest');
    }
  }

  // Okay now do the thing we have tasked ourselves to do
  if (this.getTask() === 'harvest')         { this.taskHarvest(); }
  if (this.getTask() === 'store')           { this.taskStore(); }
  // if (this.getTask() === 'storeUntilEmpty') { this.taskStore(); }
  if (this.getTask() === 'renew')           { this.taskRenew(); }
  if (this.getTask() === 'upgrade')         { this.taskUpgradeController(); }
  if (this.getTask() === 'build')           { this.taskBuildAnything(); }
  if (this.getTask() === 'buildTarget')     { this.taskBuildTarget(); }
  if (this.getTask() === 'repair')          { this.taskRepairTarget(); }
}

// DECISIONS
// Should we build something?
// If we have 50% or more rats, and we don't have more than 50% doing the work
Creep.prototype.skaven.slave.shouldWeBuild = function(slaves) {
  if (!this.getTask()) {
    const constructionTargets = this.room.find(FIND_CONSTRUCTION_SITES);
    if (constructionTargets && constructionTargets.length > 0 && this.canCarry() && this.canWork()) {
      // Do we have 50% or more max rats?
      const enoughSlaves = slaves.length >= (Memory.rooms[this.room.name].maxSlaves/2);
      // Are less than 50% of them doing the work?
      const notEnoughActive = Creep.numActive('build') <= (Memory.rooms[this.room.name].maxSlaves*0.5);
      // Are we full energy?
      const fullEnergy = this.room.energyAvailable === Memory.rooms[this.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy) {
        this.setTarget(constructionTargets[0]);
        return true;
      }
    }
  }
  return false;
}
// Should we upgrade the controller?
// Are we bored? Do we have enough slaves? Do we not have enough active? Are we full everywhere?
Creep.prototype.skaven.slave.shouldWeUpgrade = function(slaves) {
  if (!this.getTask()) {
    const upgradeTarget = this.room.controller;
    if (upgradeTarget && this.canCarry() && this.canWork()) {
      // if the rat has been sleeping on the job, go make him upgrade..
      if (this.memory.slept > 2) return true;
      // Do we have 80% of max slaves?
      const enoughSlaves = slaves.length >= (Memory.rooms[this.room.name].maxSlaves*0.8);
      // Are less than 25% doing the work?
      const notEnoughActive = Creep.numActive('upgrade') < (Memory.rooms[this.room.name].maxSlaves * 0.25);
      // Is No one upgrading?!
      const noSlavesUpgrading = Creep.numActive('upgrade') === 0;
      // Are we full energy?
      const fullEnergy = this.room.energyAvailable === Memory.rooms[this.room.name].maxEnergy
      // Decide
      if (enoughSlaves && notEnoughActive && fullEnergy && noSlavesUpgrading) return true;
    }
  }
  return false;
}
// While I'm not the designated Upgrader there is no construction, nothing to repair, and the extensions, spawns and towers are full..
Creep.prototype.skaven.slave.shouldWeUpgradeAnyway = function() {
  const fullEnergy = this.room.energyAvailable === Memory.rooms[this.room.name].maxEnergy;
  return fullEnergy && this.canWork();
}
// Should we repair something?
// If we have 50% or more rats, and we have 20% or less repairing and there are no towers...
Creep.prototype.skaven.slave.shouldWeRepair = function(slaves) {
  if (!this.getTask()) {
    const repairTargets = this.getRepairTargets();
    if (repairTargets && repairTargets.length > 0 && this.canCarry() && this.canWork()) {
      // Do we have 50% or more rats?
      const enoughSlaves = slaves.length >= (Memory.rooms[this.room.name].maxSlaves/2);
      // Are less than 25% doing the work?
      const notEnoughActive = Creep.numActive('repair') <= (Memory.rooms[this.room.name].maxSlaves*0.25)
      // Are there no towers repairing?
      const noTowers = Object.values(Game.structures).filter(structure => structure.structureType === STRUCTURE_TOWER).length > 0;
      // Decide
      if (enoughSlaves && notEnoughActive && noTowers) {
        this.setTarget(repairTargets[0]);
        return true;
      }
    }
  }
  return false;
}
// Should we store?
// If a Turret is empty, go fill it.
Creep.prototype.skaven.slave.shouldWeStore = function(salves) {
  if (!this.getTask()) {
    const anyLowTowers = this.room.find(FIND_MY_STRUCTURES, { filter: (structure) => {
      return structure.structureType === STRUCTURE_TOWER && structure.store.getUsedCapacity(RESOURCE_ENERGY) / structure.store.getCapacity(RESOURCE_ENERGY) < 0.8; }
    });

    if (anyLowTowers) return true;
  }
  return false;
}