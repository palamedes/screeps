// Utility to find all available spawns
Creep.prototype.getAvailableSpawn = () => {
  const spawns = this.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  });
  return spawns.length > 0 ? this.pos.findClosestByRange(spawns) : false;
};

// Can this Creep Carry?
Creep.prototype.canCarry = () => { return this.body.filter(part => part.type === CARRY).length > 0 }