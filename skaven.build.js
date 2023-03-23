let sBuild = {
  // Go find something to build and go build it, if there is nothing or we have finished building something, reset.
  using: rat => {
    var targets = rat.room.find(FIND_CONSTRUCTION_SITES);
    if(targets.length > 0 && rat.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
      if(rat.build(targets[0]) === ERR_NOT_IN_RANGE) {
        rat.moveTo(targets[0], {visualizePathStyle: {stroke: '#ffffff'}});
      }
    } else {
      rat.say(rat.memory.slept > 2 ? '💤' : '💡');
      rat.memory.myTargetId = null;
      rat.memory.task = null;
      rat.memory.slept++;
    }
  },


  // // Find us a construction target
  // if (constructionTargets && constructionTargets.length === 0 && (Memory.tickCount % 50) === 0 && !Memory.mostVisitedTile) {
  //   Memory.mostVisitedTile = skavenActions.getMostVisitedTile();
  //   let needsRoad = true;
  //   let structures = rat.room.lookForAt(LOOK_STRUCTURES, parseInt(Memory.mostVisitedTile.x), parseInt(Memory.mostVisitedTile.y));
  //   for (let i = 0; i < structures.length; i++) { if (structures[i].structureType === STRUCTURE_ROAD) { needsRoad = false; break; }}
  //   if (needsRoad) {
  //     rat.room.createConstructionSite(parseInt(Memory.mostVisitedTile.x), parseInt(Memory.mostVisitedTile.y), STRUCTURE_ROAD);
  //   }
  //   Memory.tileVisits[parseInt(Memory.mostVisitedTile.x)][parseInt(Memory.mostVisitedTile.y)] = 0;
  //   Memory.mostVisitedTile = null;
  // }


}
module.exports = sBuild;
