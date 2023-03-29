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
    if (rat.store.getUsedCapacity() === 0) { rat.clearTask(); }
    // If there are any targets store in order above..
    else if (targets.length > 0) {
      console.log('store targets', targets);
      // let randomIndex = Math.floor(Math.random() * targets.length);
      // let randomTarget = targets[randomIndex];
      if (rat.transfer(targets[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, targets[0], '#aaaaaa');
      // } else {
      //   rat.clearTask();
      }
      return true; // <--- this is dumb
    }
    return false;
  },
}
module.exports = sStore;
