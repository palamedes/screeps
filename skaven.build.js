const move = require('skaven.move');

let sBuild = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    var targets = rat.room.find(FIND_CONSTRUCTION_SITES);
    if(targets.length > 0 && rat.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if(rat.build(targets[0]) === ERR_NOT_IN_RANGE) {
        move.moveTo(rat, targets[0], '#0000ff');
      }
    } else {
      rat.say(rat.memory.slept > 2 ? '💤' : '💡');
      rat.memory.myTargetId = null;
      rat.memory.task = null;
      rat.memory.slept++;
    }
  },

}
module.exports = sBuild;
