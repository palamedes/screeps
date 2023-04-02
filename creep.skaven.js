/** Creep.skaven extensions
 * The purpose of this file is to give us a place to put all of the comment methods that are specific to the "Skaven race"..
 * The idea being we might later implement other "races" of Creeps that do things very differently.
 * Think code optimization, and code "personality" in which different creeps can behave differently based on a common factor.
 * It also allows us to further namespace out code segements for caste members of each individual race.
 * Think Worker versus Attacker. etc...
 *
 * example:
 *   Creep.skaven.slave.{method}(); vs Creep.skaven.ogre.{method}(); vs Creep.human.explorer.{method}();
 * Could be the same method, but the slave would do it differently than the ogre.. etc.
 * The parent namespace runs all the children, where as the child runs all of that type.
 *
 * Note; When calling anything that isn't directly root to the Creep prototype we must bind "this";
 *   this.skaven.slave.shouldWeUpgrade.bind(this)();
 */

// This method iterates through all the different skaven type and runs them based on their role.
Creep.prototype.run = function(slaves) {
  // If we are a Skaven Slave, and we have been spawned...
  if (this.memory.role === 'slave' && !this.spawning) { this.skaven.slave.skitter.bind(this)(slaves); }
}

// Go store the energy
Creep.prototype.storeTask = function() {
  let targets = [], target = null;

  // If the rat cannot WORK then it's probably a hauler so check for more storage
  if (this.cannotWork()) {
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      if (targets.length > 0) target = targets.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY))[0];
    }
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTAINER  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity() > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
  }

  // all other rats, probably a slave, store it somewhere else.
  if (this.canWork()) {
    // If we are a worker and have picked up a non energy resource
    if (this.carryingNonEnergyResource()) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTAINER    && structure.store.getFreeCapacity() > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
    if (targets.length === 0) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      if (targets.length > 0) target = this.pos.findClosestByRange(targets);
    }
  }

  // If the rat is empty then unset all the things.
  if (this.store.getUsedCapacity() === 0 && !this.carryingNonEnergyResource()) {
    // console.log('clear', this.name, target);
    this.clearTask();
  }
  // If there are any targets store in order above..
  else if (target) {
    // console.log('target', this.name, target);
    if (this.pos.inRangeTo(target.pos, 1)) {
      let res = this.giveAllTo(target);
      if (res.includes(ERR_NOT_IN_RANGE)) {
        console.log('ERROR: Not in range?!  How....');
      } else if (res.includes(ERR_INVALID_TARGET)) {
        this.clearTask();
      } else if (res.includes(ERR_FULL)) {
        this.clearTarget();
      }
    } else {
      this.moveCreepTo(target, '#ffffff');
    }
    return true;
  }
  return false;
}
