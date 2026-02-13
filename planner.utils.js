
const PlannerUtils = {

  /**
   * Iterate over all tiles within a radius of an origin.
   */
  forEachInRadius(origin, radius, callback) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        callback(x, y, dx, dy);
      }
    }
  },

  /**
   * Returns true if tile is within room bounds (safe build zone).
   */
  inBounds(x, y) {
    return x > 0 && x < 49 && y > 0 && y < 49;
  },

  /**
   * Returns true if tile terrain is not a wall.
   */
  isTerrainWalkable(room, x, y) {
    if (!this.inBounds(x, y)) return false;
    const terrain = room.getTerrain();
    return terrain.get(x, y) !== TERRAIN_MASK_WALL;
  },

  /**
   * Returns true if tile is buildable.
   * Allows roads + containers to coexist.
   */
  isBuildable(room, x, y) {
    if (!this.isTerrainWalkable(room, x, y)) return false;

    const structures = room.lookForAt(LOOK_STRUCTURES, x, y);

    for (const s of structures) {
      if (
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      ) {
        return false;
      }
    }

    const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y);
    if (sites.length) return false;

    return true;
  },

  /**
   * Chebyshev range (Screeps standard range).
   */
  range(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  },

  /**
   * Manhattan distance (sometimes useful for scoring).
   */
  manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  },

  /**
   * Count adjacent tiles matching a structure type.
   */
  countAdjacent(room, x, y, structureType) {
    let count = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const structures = room.lookForAt(
          LOOK_STRUCTURES,
          x + dx,
          y + dy
        );

        if (structures.some(s => s.structureType === structureType)) {
          count++;
        }
      }
    }

    return count;
  },

  /**
   * Returns list of buildable tiles within radius.
   */
  getBuildableTiles(room, origin, radius) {
    const tiles = [];

    this.forEachInRadius(origin, radius, (x, y) => {
      if (!this.isBuildable(room, x, y)) return;
      tiles.push({ x, y });
    });

    return tiles;
  },

  /**
   * Cached path finder.
   * Stores in room.memory._plannerPaths
   */
  getPath(room, from, to, key) {
    if (!room.memory._plannerPaths) {
      room.memory._plannerPaths = {};
    }

    if (room.memory._plannerPaths[key]) {
      return room.memory._plannerPaths[key];
    }

    const path = room.findPath(from, to, {
      ignoreCreeps: true
    });

    room.memory._plannerPaths[key] = path;

    return path;
  }

};

module.exports = PlannerUtils;
