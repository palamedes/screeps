
const Utils = require('planner.utils');

const PlannerScoring = {

  scoreExtensionTile(room, tile, spawn) {
    let score = 0;

    // Prefer closer to spawn
    const dist = spawn.pos.getRangeTo(tile.x, tile.y);
    score += (20 - dist);

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

    score += nearbyExtensions * 5;

    return score;
  }

};

module.exports = PlannerScoring;
