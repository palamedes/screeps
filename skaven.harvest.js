const move = require('skaven.move');

let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {
    // If the rat doesn't know where to go.. Find dropped energy?
    if (!rat.memory.myTargetId) {
      // Try to pickup dropped energy first
      let droppedEnergy = Game.rooms[rat.room.name].find(FIND_DROPPED_RESOURCES, {
        filter: (dropped) => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 25
      });
      if (droppedEnergy.length > 0) {
        rat.memory.myTargetId = rat.pos.findClosestByRange(droppedEnergy).id;
      }
    }
    // If the rat doesn't know where to go.. Find tombstone energy?
    if (!rat.memory.myTargetId) {
      let tombstoneEnergy = Game.rooms[rat.room.name].find(FIND_TOMBSTONE, {
        filter: (tombstone) => tombstone.store[RESOURCE_ENERGY] > 25
      });
      if (tombstoneEnergy.length > 0) {
        rat.memory.myTargetId = rat.pos.findClosestByRange(tombstoneEnergy).id;
      }
    }
    // If the rat doesn't know where to go.. Find source energy?
    if (!rat.memory.myTargetId) {
      let sourceEnergy = Game.rooms[rat.room.name].find(FIND_SOURCES, {
        filter: (source) => source.energy > 0
      });
      if (sourceEnergy.length > 0) {
        rat.memory.myTargetId = rat.pos.findClosestByRange(sourceEnergy).id;
      }
    }

    // Go to that target and harvest it, assuming it has power.
    let target = Game.getObjectById(rat.memory.myTargetId);
    if (target && target.energy > 0) {
      // If the target is a pickup, then go try to pick it up
      if (target instanceof Resource && rat.pickup(target) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, target, '#ffaa00');
      }
      // If the target is a ruin, then go withdraw the energy
      if (target.structureType === STRUCTURE_RUIN && rat.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
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
