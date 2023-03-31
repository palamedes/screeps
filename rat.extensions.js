const move = require("skaven.move");

Creep.prototype.getAvailableSpawn = function() {
  const spawns = this.room.find(FIND_MY_STRUCTURES, {
    filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  });
  return spawns.length > 0 ? this.pos.findClosestByRange(spawns) : false;
};

Creep.prototype.canCarry = function() { return this.body.some(part => part.type === CARRY); }
Creep.prototype.cannotCarry = function() { return this.body.every(part => part.type !== CARRY); }
Creep.prototype.carryingNonEnergyResource = function() {
  for (let rT in this.store) { if (rT !== RESOURCE_ENERGY && this.store[rT] > 0) return true; } return false;
};

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
  if (target.store) {
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
  } else {
    results = [this.takeFrom(target, 'energy')];
  }
  return results;
}
Creep.prototype.takeFrom = function(target, resource) {
  let results = null;
  if (target instanceof Resource && target.energy > 0) { results = this.pickup(target); }
  if (target instanceof Tombstone && target.store[resource] > 0) { results = this.withdraw(target, resource); }
  if (target instanceof StructureContainer && target.store[resource] > 0) { results = this.withdraw(target, resource); }
  return results;
}

Creep.prototype.giveAllTo = function(target) {
  let results = [];
  const store = Object.keys(this.store);
  if (store.length > 0) {
    if (store.includes('energy')) results.push(this.giveTo(target, RESOURCE_ENERGY));
    if (store.includes('U'))      results.push(this.giveTo(target, RESOURCE_UTRIUM));
    if (store.includes('K'))      results.push(this.giveTo(target, RESOURCE_KEANIUM));
    if (store.includes('L'))      results.push(this.giveTo(target, RESOURCE_LEMERGIUM));
    if (store.includes('Z'))      results.push(this.giveTo(target, RESOURCE_ZYNTHIUM));
    if (store.includes('O'))      results.push(this.giveTo(target, RESOURCE_OXYGEN));
    if (store.includes('H'))      results.push(this.giveTo(target, RESOURCE_HYDROGEN));
    if (store.includes('X'))      results.push(this.giveTo(target, RESOURCE_CATALYST));
    if (store.includes('UH'))     results.push(this.giveTo(target, RESOURCE_UTRIUM_HYDRIDE));
    if (store.includes('UO'))     results.push(this.giveTo(target, RESOURCE_UTRIUM_OXIDE));
    if (store.includes('KH'))     results.push(this.giveTo(target, RESOURCE_KEANIUM_HYDRIDE));
    if (store.includes('KO'))     results.push(this.giveTo(target, RESOURCE_KEANIUM_OXIDE));
    if (store.includes('LH'))     results.push(this.giveTo(target, RESOURCE_LEMERGIUM_HYDRIDE));
    if (store.includes('LO'))     results.push(this.giveTo(target, RESOURCE_LEMERGIUM_OXIDE));
    if (store.includes('ZH'))     results.push(this.giveTo(target, RESOURCE_ZYTHNIUM_HYDRIDE));
    if (store.includes('ZO'))     results.push(this.giveTo(target, RESOURCE_ZYTHNIUM_OXIDE));
    if (store.includes('GH'))     results.push(this.giveTo(target, RESOURCE_GHODIUM_HYDRIDE));
    if (store.includes('GO'))     results.push(this.giveTo(target, RESOURCE_GHODIUM_OXIDE));
    if (store.includes('XUH2O'))  results.push(this.giveTo(target, RESOURCE_UTRIUM_ACID));
    if (store.includes('XUHO2'))  results.push(this.giveTo(target, RESOURCE_UTRIUM_ALKALIDE));
    if (store.includes('XKH2O'))  results.push(this.giveTo(target, RESOURCE_KEANIUM_ACID));
    if (store.includes('XKHO2'))  results.push(this.giveTo(target, RESOURCE_KEANIUM_ALKALIDE));
    if (store.includes('XLH2O'))  results.push(this.giveTo(target, RESOURCE_LEMERGIUM_ACID));
    if (store.includes('XLHO2'))  results.push(this.giveTo(target, RESOURCE_LEMERGIUM_ALKALIDE));
    if (store.includes('XZH2O'))  results.push(this.giveTo(target, RESOURCE_ZYTHNIUM_ACID));
    if (store.includes('XZHO2'))  results.push(this.giveTo(target, RESOURCE_ZYTHNIUM_ALKALIDE));
    if (store.includes('XGH2O'))  results.push(this.giveTo(target, RESOURCE_GHODIUM_ACID));
    if (store.includes('XGHO2'))  results.push(this.giveTo(target, RESOURCE_GHODIUM_ALKALIDE));
  }
  return results;
}
Creep.prototype.giveTo = function(target, resource) {
  return this.transfer(target, resource);
}