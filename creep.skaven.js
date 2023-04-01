/** Creep.skaven extensions
 * The purpose of this file is to give us a place to put all those "brain and logic" decision making methods for "Skaven".
 * The idea being we might later implement other "races" of Creeps that do things very differently. (think code optimization)
 * It also allows us to further namespace out code segements for caste members of each individual race.
 * example:
 *   Creep.skaven.slave.{method}();
 *   vs
 *   Creep.skaven.ogre.{method}();
 * Could be the same method, but the slave would do it differently than the ogre.. etc.
 * The parent namespace runs all the children, where as the child runs all of that type.
 */

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
  this.slave.sayHello();
  if (this.getTask() === 'harvest')         { this.harvestTask(); }
  if (this.getTask() === 'store')           { if (!this.storeTask())   { this.sleep(); } }
  if (this.getTask() === 'storeUntilEmpty') { this.storeTask(); }
  if (this.getTask() === 'renew')           { if (!this.renewTask())   { this.sleep(); } }
  if (this.getTask() === 'upgrade')         { if (!this.upgradeTask()) { this.sleep(); } }
  if (this.getTask() === 'build')           { if (!this.buildTask())   { this.sleep(); } }
  if (this.getTask() === 'repair')          { if (!this.repairTask())  { this.sleep(); } }
}

// DECISIONS
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

// TASKS
// Find something to build and go build it, if there is nothing or we have finished building something, reset.
Creep.prototype.buildTask = function() {
  var targets = this.room.find(FIND_CONSTRUCTION_SITES);
  if(targets.length > 0 && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
    if(this.build(targets[0]) === ERR_NOT_IN_RANGE) {
      this.moveCreepTo(targets[0], '#0000ff');
    }
    return true;
  }
  return false;
}
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
      if (!this.memory.myTargetId && this.canWork()) {
        const containers = this.room.find(FIND_STRUCTURES, {
          filter: structure => { return structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0; }
        });
        if (containers.length > 0) {
          this.memory.myTargetId = this.pos.findClosestByRange(containers).id;
        }
      }

      // Hauler sees a tombstone with possible goodies...
      if (!this.memory.myTargetId && this.cannotWork()) {
        const containers = this.room.find(FIND_TOMBSTONES, {
          filter: tombstone => { const totalResources = _.sum(tombstone.store); return totalResources > 0; }
        });
        if (containers.length > 0) {
          this.memory.myTargetId = this.pos.findClosestByRange(containers).id;
        }
      }

      // Try to get energy that is dropped.. Anyone.
      // @TODO GET DROPPED ENERGY NOT AT A SUCKLE POINT FIRST
      if (!this.memory.myTargetId) {
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
          this.memory.myTargetId = highestEnergyId;
        }
      }

    }
    // Can this rat work? - So not a hauler
    if (this.canWork()) {
      // If the rat still doesn't have a target and one wasn't set above, go find a source.
      if (!this.memory.myTargetId) {
        let sourceEnergy = Game.rooms[this.room.name].find(FIND_SOURCES, {
          filter: (source) => source.energy > 0
        });
        if (sourceEnergy.length > 0) {
          this.memory.myTargetId = this.pos.findClosestByRange(sourceEnergy).id;
        }
      }
    }

    // Now that you have found a target, Go to that target and harvest it, assuming it has power.
    if (this.memory.myTargetId) {
      let target = Game.getObjectById(this.memory.myTargetId);
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
          if (target.id !== sucklePointSourceId) { this.memory.myTargetId = sucklePointSourceId; }
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
                this.memory.myTargetId = id;
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
