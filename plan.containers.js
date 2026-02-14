/**
 * plan.containers.js
 *
 * Places a container adjacent to the room controller.
 * This container is the Warlock Engineer's energy supply — the hauler fills it,
 * the engineer drains it, and upgrade throughput becomes continuous.
 *
 * Placement rules:
 *   - Only one controller container is ever placed
 *   - Tile must be walkable and buildable
 *   - Prefer the tile closest to the spawn (minimizes hauler detour)
 *   - Does nothing if the container or its construction site already exists
 *
 * Called by: warren.act.js (when plan.buildControllerContainer is true)
 * Reads:     room structures, construction sites, terrain
 * Writes:    one construction site (at most)
 */

const Utils = require('plan.utils');

Room.prototype.planControllerContainer = function () {
  if (!this.controller) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  // Already have a container adjacent to the controller — nothing to do
  const existing = this.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.controller, 3)
  });

  if (existing.length > 0) return;

  // Already have a construction site for one — wait for it to complete
  const sites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.controller, 3)
  });

  if (sites.length > 0) return;

  // Find all walkable tiles adjacent to the controller
  // Use range 1 — engineer must be able to stand on it and reach the controller
  const candidates = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;

      const x = this.controller.pos.x + dx;
      const y = this.controller.pos.y + dy;

      if (Utils.isBuildable(this, x, y)) {
        candidates.push({ x, y });
      }
    }
  }

  if (!candidates.length) return;

  // Prefer the tile closest to the spawn — minimizes hauler travel distance
  const scored = candidates.map(tile => ({
    x:     tile.x,
    y:     tile.y,
    score: -spawn.pos.getRangeTo(tile.x, tile.y)
  }));

  const sorted = _.sortBy(scored, t => t.score);

  for (const tile of sorted) {
    if (this.createConstructionSite(tile.x, tile.y, STRUCTURE_CONTAINER) === OK) {
      console.log(`[warren:${this.name}] controller container site placed at ${tile.x},${tile.y}`);
      break;
    }
  }
};