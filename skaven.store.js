let sStore = {
  // Go store the energy
  store: rat => {
    var targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_EXTENSION ||
            structure.structureType === STRUCTURE_SPAWN ||
            structure.structureType === STRUCTURE_TOWER) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if(targets.length > 0) {
      var target = rat.pos.findClosestByRange(targets);
      if(rat.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        rat.moveTo(target, {visualizePathStyle: {stroke: '#aaffff'}});
      }
    } else {
      roleSkaven.reset(rat, 'build');
    }
  },
}
module.export = sStore;
