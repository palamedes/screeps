let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {

    // let roomBounds = Game.rooms[creep.room.name].getBounds();
    let harvestTargets = rat.room.find(FIND_SOURCES);

    // var ruins = creep.room.find(FIND_RUINS, {
    //     filter: (ruin) => ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var tombstones = rat.room.find(FIND_TOMBSTONES, {
    //     filter: (tombstone) => tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var droppedEnergy = rat.room.find(FIND_DROPPED_RESOURCES, {
    //     filter: (dropped) => dropped.resourceType == RESOURCE_ENERGY
    // });

    // If the creep doesn't know where to go..
    if(!rat.memory.myTargetId) {
      var closestTarget = rat.pos.findClosestByRange(harvestTargets);
      if(closestTarget) {
        rat.memory.myTargetId = closestTarget.id;
      }
    }

    var target = Game.getObjectById(rat.memory.myTargetId);
    if(target && rat.store.getFreeCapacity() === 0) {
      if(rat.harvest(target) === ERR_NOT_IN_RANGE) {
        rat.moveTo(target, { visualizePathStyle: {stroke: '#ffaa00'} });
      }
    } else {
      rat.say('💤');
      rat.memory.myTargetId = null;
      rat.memory.task = null;
      rat.memory.slept++;
    }
  },
}
module.exports = sHarvest;
