let structureTower = {

  // Run the tower code
  run: () => {
    let towers = structureTower.getTowers();
    if (towers.length > 0) {
      let onAlert = structureTower.attack(towers);
      if (!onAlert) {
        structureTower.heal(towers);
        structureTower.repair(towers);
      }
    }
  },

  // Get our towers
  getTowers: () => {
    return Object.values(Game.structures).filter(structure => structure.structureType === STRUCTURE_TOWER)
  },

  // Heal any damaged rats near by
  heal: towers => {
    for (let id in towers) {
      let damagedRat = towers[id].pos.findClosestByRange(FIND_MY_CREEPS, {
        filter: (rat) => rat.hits < rat.hitsMax
      });
      if (damagedRat) {
        towers[id].heal(damagedRat);
      }
    }
  },

  // Repair those things that need repairing
  repair: towers => {
    for (let id in towers) {
      let damagedStructures = towers[id].room.find(FIND_STRUCTURES, {
        filter: (structure) => {
          if (structure.structureType === STRUCTURE_ROAD) {
            return structure.hits < structure.hitsMax * 0.8; // repair roads at 80% of maximum hits
          } else if (structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART) {
            return structure.hits < structure.hitsMax * 0.0001;
          } else {
            return (structure.structureType !== STRUCTURE_CONTROLLER) &&
              structure.hits < structure.hitsMax;
          }
        }
      });
      if (damagedStructures.length > 0) {
        damagedStructures.sort((a, b) => a.hits - b.hits);
        towers[id].repair(damagedStructures[0]);
      }
    }
  },

  // Attack any hostile creeps
  attack: towers => {
    // Are there any hostile creeps?
    const hostileCreeps = towers[id].room.find(FIND_HOSTILE_CREEPS);
    if (hostileCreeps.length > 0) {
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
