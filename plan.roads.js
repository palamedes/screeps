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
 *   - Energy ratio >= 0.7 (same guard as extensions — don't build during recovery)
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

  // Only build roads when we have economic surplus.
  // Roads are infrastructure investment — don't starve the horde to build them.
  const energyRatio = this.energyAvailable / this.energyCapacityAvailable;
  if (energyRatio < 0.7) return;

  // One site at a time. Wait for the current road to be built before placing
  // the next. Keeps workers focused and prevents energy drain from a backlog.
  const existingSites = this.find(FIND_MY_CONSTRUCTION_SITES, {
    filter: s => s.structureType === STRUCTURE_ROAD
  });
  if (existingSites.length > 0) return;

  const sources    = this.find(FIND_SOURCES);
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