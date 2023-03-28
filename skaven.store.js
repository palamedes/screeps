const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    let targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTAINER  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }

    if (rat.store.getUsedCapacity() === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
    // If there are any targets store in order above..
    if (targets.length > 0) {
      let randomIndex = Math.floor(Math.random() * targets.length);
      let randomTarget = targets[randomIndex];
      if(rat.transfer(randomTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, randomTarget, '#aaaaaa');
      }
      return true;
    }
    return false;
  },
}
module.exports = sStore;
