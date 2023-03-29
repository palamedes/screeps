
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

Creep.prototype.getTarget = function() { return Game.getObjectById(this.memory.myTargetId); }
Creep.prototype.setTarget = function(t) { return this.memory.myTargetId = t instanceof Object ? t.id : t; }

Creep.prototype.clearTask = function() { this.memory.myTargetId = null; this.memory.task = null; }
Creep.prototype.sleep = function() { this.clearTask(); this.memory.slept++; }
Creep.prototype.setTask = function(task) { this.memory.task = task; this.memory.slept = 0;
  if (task === 'build')   { this.say('🚧'); }
  if (task === 'upgrade') { this.say('🛠️'); }
  if (task === 'repair')  { this.say('🔧'); }
  if (task === 'upgrade') { this.say('🛠️'); }
  if (task === 'store')   { this.say('🔋'); }
  if (task === 'renew')   { this.say('⌛'); this.memory.renews--; }
  if (task === 'harvest') { this.say('⚡'); this.setTarget(null); }
}
