/**
 * plan.roads.js
 *
 * Places road construction sites along high-traffic paths.
 * One site per call, in strict priority order, same discipline as extensions.
 *
 * Path priority (highest ROI first):
 *   1. spawn → each source   (haulers run this every cycle — highest traffic)
 *   2. spawn → controller    (warlock walks once, workers periodically)
 *
 * Roads complete in priority order — spawn→source paths finish before the
 * controller road starts. Hauler throughput improves before warlock travel.
 *
 * CRITICAL INFRASTRUCTURE FIX:
 *   Spawn→source roads use a LOWER energy threshold (0.5 vs 0.7) because
 *   hauler paths are critical to energy flow. If these roads decay completely
 *   during energy crashes, the planner must rebuild them even during recovery.
 *   Without hauler roads, recovery takes much longer.
 *
 * IMPORTANT — path calculation matches traffic.js exactly:
 *   Roads must be placed on the tiles creeps actually walk, not just the
 *   geometrically shortest path. This planner uses PathFinder.search with
 *   the same CostMatrix rules as traffic.js (structures, construction sites)
 *   so the road path and the creep path are guaranteed to be the same.
 *   Pin costs are excluded — those change every tick and would produce an
 *   inconsistent cached path. Structures and sites are sufficient to get the
 *   same routing decisions as traffic makes during normal operation.
 *
 * Guard conditions (all must pass or planner returns immediately):
 *   - Spawn and controller must exist
 *   - Energy ratio >= 0.5 (for spawn→source) or 0.7 (for spawn→controller)
 *   - No road construction site already exists (one site at a time)
 *
 * Paths are cached in room.memory._roadPaths after first calculation.
 * Terrain is static so cached paths are valid indefinitely.
 * Stored separately from _plannerPaths (used by plan.utils.js) to avoid
 * collisions with other planners that use a different pathfinding method.
 *
 * Called by: warren.act.js (when plan.buildRoads is true)
 * Reads:     room structures, construction sites, cached paths
 * Writes:    one road construction site (at most)
 */

Room.prototype.planRoads = function () {
  if (!this.controller) return;

  const spawn = this.find(FIND_MY_SPAWNS)[0];
  if (!spawn) return;

  const sources = this.find(FIND_SOURCES);

  // Check if we're missing any spawn→source roads (critical infrastructure)
  const missingCriticalRoads = this._checkMissingSpawnSourceRoads(spawn, sources);

  // Only build roads when we have economic surplus.
  // HOWEVER: spawn→source roads are CRITICAL (hauler paths) so use lower threshold.
  // Without hauler roads, energy recovery takes much longer.
  const energyRatio = this.energyAvailable / this.energyCapacityAvailable;
  const threshold = missingCriticalRoads ? 0.5 : 0.7;

  if (energyRatio < threshold) return;

  // One site at a time. Wait for the current road to be built before placing
  // the next. Keeps workers focused and prevents energy drain from a backlog.
  const existingSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_ROAD
  });
  if (existingSites.length > 0) return;

  const controller = this.controller;

  // Priority-ordered list of paths to road.
  // Sources first — haulers use these every cycle.
  // Controller last — warlock walks once and pins; workers come occasionally.
  const pathTargets = [
    ...sources.map((source, i) => ({
      from:  spawn.pos,
      to:    source.pos,
      range: 1,
      key:   `road_spawn_source_${i}`
    })),
    {
      from:  spawn.pos,
      to:    controller.pos,
      range: 3,   // warlock sits at range 3 — road only needs to reach range 3
      key:   'road_spawn_controller'
    }
  ];

  if (!this.memory._roadPaths) {
    this.memory._roadPaths = {};
  }

  for (const { from, to, range, key } of pathTargets) {

    // Use cached path if available — terrain doesn't change
    if (!this.memory._roadPaths[key]) {
      this.memory._roadPaths[key] = this._calcRoadPath(from, to, range);
    }

    const path = this.memory._roadPaths[key];
    if (!path || !path.length) continue;

    for (const step of path) {
      // Skip spawn tile — it's a structure, createConstructionSite fails silently
      if (step.x === spawn.pos.x && step.y === spawn.pos.y) continue;

      // Skip if road already exists here
      const structures = this.lookForAt(LOOK_STRUCTURES, step.x, step.y);
      if (structures.some(s => s.structureType === STRUCTURE_ROAD)) continue;

      // Skip if road site already exists here
      const sites = this.lookForAt(LOOK_CONSTRUCTION_SITES, step.x, step.y);
      if (sites.some(s => s.structureType === STRUCTURE_ROAD)) continue;

      const result = this.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      if (result === OK) {
        console.log(`[warren:${this.name}] road site at ${step.x},${step.y} (${key})`);
        return; // one site per tick — done
      }
    }
  }
};

/**
 * Check if any spawn→source road tiles are missing.
 * Used to determine if we should use the lower energy threshold.
 *
 * @param  {StructureSpawn} spawn
 * @param  {Array<Source>}  sources
 * @return {boolean}        true if any spawn→source road tiles are missing
 */
Room.prototype._checkMissingSpawnSourceRoads = function (spawn, sources) {
  if (!this.memory._roadPaths) return false;

  for (let i = 0; i < sources.length; i++) {
    const key = `road_spawn_source_${i}`;
    const path = this.memory._roadPaths[key];
    if (!path || !path.length) continue;

    // Check if any tile in this path is missing a road
    for (const step of path) {
      // Skip spawn tile
      if (step.x === spawn.pos.x && step.y === spawn.pos.y) continue;

      const structures = this.lookForAt(LOOK_STRUCTURES, step.x, step.y);
      const hasRoad = structures.some(s => s.structureType === STRUCTURE_ROAD);

      if (!hasRoad) {
        return true;  // Found a missing road tile on a critical path
      }
    }
  }

  return false;  // All spawn→source roads intact
};

/**
 * Calculate a road path using PathFinder.search with the same CostMatrix
 * rules as traffic.js. This guarantees roads land on tiles creeps actually
 * walk rather than tiles a different algorithm happens to prefer.
 *
 * Pin costs are intentionally excluded — they change every tick and would
 * make the cached path unstable. Structure and site costs are sufficient
 * to match traffic routing in all normal cases.
 *
 * @param  {RoomPosition} from
 * @param  {RoomPosition} to
 * @param  {number}       range  stop this many tiles from target
 * @return {Array}        array of {x, y} steps, or empty array on failure
 */
Room.prototype._calcRoadPath = function (from, to, range) {
  const room = this;

  const result = PathFinder.search(
    from,
    { pos: new RoomPosition(to.x, to.y, this.name), range },
    {
      plainCost: 2,
      swampCost: 5,
      roomCallback(roomName) {
        const r = Game.rooms[roomName];
        if (!r) return;

        const costs = new PathFinder.CostMatrix();

        // Mirror traffic.js CostMatrix exactly (minus pin costs)
        r.find(FIND_STRUCTURES).forEach(s => {
          if (s.structureType === STRUCTURE_ROAD) {
            costs.set(s.pos.x, s.pos.y, 1);
          } else if (
            s.structureType !== STRUCTURE_CONTAINER &&
            s.structureType !== STRUCTURE_RAMPART
          ) {
            costs.set(s.pos.x, s.pos.y, 0xff);
          }
        });

        r.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
          if (
            site.structureType !== STRUCTURE_ROAD &&
            site.structureType !== STRUCTURE_CONTAINER &&
            site.structureType !== STRUCTURE_RAMPART
          ) {
            costs.set(site.pos.x, site.pos.y, 0xff);
          }
        });

        return costs;
      }
    }
  );

  if (result.incomplete || !result.path.length) {
    console.log(`[warren:${room.name}] road path calculation failed (incomplete: ${result.incomplete})`);
    return [];
  }

  return result.path.map(p => ({ x: p.x, y: p.y }));
};