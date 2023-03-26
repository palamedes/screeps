const move = require('skaven.move');

let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {
    // let roomBounds = Game.rooms[creep.room.name].getBounds();

    // If the rat doesn't know where to go.. Find it.
    if (!rat.memory.myTargetId) {
      const emergencyPickupAmount = 50; // Change this based on controller level
      // if we have a high volume emergency pickup, lets go get it
      let emergencyPickup = rat.room.find([FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES], {
        filter: (target) => {
          return (target.resourceType  === RESOURCE_ENERGY && target.amount > emergencyPickupAmount) ||
                 (target.structureType === STRUCTURE_TOMBSTONE && target.store[RESOURCE_ENERGY] > emergencyPickupAmount) ||
                 (target.structureType === STRUCTURE_RUIN && target.store[RESOURCE_ENERGY] > emergencyPickupAmount)
        }
      });
      // If we have any "emergency pickup" stuff, let's go get that and just act as a hauler
      if (emergencyPickup.length > 0) {
        let closestEmergency = rat.pos.findClosestByRange(emergencyPickup);
        rat.memory.myTargetId = closestEmergency.id
      } else {
        // Get a list of all possible targets
        let droppedEnergy = rat.room.find(FIND_DROPPED_RESOURCES, {
          filter: (dropped) => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 25
        });
        let harvestEnergy = rat.room.find(FIND_SOURCES, {
          filter: (source) => source.energy > 0
        });
        let possibleTargets = [...droppedEnergy, ...harvestEnergy]
        // Find the closest one
        let closestTarget = rat.pos.findClosestByRange(possibleTargets);
        if (closestTarget) {
          rat.memory.myTargetId = closestTarget.id;
        }
      }
    }
    // Go to that target and harvest it, assuming it has power.
    let target = Game.getObjectById(rat.memory.myTargetId);
    if (target && target.energy > 0) {
      // If the target is a pickup, then go try to pick it up
      if (target instanceof Resource && rat.pickup(target) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, target, '#ffaa00');
      }
      // Method to quickly check to see if we are standing on one of the suckle points we have in memory
      let isNearResource = (rat, sources) => {
        const x = rat.pos.x, y = rat.pos.y;
        for (let sourceKey in sources) {
          for (let posKey in sources[sourceKey]) {
            if (sources[sourceKey][posKey].x === x && sources[sourceKey][posKey].y === y) {
              return true;
            }
          }
        }
        return false;
      }
      let isRatPresentAtLocation = (x,y) => {
        let creepAtLocation = Game.rooms[rat.room.name].find(FIND_CREEPS, { filter: (creep) => { return creep.pos.x === x && creep.pos.y === y; } });
        return creepAtLocation.length > 0
      }

      // If the target is a source
      if (target instanceof Source) {
        let foundSucklePoint = false;
        // ...and we are at one of the known suckle points, harvest.
        if (isNearResource(rat, Memory.rooms[rat.room.name].sources)) {
          foundSucklePoint = true; // we are on it..
          if (rat.harvest(target) === ERR_NOT_IN_RANGE) {
            console.log('somethings wrong');
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
        if (!foundSucklePoint) {
          rat.memory.myTargetId = null;
          rat.memory.task = null;
        }
      }
      // If the rat is full, or the target is empty then find something else to do.
      if (rat.store.getFreeCapacity() === 0 || target.energy === 0) {
        rat.memory.myTargetId = null;
        rat.memory.task = null;
      }
    } else {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
  },
}
module.exports = sHarvest;
