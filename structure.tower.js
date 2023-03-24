var structureTower = {

  run: () => {
    structureTower.attack();
    structureTower.heal();
    structureTower.repair();
  },

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

  // Repair those things that need repairing
  repair: () => {
    for (let towerId in Game.towers) {
      let tower = Game.towers[towerId];
      if (tower.towerType === STRUCTURE_TOWER) {
        let damagedStructures = tower.room.find(FIND_STRUCTURES, {
          filter: (structure) => structure.hits < structure.hitsMax
        });
        if (damagedStructures.length > 0) {
          damagedStructures.sort((a, b) => a.hits - b.hits);
          tower.repair(damagedStructures[0]);
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
