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
 *                              tick once seated. These creeps are NEVER pushed
 *                              (except by miners — see role priority below).
 *
 *   requestMove(creep, target, opts) — moving creep declares intent.
 *                              Calculates next-step direction via cached path.
 *                              Does NOT call creep.move() — resolve() does that.
 *
 *   resolve()                — called once after all creep ticks. Auto-pins
 *                              any creep that registered no intent as a SOFT pin.
 *                              Soft-pinned creeps (idle rats with nothing to do)
 *                              can be pushed aside by moving creeps that need
 *                              their tile. Hard-pinned creeps cannot be displaced
 *                              except by miners trying to reach their source seat.
 *
 * Pin types:
 *   Hard pin (_pins only, not _softPins):
 *     Set by explicit pin() calls — miners seated on sources, warlock at controller.
 *     These rats have work and own their tile. Nobody routes through, nobody pushes —
 *     EXCEPT: a miner moving toward its source seat can displace any non-miner
 *     hard-pinned creep. This ensures miners always reach their harvest positions.
 *
 *   Soft pin (_pins AND _softPins):
 *     Set automatically in resolve() for creeps that registered no intent.
 *     These rats are idle and just parked. A moving creep that needs their tile
 *     will shove them to any adjacent free tile rather than waiting.
 *
 * Role priority:
 *   When multiple creeps contest the same destination tile, the higher-priority
 *   role wins the tile and lower-priority creeps yield sideways.
 *
 *     miner:   100  — must reach source to keep income flowing
 *     warlock:  80  — stationary upgrader; don't bump it once seated
 *     clanrat:  50  — builder/upgrader
 *     thrall:   30  — hauler
 *     slave:    10  — bootstrap generalist
 *
 * Graduated stuck recovery:
 *   The stuck counter (_trafficStuck) accumulates every tick the creep doesn't
 *   move and fatigue is zero. It ONLY resets on actual position change.
 *   Triggering a recovery tier does NOT reset the counter — if moveTo also
 *   fails, the counter keeps climbing to the next threshold automatically.
 *
 *   Tick  3+: moveTo fallback — ignoreCreeps bulldoze attempt (FALLBACK_DURATION ticks)
 *   Tick  9+: random nudge   — pick any open adjacent tile to break the deadlock
 *   Tick 18+: suicide        — irrecoverably stuck; spawn director queues replacement
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
 * Called from: main.js (reset before ticks, resolve after)
 * Registered by: all rat files (pin or requestMove)
 */

// Graduated stuck recovery thresholds (ticks without movement, fatigue = 0).
// Counter accumulates continuously — triggering a tier does NOT reset it.
// Only actual position change resets the counter.
const STUCK_FALLBACK = 3;   // → moveTo ignoreCreeps bulldoze
const STUCK_NUDGE    = 9;   // → random-direction nudge to break deadlock
const STUCK_SUICIDE  = 18;  // → suicide; spawn director queues a fresh replacement

// How many ticks to stay in moveTo fallback mode per trigger.
const FALLBACK_DURATION = 3;

// Role priority for contested tile resolution.
// Higher number = wins the tile when multiple creeps want the same destination.
// Miners are highest — a stuck miner kills income for the whole room.
// Losers yield sideways rather than queueing indefinitely.
const ROLE_PRIORITY = {
  miner:   100,
  warlock:  80,
  clanrat:  50,
  thrall:   30,
  slave:    10
};

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
   * Nobody routes through it, nobody pushes it — EXCEPT miners displacing
   * non-miners to reach their source seat (see resolve()).
   * Miners and Warlock Engineers call this every tick once seated.
   *
   * Hard pin = in _pins, NOT in _softPins.
   */
  pin(creep) {
    const key = `${creep.pos.x},${creep.pos.y}`;
    this._pins[key] = creep.name;
    // Deliberately NOT adding to _softPins — this rat cannot be displaced
    // (except by miners — handled explicitly in resolve()).
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
      range: opts.range !== undefined ? opts.range : 1,
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
   *   4. Group by destination; sort by role priority; resolve conflicts
   *   5. Miner override: miners can displace non-miners from hard-pinned tiles
   *   6. Soft-pin push: displace idle rats blocking a mover's path
   *   7. Yield losers sideways to prevent permanent queueing
   */
  resolve() {

    // Step 0: Auto soft-pin idle creeps.
    for (const name in Game.creeps) {
      if (!this._intents[name]) {
        const creep = Game.creeps[name];
        const key = `${creep.pos.x},${creep.pos.y}`;
        this._pins[key]     = creep.name;
        this._softPins[key] = creep.name;
      }
    }

    // Step 1 & 2: Calculate next-step direction for each intent.
    const moves = {};  // creepName → { creep, dir, fromKey, toKey }

    for (const [name, intent] of Object.entries(this._intents)) {
      const { creep, target, range } = intent;

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

    // Step 3: Mutual swaps first — A wants B's tile, B wants A's tile.
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

    // Step 4–7: Group by destination and resolve.
    const destinations = {};

    for (const [name, move] of Object.entries(moves)) {
      if (swapped.has(name)) continue;
      if (!destinations[move.toKey]) destinations[move.toKey] = [];
      destinations[move.toKey].push(name);
    }

    for (const [toKey, names] of Object.entries(destinations)) {

      // Sort contestants by role priority — highest wins the tile.
      names.sort((a, b) => {
        const roleA = moves[a].creep.memory.role;
        const roleB = moves[b].creep.memory.role;
        return (ROLE_PRIORITY[roleB] || 0) - (ROLE_PRIORITY[roleA] || 0);
      });

      const moverName = names[0];
      const mover     = moves[moverName];
      const moverRole = mover.creep.memory.role;

      // --- Miner hard-pin override ---
      // Miners can displace any non-miner that has hard-pinned their seat tile.
      if (this._pins[toKey] && !this._softPins[toKey]) {
        if (moverRole === 'miner') {
          const pinnedName  = this._pins[toKey];
          const pinnedCreep = Game.creeps[pinnedName];
          if (pinnedCreep && pinnedCreep.memory.role !== 'miner') {
            const pushDir = this._getPushDir(pinnedCreep, destinations);
            if (pushDir !== null) {
              pinnedCreep.move(pushDir);
              pinnedCreep.memory._trafficPath = null;
              mover.creep.move(mover.dir);
              console.log(
                `[traffic] miner ${mover.creep.name} displaced ` +
                `${pinnedCreep.memory.role} ${pinnedName} from ${toKey}`
              );
            }
          }
          // Two miners respect each other's hard pins.
        }
        // All other roles respect hard pins unconditionally.
        continue;
      }

      // --- Soft-pin push: idle rat parked on the destination ---
      if (this._softPins[toKey]) {
        const blockerName = this._softPins[toKey];
        const blocker     = Game.creeps[blockerName];

        if (!blocker) {
          mover.creep.move(mover.dir);
          continue;
        }

        const pushDir = this._getPushDir(blocker, destinations);
        if (pushDir !== null) {
          blocker.move(pushDir);
          mover.creep.move(mover.dir);
          delete this._softPins[toKey];
        }

        // Yield losers regardless of push success.
        for (let i = 1; i < names.length; i++) {
          const loser    = moves[names[i]].creep;
          const yieldDir = this._getYieldDir(loser, destinations);
          if (yieldDir !== null) {
            loser.move(yieldDir);
            loser.memory._trafficPath = null;
          }
        }
        continue;
      }

      // --- Uncontested or role-priority-won move ---
      mover.creep.move(mover.dir);

      // Yield all losers sideways.
      for (let i = 1; i < names.length; i++) {
        const loser    = moves[names[i]].creep;
        const yieldDir = this._getYieldDir(loser, destinations);
        if (yieldDir !== null) {
          loser.move(yieldDir);
          loser.memory._trafficPath = null;
        }
      }
    }
  },

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Get the next direction toward target using a cached path.
   *
   * Graduated stuck recovery — counter accumulates, only resets on movement.
   * Triggering a tier does NOT reset the counter.
   *
   *   >= STUCK_FALLBACK (3):  moveTo ignoreCreeps for FALLBACK_DURATION ticks
   *   >= STUCK_NUDGE    (9):  random open-tile nudge to break the deadlock
   *   >= STUCK_SUICIDE  (18): suicide — spawn director queues a replacement
   */
  _getNextDir(creep, target, range) {
    const targetPos = target.pos || target;
    const targetKey = `${targetPos.x},${targetPos.y},${range}`;

    // --- Stuck detection ---
    // Accumulate when stationary and not fatigued.
    // Reset ONLY on successful position change.
    const lastPos = creep.memory._trafficLastPos;
    if (lastPos && lastPos.x === creep.pos.x && lastPos.y === creep.pos.y) {
      if (creep.fatigue === 0) {
        creep.memory._trafficStuck = (creep.memory._trafficStuck || 0) + 1;
      }
    } else {
      creep.memory._trafficStuck    = 0;
      creep.memory._trafficFallback = 0;
      creep.memory._trafficLastPos  = { x: creep.pos.x, y: creep.pos.y };
    }

    creep.memory._trafficLastPos = { x: creep.pos.x, y: creep.pos.y };

    const stuck = creep.memory._trafficStuck || 0;

    // --- Tier 3: Suicide (18+ ticks) ---
    if (stuck >= STUCK_SUICIDE) {
      console.log(
        `[traffic] ${creep.name} (${creep.memory.role}) stuck ${stuck} ticks — suiciding`
      );
      creep.suicide();
      return null;
    }

    // --- Tier 2: Random nudge (9+ ticks) ---
    if (stuck >= STUCK_NUDGE) {
      const nudgeDir = this._getNudgeDir(creep);
      if (nudgeDir !== null) {
        console.log(
          `[traffic] ${creep.name} (${creep.memory.role}) stuck ${stuck} ticks — nudging`
        );
        creep.memory._trafficPath = null;
        creep.move(nudgeDir);
      }
      return null; // resolve() must not double-move
    }

    // --- Tier 1: moveTo fallback (3+ ticks) ---
    // Start a new fallback window each time stuck threshold is crossed
    // (every FALLBACK_DURATION ticks as long as stuck counter keeps climbing).
    if (stuck >= STUCK_FALLBACK && (creep.memory._trafficFallback || 0) <= 0) {
      creep.memory._trafficFallback = FALLBACK_DURATION;
      creep.memory._trafficPath     = null;
      console.log(
        `[traffic] ${creep.name} (${creep.memory.role}) stuck ${stuck} ticks — moveTo fallback`
      );
    }

    if ((creep.memory._trafficFallback || 0) > 0) {
      creep.memory._trafficFallback--;
      creep.moveTo(targetPos.x, targetPos.y, {
        ignoreCreeps: true,
        reusePath:    5,
        visualizePathStyle: { stroke: '#ff4444', opacity: 0.4 }
      });
      return null; // resolve() must not double-move
    }

    // --- Normal path following ---

    // Invalidate cache if target changed.
    if (creep.memory._trafficTarget !== targetKey) {
      creep.memory._trafficTarget = targetKey;
      creep.memory._trafficPath   = null;
    }

    // Invalidate if pushed off-path (first step no longer adjacent).
    const cached = creep.memory._trafficPath;
    if (cached && cached.length) {
      const next = cached[0];
      if (Math.abs(next.x - creep.pos.x) > 1 || Math.abs(next.y - creep.pos.y) > 1) {
        creep.memory._trafficPath = null;
      }
    }

    // Invalidate if next cached step is now blocked.
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

      const pinnedByOther =
        this._pins[nextKey] &&
        this._pins[nextKey] !== creep.name;

      if (structureBlocked || siteBlocked || pinnedByOther) {
        creep.memory._trafficPath = null;
      }
    }

    // Advance path if already on next step.
    if (creep.memory._trafficPath && creep.memory._trafficPath.length) {
      const next = creep.memory._trafficPath[0];
      if (creep.pos.x === next.x && creep.pos.y === next.y) {
        creep.memory._trafficPath.shift();
      }
    }

    // Recalculate path if needed.
    if (!creep.memory._trafficPath || !creep.memory._trafficPath.length) {

      const pins    = Object.assign({}, this._pins);
      const intents = Object.assign({}, this._intents);

      const activeMoves    = creep.body.filter(p => p.type === MOVE  && p.hits > 0).length;
      const activeNonMoves = creep.body.filter(p => p.type !== MOVE  && p.hits > 0).length;
      const swampCost      = activeMoves > 0 && activeNonMoves > 0
        ? Math.max(2, Math.ceil((activeNonMoves * 10) / (activeMoves * 2)))
        : 5;

      const result = PathFinder.search(
        creep.pos,
        { pos: new RoomPosition(targetPos.x, targetPos.y, creep.room.name), range },
        {
          plainCost: 2,
          swampCost,

          roomCallback(roomName) {
            const room = Game.rooms[roomName];
            if (!room) return;

            const costs = new PathFinder.CostMatrix();

            room.find(FIND_STRUCTURES).forEach(s => {
              if (s.structureType === STRUCTURE_ROAD) {
                costs.set(s.pos.x, s.pos.y, 1);
              } else if (
                s.structureType !== STRUCTURE_CONTAINER &&
                s.structureType !== STRUCTURE_RAMPART
              ) {
                costs.set(s.pos.x, s.pos.y, 0xff);
              }
            });

            room.find(FIND_MY_CONSTRUCTION_SITES).forEach(site => {
              if (
                site.structureType !== STRUCTURE_ROAD &&
                site.structureType !== STRUCTURE_CONTAINER &&
                site.structureType !== STRUCTURE_RAMPART
              ) {
                costs.set(site.pos.x, site.pos.y, 0xff);
              }
            });

            for (const key of Object.keys(pins)) {
              const [x, y] = key.split(',').map(Number);
              if (costs.get(x, y) < 20) costs.set(x, y, 20);
            }

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
   * Pick a random open adjacent direction to nudge a stuck creep.
   * Used at STUCK_NUDGE threshold to physically break a deadlock.
   * Direction order is shuffled so repeated nudges don't always go the same way.
   *
   * @param  {Creep} creep
   * @return {number|null} direction constant or null if completely boxed in
   */
  _getNudgeDir(creep) {
    const terrain = creep.room.getTerrain();
    const allDirs = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];

    // Fisher-Yates shuffle for true randomness
    for (let i = allDirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allDirs[i], allDirs[j]] = [allDirs[j], allDirs[i]];
    }

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

    for (const dir of allDirs) {
      const { dx, dy } = offsets[dir];
      const nx = creep.pos.x + dx;
      const ny = creep.pos.y + dy;

      if (nx <= 0 || nx >= 49 || ny <= 0 || ny >= 49) continue;
      if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

      const tileKey = `${nx},${ny}`;

      // Don't nudge into a hard-pinned tile
      if (this._pins[tileKey] && !this._softPins[tileKey]) continue;

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

    return null; // completely boxed in — suicide fires at tick 18
  },

  /**
   * Find a yield direction for a moving creep that lost a contested tile.
   * Prefers perpendicular directions — stepping sideways off a road corridor
   * is more useful than stepping backward.
   *
   * @param  {Creep}  creep
   * @param  {object} destinations
   * @return {number|null}
   */
  _getYieldDir(creep, destinations) {
    const terrain = creep.room.getTerrain();
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

      if (this._pins[tileKey] && !this._softPins[tileKey]) continue;
      if (destinations[tileKey]) continue;

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
   * Find a push direction for a soft-pinned (idle) creep being displaced.
   * Prefers cardinal directions to minimise corner-pushing.
   *
   * @param {Creep}  blocker
   * @param {object} destinations
   * @return {number|null}
   */
  _getPushDir(blocker, destinations) {
    const terrain = blocker.room.getTerrain();
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

      if (nx <= 0 || nx >= 49 || ny <= 0 || ny >= 49) continue;
      if (terrain.get(nx, ny) === TERRAIN_MASK_WALL) continue;

      const tileKey = `${nx},${ny}`;

      if (this._pins[tileKey] && !this._softPins[tileKey]) continue;
      if (destinations[tileKey]) continue;

      const structures = blocker.room.lookForAt(LOOK_STRUCTURES, nx, ny);
      if (structures.some(s =>
        s.structureType !== STRUCTURE_ROAD &&
        s.structureType !== STRUCTURE_CONTAINER &&
        s.structureType !== STRUCTURE_RAMPART
      )) continue;

      const sites = blocker.room.lookForAt(LOOK_CONSTRUCTION_SITES, nx, ny);
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