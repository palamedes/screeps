/**
 * Skaven Engineer!
 * This is the creep that upgrades the room controller, goes into a new room to do the same..etc..
 * There should be 1 per room we have.
 *
 * Possible Tasks
 *  FIND_ROOM         - Find us a room to work in...
 *  UPDATE_CONTROLLER - Update the controller in that room...
 *  GET_POWER         - Go find some power to use...
 */

Creep.prototype.skaven.engineer.skitter = function(engineers) {

  // If we don't know what we are doing, then lets find something to do...
  if (!this.getTask()) { this.setTask('FIND_ROOM'); }

  // Perform a task
  if (this.getTask() === 'FIND_ROOM')         { this.skaven.engineer.findRoom.bind(this)(); }
  if (this.getTask() === 'UPDATE_CONTROLLER') { this.skaven.engineer.updateController.bind(this)(); }
  if (this.getTask() === 'GET_POWER')         { this.skaven.engineer.getPower.bind(this)(); }

}

// Find us a room that needs it's controller updated...
Creep.prototype.skaven.engineer.findRoom = function() {
  // Look at all the rooms we own, does each one have at least one engineer working the controller?
  // Does my room have a controller and is it .my?

}

// Update the controller in the room we are assigned to...
Creep.prototype.skaven.engineer.updateController = function() {
  // Move to and update the controller.
  // If we run out of power, go get power and come back.  This is your life...
}

// Update the controller in the room we are assigned to...
Creep.prototype.skaven.engineer.getPower = function() {

}



/** Summon Skaven Engineer
 * This root Creep method does the work of determining if we need an Engineer to go take care of a controller in some room.
 * If we do it will summon the engineer and put him to work updating the controller... that's his life...
 * @param room
 * @param engineers
 */
Creep.summonSkavenEngineer = function(room, engineers) {
  return false;
  // Summon an Engineer if we don't have at least one in each room
  if (engineers.length < Memory.roomsList.length && room.energyAvailable > 300) {
    const ratSpawn = Game.spawns[Object.keys(Game.spawns)[0]];
    if (ratSpawn) {
      const ratName = 'Engineer-' + Game.time + '-' + room.energyAvailable;
      const ratBrain = { memory: { role: 'engineer', renews: 25, spawn: { id: room.id, name: room.name }, task: null, slept: 0, taskAttempt: 0, moveAttempt: 0 } };
      // Calculate the number of body parts based on energy given for this
      const percentWork = 0.5, percentCarry = 0.50;
      let energy = room.energyAvailable;
      const numWork  = Math.floor(energy * percentWork / 100); // 50% of the energy to work
      energy = energy - numWork * 100;
      const numCarry = Math.floor(energy * percentCarry / 50); // 50% of the remaining energy to carry
      energy = energy - numCarry * 50;
      const numMove  = Math.floor(energy / 50); // 100% remaining to move

    }


    //   const ratParts = [CLAIM,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE];
  //
  //   const spawns = room.find(FIND_MY_STRUCTURES, {
  //     filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
  //   });
  //   if (spawns.length > 0) { spawns[0].spawnCreep(ratParts, ratName, ratBrain); }
  }
}