var structureTower = {

  // Heal any damaged rats near by
  heal: () => {
    for (let towerId in Game.towers) {
      let tower = Game.towers[towerId];
      if (tower.towerType === STRUCTURE_TOWER) {
        var damagedRat = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
          filter: (rat) => rat.hits < rat.hitsMax
        });
        if(damagedRat) {
          tower.heal(damagedRat);
        }
      }
    }
  },

  // Attack any hostile creeps
  attack: () => {
    // Are there any hostile creeps?
    const hostileCreeps = Game.spawns[Object.keys(Game.spawns)[0]].room.find(FIND_HOSTILE_CREEPS);
    if (hostileCreeps.length > 0) {
      for (let towerId in Game.towers) {
        let tower = Game.towers[towerId];
        if (tower.towerType === STRUCTURE_TOWER) {
          let closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
          if (closestHostile) {
            tower.attack(closestHostile);
          }
        }
      }
    }
  }

}
module.exports = structureTower;
