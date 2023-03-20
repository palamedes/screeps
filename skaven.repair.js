let sRepair = {
  // Go find something to repair
  using: rat => {
    let repairTargets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) && structure.hits < structure.hitsMax;
      }
    });
    if (repair_targets.length > 0) {
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
    }
  }
}
module.export = sRepair;
