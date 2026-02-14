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
 * Guard conditions (all must pass or planner returns immediately):
 *   - Spawn and controller must exist
 *   - Energy ratio >= 0.7 (same guard as extensions — don't build during recovery)
 *   - No road construction site already exists (one site at a time)
 *
 * Uses Utils.getPath() for cached room.findPath results. Path cache lives in
 * room.memory._plannerPaths and persists indefinitely (terrain is static).
 *
 * Called by: warren.act.js (when plan.buildRoads is true)
 * Reads:     room structures, construction sites, cached paths
 * Writes:    one road construction site (at most)
 */

const Utils = require('plan.utils');

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
      from: spawn.pos,
      to:   source.pos,
      key:  `road_spawn_source_${i}`
    })),
    {
      from: spawn.pos,
      to:   controller.pos,
      key:  'road_spawn_controller'
    }
  ];

  for (const { from, to, key } of pathTargets) {
    const path = Utils.getPath(this, from, to, key);
    if (!path || !path.length) continue;

    for (const step of path) {
      // Don't place a road on the spawn tile itself — spawn is a structure,
      // createConstructionSite will fail silently and waste the call.
      if (step.x === spawn.pos.x && step.y === spawn.pos.y) continue;

      // Skip if a road already exists here — path is partially built
      const structures = this.lookForAt(LOOK_STRUCTURES, step.x, step.y);
      if (structures.some(s => s.structureType === STRUCTURE_ROAD)) continue;

      // Skip if a road site already exists here — shouldn't happen given the
      // guard above, but belt-and-suspenders for multi-path iteration
      const sites = this.lookForAt(LOOK_CONSTRUCTION_SITES, step.x, step.y);
      if (sites.some(s => s.structureType === STRUCTURE_ROAD)) continue;

      // Attempt placement. createConstructionSite returns an error code if the
      // tile is occupied by a blocking structure — in that case try the next step.
      const result = this.createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
      if (result === OK) {
        console.log(`[warren:${this.name}] road site placed at ${step.x},${step.y} (path: ${key})`);
        return; // one site per tick — done
      }
    }
  }
};