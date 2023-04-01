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
    if (this.cannotCarry()) { this.setTask('harvest'); }

    // Hauler: If rat has less than 40% free capacity ( at least 60% full ) then go store it until empty
    else if (this.cannotWork() && (this.store.getFreeCapacity() / this.store.getCapacity()) < 0.4) {
      this.setTask('storeUntilEmpty');
    }

    // If rat has less than 80% free capacity ( at least 20% energy ) then go do some work.. Else harvest.
    else if (this.canWork() && this.canCarry() && (this.store.getFreeCapacity() / this.store.getCapacity()) < 0.8) {
      // Upgrade Controller
      if (this.shouldWeUpgrade(slaves)) { this.setTask('upgrade'); }
      // Construction
      else if (this.shouldWeBuild(slaves)) { this.setTask('build'); }
      // Repair
      else if (this.shouldWeRepair(slaves)) { this.setTask('repair'); }
      // Store (or Upgrade anyway if bored)
      else {
        if (this.shouldWeUpgradeAnyway() && !this.carryingNonEnergyResource()) {
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
  if (this.getTask() === 'harvest')         { this.harvestTask(); }
  if (this.getTask() === 'store')           { if (!this.storeTask())   { this.sleep(); } }
  if (this.getTask() === 'storeUntilEmpty') { this.storeTask(); }
  if (this.getTask() === 'renew')           { if (!this.renewTask())   { this.sleep(); } }
  if (this.getTask() === 'upgrade')         { if (!this.upgradeTask()) { this.sleep(); } }
  if (this.getTask() === 'build')           { if (!this.skaven.slave.buildTask.bind(this)())   { this.sleep(); } }
  if (this.getTask() === 'repair')          { if (!this.repairTask())  { this.sleep(); } }
}

// DECISIONS
// Should we build something?
// If we have 50% or more rats, and we don't have more than 50% doing the work
Creep.prototype.skaven.slave.shouldWeBuild = function(slaves) {
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
