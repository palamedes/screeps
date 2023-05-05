Room.prototype.summonSlave = function(memory) {
  // Get our slaves and then get the number of them that don't have the ability to carry anything.
  const slaves = _.filter(Game.creeps, (rat) => rat.memory.role === 'slave');
  const numHaulers = slaves.filter((slave) => slave.name.includes("hauler")).length;
  const numHarvesters = slaves.filter((slave) => slave.name.includes("harvester")).length;
  // const numHaulers = _.filter(Game.creeps, rat => rat.body.every(part => part.type !== WORK)).length;
  // const numHarvesters = _.filter(slaves, (slave) => !slave.body.some((part) => part.type === CARRY)).length;
  const ratSpawn = this.find(FIND_MY_SPAWNS)[0];
  const ratID = (Game.time % 100000) + '-' + this.energyAvailable;

  let ratName = 'Slave';
  let renews = 0;
  let energy = this.energyAvailable;
  let percentWork = 0.5, percentCarry = 0.50;

  // If we have more than 2 slaves already, and the number of harvester is less than the max number of harvesters for this room...
  // Summon a dedicated harvester -- which is a rat that can't carry.
  // const maxHarvesters = this.controller.level < 5 ? Memory.rooms[this.name].numSucklePoints : Memory.rooms[this.name].sources.length;
  const maxHarvesters = Memory.rooms[this.name].sources.length;
  if (slaves.length >= 2 && numHarvesters < maxHarvesters) {
    percentWork = 0.85;
    percentCarry = 0;
    energy = energy > 1000 ? 1000 : energy;
    renews = (energy === 1000) ? 50 : 0;
    ratName = 'Harvester';
  }

  // If we have more than 2 slaves already, and we have the max number of harvesters, and less haulers than harvesters..
  // Summon a dedicated hauler -- which is a rat that can't work.
  if (slaves.length >= 2 && numHarvesters >= 2 && numHaulers < 1) {
    percentWork = 0;
    percentCarry = 0.60;
    energy = energy > 1500 ? 1500 : energy;
    renews = (energy - 200) / (1500 - 200) * 50;
    ratName = 'Hauler';
  }

  // Setup the rat brain
  const ratBrain = { memory: { role: 'slave', renews: renews, spawn: { id: ratSpawn.id, name: ratSpawn.name }, task: null, slept: 0, taskAttempt: 0, moveAttempt: 0, ...memory } };
  // Calculate the number of body parts based on energySize
  const numWork  = Math.floor(energy * percentWork / 100); // 50% of the energy to work
  energy = energy - numWork * 100;
  const numCarry = Math.floor(energy * percentCarry / 50); // 50% of the remaining energy to carry
  energy = energy - numCarry * 50;
  const numMove  = Math.floor(energy / 50); // 100% remaining to move
  energy = energy - numMove * 50;
  let numTough = Math.floor(energy / 10); // Any amount left over, add toughness

  // Build the array of body parts based on the calculated numbers
  let ratParts = [];
  for (let i = 0; i < numTough; i++)  { ratParts.push(TOUGH); }
  for (let i = 0; i < numWork; i++)   { ratParts.push(WORK); }
  for (let i = 0; i < numCarry; i++)  { ratParts.push(CARRY); }
  for (let i = 0; i < numMove; i++)   { ratParts.push(MOVE); }
  // Now try to summon it
  return ratSpawn.spawnCreep(ratParts, ratName+ratID, ratBrain);
}