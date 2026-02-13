const PlannerScoring = {

  getBuildableTiles(room, origin, radius = 8) {
    const terrain = room.getTerrain();
    const tiles = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {

        const x = origin.x + dx;
        const y = origin.y + dy;

        if (x <= 1 || x >= 48 || y <= 1 || y >= 48) continue;
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

        if (room.lookForAt(LOOK_STRUCTURES, x, y).length) continue;
        if (room.lookForAt(LOOK_CONSTRUCTION_SITES, x, y).length) continue;

        tiles.push({ x, y });
      }
    }

    return tiles;
  },

  scoreExtensionTile(room, tile, spawn) {
    let score = 0;

    // Prefer closer to spawn
    const dist = spawn.pos.getRangeTo(tile.x, tile.y);
    score += (20 - dist);

    // Prefer clustering
    const nearbyExtensions = room.lookForAtArea(
      LOOK_STRUCTURES,
      tile.y - 1, tile.x - 1,
      tile.y + 1, tile.x + 1,
      true
    ).filter(r => r.structure?.structureType === STRUCTURE_EXTENSION);

    score += nearbyExtensions.length * 5;

    return score;
  }

};

module.exports = PlannerScoring;
