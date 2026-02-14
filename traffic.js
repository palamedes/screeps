/**
 * traffic.js
 *
 * Movement coordination layer for the Skaven horde.
 * Replaces direct moveTo calls — all creep movement is registered here
 * and resolved once per tick after all creep logic has run.
 *
 * Why this exists:
 *   Direct moveTo with ignoreCreeps causes oscillation — the pathfinder
 *   routes through occupied tiles, the creep physically can't get there,
 *   stuck detection fires a random move, and the creep starts pinging.
 *   This layer resolves conflicts before any movement happens so creeps
 *   only move when they have a clear path.
 *
 * Core concepts:
 *   pin(creep)               — stationary creep locks its tile. Nobody
 *                              routes through it. Miners and Warlock Engineers
 *                              call this every tick once seated.
 *
 *   requestMove(creep, target, opts) — moving creep declares intent.
 *                              Calculates next-step direction via cached path.
 *                              Does NOT call creep.move() — resolve() does that.
 *
 *   resolve()                — called once after all creep ticks. Auto-pins
 *                              any creep that registered no intent (idle creeps
 *                              are invisible blockers without this). Detects
 *                              swaps, resolves conflicts, executes moves.
 *
 * Path caching:
 *   Paths are stored in creep.memory._trafficPath as {x,y} arrays.
 *   Cache is invalidated when:
 *     - target changes
 *     - creep is pushed off-path
 *     - next cached step is now blocked by a structure or construction site
 *   Roads get cost 1 vs plain cost 2 — naturally preferred once built.
 *   Pinned creep tiles get cost 20 in the CostMatrix — strong enough signal
 *   that the pathfinder routes around occupied clusters rather than threading
 *   through them. Cost 20 (not 0xff) keeps adjacent tiles reachable for
 *   final approach to a target that is itself adjacent to a pinned creep.
 *   Construction sites for blocking structures get cost 0xff — they are
 *   physically impassable even though they aren't structures yet, and the
 *   pathfinder must treat them as walls or it will plan routes through them
 *   that creep.move() will silently fail to execute every tick.
 *
 * Auto-pin:
 *   Any creep that ends its tick without registering a move intent is
 *   automatically pinned at its current position. This makes idle creeps
 *   (haulers waiting for energy, workers with no job) visible to the
 *   pathfinder so other creeps route around them naturally.
 *
 * Future hooks (not yet implemented):
 *   - Priority weighting by role for contested tiles
 *   - Convoy logic for haulers in corridors
 *   - Inter-room pathing awareness
 *   - Road preference scoring fed from plan.roads.js
 *
 * Called from: main.js (reset before ticks, resolve after)
 * Registered by: all rat files (pin or requestMove)
 */

const Traffic = {

  _intents: {},  // creepName → { creep, target, range }
  _pins:    {},  // "x,y"     → creepName

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Clear all intents and pins. Called at the top of every tick in main.js.
   */
  reset() {
    this._intents = {};
    this._pins    = {};
  },

  /**
   * Register a stationary creep. Pins its current tile so other creeps
   * don't route through it or contest it.
   * Miners and Warlock Engineers call this every tick once seated.
   */
  pin(creep) {
    const key = `${creep.pos.x},${creep.pos.y}`;
    this._pins[key] = creep.name;
  },

  /**
   * Register a move intent. Called instead of creep.moveTo().
   * Does NOT move the creep — resolve() does that after all ticks.
   *
   * @param {Creep}  creep   — the creep that wants to move
   * @param {object} target  — game object, RoomPosition, or {x, y}
   * @param {object} opts    — optional: { range: number }
   */
  requestMove(creep, target, opts = {}) {
    this._intents[creep.name] = {
      creep,
      target,
      range: opts.range || 1
    };
  },

  /**
   * Execute all registered moves.
   * Called once per tick in main.js after all creep ticks complete.
   *
   * Resolution order:
   *   0. Auto-pin any creep that registered no intent this tick
   *   1. Skip creeps already in range of their target
   *   2. Calculate next-step direction for each intent (cached paths)
   *   3. Detect and execute mutual swaps
   *   4. Execute uncontested moves
   *   5. Skip contested or pinned destinations (creep waits one tick)
   */
  resolve() {

    // Step 0: Auto-pin idle creeps.
    // Any creep that didn't register a move intent this tick is stationary.
    // Pin it so the pathfinder treats its tile as occupied — otherwise idle
    // creeps are invisible blockers that other creeps' paths route straight
    // through, causing physical deadlocks every time they meet.
    for (const name in Game.creeps) {
      if (!this._intents[name]) {
        this.pin(Game.creeps[name]);
      }
    }

    // Step 1 & 2: Calculate next-step direction for each intent
    const moves = {};  // creepName → { creep, dir, fromKey, toKey }

    for (const [name, intent] of Object.entries(this._intents)) {
      const { creep, target, range } = intent;

      // Already in range — no move needed
      const targetPos = target.pos || target;
      if (creep.pos.inRangeTo(targetPos.x, targetPos.y, range)) continue;

      const dir = this._getNextDir(creep, target, range);
      if (!dir) continue;

      const nextPos = this._posInDir(creep.pos, dir);
      if (!nextPos) continue;

      moves[name] = {
        creep,
        dir,
        fromKey: `${creep.pos.x},${creep.pos.y}`,
        toKey:   `${nextPos.x},${nextPos.y}`
      };
    }

    // Step 3: Detect mutual swaps and execute them first
    const swapped = new Set();

    for (const [nameA, moveA] of Object.entries(moves)) {
      if (swapped.has(nameA)) continue;

      for (const [nameB, moveB] of Object.entries(moves)) {
        if (nameA === nameB)    continue;
        if (swapped.has(nameB)) continue;

        // A wants B's tile and B wants A's tile — clean swap
        if (moveA.toKey === moveB.fromKey && moveB.toKey === moveA.fromKey) {
          moveA.creep.move(moveA.dir);
          moveB.creep.move(moveB.dir);
          swapped.add(nameA);
          swapped.add(nameB);
          break;
        }
      }
    }

    // Step 4 & 5: Group remaining moves by destination, execute uncontested
    const destinations = {};  // toKey → [creepName, ...]

    for (const [name, move] of Object.entries(moves)) {
      if (swapped.has(name)) continue;
      if (!destinations[move.toKey]) destinations[move.toKey] = [];
      destinations[move.toKey].push(name);
    }

    for (const [toKey, names] of Object.entries(destinations)) {

      // Skip pinned tiles — stationary creep owns this tile
      if (this._pins[toKey]) continue;

      if (names.length === 1) {
        // Uncontested — move freely
        moves[names[0]].creep.move(moves[names[0]].dir);
      } else {
        // Contested — first registrant wins for now.
        // Future: weight by role priority (hauler > worker > slave)
        moves[names[0]].creep.move(moves[names[0]].dir);
      }
    }
  },

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Get the next direction toward target using a cached path.
   * Recalculates when:
   *   - target changes
   *   - creep is pushed off-path
   *   - next cached step is now blocked by a structure or construction site
   *
   * Pinned creep tiles are written into the CostMatrix at cost 20 so the
   * pathfinder routes around occupied clusters proactively.
   *
   * Construction sites for blocking structures are written at cost 0xff —
   * they are physically impassable even though they aren't structures yet.
   * Without this, the pathfinder plans routes through them that creep.move()
   * silently fails to execute, freezing the creep indefinitely.
   */
  _getNextDir(creep, target, range) {
    const targetPos = target.pos || target;
    const targetKey = `${targetPos.x},${targetPos.y},${range}`;

    // Invalidate cache if target changed
    if (creep.memory._trafficTarget !== targetKey) {
      creep.memory._trafficTarget = targetKey;
      creep.memory._trafficPath   = null;
    }

    // Invalidate if first cached step no longer adjacent (pushed off-path)
    const cached = creep.memory._trafficPath;
    if (cached && cached.length) {
      const next = cached[0];
      if (Math.abs(next.x - creep.pos.x) > 1 || Math.abs(next.y - creep.pos.y) > 1) {
        creep.memory._trafficPath = null;
      }
    }

    // Invalidate if the next cached step is now blocked by a structure,
    // construction site, or a pinned creep that wasn't there when the path
    // was calculated.
    //
    // The pinned-creep check is critical for the "convoy" case: two creeps
    // follow the same cached path to the same target. The leading creep
    // reaches range and pins. The trailing creep's next step is now the
    // pinned tile — resolve() will block the move every tick and the creep
    // freezes. Invalidating here forces a fresh path that routes around the
    // now-occupied tile.
    if (creep.memory._trafficPath && creep.memory._trafficPath.length) {
      const next = creep.memory._trafficPath[0];
      const nextKey = `${next.x},${next.y}`;

      const structures = creep.room.lookForAt(LOOK_STRUCTURES, next.x, next.y);
      const sites      = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, next.x, next.y);

      const structureBlocked = structures.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      );

      const siteBlocked = sites.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      );

      // Pinned by a different creep — recalculate so we route around them
      const pinnedByOther = this._pins[nextKey] &&
        this._pins[nextKey] !== creep.name;

      if (structureBlocked || siteBlocked || pinnedByOther) {
        creep.memory._trafficPath = null;
      }
    }

    // Advance path if we've already reached the next step
    if (creep.memory._trafficPath && creep.memory._trafficPath.length) {
      const next = creep.memory._trafficPath[0];
      if (creep.pos.x === next.x && creep.pos.y === next.y) {
        creep.memory._trafficPath.shift();
      }
    }

    // Recalculate if no valid cached path
    if (!creep.memory._trafficPath || !creep.memory._trafficPath.length) {

      // Capture pins at path-calculation time so the closure sees current state.
      // This is the key to proactive routing — the pathfinder knows where
      // every idle creep is sitting before it plans a route around them.
      const pins = Object.assign({}, this._pins);

      const result = PathFinder.search(
        creep.pos,
        { pos: new RoomPosition(targetPos.x, targetPos.y, creep.room.name), range },
        {
          plainCost: 2,
          swampCost: 10,
          roomCallback(roomName) {
            const room = Game.rooms[roomName];
            if (!room) return;

            const costs = new PathFinder.CostMatrix();

            // Structures: roads cheap, blocking structures impassable
            room.find(FIND_STRUCTURES).forEach(s => {
              if (s.structureType === STRUCTURE_ROAD) {
                // Roads are cheap — pathfinder naturally prefers them once built
                costs.set(s.pos.x, s.pos.y, 1);
              } else if (
                s.structureType !== STRUCTURE_CONTAINER &&
                s.structureType !== STRUCTURE_RAMPART
              ) {
                costs.set(s.pos.x, s.pos.y, 0xff);
              }
            });

            // Construction sites for blocking structures are impassable.
            // creep.move() silently fails when trying to step onto these tiles,
            // so the pathfinder must treat them as walls to avoid planning
            // routes that can never execute.
            room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
              if (
                site.structureType !== STRUCTURE_ROAD &&
                site.structureType !== STRUCTURE_CONTAINER &&
                site.structureType !== STRUCTURE_RAMPART
              ) {
                costs.set(site.pos.x, site.pos.y, 0xff);
              }
            });

            // Pinned creep tiles: strongly discourage routing through occupied
            // positions. Cost 20 makes even a single pinned tile expensive enough
            // that the pathfinder prefers a detour. Cost 20 vs plain cost 2 means
            // the pathfinder will take up to a 10-tile detour to avoid one pinned
            // creep — enough to break up dense clusters near spawn without making
            // final approach to adjacent targets impossible.
            for (const key of Object.keys(pins)) {
              const [x, y] = key.split(',').map(Number);
              if (costs.get(x, y) < 20) {
                costs.set(x, y, 20);
              }
            }

            return costs;
          }
        }
      );

      if (result.incomplete || !result.path.length) return null;

      creep.memory._trafficPath = result.path.map(p => ({ x: p.x, y: p.y }));
    }

    if (!creep.memory._trafficPath || !creep.memory._trafficPath.length) return null;

    return this._dirTo(creep.pos, creep.memory._trafficPath[0]);
  },

  /**
   * Convert two adjacent positions into a Screeps direction constant.
   */
  _dirTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (dx ===  0 && dy === -1) return TOP;
    if (dx ===  1 && dy === -1) return TOP_RIGHT;
    if (dx ===  1 && dy ===  0) return RIGHT;
    if (dx ===  1 && dy ===  1) return BOTTOM_RIGHT;
    if (dx ===  0 && dy ===  1) return BOTTOM;
    if (dx === -1 && dy ===  1) return BOTTOM_LEFT;
    if (dx === -1 && dy ===  0) return LEFT;
    if (dx === -1 && dy === -1) return TOP_LEFT;

    return null;
  },

  /**
   * Get the {x, y} position one step in a direction from pos.
   */
  _posInDir(pos, dir) {
    const offsets = {
      [TOP]:          { dx:  0, dy: -1 },
      [TOP_RIGHT]:    { dx:  1, dy: -1 },
      [RIGHT]:        { dx:  1, dy:  0 },
      [BOTTOM_RIGHT]: { dx:  1, dy:  1 },
      [BOTTOM]:       { dx:  0, dy:  1 },
      [BOTTOM_LEFT]:  { dx: -1, dy:  1 },
      [LEFT]:         { dx: -1, dy:  0 },
      [TOP_LEFT]:     { dx: -1, dy: -1 }
    };

    const offset = offsets[dir];
    if (!offset) return null;

    return {
      x: pos.x + offset.dx,
      y: pos.y + offset.dy
    };
  }

};

// Expose as global so Traffic._pins, Traffic._intents etc. are inspectable
// from the Screeps console without needing require().
global.Traffic = Traffic;

module.exports = Traffic;