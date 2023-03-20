module.exports = {

  getMaxEnergyCapacity: room => {
//      let baseCapacity = STRUCTURE_SPAWN.energyCapacity + STRUCTURE_EXTENSION.energyCapacity * CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level];
    let extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
    let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
    console.log(extensionCapacity + spawnCapacity);
    return extensionCapacity + spawnCapacity;
  },

  getSkavenBodyParts: size => {
    return [WORK, CARRY, MOVE, MOVE, MOVE];
  }

};