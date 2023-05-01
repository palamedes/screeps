const structures = require("structures");

// Set the room memory...
Room.prototype.setMemory = function() {
  Memory.rooms = Memory.rooms || {}
  Memory.rooms[this.name] = Memory.rooms[this.name]     || {}
  Memory.rooms[this.name] = {
    status:       Memory.rooms[this.name].status        || 'init',
    sources:      Memory.rooms[this.name].sources       || {},
    sourcesUsed:  Memory.rooms[this.name].sourcesUsed   || {},
    maxSlaves:    Memory.rooms[this.name].maxSlaves     || 2,
    basePlan:     Memory.rooms[this.name].basePlan      || null,
    tickCount:    Memory.rooms[this.name].tickCount     || 0,
    maxEnergy:    Memory.rooms[this.name].maxEnergy     || 0,
  }
  return Memory.rooms[this.name];
}

// Run the room...
Room.prototype.run = function() {
  let mem = Memory.rooms[this.name];
  mem.tickCount++;
  if (mem.status  === 'init')     { this.init(); }
  if (mem.status  === 'running')  { this.running(); }
}

// Setup plan for base, roads to sources..etc.
Room.prototype.init = function() {
  // Find our sources and build path from spawn to
  const energySources = this.find(FIND_SOURCES);
  // Look around the sources, and find the suckle points
  let findSucklePoints = source => {
    const surroundings = [];
    for (let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
      for (let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
        if (x === source.pos.x && y === source.pos.y) continue;
        const look = source.room.lookAt(x, y);
        if (look.some(obj => obj.type === LOOK_TERRAIN && obj.terrain === 'wall')) continue;
        if (look.some(obj => obj.type === LOOK_STRUCTURES && OBSTACLE_OBJECT_TYPES.includes(obj.structure.structureType))) continue;
        surroundings.push({x: x, y: y});
      }
    }
    return surroundings;
  }
  for(let i in energySources) {
    Memory.rooms[this.name].sources[energySources[i].id] = findSucklePoints(energySources[i]);
  }

  // @TODO Do stuff to setup the room here..

  // Once this is all said and done, we can run the this.
  Memory.rooms[this.name].status = "running";
}

// Okay do the day to day running of the room
Room.prototype.running = function() {
  // Work Towers
  structures.tower.run();
  // Draw the base plan based on the rooms information
  structures.drawBaseplan(this);
  // Okay every so often we need the room to build something
  structures.buildSomething(this);
}

// If we are RCL 5, we need to change our Creeps
Room.prototype.onRCL5 = function() {

}