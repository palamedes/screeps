module.exports = {

  // Get the max energy capacity of the room (not how much we have, but how much we COULD have)
  getMaxEnergyCapacity: room => {
    let extensions = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
    let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
    console.log(extensionCapacity + spawnCapacity);
    return extensionCapacity + spawnCapacity;
  },

};