var structureTower = {

  // Run the tower code
  run: () => {
    let towers = Object.values(Game.structures).filter(structure => structure.structureType === STRUCTURE_TOWER);
    let onAlert = structureTower.attack(towers);
    if (!onAlert) {
      structureTower.heal(towers);
      structureTower.repair(towers);
    }
  },

  // Heal any damaged rats near by
  heal: towers => {
    for (let tower in towers) {
      // let tower = Game.towers[towerId];
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
  repair: towers => {
    for (let tower in towers) {
      // let tower = Game.towers[towerId];
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
  attack: towers => {
    console.log('testin attack')
    // Are there any hostile creeps?
    const hostileCreeps = Game.spawns[Object.keys(Game.spawns)[0]].room.find(FIND_HOSTILE_CREEPS);
    if (hostileCreeps.length > 0) {
      console.log('enemy!')
      for (let id in towers) {
        // let tower = Game.towers[towerId];
        let closestHostile = towers[id].pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (closestHostile) {
          towers[id].attack(closestHostile);
        }
      }
      return true;
    } else {
      return false;
    }
  }

}
module.exports = structureTower;
