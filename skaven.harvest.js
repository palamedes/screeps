let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {
    // var ruins = creep.room.find(FIND_RUINS, {
    //     filter: (ruin) => ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var tombstones = rat.room.find(FIND_TOMBSTONES, {
    //     filter: (tombstone) => tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });

    // let roomBounds = Game.rooms[creep.room.name].getBounds();

    // If the rat doesn't know where to go.. Find it.
    if (!rat.memory.myTargetId) {
      // if we have a high volume emergency pickup, lets go get it
      let emergencyPickup = rat.room.find([FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES], {
        filter: (dropped) => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 200
      });
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
      // Move to the target and harvest it or pickit up
      if((target instanceof Source && rat.harvest(target) === ERR_NOT_IN_RANGE) ||
         (target instanceof Resource && rat.pickup(target) === ERR_NOT_IN_RANGE)) {
        rat.moveTo(target, { visualizePathStyle: {stroke: '#ffaa00'} });
      }
      // If the rat is full, or the target is empty.. unass
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
