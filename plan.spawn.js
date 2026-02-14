/**
 * plan.spawn.js
 *
 * Automatically selects and places the spawn construction site on first boot.
 *
 * This planner fires exactly once per room — when the room is owned but has
 * no spawn and no spawn construction site. After the site is placed it never
 * runs again. After the spawn is built it never runs again.
 *
 * This is the first step toward full automation: you pick a room, the code
 * decides where everything goes. Your only manual act is "I claim this room."
 *
 * Scoring factors (all normalized, higher = better):
 *
 *   Source proximity    (weight: 40)
 *     Minimize combined walking distance to all sources.
 *     Haulers run spawn→source→spawn every cycle — this is the highest-
 *     frequency path in the warren. Shaving tiles here compounds over time.
 *
 *   Controller proximity (weight: 20)
 *     Minimize distance to controller.
 *     Warlock and workers travel here constantly. Less critical than sources
 *     because they eventually sit still, but still meaningful early on.
 *
 *   Open space (weight: 30)
 *     Count buildable tiles within radius 4.
 *     A spawn boxed in by terrain has nowhere to put extensions. We need
 *     room to grow — a spawn in open terrain unlocks better extension layouts.
 *
 *   Edge distance (weight: 10)
 *     Prefer tiles away from room edges (range 8+).
 *     Edge spawns are exposed to exit harassment and have asymmetric extension
 *     space. Center-biased spawns are more defensible and expandable.
 *
 * Guard conditions (all must pass or planner returns immediately):
 *   - Room controller must exist and be owned by us
 *   - No spawn already exists
 *   - No spawn construction site already exists
 *   - Room must have vision (we can see it)
 *
 * Called by: warren.act.js (when plan.buildSpawn is true)
 * Reads:     room terrain, sources, controller position
 * Writes:    one spawn construction site (at most, ever)
 */

const Utils = require('plan.utils');

// Scoring weights — must sum to 100 for easy reasoning about contributions
const WEIGHT_SOURCES     = 40;
const WEIGHT_CONTROLLER  = 20;
const WEIGHT_OPEN_SPACE  = 30;
const WEIGHT_EDGE_DIST   = 10;

// How far from spawn to count open tiles for extension space scoring
const OPEN_SPACE_RADIUS  = 4;

// Minimum distance from room edge to be considered (edges are x/y < 8 or > 41)
const EDGE_SAFE_DISTANCE = 8;

// Search radius from room center — no need to consider the entire room
const SEARCH_RADIUS      = 20;

Room.prototype.planSpawn = function () {

  // --- Guard conditions ---
  if (!this.controller || !this.controller.my) return;

  const existingSpawns = this.find(FIND_MY_SPAWNS);
  if (existingSpawns.length > 0) return;

  const existingSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_SPAWN
  });
  if (existingSites.length > 0) return;

  console.log(`[warren:${this.name}] no spawn found — scoring tiles for spawn placement`);

  const sources    = this.find(FIND_SOURCES);
  const controller = this.controller;

  // Search from room center outward
  const center = { x: 25, y: 25 };
  const candidates = Utils.getBuildableTiles(this, center, SEARCH_RADIUS);

  if (!candidates.length) {
    console.log(`[warren:${this.name}] no buildable tiles found for spawn — room may be too walled in`);
    return;
  }

  // --- Score each candidate ---
  const scored = candidates.map(tile => {
    const score = this._scoreSpawnTile(tile, sources, controller);
    return { x: tile.x, y: tile.y, score };
  });

  const sorted = _.sortBy(scored, t => -t.score);
  const best   = sorted[0];

  if (!best || best.score === -Infinity) {
    console.log(`[warren:${this.name}] no valid spawn tile found`);
    return;
  }

  const result = this.createConstructionSite(best.x, best.y, STRUCTURE_SPAWN);

  if (result === OK) {
    console.log(`[warren:${this.name}] spawn site placed at ${best.x},${best.y} (score: ${best.score.toFixed(1)})`);
  } else {
    console.log(`[warren:${this.name}] spawn site placement failed at ${best.x},${best.y} (code: ${result})`);
  }
};

/**
 * Score a single tile for spawn placement.
 * Returns -Infinity for tiles that should never be chosen.
 * Returns a higher number for better tiles.
 *
 * All sub-scores are normalized to 0–100 range before weighting.
 */
Room.prototype._scoreSpawnTile = function (tile, sources, controller) {

  // Hard reject: too close to room edge
  // Spawn needs accessible tiles on all sides for extensions and traffic
  if (
    tile.x < EDGE_SAFE_DISTANCE ||
    tile.x > 49 - EDGE_SAFE_DISTANCE ||
    tile.y < EDGE_SAFE_DISTANCE ||
    tile.y > 49 - EDGE_SAFE_DISTANCE
  ) {
    return -Infinity;
  }

  // Hard reject: any wall adjacent to the spawn
  // A spawn directly adjacent to a wall loses an extension slot permanently
  const terrain = this.getTerrain();
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (terrain.get(tile.x + dx, tile.y + dy) === TERRAIN_MASK_WALL) {
        return -Infinity;
      }
    }
  }

  // --- Source proximity score ---
  // Sum of distances to all sources. Closer = better.
  // Normalize: assume max reasonable distance is 40 tiles per source.
  const totalSourceDist = sources.reduce((sum, source) => {
    return sum + Math.abs(tile.x - source.pos.x) + Math.abs(tile.y - source.pos.y);
  }, 0);
  const maxSourceDist   = sources.length * 40;
  const sourceScore     = Math.max(0, 100 - (totalSourceDist / maxSourceDist * 100));

  // --- Controller proximity score ---
  // Closer = better. Normalize: assume max reasonable distance is 45 tiles.
  const controllerDist  = Math.abs(tile.x - controller.pos.x) +
    Math.abs(tile.y - controller.pos.y);
  const controllerScore = Math.max(0, 100 - (controllerDist / 45 * 100));

  // --- Open space score ---
  // Count buildable tiles within OPEN_SPACE_RADIUS. More = better.
  // A spawn in open terrain has more room to place extensions.
  // Max possible open tiles in a radius-4 square = (2*4+1)^2 - 1 = 80
  const openTiles      = Utils.getBuildableTiles(this, tile, OPEN_SPACE_RADIUS);
  const openSpaceScore = Math.min(100, (openTiles.length / 80) * 100);

  // --- Edge distance score ---
  // Distance from nearest edge. Further = better. Normalize to 0-100.
  const edgeDist      = Math.min(tile.x, tile.y, 49 - tile.x, 49 - tile.y);
  const edgeScore     = Math.min(100, (edgeDist / 25) * 100);

  // --- Weighted total ---
  return (
    (sourceScore     * WEIGHT_SOURCES    / 100) +
    (controllerScore * WEIGHT_CONTROLLER / 100) +
    (openSpaceScore  * WEIGHT_OPEN_SPACE / 100) +
    (edgeScore       * WEIGHT_EDGE_DIST  / 100)
  );
};