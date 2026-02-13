const Utils = require('planner.utils');

const PlannerScoring = {

  scoreExtensionTile(room, tile, spawn) {
    let score = 0;

    const dist = spawn.pos.getRangeTo(tile.x, tile.y);

    // Never block spawn adjacency
    if (dist <= 1) {
      return -Infinity;
    }

    // Prefer relatively close, but not suffocating
    score += (10 - dist);

    // Prefer clustering
    const area = room.lookForAtArea(
      LOOK_STRUCTURES,
      tile.y - 1,
      tile.x - 1,
      tile.y + 1,
      tile.x + 1,
      true
    );

    let nearbyExtensions = 0;

    for (let i = 0; i < area.length; i++) {
      const result = area[i];

      if (
        result.structure &&
        result.structure.structureType === STRUCTURE_EXTENSION
      ) {
        nearbyExtensions++;
      }
    }

    score += nearbyExtensions * 4;

    return score;
  }

};

module.exports = PlannerScoring;
