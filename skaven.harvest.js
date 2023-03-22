let sHarvest = {
  // Harvest energy from sources, ruins, tombstones, and dropped resources
  using: rat => {

    // let roomBounds = Game.rooms[creep.room.name].getBounds();
    let harvestTargets = rat.room.find(FIND_SOURCES, {
      filter: (source) => source.energy > 0
    });

    // var ruins = creep.room.find(FIND_RUINS, {
    //     filter: (ruin) => ruin.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    // var tombstones = rat.room.find(FIND_TOMBSTONES, {
    //     filter: (tombstone) => tombstone.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    // });
    let droppedEnergy = rat.room.find(FIND_DROPPED_RESOURCES, {
      filter: (dropped) => dropped.resourceType === RESOURCE_ENERGY && dropped.amount > 25
    });

    if (!rat.memory.myTargetId && droppedEnergy.length > 0) {
      let firstDrop = droppedEnergy[0];
      console.log('assigning dropped energy' + droppedEnergy.length);
      console.log(firstDrop);
      let x = firstDrop.pos.x;
      let y = firstDrop.pos.y;
      let roomName = firstDrop.pos.roomName;

      new RoomVisual(roomName).circle(x, y, {
        radius: 0.5,
        fill: 'rgba(255, 255, 0, 0.3)',
        stroke: 'yellow',
        strokeWidth: 0.15
      });

      // THIS FIRES but it then just goes on to harvest, is a regular energy source considered a dropped energy source?
      rat.memory.myTargetId = droppedEnergy.id
    }

    // If the rat doesn't know where to go.. Find it.
    if(!rat.memory.myTargetId) {
      var closestTarget = rat.pos.findClosestByRange(harvestTargets);
      if(closestTarget) {
        rat.memory.myTargetId = closestTarget.id;
      }
    }
    // Go to that target and harvest it, assuming it has power.
    var target = Game.getObjectById(rat.memory.myTargetId);
    if (target && target.energy > 0) {
      if(rat.harvest(target) === ERR_NOT_IN_RANGE) {
        rat.moveTo(target, { visualizePathStyle: {stroke: '#ffaa00'} });
      }
    }
    // If the rat is full, or the target is empty.. unass
    if (rat.store.getFreeCapacity() === 0 || target.energy === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
  },
}
module.exports = sHarvest;
