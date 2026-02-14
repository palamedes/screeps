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
 *   pin(creep)               — HARD pin. Stationary creep with purpose.
 *                              Miners and Warlock Engineers call this every
 *                              tick once seated. These creeps are NEVER pushed.
 *
 *   requestMove(creep, target, opts) — moving creep declares intent.
 *                              Calculates next-step direction via cached path.
 *                              Does NOT call creep.move() — resolve() does that.
 *
 *   resolve()                — called once after all creep ticks. Auto-pins
 *                              any creep that registered no intent as a SOFT pin.
 *                              Soft-pinned creeps (idle rats with nothing to do)
 *                              can be pushed aside by moving creeps that need
 *                              their tile. Hard-pinned creeps cannot be displaced.
 *
 * Pin types:
 *   Hard pin (_pins only, not _softPins):
 *     Set by explicit pin() calls — miners seated on sources, warlock at controller.
 *     These rats have work and own their tile. Nobody routes through, nobody pushes.
 *
 *   Soft pin (_pins AND _softPins):
 *     Set automatically in resolve() for creeps that registered no intent.
 *     These rats are idle and just parked. A moving creep that needs their tile
 *     will shove them to any adjacent free tile rather than waiting.
 *
 * Path caching:
 *   Paths are stored in creep.memory._trafficPath as {x,y} arrays.
 *   Cache is invalidated when:
 *     - target changes
 *     - creep is pushed off-path
 *     - next cached step is now blocked by a structure or construction site
 *     - next cached step is HARD-pinned by a different creep
 *   Soft-pinned tiles do NOT invalidate the cache — the moving creep keeps
 *   its direct path and resolve() pushes the blocker out of the way.
 *   Roads get cost 1 vs plain cost 2 — naturally preferred once built.
 *   Pinned creep tiles get cost 20 in the CostMatrix — deters routing through
 *   occupied clusters, but cost 20 (not 0xff) keeps tiles reachable so
 *   final approach to targets adjacent to pinned creeps still works.
 *   Construction sites for blocking structures get cost 0xff — physically
 *   impassable even though they aren't structures yet.
 *
 * Push logic:
 *   When a moving creep's next step is soft-pinned (idle rat parked there),
 *   resolve() looks for any adjacent free tile and shoves the idle rat there.
 *   "Free" means: walkable terrain, not hard-pinned, not a blocking structure
 *   or site, and not a tile another creep is already moving into this tick.
 *   If no push tile exists (completely boxed in), the moving creep waits one tick.
 *   A pushed blocker is immediately removed from _softPins so a second creep
 *   doesn't try to push the same rat again in the same tick.
 *
 * Auto-pin:
 *   Any creep that ends its tick without registering a move intent is
 *   automatically soft-pinned at its current position. This makes idle creeps
 *   visible to the pathfinder (cost 20 deters routing through) while still
 *   allowing motivated creeps to displace them when necessary.
 *
 * Stuck detection and moveTo fallback:
 *   Every tick a creep registers a move intent, its position is compared to
 *   creep.memory._trafficLastPos. If unchanged for STUCK_THRESHOLD consecutive
 *   ticks, the traffic system surrenders and calls native moveTo() as an escape
 *   hatch. moveTo uses ignoreCreeps:true — it will bulldoze through any blocker
 *   rather than waiting politely. Path cache is wiped on fallback so a fresh
 *   path is calculated on the next tick once the creep is moving again.
 *   Counter resets to 0 whenever the creep successfully changes position.
 *   Memory keys: _trafficLastPos {x,y}, _trafficStuck (tick count)
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

// How many consecutive ticks without movement before triggering the moveTo fallback.
const STUCK_THRESHOLD = 3;

// How many ticks to stay in moveTo fallback mode once triggered.
// The creep gets FALLBACK_DURATION full ticks of ignoreCreeps moveTo to break free
// before traffic resumes control. 3 ticks is usually enough to clear any jam.
const FALLBACK_DURATION = 3;

const Traffic = {

  _intents:  {},  // creepName → { creep, target, range }
  _pins:     {},  // "x,y"     → creepName  (ALL pinned tiles — used for CostMatrix)
  _softPins: {},  // "x,y"     → creepName  (auto-pinned idle creeps — can be pushed)

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Clear all intents and pins. Called at the top of every tick in main.js.
   */
  reset() {
    this._intents  = {};
    this._pins     = {};
    this._softPins = {};
  },

  /**
   * Register a HARD-pinned creep. Owns its tile permanently for this tick.
   * Nobody routes through it, nobody pushes it.
   * Miners and Warlock Engineers call this every tick once seated.
   *
   * Hard pin = in _pins, NOT in _softPins.
   */
  pin(creep) {
    const key = `${creep.pos.x},${creep.pos.y}`;
    this._pins[key] = creep.name;
    // Deliberately NOT adding to _softPins — this rat cannot be displaced.
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
   *   0. Auto soft-pin any creep that registered no intent this tick
   *   1. Skip creeps already in range of their target
   *   2. Calculate next-step direction for each intent (cached paths)
   *   3. Detect and execute mutual swaps
   *   4. Execute uncontested moves; push soft-pinned blockers when needed
   *   5. Skip hard-pinned or unresolvable destinations (creep waits one tick)
   */
  resolve() {

    // Step 0: Auto soft-pin idle creeps.
    // Any creep that didn't register a move intent this tick is parked.
    // Register as a SOFT pin — idle rats can be pushed by motivated movers.
    // The _pins entry (cost 20 in CostMatrix) still makes other creeps prefer
    // to route around them; the _softPins entry marks them as displaceable.
    for (const name in Game.creeps) {
      if (!this._intents[name]) {
        const creep = Game.creeps[name];
        const key = `${creep.pos.x},${creep.pos.y}`;
        this._pins[key]     = creep.name;
        this._softPins[key] = creep.name;
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

    // Step 3: Detect mutual swaps and execute them first.
    // A wants B's tile and B wants A's tile — clean swap, both move.
    const swapped = new Set();

    for (const [nameA, moveA] of Object.entries(moves)) {
      if (swapped.has(nameA)) continue;

      for (const [nameB, moveB] of Object.entries(moves)) {
        if (nameA === nameB)    continue;
        if (swapped.has(nameB)) continue;

        if (moveA.toKey === moveB.fromKey && moveB.toKey === moveA.fromKey) {
          moveA.creep.move(moveA.dir);
          moveB.creep.move(moveB.dir);
          swapped.add(nameA);
          swapped.add(nameB);
          break;
        }
      }
    }

    // Step 4 & 5: Group remaining moves by destination, then resolve.
    //
    // For each destination tile:
    //   - Hard-pinned: skip entirely (miner/warlock owns this tile).
    //   - Soft-pinned: try to push the idle blocker to a free adjacent tile,
    //     then let the moving creep through. If no push tile exists, skip.
    //   - Uncontested: move freely.
    //   - Contested: first registrant wins (future: weight by role priority).
    const destinations = {};  // toKey → [creepName, ...]

    for (const [name, move] of Object.entries(moves)) {
      if (swapped.has(name)) continue;
      if (!destinations[move.toKey]) destinations[move.toKey] = [];
      destinations[move.toKey].push(name);
    }

    for (const [toKey, names] of Object.entries(destinations)) {

      // Hard-pinned tile — miner or warlock owns this. Nobody gets in.
      // Hard pin = in _pins but NOT in _softPins.
      if (this._pins[toKey] && !this._softPins[toKey]) continue;

      // Determine the one mover we'll try to execute (first registrant).
      const moverName = names[0];
      const mover     = moves[moverName];

      // Soft-pinned tile — idle rat is parked here. Try to shove it aside.
      if (this._softPins[toKey]) {
        const blockerName = this._softPins[toKey];
        const blocker     = Game.creeps[blockerName];

        if (!blocker) {
          // Blocker died this tick — proceed normally.
          mover.creep.move(mover.dir);
          continue;
        }

        const pushDir = this._getPushDir(blocker, destinations);

        if (pushDir !== null) {
          // Push the idle rat to a free adjacent tile, then advance.
          blocker.move(pushDir);
          mover.creep.move(mover.dir);

          // Remove from softPins so a second contender doesn't also try
          // to push this same rat in the same tick (move() can only fire once).
          delete this._softPins[toKey];
        }
        // If pushDir is null the blocker has nowhere to go — moving creep
        // waits one tick. This should be rare (completely boxed in blocker).
        continue;
      }

      if (names.length === 1) {
        // Uncontested — move freely
        mover.creep.move(mover.dir);
      } else {
        // Contested — first registrant wins the tile.
        // Losers yield sideways rather than waiting in place.
        //
        // Without yielding, a losing creep drops its move, recalculates the
        // same road path next tick, contests the same tile again, and waits
        // again indefinitely — producing a permanent single-file queue.
        //
        // Yielding steps the loser to any adjacent free tile, getting it out
        // of the road corridor so the creep behind it can advance. Path cache
        // is wiped so the loser recalculates a fresh route from the yield tile.
        mover.creep.move(mover.dir);

        for (let i = 1; i < names.length; i++) {
          const loser    = moves[names[i]].creep;
          const yieldDir = this._getYieldDir(loser, destinations);
          if (yieldDir !== null) {
            loser.move(yieldDir);
            loser.memory._trafficPath = null; // recalculate from yield position
          }
          // No yield tile available — creep waits one tick (rare, boxed in)
        }
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
   *   - next cached step is blocked by a structure or construction site
   *   - next cached step is HARD-pinned by a different creep
   *
   * Soft-pinned tiles do NOT trigger cache invalidation — the moving creep
   * keeps its direct path and resolve() will push the blocker aside.
   * Routing around a soft pin (via cost 20 detour) is wasteful when we can
   * simply displace the idle rat and take the straight line.
   *
   * Pinned creep tiles are written into the CostMatrix at cost 20 so the
   * pathfinder routes around occupied clusters proactively, but still allows
   * paths through them when no good detour exists.
   *
   * Construction sites for blocking structures are written at cost 0xff —
   * physically impassable even though they aren't structures yet.
   */
  _getNextDir(creep, target, range) {
    const targetPos = target.pos || target;
    const targetKey = `${targetPos.x},${targetPos.y},${range}`;

    // --- Phase 1: Active fallback ---
    // If _trafficFallback > 0 we are mid-rescue. Keep using moveTo until the
    // countdown expires, then hand back to normal traffic control.
    // The creep gets FALLBACK_DURATION full ticks to bulldoze clear of whatever
    // jammed it before we go back to being polite about other creeps.
    if (creep.memory._trafficFallback > 0) {
      creep.memory._trafficFallback--;
      creep.moveTo(targetPos.x, targetPos.y, {
        ignoreCreeps: true,
        reusePath:    5,
        visualizePathStyle: { stroke: '#ff4444', opacity: 0.4 }
      });
      return null; // resolve() must not double-move this creep
    }

    // --- Phase 2: Stuck detection ---
    // Compare current position to last tick. If unchanged for STUCK_THRESHOLD
    // consecutive ticks, traffic's own resolution has failed — trigger fallback.
    const lastPos = creep.memory._trafficLastPos;
    if (lastPos && lastPos.x === creep.pos.x && lastPos.y === creep.pos.y) {
      creep.memory._trafficStuck = (creep.memory._trafficStuck || 0) + 1;
    } else {
      // Moved successfully — reset both counters
      creep.memory._trafficStuck   = 0;
      creep.memory._trafficLastPos = { x: creep.pos.x, y: creep.pos.y };
    }

    if (creep.memory._trafficStuck >= STUCK_THRESHOLD) {
      // Wipe path cache so we recalculate fresh when fallback ends
      creep.memory._trafficPath    = null;
      creep.memory._trafficStuck   = 0;
      creep.memory._trafficFallback = FALLBACK_DURATION;
      console.log(`[traffic] ${creep.name} stuck — entering moveTo fallback for ${FALLBACK_DURATION} ticks`);
      // Use moveTo this tick too — don't waste the trigger tick waiting
      creep.moveTo(targetPos.x, targetPos.y, {
        ignoreCreeps: true,
        reusePath:    5,
        visualizePathStyle: { stroke: '#ff4444', opacity: 0.4 }
      });
      return null;
    }

    // Update last pos for next tick's comparison
    creep.memory._trafficLastPos = { x: creep.pos.x, y: creep.pos.y };

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

    // Invalidate if the next cached step is now blocked.
    // Structure/site blocks are always hard invalidations.
    // Pin invalidation is ONLY for hard pins — soft-pinned creeps (idle rats)
    // will be pushed out of the way by resolve(), so the path stays valid.
    if (creep.memory._trafficPath && creep.memory._trafficPath.length) {
      const next    = creep.memory._trafficPath[0];
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

      // Only hard pins force a reroute. Soft-pinned tiles used to be exempt —
      // the idea was resolve() would push the idle rat aside. But that creates
      // a worse problem: the path was calculated routing AROUND the soft-pinned
      // creep. When that creep gets pushed away, the cached path still detours
      // around where it used to be, leading creeps on a bad route for many ticks.
      // Recalculating when a soft pin is in the way gives a fresh direct path.
      const pinnedByOther =
        this._pins[nextKey] &&
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

      // Capture pins and current intent positions at path-calculation time.
      // Pins: idle creeps that are physically stationary this tick.
      // Intents: creeps already registered to move somewhere this tick.
      // Including intent positions at moderate cost creates natural path diversity —
      // a creep that ticks later sees existing traffic and routes slightly
      // differently, preventing all creeps from piling onto the exact same tiles.
      const pins    = Object.assign({}, this._pins);
      const intents = Object.assign({}, this._intents);

      const result = PathFinder.search(
        creep.pos,
        { pos: new RoomPosition(targetPos.x, targetPos.y, creep.room.name), range },
        {
          plainCost: 2,
          swampCost: 5,   // 10 is technically correct for fatigue ratios but causes
                          // all creeps to pile into the same narrow plain detour.
                          // 5 still prefers plains but tolerates a swamp tile rather
                          // than routing everyone down the same corridor.
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

            // All pinned creep tiles (hard and soft): cost 20.
            // Pathfinder prefers to route around occupied clusters.
            // Cost 20 vs plain 2 = up to 10-tile detour to avoid one pinned creep.
            // Cost 20 (not 0xff) keeps adjacent tiles reachable for final approach.
            for (const key of Object.keys(pins)) {
              const [x, y] = key.split(',').map(Number);
              if (costs.get(x, y) < 20) {
                costs.set(x, y, 20);
              }
            }

            // Creeps that already registered move intents this tick are
            // physically present on their current tiles. Adding their positions
            // at moderate cost (10) creates path diversity — creeps that tick
            // later see existing traffic and naturally route slightly differently
            // rather than all computing the exact same path and piling up.
            // Cost 10 is noticeable but not so high it causes wild detours.
            for (const intentName of Object.keys(intents)) {
              const ic = Game.creeps[intentName];
              if (!ic) continue;
              const cur = costs.get(ic.pos.x, ic.pos.y);
              if (cur < 10) costs.set(ic.pos.x, ic.pos.y, 10);
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
   * Find a yield direction for a moving creep that lost a contested tile.
   *
   * Prefers tiles that are:
   *   1. Not the contested destination (don't step into the same fight)
   *   2. Not hard-pinned
   *   3. Not a blocking structure or site
   *   4. Not already claimed by another mover this tick
   *   5. Walkable terrain
   *
   * Prefers perpendicular directions first — stepping sideways off a road
   * is more useful than stepping backward toward where you came from.
   *
   * @param  {Creep}  creep        — the creep that needs to yield
   * @param  {object} destinations — current tick destination map { toKey: [names] }
   * @return {number|null}         — direction constant or null if boxed in
   */
  _getYieldDir(creep, destinations) {
    const terrain = creep.room.getTerrain();

    // All 8 directions — perpendicular/diagonal first, backward last.
    // Stepping sideways off a road corridor is the most useful yield move.
    const dirs = [TOP_RIGHT, BOTTOM_RIGHT, BOTTOM_LEFT, TOP_LEFT, TOP, RIGHT, BOTTOM, LEFT];
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

    for (const dir of dirs) {
      const { dx, dy } = offsets[dir];
      const nx = creep.pos.x + dx;
      const ny = creep.pos.y + dy;

      if (nx <= 0 || nx >= 49 || ny <= 0 || ny >= 49) continue;
      if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

      const tileKey = `${nx},${ny}`;

      // Don't yield into a hard-pinned tile
      if (this._pins[tileKey] && !this._softPins[tileKey]) continue;

      // Don't yield into a tile someone else is moving into this tick
      if (destinations[tileKey]) continue;

      // Don't yield into a blocking structure or site
      const structures = creep.room.lookForAt(LOOK_STRUCTURES, nx, ny);
      if (structures.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      )) continue;

      const sites = creep.room.lookForAt(LOOK_CONSTRUCTION_SITES, nx, ny);
      if (sites.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      )) continue;

      return dir;
    }

    return null;
  },

  /**
   *
   * A valid push tile must be:
   *   1. Within room bounds
   *   2. Walkable terrain (not a wall)
   *   3. Not hard-pinned (not a miner/warlock tile)
   *   4. Not a blocking structure or construction site
   *   5. Not already the destination of another moving creep this tick
   *      (avoids two creeps trying to occupy the same tile after the push)
   *
   * Prefers cardinal directions (TOP/RIGHT/BOTTOM/LEFT) over diagonals
   * to minimize the chance of pushing a rat into a corner.
   *
   * Returns a direction constant, or null if the blocker is boxed in.
   *
   * @param {Creep}  blocker      — the idle rat to be pushed
   * @param {object} destinations — current tick's destination map { toKey: [names] }
   */
  _getPushDir(blocker, destinations) {
    const terrain = blocker.room.getTerrain();

    // Cardinals first — diagonals as fallback.
    // Pushing into a cardinal direction keeps the rat on open ground more often.
    const dirs = [TOP, RIGHT, BOTTOM, LEFT, TOP_RIGHT, BOTTOM_RIGHT, BOTTOM_LEFT, TOP_LEFT];
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

    for (const dir of dirs) {
      const { dx, dy } = offsets[dir];
      const nx = blocker.pos.x + dx;
      const ny = blocker.pos.y + dy;

      // Bounds check
      if (nx <= 0 || nx >= 49 || ny <= 0 || ny >= 49) continue;

      // Terrain must be walkable
      if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

      const tileKey = `${nx},${ny}`;

      // Don't push into a hard-pinned tile (miner or warlock owns it).
      // Soft-pinned tiles are OK — we'd just displace one idle rat with another,
      // which is harmless (the displaced rat will re-evaluate next tick).
      if (this._pins[tileKey] && !this._softPins[tileKey]) continue;

      // Don't push into a tile another creep is moving into this tick.
      // Avoids the pushed rat colliding with an incoming mover.
      if (destinations[tileKey]) continue;

      // Don't push into a blocking structure
      const structures = blocker.room.lookForAt(LOOK_STRUCTURES, nx, ny);
      const structureBlocked = structures.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      );
      if (structureBlocked) continue;

      // Don't push into a blocking construction site
      const sites = blocker.room.lookForAt(LOOK_CONSTRUCTION_SITES, nx, ny);
      const siteBlocked = sites.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      );
      if (siteBlocked) continue;

      return dir;
    }

    // Blocker is completely surrounded — moving creep waits one tick.
    return null;
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

// Expose as global so Traffic._pins, Traffic._intents, Traffic._softPins etc.
// are inspectable from the Screeps console without needing require().
global.Traffic = Traffic;

module.exports = Traffic;