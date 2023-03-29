// Utility to find all available spawns
Creep.prototype.getAvailableSpawn = function() {
  const spawns = this.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  });
  return spawns.length > 0 ? this.pos.findClosestByRange(spawns) : false;
};

// Can this Creep Carry?
Creep.prototype.canCarry = function() {
  return this.body.some(part => part.type === CARRY);
}
