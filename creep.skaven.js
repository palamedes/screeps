const sHarvest  = require("skaven.harvest");
const sStore    = require("skaven.store");
const sRenew    = require("skaven.renew");
const sUpgrade  = require("skaven.upgrade");
const sBuild    = require("skaven.build");
const sRepair   = require("skaven.repair");

// Run the Skaven (Slaves of all types)
Creep.prototype.run = function() {
  // If we are a slave, and we have been spawned...
  if (this.memory.role === 'slave' && !this.spawning) {
    // Get our list of slaves
    let slaves = _.filter(Game.creeps, rat => rat.memory.role === 'slave');
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
    // Okay, with this individual rat.. Run him..
    this.skitter();
  }
}

// Run an individual rat
Creep.prototype.skitter = function() {
  if (this.getTask() === 'harvest')  { sHarvest.using(this); }
  if (this.getTask() === 'store')    { if (!sStore.using(this))   { this.sleep(); } }
  if (this.getTask() === 'storeUntilEmpty') { sStore.using(this); }
  if (this.getTask() === 'renew')    { if (!sRenew.using(this))   { this.sleep(); } }
  if (this.getTask() === 'upgrade')  { if (!sUpgrade.using(this)) { this.sleep(); } }
  if (this.getTask() === 'build')    { if (!sBuild.using(this))   { this.sleep(); } }
  if (this.getTask() === 'repair')   { if (!sRepair.using(this))  { this.sleep(); } }
}

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
  const repairTargets = this.getRepairTargets();
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
