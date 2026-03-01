/**
 * spawn.director.js
 *
 * HARDENED against runaway spawning of any role.
 *
 * THREE-CONSTRAINT SYSTEM PER ROLE:
 *
 *   minCount[rcl] — floor. Neither culling pass will reduce a role below
 *                   this count. Prevents the death spiral where deadweight
 *                   culling kills a useful thrall because 3/10 CARRY < 40%,
 *                   then the room starves waiting for a replacement.
 *
 *   maxCount[rcl] — ceiling. Excess culling kills the weakest creep over
 *                   this limit every tick until the count is back in range.
 *
 *   minParts      — spawn quality floor. The spawn gate won't fire if the
 *                   best affordable body has fewer key parts than this.
 *                   Waits for energy to accumulate rather than producing
 *                   an undersized body that clogs traffic and wastes a slot.
 *
 * TWO-PASS CULLING (runs before spawn decisions every tick):
 *
 *   Pass 1 — checkExcessCreeps()
 *     Kills weakest creep of any role that exceeds maxCount[rcl].
 *     Respects minCount — never culls below the floor.
 *     One kill per tick for safe convergence.
 *
 *   Pass 2 — checkDeadWeight()
 *     Kills a creep whose active key parts < 40% of the ideal body.
 *     Respects minCount — never culls below the floor.
 *     Only fires if we can afford a minimum viable replacement.
 *
 * WARLOCK LOGIC:
 *   Count-based (exactly 1). Was previously part-accumulation across N
 *   warlocks which caused runaway spawning. Now: spawn if activeWarlocks < 1,
 *   stop otherwise. minCount = maxCount = 1 means the band is zero-width.
 *
 * ROLE_LIMITS is the single source of truth for all spawn constraints.
 * Every spawnable role must have an entry. Missing entry = console warning.
 */

const Bodies = require('spawn.bodies');

const SPAWN_ENERGY_THRESHOLD = 0.9;

const PREEMPT_TTL = {
  miner:   80,
  thrall:  150,
  warlock: 200   // warlock walks to seat — needs generous overlap
};

const NAMES = [
  'gnaw','skritt','queek','lurk','ruin','blight','fang','scab','gash','rot',
  'skulk','twitch','snikk','claw','filth','mangle','reek','slit','spite','pox',
  'rattle','skree','chitter','bleed','warp','snarl','scrape','bite','mire','fester',
  'hook','tatter','scurry','crack','nibble','scour','screech','itch','grime','rend'
];

/**
 * The key body part for each role.
 * Used for minParts enforcement, excess culling (weakest = fewest of this),
 * and deadweight checks.
 */
const ROLE_KEY_PART = {
  miner:        'work',
  thrall:       'carry',
  clanrat:      'work',
  warlock:      'work',
  gutterrunner: 'move',
  stormvermin:  'attack',
  slave:        'work'
};

/**
 * Three-constraint spawn limits indexed by RCL [0..8].
 *
 * minCount — floor for culling. Neither culling pass reduces a role below
 *            this. Set equal to maxCount for roles that must be exact (warlock).
 *
 * maxCount — ceiling for culling. Excess culling fires when count > maxCount.
 *            Set to 0 at RCLs where the role shouldn't exist at all.
 *
 * minParts — minimum key-part count the spawned body must contain.
 *            Spawn waits for energy rather than producing an undersized body.
 */
const ROLE_LIMITS = {
  //              RCL: [0, 1,  2,  3,  4,  5,  6,  7,  8]
  slave: {
    minParts:  1,
    minCount: [0, 1,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 4,  0,  0,  0,  0,  0,  0,  0]
  },
  miner: {
    minParts:  1,
    minCount: [0, 1,  2,  2,  2,  2,  2,  2,  2],
    maxCount: [0, 1,  2,  2,  2,  2,  2,  2,  2]
  },
  thrall: {
    minParts:  3,  // 3 CARRY pairs = 300e minimum body. Below this, wait.
    minCount: [0, 0,  1,  2,  2,  3,  3,  4,  5],  // never cull below this
    maxCount: [0, 0,  2,  3,  4,  5,  6,  7,  8]
  },
  clanrat: {
    minParts:  1,
    minCount: [0, 0,  1,  1,  2,  2,  3,  3,  3],
    maxCount: [0, 0,  2,  4,  4,  6,  8,  8,  8]
  },
  warlock: {
    minParts:  1,
    minCount: [0, 0,  1,  1,  1,  1,  1,  1,  1],  // exactly 1 — band is zero-width
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]
  },
  gutterrunner: {
    minParts:  2,
    minCount: [0, 0,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]
  },
  stormvermin: {
    minParts:  1,
    minCount: [0, 0,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 0,  1,  1,  2,  2,  3,  3,  3]
  }
};

/**
 * Roles subject to dead-weight culling (part-ratio check).
 * part     — key part to check against ideal body.
 * minRatio — cull if active parts < (ideal parts * minRatio).
 */
const DEADWEIGHT = {
  miner:   { part: 'work',  minRatio: 0.4 },
  thrall:  { part: 'carry', minRatio: 0.4 },
  clanrat: { part: 'work',  minRatio: 0.4 },
  warlock: { part: 'work',  minRatio: 0.4 }
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    let creeps = this.getWarrenCreeps(room);

    // Bootstrap: no creeps at all → spawn a slave immediately
    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    // --- CULLING PASSES (before any spawn decision) ---

    // Pass 1: excess count — kill weakest over maxCount[rcl], respect minCount
    const excessKill = this.checkExcessCreeps(room, creeps);
    if (excessKill) {
      creeps = creeps.filter(c => c.name !== excessKill);
    }

    // Pass 2: dead weight — kill degraded survivors, respect minCount
    const deadKill = this.checkDeadWeight(room, creeps);
    if (deadKill) {
      creeps = creeps.filter(c => c.name !== deadKill);
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  // ───────────────────────────────────────── Helpers: limit lookup ──

  /**
   * Get the minCount for a role at the current RCL.
   * Falls back to the last defined value if RCL exceeds the array.
   */
  _getMinCount(role, rcl) {
    const limits = ROLE_LIMITS[role];
    if (!limits) return 0;
    return limits.minCount[rcl] !== undefined
      ? limits.minCount[rcl]
      : limits.minCount[limits.minCount.length - 1];
  },

  /**
   * Get the maxCount for a role at the current RCL.
   */
  _getMaxCount(role, rcl) {
    const limits = ROLE_LIMITS[role];
    if (!limits) return 99;
    return limits.maxCount[rcl] !== undefined
      ? limits.maxCount[rcl]
      : limits.maxCount[limits.maxCount.length - 1];
  },

  // ─────────────────────────────────── Culling pass 1: excess count ──

  /**
   * If any role exceeds maxCount[rcl], kill the weakest one (fewest key
   * parts, then shortest TTL as tiebreaker).
   *
   * Respects minCount — never reduces a role below its floor even if
   * maxCount would allow it. This protects the room from losing critical
   * workers during the cull of a swarm.
   *
   * One kill per tick for safe convergence.
   *
   * @return {string|null}  name of suicided creep, or null
   */
  checkExcessCreeps(room, creeps) {
    const rcl = room.controller ? room.controller.level : 0;

    for (const role in ROLE_LIMITS) {
      const maxCount = this._getMaxCount(role, rcl);
      const minCount = this._getMinCount(role, rcl);

      const roleCreeps = creeps.filter(c => c.memory.role === role);
      if (roleCreeps.length <= maxCount) continue;

      // Never cull below the floor
      if (roleCreeps.length <= minCount) continue;

      const keyPart = ROLE_KEY_PART[role];

      // Sort: weakest first (fewest key parts), then shortest TTL
      roleCreeps.sort((a, b) => {
        const aParts = keyPart
          ? a.body.filter(p => p.type === keyPart && p.hits > 0).length
          : 0;
        const bParts = keyPart
          ? b.body.filter(p => p.type === keyPart && p.hits > 0).length
          : 0;
        if (aParts !== bParts) return aParts - bParts;
        return (a.ticksToLive || 0) - (b.ticksToLive || 0);
      });

      const victim = roleCreeps[0];
      console.log(
        `[warren:${room.name}] excess ${role}: ${roleCreeps.length}/${maxCount} ` +
        `@ RCL${rcl} — suiciding ${victim.name} ` +
        `(${keyPart
          ? victim.body.filter(p => p.type === keyPart && p.hits > 0).length
          : '?'} ${keyPart})`
      );
      victim.suicide();
      return victim.name;
    }

    return null;
  },

  // ─────────────────────────────────── Culling pass 2: dead weight ──

  /**
   * Kill a creep whose active key parts have decayed below 40% of the
   * ideal body for this role.
   *
   * Guards:
   *   - sameRoleAlive must be above minCount[rcl] — never cull below floor
   *   - creep must not have combat damage (hits < 100 on any part)
   *   - creep must have TTL >= 200 (don't cull a creep about to die naturally)
   *   - room must be able to afford a minimum viable replacement body
   *
   * One kill per tick.
   *
   * @return {string|null}
   */
  checkDeadWeight(room, creeps) {
    const rcl = room.controller ? room.controller.level : 0;

    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      // Never cull below the minCount floor for this role
      const minCount      = this._getMinCount(creep.memory.role, rcl);
      const sameRoleAlive = creeps.filter(c => c.memory.role === creep.memory.role).length;
      if (sameRoleAlive <= minCount) continue;

      // Don't cull damaged creeps — they may be defending
      if (creep.body.some(b => b.hits < 100)) continue;

      // Don't cull creeps close to natural death
      if (creep.ticksToLive !== undefined && creep.ticksToLive < 200) continue;

      const bodyFn = Bodies[creep.memory.role];
      if (!bodyFn) continue;

      const idealBody  = bodyFn(room.energyCapacityAvailable);
      const idealCount = idealBody.filter(p => p === config.part).length;
      if (idealCount === 0) continue;

      const activeCount = creep.body.filter(
        b => b.type === config.part && b.hits > 0
      ).length;

      if (activeCount >= idealCount * config.minRatio) continue;

      // Only cull if we can afford a minimum viable replacement
      const minViableCost = this._minViableCost(room, creep.memory.role, bodyFn);
      if (room.energyAvailable < minViableCost) continue;

      console.log(
        `[warren:${room.name}] dead weight: ${creep.name} ` +
        `(${creep.memory.role}, ${activeCount}/${idealCount} ${config.part} ` +
        `— ${Math.round(activeCount / idealCount * 100)}% of ideal) — suiciding`
      );
      creep.suicide();
      return creep.name;
    }
    return null;
  },

  // ─────────────────────────────────────────────────── Spawn gate ──

  /**
   * Two-constraint spawn gate. Blocks if:
   *   a) live count >= maxCount[rcl]
   *   b) body has fewer key parts than minParts
   *
   * @return {boolean}  true = allow spawn
   */
  _checkRoleLimit(room, role, body) {
    const limits = ROLE_LIMITS[role];
    if (!limits) {
      console.log(`[spawn:${room.name}] WARNING: no ROLE_LIMITS entry for '${role}' — add one!`);
      return true;
    }

    const rcl      = room.controller ? room.controller.level : 0;
    const maxCount = this._getMaxCount(role, rcl);
    const current  = this.getRoleCount(room.name, role);

    if (current >= maxCount) {
      if (Game.time % 20 === 0) {
        console.log(
          `[spawn:${room.name}] ${role} at maxCount ` +
          `(${current}/${maxCount} @ RCL${rcl}) — waiting`
        );
      }
      return false;
    }

    const keyPart = ROLE_KEY_PART[role];
    if (keyPart && limits.minParts > 0) {
      const partCount = body.filter(p => p === keyPart).length;
      if (partCount < limits.minParts) {
        if (Game.time % 20 === 0) {
          console.log(
            `[spawn:${room.name}] ${role} body too weak ` +
            `(${partCount}/${limits.minParts} ${keyPart} @ RCL${rcl}) — waiting for energy`
          );
        }
        return false;
      }
    }

    return true;
  },

  // ──────────────────────────────────────────────── Part targets ──

  calculatePartsTargets(room) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const cap     = room.energyCapacityAvailable;

    const minerWorkTarget = sources.length * 5;

    const pairsPerThrall = Math.min(Math.floor(cap / 100), 10);
    const extensions     = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const hasStorage     = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE
    }).length > 0;

    const thrallCount = (extensions === 0 && !hasStorage)
      ? 1
      : rcl <= 3
        ? sources.length
        : sources.length + 1;
    const thrallCarryTarget = thrallCount * pairsPerThrall;

    const setsPerClanrat  = Math.min(Math.floor(cap / 200), 16);
    const clanratCountCap = rcl <= 2
      ? sources.length
      : rcl <= 4
        ? sources.length * 2
        : sources.length * 3;
    const clanratWorkTarget = Math.min(16, clanratCountCap) * setsPerClanrat;

    return {
      miner:   { parts: minerWorkTarget,   type: WORK  },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK, countCap: clanratCountCap }
    };
  },

  // ──────────────────────────────────────────── Spawn decisions ──

  spawnByDemand(room, spawn, creeps) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    const targets = this.calculatePartsTargets(room);

    // ── MINERS ────────────────────────────────────────────────────────────────
    const effectiveMinerWork = this.countLivingParts(
      room.name, 'miner', WORK, PREEMPT_TTL.miner
    );
    const activeMinerCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      c.memory.role === 'miner' &&
      (c.ticksToLive === undefined || c.ticksToLive >= PREEMPT_TTL.miner)
    ).length;

    if (effectiveMinerWork < targets.miner.parts && activeMinerCount < sources.length) {
      const body = Bodies.miner(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost && this._checkRoleLimit(room, 'miner', body)) {
          this.spawnRat(spawn, 'miner', body);
          console.log(
            `[spawn:${room.name}] miner — ` +
            `${effectiveMinerWork}/${targets.miner.parts} WORK — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
      return; // wait — don't fall through while miners needed
    }

    // ── THRALLS ───────────────────────────────────────────────────────────────
    const effectiveThrallCarry = this.countLivingParts(
      room.name, 'thrall', CARRY, PREEMPT_TTL.thrall
    );

    if (effectiveThrallCarry < targets.thrall.parts) {
      const body = Bodies.thrall(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost && this._checkRoleLimit(room, 'thrall', body)) {
          this.spawnRat(spawn, 'thrall', body);
          console.log(
            `[spawn:${room.name}] thrall — ` +
            `${effectiveThrallCarry}/${targets.thrall.parts} CARRY — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ── GUTTER RUNNER ─────────────────────────────────────────────────────────
    if (rcl >= 2) {
      const hasScout   = Object.values(Game.creeps).some(c =>
        c.memory.homeRoom === room.name && c.memory.role === 'gutterrunner'
      );
      const intel      = Memory.intelligence || {};
      const STALE_AGE  = 5000;
      const needsScout = !hasScout && Object.values(Game.map.describeExits(room.name)).some(rName => {
        const entry = intel[rName];
        return !entry || (Game.time - entry.scoutedAt) > STALE_AGE;
      });

      if (needsScout) {
        const body = Bodies.gutterrunner(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost && this._checkRoleLimit(room, 'gutterrunner', body)) {
            this.spawnRat(spawn, 'gutterrunner', body);
            console.log(`[spawn:${room.name}] gutterrunner — ${body.length} MOVE, ${cost}e`);
            return;
          }
        }
      }
    }

    // ── STORMVERMIN ───────────────────────────────────────────────────────────
    const { ROOM_STATE } = require('warren.memory');
    const underThreat = room.memory.state === ROOM_STATE.WAR ||
      room.memory.state === ROOM_STATE.FORTIFY;
    const hasHostiles = room.find(FIND_HOSTILE_CREEPS).some(h =>
      h.getActiveBodyparts(WORK)          > 0 ||
      h.getActiveBodyparts(ATTACK)        > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0
    );

    if (underThreat || hasHostiles) {
      const svCount  = this.getRoleCount(room.name, 'stormvermin');
      const svTarget = rcl >= 4 ? 2 : 1;
      if (svCount < svTarget) {
        const body = Bodies.stormvermin(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost && this._checkRoleLimit(room, 'stormvermin', body)) {
            this.spawnRat(spawn, 'stormvermin', body);
            console.log(`[spawn:${room.name}] ⚔️  stormvermin — ${body.length} parts, ${cost}e`);
            return;
          }
        }
      }
    }

    // ── WARLOCK: count-based, exactly 1 ──────────────────────────────────────
    if (room.controller) {
      const controllerContainer = room.find(FIND_STRUCTURES, {
        filter: s =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.pos.inRangeTo(room.controller, 3)
      })[0];

      if (controllerContainer) {
        const activeWarlocks = Object.values(Game.creeps).filter(c =>
          c.memory.homeRoom === room.name &&
          c.memory.role === 'warlock' &&
          (c.ticksToLive === undefined || c.ticksToLive >= PREEMPT_TTL.warlock)
        ).length;

        if (activeWarlocks < 1) {
          const body = Bodies.warlock(energy);
          if (body && body.length > 0) {
            const cost = this._bodyCost(body);
            if (energy >= cost && this._checkRoleLimit(room, 'warlock', body)) {
              this.spawnRat(spawn, 'warlock', body);
              console.log(`[spawn:${room.name}] warlock — ${body.length} parts, ${cost}e`);
              return;
            }
          }
        }
      }
    }

    // ── CLANRATS (energy threshold required) ──────────────────────────────────
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    const currentClanratWork  = this.countLivingParts(room.name, 'clanrat', WORK);
    const workerWork          = this.countLivingParts(room.name, 'worker',  WORK);
    const totalClanratWork    = currentClanratWork + workerWork;
    const currentClanratCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      (c.memory.role === 'clanrat' || c.memory.role === 'worker')
    ).length;

    if (currentClanratCount >= targets.clanrat.countCap) return;

    if (totalClanratWork < targets.clanrat.parts) {
      const body = Bodies.clanrat(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost && this._checkRoleLimit(room, 'clanrat', body)) {
          this.spawnRat(spawn, 'clanrat', body);
          console.log(
            `[spawn:${room.name}] clanrat — ` +
            `${totalClanratWork}/${targets.clanrat.parts} WORK — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }
  },

  // ──────────────────────────────────────────────────── Helpers ──

  countLivingParts(roomName, role, partType, minTTL) {
    return Object.values(Game.creeps)
      .filter(c => {
        if (c.memory.homeRoom !== roomName) return false;
        if (c.memory.role !== role) return false;
        if (minTTL !== undefined && c.ticksToLive !== undefined &&
          c.ticksToLive < minTTL) return false;
        return true;
      })
      .reduce((sum, creep) => {
        return sum + creep.body.filter(p => p.type === partType && p.hits > 0).length;
      }, 0);
  },

  getRoleCount(roomName, role) {
    return Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === roomName &&
      c.memory.role === role
    ).length;
  },

  /**
   * Find the minimum energy cost to produce a body with at least minParts
   * of the role's key part. Used by checkDeadWeight to ensure we can afford
   * a viable replacement before culling a degraded creep.
   */
  _minViableCost(room, role, bodyFn) {
    const limits  = ROLE_LIMITS[role];
    const keyPart = ROLE_KEY_PART[role];

    if (!limits || !keyPart || limits.minParts <= 0) {
      return this._bodyCost(bodyFn(room.energyCapacityAvailable));
    }

    let testEnergy = 100;
    while (testEnergy <= room.energyCapacityAvailable) {
      const testBody  = bodyFn(testEnergy);
      const partCount = testBody.filter(p => p === keyPart).length;
      if (partCount >= limits.minParts) {
        return this._bodyCost(testBody);
      }
      testEnergy += 50;
    }

    return this._bodyCost(bodyFn(room.energyCapacityAvailable));
  },

  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${NAMES[Game.time % NAMES.length]}${Math.floor(Game.time / 10) % 100}`;
    spawn.spawnCreep(body, name, {
      memory: { role, homeRoom: spawn.room.name }
    });
  },

  _bodyCost(body) {
    const costs = {
      work: 100, carry: 50, move: 50,
      attack: 80, ranged_attack: 150,
      tough: 10, heal: 250, claim: 600
    };
    return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
  }

};