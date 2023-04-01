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

// TASKS
// Go upgrade the room controller. (Note; if a rat is bored it will also do this task without the task being set)
Creep.prototype.repairTask = function() {
  var target = this.room.controller;
  if (this.room.controller && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && this.canWork()) {
    if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
      this.moveCreepTo(this.room.controller, '#00ff00');
    }
    return true;
  }
  return false;
}
// Go find the nearest spawn and renew at it
Creep.prototype.renewTask = function() {
  let doneRenewing = false;
  const spawns = this.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  });
  let closestSpawn = this.pos.findClosestByPath(spawns);
  if (closestSpawn) {
    if (this.pos.isNearTo(closestSpawn)) {
      let result = closestSpawn.renewCreep(this);
      doneRenewing = result === ERR_FULL || result === ERR_NOT_ENOUGH_ENERGY;
    } else {
      this.moveCreepTo(closestSpawn, '#00ffff');
      doneRenewing = false
    }
  } else {
    doneRenewing = true
  }
  return !doneRenewing;
}
// Go upgrade the room controller. (Note; if a rat is bored it will also do this task without the task being set)
Creep.prototype.upgradeTask = function() {
  var target = this.room.controller;
  if (this.room.controller && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && this.canWork()) {
    if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
      this.moveCreepTo(this.room.controller, '#00ff00');
    }
    return true;
  }
  return false;
}
// Go harvest energy from sources, ruins, tombstones, and dropped resources
Creep.prototype.harvestTask = function() {
    // const noCarryRats = _.filter(Game.creeps, rat => !this.body.some(part => part.type === CARRY)).length;

    // Can this rat carry? - So not harvesters
    if (this.canCarry()) {

      // Try to get energy from a container first.. But only if they can work.
      if (!this.memory.taskTarget && this.canWork()) {
        const containers = this.room.find(FIND_STRUCTURES, {
          filter: structure => { return structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0; }
        });
        if (containers.length > 0) {
          this.memory.taskTarget = this.pos.findClosestByRange(containers).id;
        }
      }

      // Hauler sees a tombstone with possible goodies...
      if (!this.memory.taskTarget && this.cannotWork()) {
        const containers = this.room.find(FIND_TOMBSTONES, {
          filter: tombstone => { const totalResources = _.sum(tombstone.store); return totalResources > 0; }
        });
        if (containers.length > 0) {
          this.memory.taskTarget = this.pos.findClosestByRange(containers).id;
        }
      }

      // Try to get energy that is dropped.. Anyone.
      // @TODO GET DROPPED ENERGY NOT AT A SUCKLE POINT FIRST
      if (!this.memory.taskTarget) {
        // Try to pickup dropped energy first
        let droppedEnergy = Game.rooms[this.room.name].find(FIND_DROPPED_RESOURCES, {
          filter: dropped => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 25
        });
        if (droppedEnergy.length > 0) {
          let highestEnergy = 0;
          let highestEnergyId = null;
          for (let i = 0; i < droppedEnergy.length; i++) {
            if (droppedEnergy[i].amount > highestEnergy) {
              highestEnergy = droppedEnergy[i].amount;
              highestEnergyId = droppedEnergy[i].id;
            }
          }
          this.memory.taskTarget = highestEnergyId;
        }
      }

    }
    // Can this rat work? - So not a hauler
    if (this.canWork()) {
      // If the rat still doesn't have a target and one wasn't set above, go find a source.
      if (!this.memory.taskTarget) {
        let sourceEnergy = Game.rooms[this.room.name].find(FIND_SOURCES, {
          filter: (source) => source.energy > 0
        });
        if (sourceEnergy.length > 0) {
          this.memory.taskTarget = this.pos.findClosestByRange(sourceEnergy).id;
        }
      }
    }

    // Now that you have found a target, Go to that target and harvest it, assuming it has power.
    if (this.memory.taskTarget) {
      let target = Game.getObjectById(this.memory.taskTarget);
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
