var structureTower = {

  heal: () => {
    for (let structureId in Game.structures) {
      let structure = Game.structures[structureId];
      if (structure.structureType === STRUCTURE_TOWER) {
        var closestDamagedCreep = structure.pos.findClosestByRange(FIND_MY_CREEPS, {
          filter: (creep) => creep.hits < creep.hitsMax
        });
        if(closestDamagedCreep) {
          structure.heal(closestDamagedCreep);
        }
      }
    }
  }

}
module.exports = structureTower;
