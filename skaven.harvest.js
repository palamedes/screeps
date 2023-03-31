const move = require('skaven.move');

let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {
    // const noCarryRats = _.filter(Game.creeps, rat => !rat.body.some(part => part.type === CARRY)).length;

    // Can this rat carry? - So not harvesters
    if (rat.canCarry()) {

      // Try to get energy from a container first.. But only if they can work.
      if (!rat.memory.myTargetId && rat.canWork()) {
        const containers = rat.room.find(FIND_STRUCTURES, {
          filter: structure => { return structure.structureType === STRUCTURE_CONTAINER && structure.store[RESOURCE_ENERGY] > 0; }
        });
        if (containers.length > 0) {
          rat.memory.myTargetId = rat.pos.findClosestByRange(containers).id;
        }
      }

      // Hauler sees a tombstone with possible goodies...
      if (!rat.memory.myTargetId && rat.cannotWork()) {
        const containers = rat.room.find(FIND_TOMBSTONES, {
          filter: tombstone => { const totalResources = _.sum(tombstone.store); return totalResources > 0; }
        });
        if (containers.length > 0) {
          rat.memory.myTargetId = rat.pos.findClosestByRange(containers).id;
        }
      }

      // Try to get energy that is dropped.. Anyone.
      // @TODO GET DROPPED ENERGY NOT AT A SUCKLE POINT FIRST
      if (!rat.memory.myTargetId) {
        // Try to pickup dropped energy first
        let droppedEnergy = Game.rooms[rat.room.name].find(FIND_DROPPED_RESOURCES, {
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
          rat.memory.myTargetId = highestEnergyId;
        }
      }

    }
    // Can this rat work? - So not a hauler
    if (rat.canWork()) {
      // If the rat still doesn't have a target and one wasn't set above, go find a source.
      if (!rat.memory.myTargetId) {
        let sourceEnergy = Game.rooms[rat.room.name].find(FIND_SOURCES, {
          filter: (source) => source.energy > 0
        });
        if (sourceEnergy.length > 0) {
          rat.memory.myTargetId = rat.pos.findClosestByRange(sourceEnergy).id;
        }
      }
    }

    // Now that you have found a target, Go to that target and harvest it, assuming it has power.
    if (rat.memory.myTargetId) {
      let target = Game.getObjectById(rat.memory.myTargetId);
      if (target) {
        if (rat.pos.inRangeTo(target.pos, 1)) {
          let res = null;
          if (rat.canWork()) {
            res = [rat.takeFrom(target, 'energy')];
          } else {
            res = rat.takeAllFrom(target);
          }
          // res == NULL if it's just being dropped to the ground (Harvester) Ignore it.
          if (res.includes(ERR_NOT_IN_RANGE)) {
            console.log('ERROR: Not in range?!  How....');
          } else if (res.includes(ERR_INVALID_ARGS)) {
            console.log("ERROR: Invalid resource (we tried to pull something that doesn't exist.. check spellings)");
          } else if (res.includes(ERR_NOT_ENOUGH_RESOURCES)) {
            rat.clearTarget();
          } else if (res.includes(ERR_NOT_OWNER) || res.includes(ERR_FULL) || res.includes(null)) {
            rat.clearTask();
          }
        } else {
          move.moveTo(rat, target, '#ffffff');
        }

        // If the target is a pickup, then go try to pick it up
        // if (target instanceof Resource && target.energy > 0 && rat.pickup(target) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // If the target is a tombstone, then go try to withdraw
        // if (target instanceof Tombstone && target.store[RESOURCE_ENERGY] > 0 && rat.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_UTRIUM] > 0 && rat.withdraw(target, RESOURCE_UTRIUM) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_KEANIUM] > 0 && rat.withdraw(target, RESOURCE_KEANIUM) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_LEMERGIUM] > 0 && rat.withdraw(target, RESOURCE_LEMERGIUM) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_ZYNTHIUM] > 0 && rat.withdraw(target, RESOURCE_ZYNTHIUM) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_OXYGEN] > 0 && rat.withdraw(target, RESOURCE_OXYGEN) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_GHODIUM_OXIDE] > 0 && rat.withdraw(target, RESOURCE_GHODIUM_OXIDE) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_KEANIUM_OXIDE] > 0 && rat.withdraw(target, RESOURCE_KEANIUM_OXIDE) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_ZYNTHIUM_HYDRIDE] > 0 && rat.withdraw(target, RESOURCE_ZYNTHIUM_HYDRIDE) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_UTRIUM_HYDRIDE] > 0 && rat.withdraw(target, RESOURCE_UTRIUM_HYDRIDE) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_HYDROGEN] > 0 && rat.withdraw(target, RESOURCE_HYDROGEN) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // if (target instanceof Tombstone && target.store[RESOURCE_CATALYST] > 0 && rat.withdraw(target, RESOURCE_CATALYST) === ERR_NOT_IN_RANGE) {
        //   move.moveTo(rat, target, '#ffaa00');
        // }
        // // If the target is a container, then go transfer out some energy
        // if (target instanceof StructureContainer) {
        //   let withdraw = rat.withdraw(target, RESOURCE_ENERGY);
        //   if (withdraw === ERR_NOT_IN_RANGE) {
        //     move.moveTo(rat, target, '#ffaa00');
        //   } else if (!withdraw || withdraw === ERR_NOT_ENOUGH_RESOURCES) {
        //     rat.memory.myTargetId = null;
        //     rat.memory.task = null;
        //   }
        // }

        // Method to quickly check to see if we are standing on one of the suckle points we have in memory
        let isNearResource = (rat, sources) => {
          const x = rat.pos.x, y = rat.pos.y;
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
          let creepAtLocation = Game.rooms[rat.room.name].find(FIND_CREEPS, { filter: (creep) => { return creep.pos.x === x && creep.pos.y === y; } });
          return creepAtLocation.length > 0
        }
        // If the target is a source find a suckle point for that source
        if (target instanceof Source && target.energy > 0) {
          let foundSucklePoint = false;
          let sucklePointSourceId = isNearResource(rat, Memory.rooms[rat.room.name].sources)
          // ...and we are at one of the known suckle points, harvest.
          if (sucklePointSourceId) {
            foundSucklePoint = true; // we are on it..
            // If we are standing on a point but not the one we found, then use this one. (no sense in moving)
            if (target.id !== sucklePointSourceId) {
              rat.memory.myTargetId = foundSucklePoint;
            }
            // Try to harvest it.. and if you can't.. just wait.
            if (rat.harvest(target) === ERR_NOT_IN_RANGE) {
              // Waiting for power to respawn most likely
            }
            // ...otherwise find us a suckle point that is open and move to it.
          } else {
            for (let id in Memory.rooms[rat.room.name].sources) {
              if (foundSucklePoint) break;
              for (let sucklePoint in Memory.rooms[rat.room.name].sources[id]) {
                if (!isRatPresentAtLocation(Memory.rooms[rat.room.name].sources[id][sucklePoint].x, Memory.rooms[rat.room.name].sources[id][sucklePoint].y)) {
                  foundSucklePoint = true;
                  rat.memory.myTargetId = id;
                  move.moveTo(rat, Game.getObjectById(id), '#ffaa00');
                  break;
                }
              }
            }
          }
          // If we didn't find a suckle point, then ask for something else to do..
          if (!foundSucklePoint) { rat.clearTask(); }
        }
        // If the rat is full, or the target is empty then find something else to do.
        if (rat.store.getFreeCapacity() === 0 || target.energy === 0) { rat.clearTask(); }
      } else { rat.clearTask(); }
    }
  },
}
module.exports = sHarvest;
