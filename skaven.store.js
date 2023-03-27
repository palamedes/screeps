const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    if (rat.store.getUsedCapacity() === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    } else {
      let targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
      targets.push(rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }));
      targets.push(rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }));
      targets.push(rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTAINER  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }));
      targets.push(rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 }));

      // If there are any targets store in order above..
      if(targets.length > 0) {
        if(rat.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          move.moveTo(rat, targets[0], '#aaaaaa');
        }
        return true;
      }
    }
    return false;
  },
}
module.exports = sStore;
