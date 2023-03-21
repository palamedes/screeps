let sUpgrade = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    var target = rat.room.controller;
    if (rat.room.controller) {
      if (rat.upgradeController(rat.room.controller) == ERR_NOT_IN_RANGE) {
        rat.moveTo(rat.room.controller, { visualizePathStyle: { stroke: '#ffffff' } });
      }
    } else {
      rat.say('💤');
      rat.memory.myTargetId = null;
      rat.memory.activity = '';
      rat.memory.slept++;
    }
  }
}
module.exports = sUpgrade;
