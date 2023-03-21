let sBuild = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    var targets = rat.room.find(FIND_CONSTRUCTION_SITES);
    if(targets.length > 0) {
      if(rat.build(targets[0]) === ERR_NOT_IN_RANGE) {
        rat.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
      }
    } else {
      rat.say('💤');
      rat.memory.myTargetId = null;
      rat.memory.activity = '';
      rat.memory.slept++;
    }
  }
}
module.exports = sBuild;
