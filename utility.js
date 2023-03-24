module.exports = {

  // Get the max possible energy capacity of a room by Rat
  getMaxEnergyCapacity: rat => {
    let extensions = rat.room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
    let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
    return extensionCapacity + spawnCapacity;
  },

  // Find all structures within one tile of the source
  getWallsAroundSource: (source) => {
    let structures = source.pos.findInRange(FIND_STRUCTURES, 1);
    // Filter the structures to include only walls
    let walls = structures.filter(structure => {
      return structure.structureType == STRUCTURE_WALL;
    });
    return walls;
  }

};