/**
 * Skaven Gutter Runner!
 * This is the creep that is the one that finds us new places to live, explores, and claims.
 *
 * Possible Tasks
 *  FIND_ROOM       - Find the room for us to take by looking at the various rooms around us and figure the one we want
 *  MOVE_TO_ROOM    - Move to the rooms controller for the room that we have decided to take
 *  CLAIM_ROOM      - Claim that room's controller
 */

Creep.prototype.skaven.runner.skitter = function(room, runners) {

  // If we don't know what we are doing, then lets find something to do...
  if (!this.getTask()) { this.setTask('FIND_ROOM'); }

  // Perform a task
  if (this.getTask() === 'FIND_ROOM')     { this.findRoom(); }
  if (this.getTask() === 'MOVE_TO_ROOM')  { this.moveToRoom(); }
  if (this.getTask() === 'CLAIM_ROOM')    { this.claimRoom(); }

}

Creep.prototype.skaven.runner.findRoom = function() {
  const exits = Game.map.describeExits(this.room.name);

  // Pick a random exit to move to
  const exitDir = _.sample(Object.keys(exits));
  const exit = exits[exitDir];

  console.log('Finding exits', exit);
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
    const ratParts = ['TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','TOUGH','CLAIM','MOVE','MOVE','MOVE','MOVE','MOVE','MOVE']

    const spawns = room.find(FIND_MY_STRUCTURES, {
        filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
      });
    if (spawns.length > 0) {
      console.log(spawns[0].spawnCreep(ratParts, ratName, ratBrain));
    }
  }
}