const move = require("./skaven.move");
let sRenew = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    let doneRenewing = false;
    let closestSpawn = rat.pos.findClosestByPath(FIND_MY_SPAWNS);
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
  }
}
module.exports = sRenew;
