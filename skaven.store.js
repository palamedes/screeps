const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    let targets = [];

    // If the rat cannot WORK then it's probably a hauler so check for more storage
    if (rat.cannotWork() && targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_CONTAINER    && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (rat.cannotWork() && targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_STORAGE      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }

    // all other rats, probably a slave, store it somewhere else.
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }
    if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
    }

    // If the rat is empty then unset all the things.
    if (rat.store.getUsedCapacity() === 0) {
      rat.memory.myTargetId = null;
      rat.memory.task = null;
    }
    // If there are any targets store in order above..
    if (targets.length > 0) {
      // let randomIndex = Math.floor(Math.random() * targets.length);
      // let randomTarget = targets[randomIndex];
      if(rat.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, targets[0], '#aaaaaa');
      } else {
        console.log(rat.transfer(targets[0], RESOURCE_ENERGY));
      }
      return true;
    }
    return false;
  },
}
module.exports = sStore;
