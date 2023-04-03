/**
 * Skaven Gutter Runner!
 * This is the creep that is the one that finds us new places to live, explores, and claims.
 *
 * Possible Tasks
 *  FIND_ROOM       - Find the room for us to take by looking at the various rooms around us and figure the one we want
 *  MOVE_TO_ROOM    - Move to the rooms controller for the room that we have decided to take
 *  CLAIM_ROOM      - Claim that room's controller
 */

Creep.prototype.skaven.runner.skitter = function(runners) {

  // If we don't know what we are doing, then lets find something to do...
  if (!this.getTask()) { this.setTask('FIND_ROOM'); }

  // Perform a task
  if (this.getTask() === 'FIND_ROOM')     { this.skaven.runner.findRoom.bind(this)(); }
  if (this.getTask() === 'CLAIM_ROOM')    { this.skaven.runner.claimRoom.bind(this)(); }

}

Creep.prototype.skaven.runner.findRoom = function() {

  // if this isn't our spawn room, and we don't own this room... take it
  if (this.room.name !== this.memory.spawn.name && !this.room.my) {
    this.setTask('CLAIM_ROOM');
  }

  // Pick a random exit to move to
  // const exits = Game.map.describeExits(this.room.name);
  // const exitDir = _.sample(Object.keys(exits)); // random

  // Do we own this room?
  // If this is a new room that we don't own, and it's safe... Change task to Claim

  // Find closest exit
  const target = this.pos.findClosestByPath(FIND_EXIT, { filter: (pos) => {
      return (pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49);
    }});

  if (target !== null) {
    this.moveCreepTo(target, '#ffffff');
  } else {
    // There is no exit point in the wall
    console.log("No wall exit found!");
  }

  // // Move the creep to the exit
  // creep.moveTo(creep.pos.findClosestByPath(exit));
  //
  // // Once the creep reaches the new room, start claiming it
  // if (creep.room.name !== currentRoom.name) {
  //   const controller = creep.room.controller;
  //   if (controller && !controller.my) {
  //     if (creep.claimController(controller) === ERR_NOT_IN_RANGE) {
  //       creep.moveTo(controller);
  //     }
  //   }
  // }

}


// Summon a Skaven Gutter Runner if we need to...
Creep.summonSkavenRunner = function(room, runners) {
  // Summon a Gutter Runner if we meet certain criteria
  if (room.controller.level >= 5 && runners.length === 0 && room.energyAvailable > 1000) {
    const ratName = 'Runner-' + Game.time + '-' + this.energyAvailable;
    const ratBrain = { memory: { role: 'runner', renews: 0, spawn: { id: room.id, name: room.name }, task: null, slept: 0, taskAttempt: 0, moveAttempt: 0 } };
    const ratParts = [TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,TOUGH,CLAIM,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE]

    const spawns = room.find(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
      });
    if (spawns.length > 0) { spawns[0].spawnCreep(ratParts, ratName, ratBrain); }
  }
}