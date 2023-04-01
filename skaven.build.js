
let sBuild = {
  // Find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    var targets = rat.room.find(FIND_CONSTRUCTION_SITES);
    if(targets.length > 0 && rat.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if(rat.build(targets[0]) === ERR_NOT_IN_RANGE) {
        rat.moveCreepTo(targets[0], '#0000ff');
      }
      return true;
    }
    return false;
  },

}
module.exports = sBuild;
