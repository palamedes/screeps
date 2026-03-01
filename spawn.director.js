/**
 * spawn.director.js
 *
 * HARDENED against runaway spawning of any role.
 *
 * TWO-PASS CULLING SYSTEM:
 *
 *   Pass 1 — checkExcessCreeps()
 *     For every role: if liveCount > maxCount[rcl], suicide the weakest
 *     (fewest key parts). Fires every tick before any spawn decision.
 *     This is the primary guard against swarms. It doesn't care why the
 *     room is over-count — it just corrects it.
 *
 *   Pass 2 — checkDeadWeight()
 *     For roles where count is within limits but individual creeps are
 *     too degraded to be useful. Checks part-ratio against ideal body.
 *     Deadweight threshold: active key parts < 40% of ideal body's key parts.
 *     Uses minViableCost (not idealCost) so it fires during energy drought.
 *
 * TWO-CONSTRAINT SPAWN GATE (_checkRoleLimit):
 *   maxCount[rcl] — hard ceiling on live count. No spawn if at or above.
 *   minParts      — minimum key-part count in the proposed body. No spawn
 *                   if the body is too small. Waits for energy to accumulate.
 *
 * WARLOCK LOGIC FIXED:
 *   Previously targeted warlockWorkTarget = 10 WORK across however many
 *   warlocks it took to accumulate that. 3 x 1-WORK warlocks = 3 < 10 →
 *   spawn another. Now treated like gutterrunner: count-based, exactly 1,
 *   preemptive replacement when TTL < PREEMPT_TTL.warlock.
 *
 * ROLE_LIMITS is the single source of truth for all spawn constraints.
 * Every role that can be spawned must have an entry here.
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
 * Used for minParts enforcement and dead-weight / excess culling.
 * "Weakest" = fewest of this part type.
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
 * Two-constraint spawn limits.
 *
 * minParts  — minimum count of the role's key part in the spawned body.
 *             Spawn waits for energy to accumulate rather than producing
 *             an undersized body that wastes a spawn slot and clogs traffic.
 *
 * maxCount  — maximum live creep count indexed by RCL [0..8].
 *             Hard ceiling. Excess culling removes the weakest over this limit.
 *
 * Every spawnable role must have an entry. Missing entry = warning in console.
 */
const ROLE_LIMITS = {
  //              RCL: [0, 1,  2,  3,  4,  5,  6,  7,  8]
  slave: {
    minParts: 1,
    maxCount: [0, 4,  0,  0,  0,  0,  0,  0,  0]
  },
  miner: {
    minParts: 1,
    maxCount: [0, 1,  2,  2,  2,  2,  2,  2,  2]
  },
  thrall: {
    minParts: 3,  // 3 CARRY pairs = 300e minimum. Below this, wait.
    maxCount: [0, 0,  2,  3,  4,  5,  6,  7,  8]
  },
  clanrat: {
    minParts: 1,
    maxCount: [0, 0,  2,  4,  4,  6,  8,  8,  8]
  },
  warlock: {
    minParts: 1,
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]  // exactly 1, always
  },
  gutterrunner: {
    minParts: 2,
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]
  },
  stormvermin: {
    minParts: 1,
    maxCount: [0, 0,  1,  1,  2,  2,  3,  3,  3]
  }
};

/**
 * Roles subject to dead-weight culling.
 * part     — key part to check.
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

    // Pass 1: excess count — kill weakest over maxCount[rcl]
    const excessKill = this.checkExcessCreeps(room, creeps);
    if (excessKill) {
      creeps = creeps.filter(c => c.name !== excessKill);
    }

    // Pass 2: dead weight — kill degraded survivors
    const deadKill = this.checkDeadWeight(room, creeps);
    if (deadKill) {
      creeps = creeps.filter(c => c.name !== deadKill);
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  // ─────────────────────────────────────────── Culling: excess count ──

  /**
   * For every role: if liveCount > maxCount[rcl], suicide the weakest one
   * (fewest key parts, then shortest TTL as tiebreaker).
   *
   * Only one kill per tick — converges quickly without destabilising the room.
   * Respects a minimum floor of 1 so a room is never left with zero of a role
   * due to a misconfigured limit.
   *
   * @return {string|null}  name of suicided creep, or null
   */
  checkExcessCreeps(room, creeps) {
    const rcl = room.controller ? room.controller.level : 0;

    for (const role in ROLE_LIMITS) {
      const limits   = ROLE_LIMITS[role];
      const maxCount = limits.maxCount[rcl] !== undefined
        ? limits.maxCount[rcl]
        : limits.maxCount[limits.maxCount.length - 1];

      const roleCreeps = creeps.filter(c => c.memory.role === role);
      if (roleCreeps.length <= maxCount) continue;
      if (roleCreeps.length <= 1) continue; // never cull the last one

      const keyPart = ROLE_KEY_PART[role];

      // Weakest first: fewest key parts, then shortest TTL
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

  // ────────────────────────────────────────── Culling: dead weight ──

  /**
   * Kill a creep whose key parts have decayed below 40% of the ideal body.
   * Only fires if we can afford a minimum viable replacement.
   * Skips if role count is at the floor (≤ 2).
   *
   * @return {string|null}
   */
  checkDeadWeight(room, creeps) {
    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      const sameRoleAlive = creeps.filter(c => c.memory.role === creep.memory.role).length;
      if (sameRoleAlive <= 2) continue;

      const hasCombatDamage = creep.body.some(b => b.hits < 100);
      if (hasCombatDamage) continue;

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

      // Must be able to afford a minimum viable replacement before culling
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

  // ───────────────────────────────────────────────── Spawn gate ──

  /**
   * Two-constraint gate. Blocks spawn if:
   *   a) live count >= maxCount[rcl]
   *   b) body has fewer key parts than minParts
   *
   * @return {boolean}
   */
  _checkRoleLimit(room, role, body) {
    const limits = ROLE_LIMITS[role];
    if (!limits) {
      console.log(`[spawn:${room.name}] WARNING: no ROLE_LIMITS entry for '${role}' — add one!`);
      return true;
    }

    const rcl      = room.controller ? room.controller.level : 0;
    const maxCount = limits.maxCount[rcl] !== undefined
      ? limits.maxCount[rcl]
      : limits.maxCount[limits.maxCount.length - 1];

    const currentCount = this.getRoleCount(room.name, role);
    if (currentCount >= maxCount) {
      if (Game.time % 20 === 0) {
        console.log(
          `[spawn:${room.name}] ${role} at maxCount ` +
          `(${currentCount}/${maxCount} @ RCL${rcl}) — waiting`
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

  // ──────────────────────────────────────────────── Spawn decisions ──

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
      return; // wait — don't fall through while miners are needed
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
      const hasScout    = Object.values(Game.creeps).some(c =>
        c.memory.homeRoom === room.name && c.memory.role === 'gutterrunner'
      );
      const intel       = Memory.intelligence || {};
      const STALE_AGE   = 5000;
      const needsScout  = !hasScout && Object.values(Game.map.describeExits(room.name)).some(rName => {
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

    // ── WARLOCK: count-based (exactly 1) ─────────────────────────────────────
    // Fixed: was part-accumulation across N warlocks (broken).
    // Now: spawn if zero active warlocks with TTL >= PREEMPT_TTL.
    // maxCount[rcl]=1 + excess culling enforces the ceiling.
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

    // ── CLANRATS (need energy threshold) ─────────────────────────────────────
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

  // ──────────────────────────────────────────────── Helpers ──

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
   * Find the minimum energy needed to produce a body with at least
   * minParts of the role's key part. Used by checkDeadWeight so it
   * only culls when it can afford a viable replacement.
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