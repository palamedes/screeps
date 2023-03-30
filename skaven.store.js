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
    if (rat.store.getUsedCapacity() === 0) { rat.clearTask(); }
    // If there are any targets store in order above..
    else if (target) {
      const resources = Object.keys(rat.store);
      let results = ERR_NOT_IN_RANGE;
      let transfer_item = null;

      if (resources.length > 0) {

        if (resources[0] === 'energy') transfer_item = RESOURCE_ENERGY;
        if (resources[0] === 'GO') transfer_item = RESOURCE_GHODIUM_OXIDE;
        if (resources[0] === 'ZH') transfer_item = RESOURCE_ZYNTHIUM_HYDRIDE;
        if (resources[0] === 'UH') transfer_item = RESOURCE_UTRIUM_HYDRIDE;
        if (resources[0] === 'KO') transfer_item = RESOURCE_KEANIUM_OXIDE;

        results = rat.transfer(target, transfer_item);
        console.log(target, results);
      }
      // for (let i = 0; i < resources.length; i++) {
      //   const results = rat.transfer(target, RESOURCE_ENERGY);
      //   const resourceType = resources[i];
      //   const amount = container.store[resourceType];
      //   console.log(`${resourceType}: ${amount}`);
      // }
      //
      //
      // const results = rat.transfer(target, RESOURCE_ENERGY);
      // @TODO Transfer RESOURCE_UTRIUM, RESOURCE_KEANIUM, RESOURCE_LEMERGIUM, RESOURCE_ZYNTHIUM, RESOURCE_OXYGEN, RESOURCE_HYDROGEN, RESOURCE_CATALYST
      if (results === ERR_NOT_IN_RANGE)         { move.moveTo(rat, target, '#aaaaaa');}
      else if (results === ERR_FULL)            { rat.clearTarget(); }
      else if (results === ERR_INVALID_TARGET)  { rat.clearTask(); }
      return true;
    }
    return false;
  },
}
module.exports = sStore;
