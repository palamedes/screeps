const structureTower = require('structure.tower');
const move = require("skaven.move");

let sRepair = {
  // Go find something to repair
  using: (rat) => {
    repairTargets = sRepair.getRepairTargets(rat);
    if (repairTargets.length > 0 && rat.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      let closestTarget = rat.pos.findClosestByRange(repairTargets);
      if(closestTarget) {
        rat.memory.myTargetId = closestTarget.id;
      }

      var target = Game.getObjectById(rat.memory.myTargetId);
      if(target) {
        if(rat.repair(target) === ERR_NOT_IN_RANGE) {
          move.moveTo(rat, target, '#ff0000');
        }
        return true;
      }
    }
    return false;
  },

  // Get any repair targets for this rat
  getRepairTargets: rat => {
    let towers = structureTower.getTowers();
    if (towers) {
      return null;
    } else {
      return rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          if (structure.structureType === STRUCTURE_ROAD) {
            return structure.hits < structure.hitsMax * 0.8; // repair roads at 80% of maximum hits
          } else if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
            return structure.hits < structure.hitsMax * 0.0001;
          } else {
            return (structure.structureType !== STRUCTURE_CONTROLLER) &&
              structure.hits < structure.hitsMax;
          }
        }
      });
    }
  },

}
module.exports = sRepair;
