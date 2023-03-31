const move = require("./skaven.move");
let sStore = {
  // Go store the energy
  using: rat => {
    let targets = [], target = null;

    // If the rat cannot WORK then it's probably a hauler so check for more storage
    if (rat.cannotWork()) {
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = targets.sort((a, b) => a.store.getFreeCapacity(RESOURCE_ENERGY) - b.store.getFreeCapacity(RESOURCE_ENERGY))[0];
      }
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_CONTAINER  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
    }

    // all other rats, probably a slave, store it somewhere else.
    if (rat.canWork()) {
      if (rat.carryingNonEnergyResource()) { targets = rat.room.find(FIND_STRUCTURES, {
          filter: (structure) => structure.structureType === STRUCTURE_STORAGE    && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_EXTENSION  && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
      if (targets.length === 0) { targets = rat.room.find(FIND_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_TOWER      && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0 });
        target = rat.pos.findClosestByRange(targets);
      }
    }

    // If the rat is empty then unset all the things.
    if (rat.store.getUsedCapacity() === 0 && !rat.carryingNonEnergyResource()) {
      console.log('clear', rat.name, target);
      rat.clearTask();
    }
    // If there are any targets store in order above..
    else if (target) {
      console.log('target', rat.name, target);
      if (rat.pos.inRangeTo(target.pos, 1)) {
        let res = rat.giveAllTo(target);
        if (res.includes(ERR_NOT_IN_RANGE)) {
          console.log('ERROR: Not in range?!  How....');
        } else if (res.includes(ERR_INVALID_TARGET)) {
          rat.clearTask();
        } else if (res.includes(ERR_FULL)) {
          rat.clearTarget();
        }
      } else {
        move.moveTo(rat, target, '#ffffff');
      }
      return true;
    }
    return false;
  },
}
module.exports = sStore;
