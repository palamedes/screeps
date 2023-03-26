const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    var targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return (structure.structureType === STRUCTURE_EXTENSION ||
                structure.structureType === STRUCTURE_SPAWN ||
                structure.structureType === STRUCTURE_TOWER) &&
                structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    if (rat.store.getUsedCapacity() === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
    if(targets.length > 0) {
      var target = rat.pos.findClosestByRange(targets);
      if(rat.transfer(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, target, '#aaaaaa');
      }
    } else {
      rat.say(rat.memory.slept > 2 ? '💤' : '💡');
      rat.memory.myTargetId = null;
      rat.memory.task = null;
      rat.memory.slept++;
    }
  },
}
module.exports = sStore;
