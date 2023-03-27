const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    var targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_EXTENSION ||
                structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_CONTAINER ||
                structure.structureType === STRUCTURE_TOWER) &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      },
      sort: (a, b) => {
        const types = [ STRUCTURE_CONTAINER, STRUCTURE_TOWER, STRUCTURE_SPAWN, STRUCTURE_EXTENSION  ];
        return types.indexOf(a.structureType) - types.indexOf(b.structureType);
      }
    });
    if (rat.store.getUsedCapacity() === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
    if(targets.length > 0) {
      var target = targets[0];
      // var target = rat.pos.findClosestByRange(targets);
      if(rat.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, target, '#aaaaaa');
      }
      return true;
    }
    return false;
  },
}
module.exports = sStore;
