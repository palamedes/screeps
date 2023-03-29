
Creep.prototype.getAvailableSpawn = function() {
  const spawns = this.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  });
  return spawns.length > 0 ? this.pos.findClosestByRange(spawns) : false;
};

Creep.prototype.canCarry = function() { return this.body.some(part => part.type === CARRY); }
Creep.prototype.cannotCarry = function() { return this.body.every(part => part.type !== CARRY); }

Creep.prototype.canWork = function() { return this.body.some(part => part.type === WORK); }
Creep.prototype.cannotWork = function() { return this.body.every(part => part.type !== WORK); }
