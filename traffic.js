/**
 * traffic.js
 *
 * Movement coordination layer for the Skaven horde.
 *
 * KEY FIXES vs previous version:
 *
 *   1. STUCK THRESHOLDS RAISED significantly.
 *      Old: fallback@3, nudge@9, suicide@18 — far too aggressive.
 *      New: fallback@5, nudge@25, suicide@50 — gives creeps room to breathe.
 *      An unlucky collision no longer kills a miner.
 *
 *   2. PATH TTL ADDED.
 *      Paths now expire after 50 ticks. Previously a path cached before an
 *      extension was built would route through that extension forever until
 *      the very-next-step check caught it. Now stale paths get recalculated.
 *
 *   3. SOFT-PIN COST REDUCED (20 → 8).
 *      Idle creeps were making large clusters of extensions/creeps look nearly
 *      impassable. Cost 8 still deters routing through idle clusters but
 *      doesn't force absurd detours around a few parked clanrats.
 *
 *   4. HARD-PIN COST stays at 20.
 *      Miners and warlocks genuinely own their tile and shouldn't be
 *      routed through.
 */

const STUCK_FALLBACK = 5;   // → moveTo ignoreCreeps bulldoze
const STUCK_NUDGE    = 25;  // → random-direction nudge
const STUCK_SUICIDE  = 50;  // → suicide; spawn director queues replacement

const FALLBACK_DURATION = 4;

// How many ticks before a cached path is considered stale and recalculated.
// Terrain is static but structures/sites change as the room grows.
const PATH_TTL = 50;

const ROLE_PRIORITY = {
  miner:   100,
  warlock:  80,
  clanrat:  50,
  thrall:   30,
  slave:    10
};

const Traffic = {

  _intents:  {},
  _pins:     {},
  _softPins: {},

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  reset() {
    this._intents  = {};
    this._pins     = {};
    this._softPins = {};
  },

  pin(creep) {
    const key = `${creep.pos.x},${creep.pos.y}`;
    this._pins[key] = creep.name;
    // Deliberately NOT adding to _softPins — hard-pinned creeps can't be displaced
    // (except by miners — see resolve()).
  },

  requestMove(creep, target, opts = {}) {
    this._intents[creep.name] = {
      creep,
      target,
      range: opts.range !== undefined ? opts.range : 1,
    };
  },

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
    const moves = {};

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

    // Step 3: Mutual swaps.
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

      names.sort((a, b) => {
        const roleA = moves[a].creep.memory.role;
        const roleB = moves[b].creep.memory.role;
        return (ROLE_PRIORITY[roleB] || 0) - (ROLE_PRIORITY[roleA] || 0);
      });

      const moverName = names[0];
      const mover     = moves[moverName];
      const moverRole = mover.creep.memory.role;

      // --- Miner hard-pin override ---
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
        }
        continue;
      }

      // --- Soft-pin push ---
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

  _getNextDir(creep, target, range) {
    const targetPos = target.pos || target;
    const targetKey = `${targetPos.x},${targetPos.y},${range}`;

    // --- Stuck detection ---
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

    // --- Tier 3: Suicide (50+ ticks) ---
    if (stuck >= STUCK_SUICIDE) {
      console.log(
        `[traffic] ${creep.name} (${creep.memory.role}) stuck ${stuck} ticks — suiciding`
      );
      creep.suicide();
      return null;
    }

    // --- Tier 2: Random nudge (25+ ticks) ---
    if (stuck >= STUCK_NUDGE) {
      const nudgeDir = this._getNudgeDir(creep);
      if (nudgeDir !== null) {
        console.log(
          `[traffic] ${creep.name} (${creep.memory.role}) stuck ${stuck} ticks — nudging`
        );
        creep.memory._trafficPath = null;
        creep.move(nudgeDir);
      }
      return null;
    }

    // --- Tier 1: moveTo fallback (5+ ticks) ---
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
      return null;
    }

    // --- Normal path following ---

    // Invalidate cache if target changed
    if (creep.memory._trafficTarget !== targetKey) {
      creep.memory._trafficTarget  = targetKey;
      creep.memory._trafficPath    = null;
      creep.memory._trafficPathAge = null;
    }

    // FIX: Invalidate cache if path is too old (structures/sites may have changed)
    if (creep.memory._trafficPathAge &&
        Game.time - creep.memory._trafficPathAge > PATH_TTL) {
      creep.memory._trafficPath    = null;
      creep.memory._trafficPathAge = null;
    }

    // Invalidate if pushed off-path
    const cached = creep.memory._trafficPath;
    if (cached && cached.length) {
      const next = cached[0];
      if (Math.abs(next.x - creep.pos.x) > 1 || Math.abs(next.y - creep.pos.y) > 1) {
        creep.memory._trafficPath = null;
      }
    }

    // Invalidate if next step is now structure-blocked or hard-pinned
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

      // Only invalidate for HARD pins — soft-pinned (idle) creeps will be pushed
      const hardPinnedByOther =
        this._pins[nextKey] &&
        !this._softPins[nextKey] &&
        this._pins[nextKey] !== creep.name;

      if (structureBlocked || siteBlocked || hardPinnedByOther) {
        creep.memory._trafficPath = null;
      }
    }

    // Advance path if already on the next step
    if (creep.memory._trafficPath && creep.memory._trafficPath.length) {
      const next = creep.memory._trafficPath[0];
      if (creep.pos.x === next.x && creep.pos.y === next.y) {
        creep.memory._trafficPath.shift();
      }
    }

    // Recalculate path if needed
    if (!creep.memory._trafficPath || !creep.memory._trafficPath.length) {

      const pins    = Object.assign({}, this._pins);
      const softPins = Object.assign({}, this._softPins);
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

            // FIX: Hard pins cost 20 (deters routing through, but not impassable
            // so final approach to adjacent targets still works).
            // Soft pins cost 8 (was 20) — idle creeps are pushable, don't force
            // massive detours around a cluster of parked clanrats.
            for (const key of Object.keys(pins)) {
              const [x, y] = key.split(',').map(Number);
              const isSoft = !!softPins[key];
              const cost   = isSoft ? 8 : 20;
              if (costs.get(x, y) < cost) costs.set(x, y, cost);
            }

            for (const intentName of Object.keys(intents)) {
              const ic = Game.creeps[intentName];
              if (!ic) continue;
              const cur = costs.get(ic.pos.x, ic.pos.y);
              if (cur < 5) costs.set(ic.pos.x, ic.pos.y, 5);
            }

            return costs;
          }
        }
      );

      if (result.incomplete || !result.path.length) return null;

      creep.memory._trafficPath    = result.path.map(p => ({ x: p.x, y: p.y }));
      creep.memory._trafficPathAge = Game.time;  // FIX: stamp age for TTL expiry
    }

    if (!creep.memory._trafficPath || !creep.memory._trafficPath.length) return null;

    return this._dirTo(creep.pos, creep.memory._trafficPath[0]);
  },

  _getNudgeDir(creep) {
    const terrain = creep.room.getTerrain();
    const allDirs = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];

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

    return null;
  },

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

global.Traffic = Traffic;
module.exports = Traffic;
