module.exports = {

  // Get the max possible energy capacity of a room by Rat
  getMaxEnergyCapacity: rat => {
    let extensions = rat.room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_EXTENSION } });
    let extensionCapacity = _.sum(extensions, (extension) => extension.energyCapacity);
    let spawnCapacity = Game.spawns[Object.keys(Game.spawns)[0]].energyCapacity;
    return extensionCapacity + spawnCapacity;
  },

  // Get the repair targets by rat
  getRepairTargets: rat => {
    return rat.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        if (structure.structureType == STRUCTURE_ROAD) {
          return structure.hits < structure.hitsMax * 0.8; // repair roads at 80% of maximum hits
        } else if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
          return structure.hits < structure.hitsMax * 0.0001;
        } else {
          return (structure.structureType != STRUCTURE_CONTROLLER) &&
            structure.hits < structure.hitsMax;
        }
      }
    });
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