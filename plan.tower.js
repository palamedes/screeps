/**
 * plan.tower.js
 *
 * Places a tower construction site near the spawn.
 * One tower per warren, unlocked at RCL3. A single well-fed tower will
 * shred most raiders before they reach the spawn.
 *
 * Placement strategy:
 *   - Range 2-5 from spawn (close enough for fast thrall refueling)
 *   - Not adjacent to spawn (preserve immediate neighbors for extensions)
 *   - Prefer range 3-4 — close but not crowding the spawn ring
 *
 * Energy guard: 0.7 — don't build during economic recovery.
 *
 * Called by: warren.act.js (when plan.buildTower is true)
 * Reads:     room structures, construction sites, terrain
 * Writes:    one tower construction site (at most)
 */

const Utils = require('plan.utils');

Room.prototype.planTower = function () {
  if (!this.controller) return;

  const maxTowers =
    CONTROLLER_STRUCTURES[STRUCTURE_TOWER][this.controller.level] || 0;
  if (maxTowers === 0) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const existing = this.find(FIND_MY_STRUCTURES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  });

  const sites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_TOWER
  });

  if (existing.length + sites.length >= maxTowers) return;
  if (sites.length > 0) return;

  // Energy guard — don't starve clanrats to build tower infrastructure
  const energyRatio = this.energyAvailable / this.energyCapacityAvailable;
  if (energyRatio < 0.7) return;

  const candidates = Utils.getBuildableTiles(this, spawn.pos, 6);
  if (!candidates.length) return;

  const scored = candidates.map(tile => {
    const dist = spawn.pos.getRangeTo(tile.x, tile.y);

    // Hard reject: adjacent to spawn — keep extension ring clear
    if (dist < 2) return { x: tile.x, y: tile.y, score: -Infinity };

    // Prefer range 3-4 — close for thrall refueling, not crowding spawn
    const score = dist <= 4
      ? (10 - dist)           // sweet spot: range 3 = 7, range 4 = 6
      : Math.max(0, 8 - dist); // still ok but decreasing value beyond range 4

    return { x: tile.x, y: tile.y, score };
  });

  const sorted = _.sortBy(scored, t => -t.score);

  for (const tile of sorted) {
    if (tile.score === -Infinity) continue;
    if (this.createConstructionSite(tile.x, tile.y, STRUCTURE_TOWER) === OK) {
      console.log(`[warren:${this.name}] tower site placed at ${tile.x},${tile.y}`);
      return;
    }
  }
};