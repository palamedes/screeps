// Go harvest energy from sources, ruins, tombstones, and dropped resources
Creep.prototype.taskHarvest = function() {
  const isHauler = this.isHauler(), isWorker = this.isWorker(), isHarvester = this.isHarvester();

  // STEP ONE; FIND SOMETHING TO HARVEST...

  // WORKER: Try to get energy from a container first...
  if (!this.getTarget() && isWorker) {
    const containers = this.room.find(FIND_STRUCTURES, {
      filter: structure => { return structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0; }
    });
    if (containers.length > 0) { this.setTarget(this.pos.findClosestByRange(containers)); }
  }

  // HAULER: Try to get stuff from tombstone...
  if (!this.getTarget() && isHauler) {
    const containers = this.room.find(FIND_TOMBSTONES, {
      filter: tombstone => { const totalResources = _.sum(tombstone.store); return totalResources > 0; }
    });
    if (containers.length > 0) { this.setTarget(this.pos.findClosestByRange(containers));  }
  }

  // HAULER/WORKER: Try to get energy that is dropped..
  // @TODO GET DROPPED ENERGY NOT AT A SUCKLE POINT FIRST
  if (!this.getTarget() && (isHauler || isWorker)) {
    // Try to pickup dropped energy first
    let droppedEnergy = Game.rooms[this.room.name].find(FIND_DROPPED_RESOURCES, {
      filter: dropped => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 25
    });
    if (droppedEnergy.length > 0) {
      let highestEnergyAmount = 0, highestEnergy = null;
      for (let i = 0; i < droppedEnergy.length; i++) {
        if (droppedEnergy[i].amount > highestEnergyAmount) {
          highestEnergyAmount = droppedEnergy[i].amount;
          highestEnergy = droppedEnergy[i];
        }
      }
      this.setTarget(highestEnergy);
    }
  }

  // WORKER: Try to get energy from a container first...
  if (!this.getTarget() && isWorker) {
    const containers = this.room.find(FIND_STRUCTURES, {
      filter: structure => { return structure.structureType === STRUCTURE_STORAGE && structure.store[RESOURCE_ENERGY] > 0; }
    });
    if (containers.length > 0) { this.setTarget(this.pos.findClosestByRange(containers)); }
  }

  // HARVESTER/WORKER: Still haven't any energy, go find a source and suckle..

  // @TODO Harvest from the other source back and forth
  if (isHarvester || isWorker) {
    if (!this.getTarget()) {
      let sourceEnergy = Game.rooms[this.room.name].find(FIND_SOURCES, {
        filter: (source) => source.energy > 0
      });
      if (Memory.rooms[this.room.name].sourceLastUsed) {
        sourceEnergy = sourceEnergy.filter((source) => source.id !== Memory.rooms[this.room.name].sourceLastUsed);
      }
      if (sourceEnergy.length > 0) {
        let target = this.pos.findClosestByRange(sourceEnergy);
        Memory.rooms[this.room.name].sourceLastUsed = target;
        this.setTarget(target);
      }
    }
  }

// STEP TWO; HARVEST IT...

// Now that you have found a target, Go to that target and harvest it, assuming it has power.
  if (this.getTarget()) {
    let target = this.getTarget();

    if (target && !(target instanceof Source)) {
      // Is our rat within range of the target?
      if (this.pos.inRangeTo(target.pos, 1)) {
        // Try to take resources from target
        let res = this.canWork() ? [this.takeFrom(target, 'energy')] : this.takeAllFrom(target);
        // Respond to the attempt
        if (res.includes(ERR_NOT_IN_RANGE)) {
          console.log('ERROR: Not in range?!  How....');
        } else if (res.includes(ERR_INVALID_ARGS)) {
          console.log("ERROR: Invalid resource (we tried to pull something that doesn't exist.. check spellings)");
        } else if (res.includes(ERR_NOT_ENOUGH_RESOURCES)) {
          this.clearTarget();
        } else if (res.includes(ERR_NOT_OWNER) || res.includes(ERR_FULL) || res.includes(null) || res.length === 0) {
          this.clearTask();
        }
      } else {
        // If not in position and we aren't a harvester standing on a suckle point, lets move towards the target.
        if (!this.isHarvester()) { this.moveCreepTo(target, '#ffffff'); }
      }
    }

    // Method to quickly check to see if we are standing on one of the suckle points we have in memory
    let isNearResource = (rat, sources) => {
      const x = this.pos.x, y = this.pos.y;
      for (let sourceKey in sources) {
        for (let posKey in sources[sourceKey]) {
          if (sources[sourceKey][posKey].x === x && sources[sourceKey][posKey].y === y) {
            return sourceKey;
          }
        }
      }
      return false;
    }
    let isRatPresentAtLocation = (x,y) => {
      let creepAtLocation = Game.rooms[this.room.name].find(FIND_CREEPS, { filter: (creep) => { return creep.pos.x === x && creep.pos.y === y; } });
      return creepAtLocation.length > 0
    }
    // If the target is a source find a suckle point for that source
    if (target && target instanceof Source && target.energy > 0) {
      let foundSucklePoint = false;
      let sucklePointSourceId = isNearResource(this, Memory.rooms[this.room.name].sources)
      // ...and we are at one of the known suckle points, harvest.
      if (sucklePointSourceId) {
        foundSucklePoint = true; // we are on it..
        // If we are standing on a point but not the one we found, then use this one. (no sense in moving)
        if (target.id !== sucklePointSourceId) { this.memory.taskTarget = sucklePointSourceId; }
        // Try to harvest it.. and if you can't.. just wait.
        if (this.harvest(target) === ERR_NOT_IN_RANGE) {
          // Waiting for power to respawn most likely
        }
        // ...otherwise find us a suckle point that is open and move to it.
      } else {
        for (let id in Memory.rooms[this.room.name].sources) {
          if (foundSucklePoint) break;
          for (let sucklePoint in Memory.rooms[this.room.name].sources[id]) {
            if (!isRatPresentAtLocation(Memory.rooms[this.room.name].sources[id][sucklePoint].x, Memory.rooms[this.room.name].sources[id][sucklePoint].y)) {
              foundSucklePoint = true;
              this.memory.taskTarget = id;
              this.moveCreepTo(Game.getObjectById(id), '#ffaa00');
              break;
            }
          }
        }
      }
      // If we didn't find a suckle point, then ask for something else to do..
      if (!foundSucklePoint) { this.clearTask(); }
    }
    // If the rat is full, or the target is empty then find something else to do.
    if (target != null && (this.store.getFreeCapacity() === 0 || target.energy === 0) || target === null) { this.clearTask(); }
  }
}