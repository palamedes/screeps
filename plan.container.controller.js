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
 *   - Prefer the tile closest to the spawn (minimizes hauler travel distance)
 *   - The warlock will stand ON this tile to upgrade — it must be within
 *     range 1 of the controller so the warlock can also reach upgradeController
 *     (range 3 from controller is satisfied by any adjacent tile)
 *   - Does nothing if the container or its construction site already exists
 *
 * NOTE: If the container is already placed in the wrong location, destroy it
 * manually in-game — this planner will then re-place it correctly next tick.
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

  // Find all walkable tiles adjacent (range 1) to the controller.
  // Range 1 means the warlock can stand on this tile, withdraw from the
  // container, AND reach upgradeController (which requires range 3) —
  // all from the same position, eliminating travel between refuel and upgrade.
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

  // Prefer the tile CLOSEST to spawn — minimizes hauler travel distance.
  // Score is positive distance, sorted ascending so nearest comes first.
  // (Previous version used negative score + ascending sort = farthest first. Bug.)
  const scored = candidates.map(tile => ({
    x:     tile.x,
    y:     tile.y,
    score: spawn.pos.getRangeTo(tile.x, tile.y)   // lower = closer = better
  }));

  const sorted = _.sortBy(scored, t => t.score);  // ascending: closest first

  for (const tile of sorted) {
    if (this.createConstructionSite(tile.x, tile.y, STRUCTURE_CONTAINER) === OK) {
      console.log(`[warren:${this.name}] controller container site placed at ${tile.x},${tile.y}`);
      break;
    }
  }
};