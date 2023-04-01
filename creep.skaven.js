
// Should we build something?
// If we have 50% or more rats, and we don't have more than 50% doing the work
Creep.prototype.shouldWeBuild = function(slaves) {
  const constructionTargets = this.room.find(FIND_CONSTRUCTION_SITES);
  if (constructionTargets && constructionTargets.length > 0 && this.canCarry() && this.canWork()) {
    // Do we have 50% or more max rats?
    const enoughSlaves = slaves.length >= (Memory.rooms[this.room.name].maxSlaves/2);
    // Are less than 50% of them doing the work?
    const notEnoughActive = Creep.numActive('build') <= (Memory.rooms[this.room.name].maxSlaves*0.5);
    // Are we full energy?
    const fullEnergy = this.room.energyAvailable === Memory.rooms[this.room.name].maxEnergy
    // Decide
    if (enoughSlaves && notEnoughActive && fullEnergy) return true;
  }
  return false;
}

// Should we upgrade the controller?
// Are we bored? Do we have enough slaves? Do we not have enough active? Are we full everywhere?
Creep.prototype.shouldWeUpgrade = function(slaves) {
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
  return false;
}
// While I'm not the designated Upgrader there is no construction, nothing to repair, and the extensions, spawns and towers are full..
Creep.prototype.shouldWeUpgradeAnyway = function() {
  const fullEnergy = this.room.energyAvailable === Memory.rooms[this.room.name].maxEnergy;
  return fullEnergy && this.canWork();
}

// Should we repair something?
// If we have 50% or more rats, and we have 20% or less repairing and there are no towers...
Creep.prototype.shouldWeRepair = function(slaves) {
  const repairTargets = this.getRepairTargets(rat);
  if (repairTargets && repairTargets.length > 0 && this.canCarry() && this.canWork()) {
    // Do we have 50% or more rats?
    const enoughSlaves = slaves.length >= (Memory.rooms[this.room.name].maxSlaves/2);
    // Are less than 25% doing the work?
    const notEnoughActive = Creep.numActive('repair') <= (Memory.rooms[this.room.name].maxSlaves*0.25)
    // Are there no towers repairing?
    const noTowers = Object.values(Game.structures).filter(structure => structure.structureType === STRUCTURE_TOWER).length > 0;
    // Decide
    if (enoughSlaves && notEnoughActive && noTowers) return true;
  }
  return false;
}
