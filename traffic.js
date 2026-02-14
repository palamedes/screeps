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
 *   resolve()                — called once after all creep ticks. Detects
 *                              swaps, resolves conflicts, executes moves.
 *
 * Path caching:
 *   Paths are stored in creep.memory._trafficPath as {x,y} arrays.
 *   Cache is invalidated when target changes or creep is pushed off-path.
 *   Roads get cost 1 vs plain cost 2 — naturally preferred once built.
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
   *   1. Skip creeps already in range of their target
   *   2. Calculate next-step direction for each intent (cached paths)
   *   3. Detect and execute mutual swaps
   *   4. Execute uncontested moves
   *   5. Skip contested or pinned destinations (creep waits one tick)
   */
  resolve() {

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
   * Recalculates when target changes or creep is pushed off-path.
   */
  _getNextDir(creep, target, range) {
    const targetPos = target.pos || target;
    const targetKey = `${targetPos.x},${targetPos.y},${range}`;

    // Invalidate cache if target changed
    if (creep.memory._trafficTarget !== targetKey) {
      creep.memory._trafficTarget = targetKey;
      creep.memory._trafficPath   = null;
    }

    // Invalidate if first cached step is no longer adjacent (got pushed off-path)
    const cached = creep.memory._trafficPath;
    if (cached && cached.length) {
      const next = cached[0];
      if (Math.abs(next.x - creep.pos.x) > 1 || Math.abs(next.y - creep.pos.y) > 1) {
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

            room.find(FIND_STRUCTURES).forEach(s => {
              if (s.structureType === STRUCTURE_ROAD) {
                // Roads are cheap — pathfinder naturally prefers them
                costs.set(s.pos.x, s.pos.y, 1);
              } else if (
                s.structureType !== STRUCTURE_CONTAINER &&
                s.structureType !== STRUCTURE_RAMPART
              ) {
                // Block all other structures
                costs.set(s.pos.x, s.pos.y, 0xff);
              }
            });

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

module.exports = Traffic;