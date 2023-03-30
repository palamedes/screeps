const move = require("./skaven.move");

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
Creep.prototype.clearTarget = function() { this.memory.myTargetId = null; }

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

Creep.prototype.takeAllFrom = function(target) {
  let results = [];
  const store = Object.keys(target.store);
  for (let i = 0; i < store.length; i++) {
    if (store[i] === 'energy')  results.push(this.takeFrom(target, RESOURCE_ENERGY));
    if (store[i] === 'U')       results.push(this.takeFrom(target, RESOURCE_UTRIUM));
    if (store[i] === 'K')       results.push(this.takeFrom(target, RESOURCE_KEANIUM));
    if (store[i] === 'L')       results.push(this.takeFrom(target, RESOURCE_LEMERGIUM));
    if (store[i] === 'Z')       results.push(this.takeFrom(target, RESOURCE_ZYNTHIUM));
    if (store[i] === 'O')       results.push(this.takeFrom(target, RESOURCE_OXYGEN));
    if (store[i] === 'H')       results.push(this.takeFrom(target, RESOURCE_HYDROGEN));
    if (store[i] === 'X')       results.push(this.takeFrom(target, RESOURCE_CATALYST));
    if (store[i] === 'UH')      results.push(this.takeFrom(target, RESOURCE_UTRIUM_HYDRIDE));
    if (store[i] === 'UO')      results.push(this.takeFrom(target, RESOURCE_UTRIUM_OXIDE));
    if (store[i] === 'KH')      results.push(this.takeFrom(target, RESOURCE_KEANIUM_HYDRIDE));
    if (store[i] === 'KO')      results.push(this.takeFrom(target, RESOURCE_KEANIUM_OXIDE));
    if (store[i] === 'LH')      results.push(this.takeFrom(target, RESOURCE_LEMERGIUM_HYDRIDE));
    if (store[i] === 'LO')      results.push(this.takeFrom(target, RESOURCE_LEMERGIUM_OXIDE));
    if (store[i] === 'ZH')      results.push(this.takeFrom(target, RESOURCE_ZYTHNIUM_HYDRIDE));
    if (store[i] === 'ZO')      results.push(this.takeFrom(target, RESOURCE_ZYTHNIUM_OXIDE));
    if (store[i] === 'GH')      results.push(this.takeFrom(target, RESOURCE_GHODIUM_HYDRIDE));
    if (store[i] === 'GO')      results.push(this.takeFrom(target, RESOURCE_GHODIUM_OXIDE));
    if (store[i] === 'XUH2O')   results.push(this.takeFrom(target, RESOURCE_UTRIUM_ACID));
    if (store[i] === 'XUHO2')   results.push(this.takeFrom(target, RESOURCE_UTRIUM_ALKALIDE));
    if (store[i] === 'XKH2O')   results.push(this.takeFrom(target, RESOURCE_KEANIUM_ACID));
    if (store[i] === 'XKHO2')   results.push(this.takeFrom(target, RESOURCE_KEANIUM_ALKALIDE));
    if (store[i] === 'XLH2O')   results.push(this.takeFrom(target, RESOURCE_LEMERGIUM_ACID));
    if (store[i] === 'XLHO2')   results.push(this.takeFrom(target, RESOURCE_LEMERGIUM_ALKALIDE));
    if (store[i] === 'XZH2O')   results.push(this.takeFrom(target, RESOURCE_ZYTHNIUM_ACID));
    if (store[i] === 'XZHO2')   results.push(this.takeFrom(target, RESOURCE_ZYTHNIUM_ALKALIDE));
    if (store[i] === 'XGH2O')   results.push(this.takeFrom(target, RESOURCE_GHODIUM_ACID));
    if (store[i] === 'XGHO2')   results.push(this.takeFrom(target, RESOURCE_GHODIUM_ALKALIDE));
  }
  return results;
}
Creep.prototype.takeFrom = function(target, resource) {
  let results = null;
  if (target instanceof Resource && target.energy > 0) { results = this.pickup(target); }
  if (target instanceof StructureContainer && target.store[resource] > 0) { results = this.withdraw(target, resource); }
  return results;
}
