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
          rat.moveTo(target, { visualizePathStyle: {stroke: '#ff0000'} });
        }
      }
    } else {
      rat.say('💤');
      rat.memory.myTargetId = null;
      rat.memory.task = null;
      rat.memory.slept++;
    }
  },

  getRepairTargets: rat => {
    return rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        if (structure.structureType == STRUCTURE_ROAD) {
          return structure.hits < structure.hitsMax * 0.8; // repair roads at 80% of maximum hits
        } else if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
          return structure.hits < structure.hitsMax * 0.0001;
        } else {
          return (structure.structureType != STRUCTURE_CONTROLLER) &&
            structure.hits < structure.hitsMax;
        }
      }
    });
  },

}
module.exports = sRepair;
