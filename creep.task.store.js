// Go store the energy
Creep.prototype.taskStore = function() {
  let targets = [], target = this.getTarget(), isHauler = this.isHauler(), isWorker = this.isWorker();
  // If the rat is empty then unset all the things.
  if (this.store.getUsedCapacity() === 0 && !this.carryingNonEnergyResource()) {
    this.clearTask();
  }

  // STEP ONE:  FIND A PLACE TO STORE THE STUFF

  // If no target, is hauler or worker and there is a TOWER in need....
  if (!target && (isHauler || isWorker)) { targets = this.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_TOWER && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
        structure.store[RESOURCE_ENERGY] / structure.store.getCapacity(RESOURCE_ENERGY) <= 0.8 });
    if (targets.length > 0) { target = targets.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY))[0]; }
  }
  // If no target, is hauler or worker and there is a SPAWN available...
  if (!target && (isHauler || isWorker)) { targets = this.room.find(FIND_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (targets.length > 0) target = this.pos.findClosestByRange(targets);
  }
  // If no target, is hauler and there is a CONTAINER available... OR is a worker, and happens to have non-energy resources...
  if (!target && isHauler || (isWorker && this.carryingNonEnergyResource())) { targets = this.room.find(FIND_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_CONTAINER  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (targets.length > 0) target = this.pos.findClosestByRange(targets);
  }
  // If no target, is worker and there is an EXTENSION available...
  if (!target && (isWorker || isHauler)) { targets = this.room.find(FIND_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (targets.length > 0) target = this.pos.findClosestByRange(targets);
  }
  // If no target, is hauler and there is a STORAGE available...
  if (!target && isHauler) { targets = this.room.find(FIND_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity() > 0 });
    if (targets.length > 0) target = this.pos.findClosestByRange(targets);
  }
  // If no target, is hauler and there is STILL nothing.. go drop it near the controller
  if (!target && isHauler) { target =  this.room.controller; }

  // STEP TWO; NOW ACTUALLY DO THE DEED

  // If there are any targets store in order above..
  if (target) {
    if (this.pos.inRangeTo(target.pos, 1)) {
      let res = this.giveAllTo(target);
      if (res.includes(ERR_NOT_IN_RANGE)) {
        console.log('not in range')
        // How did we get here?  this shouldn't be possible
      } else if (res.includes(ERR_INVALID_TARGET)) {
        this.clearTask();
        console.log('invalid')
      } else if (res.includes(ERR_FULL)) {
        this.clearTarget();
        console.log('full')
      } else {
        console.log(res);
      }
    } else {
      this.moveCreepTo(target, '#ffffff');
    }
  } else {
    this.clearTask();
  }
}