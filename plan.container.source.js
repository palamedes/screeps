/**
 * plan.containers.source.js
 *
 * Two responsibilities:
 *   1. getMinerSeat(sourceId) — calculates and caches the optimal standing
 *      tile for a miner at a given source. This is the tile closest to spawn
 *      among all walkable tiles adjacent to the source. Cached in
 *      room.memory.minerSeats[sourceId] so miners, the planner, and the
 *      spawn director all agree on the same tile regardless of whether a
 *      container exists yet.
 *
 *   2. planSourceContainers() — places a container construction site at each
 *      miner seat. One site at a time, consistent with all other planners.
 *      Waits for controller container to exist first — it feeds the warlock
 *      and is higher priority infrastructure.
 *
 * Why seat-first?
 *   The miner must stand on the container tile so harvested energy transfers
 *   directly into the container. If the planner placed containers wherever
 *   and expected the miner to follow, we'd need coordination logic. Instead,
 *   the seat is calculated once from the room layout (static geometry) and
 *   written to memory. The planner places the container there. The miner
 *   targets that tile always. They naturally converge.
 *
 * Seat calculation:
 *   - All walkable tiles within range 1 of the source
 *   - Ranked by distance to spawn (Chebyshev range — same metric Screeps uses)
 *   - Closest to spawn wins — minimizes thrall travel distance
 *   - Cached forever (terrain is static, spawn doesn't move)
 *
 * Guard conditions for planSourceContainers:
 *   - Controller container must already exist (it feeds the warlock — higher
 *     priority; build order enforced by calling order in warren.act.js)
 *   - One site placed at a time across ALL container types — we check for any
 *     existing container construction site in the room, not just source ones
 *
 * Called by: warren.act.js (when plan.buildSourceContainers is true)
 * Reads:     room structures, construction sites, terrain, room.memory.minerSeats
 * Writes:    room.memory.minerSeats, one container construction site (at most)
 */

const Utils = require('plan.utils');

/**
 * Get (or calculate and cache) the optimal miner standing tile for a source.
 *
 * Returns {x, y} of the best adjacent walkable tile, scored closest to spawn.
 * Returns null if no walkable adjacent tile exists (shouldn't happen in practice).
 *
 * @param  {string} sourceId  — Game ID of the source
 * @return {{x, y}|null}
 */
Room.prototype.getMinerSeat = function (sourceId) {
  if (!this.memory.minerSeats) {
    this.memory.minerSeats = {};
  }

  // Return cached seat if available — terrain and spawn position never change
  if (this.memory.minerSeats[sourceId]) {
    return this.memory.minerSeats[sourceId];
  }

  const source = Game.getObjectById(sourceId);
  if (!source) return null;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return null;

  // Find all walkable tiles adjacent (range 1) to the source
  const candidates = [];

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;

      const x = source.pos.x + dx;
      const y = source.pos.y + dy;

      if (Utils.isTerrainWalkable(this, x, y)) {
        candidates.push({ x, y });
      }
    }
  }

  if (!candidates.length) return null;

  // Score by Chebyshev distance to spawn — closest wins.
  // Thralls run spawn→seat→spawn every cycle so minimizing this distance
  // directly improves throughput.
  const scored = candidates.map(tile => ({
    x:     tile.x,
    y:     tile.y,
    score: spawn.pos.getRangeTo(tile.x, tile.y)  // lower = closer = better
  }));

  const sorted = _.sortBy(scored, t => t.score);
  const best   = sorted[0];

  // Cache permanently — this tile won't change
  this.memory.minerSeats[sourceId] = { x: best.x, y: best.y };

  console.log(
    `[warren:${this.name}] miner seat for source ${sourceId} ` +
    `cached at ${best.x},${best.y} (range ${best.score} from spawn)`
  );

  return this.memory.minerSeats[sourceId];
};

/**
 * Place a source container construction site at each miner seat.
 * One site at a time — waits for any existing container site to complete first.
 * Controller container must already exist before source containers are placed.
 */
Room.prototype.planSourceContainers = function () {
  if (!this.controller) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  // Controller container must exist first.
  // It feeds the warlock — higher priority, and build order is enforced
  // by calling planControllerContainer before planSourceContainers in act().
  const controllerContainer = this.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.controller, 3)
  })[0];

  if (!controllerContainer) return;

  // One container site at a time across the whole room.
  // Keeps workers focused and prevents energy drain from a build backlog.
  const existingSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_CONTAINER
  });

  if (existingSites.length > 0) return;

  const sources = this.find(FIND_SOURCES);

  for (const source of sources) {
    // Check if a container already exists at this source's seat
    const seat = this.getMinerSeat(source.id);
    if (!seat) continue;

    const existingAtSeat = this.lookForAt(LOOK_STRUCTURES, seat.x, seat.y)
      .some(s => s.structureType === STRUCTURE_CONTAINER);

    if (existingAtSeat) continue;

    // Place the site
    const result = this.createConstructionSite(seat.x, seat.y, STRUCTURE_CONTAINER);

    if (result === OK) {
      console.log(
        `[warren:${this.name}] source container site placed at ` +
        `${seat.x},${seat.y} for source ${source.id}`
      );
      return; // one site per tick — done
    }
  }
};