const move = require("skaven.move");
let sRenew = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    let doneRenewing = false;
    const spawns = rat.room.find(FIND_MY_STRUCTURES, {
      filter: (structure) => structure.structureType === STRUCTURE_SPAWN  && !structure.spawning
    });
    let closestSpawn = rat.pos.findClosestByPath(spawns);
    if (closestSpawn) {
      if (rat.pos.isNearTo(closestSpawn)) {
        let result = closestSpawn.renewCreep(rat);
        doneRenewing = result === ERR_FULL || result === ERR_NOT_ENOUGH_ENERGY;
      } else {
        move.moveTo(rat, closestSpawn, '#00ffff');
        doneRenewing = false
      }
    } else {
      doneRenewing = true
    }
    return !doneRenewing;
  },

  decide: rat => {
    // const canCarry = rat.body.filter(part => part.type === CARRY).length > 0;
    // if (canCarry && rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room)
  }

  //   rat.ticksToLive <= 50 && rat.memory.task !== 'renew' && rat.room.controller.level >= 4 && rat.memory.renews > 0) {
  // if (Game.rooms[rat.memory.homeRoom].energyAvailable > 100

}
module.exports = sRenew;
