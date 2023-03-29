const move = require("skaven.move");
let sUpgrade = {
  // Go upgrade the room controller. (Note; if a rat is bored it will also do this task without the task being set)
  using: rat => {
    var target = rat.room.controller;
    if (rat.room.controller && rat.store.getUsedCapacity(RESOURCE_ENERGY) > 0 && rat.canWork()) {
      if (rat.upgradeController(rat.room.controller) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, rat.room.controller, '#00ff00');
      }
      return true;
    }
    return false;
  }
}
module.exports = sUpgrade;
