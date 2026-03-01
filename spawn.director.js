/**
 * spawn.director.js
 *
 * Spawn logic for the Skaven warren. Pure logic — no magic numbers.
 * All tuning lives in spawn.config.js.
 *
 * CULLING (two passes, runs before spawn decisions every tick):
 *
 *   Pass 1 — checkExcessCreeps()
 *     If any role exceeds maxCount[rcl], kills the weakest one (fewest key
 *     parts, then shortest TTL). Respects minCount — never culls below floor.
 *     One kill per tick for safe convergence.
 *
 *   Pass 2 — checkDeadWeight()
 *     Kills a creep whose active key parts have decayed below 40% of ideal.
 *     Respects minCount. Only fires if room can afford a minimum viable
 *     replacement body. One kill per tick.
 *
 * SPAWN GATE (_checkRoleLimit):
 *   Blocks a spawn if live count >= maxCount[rcl] OR the proposed body
 *   has fewer key parts than minParts. Waits for energy to accumulate
 *   rather than producing undersized bodies.
 *
 * SPAWN PRIORITY ORDER:
 *   1. Miners       — always, no energy threshold
 *   2. Thralls      — always (after miners covered), no energy threshold
 *   3. Gutterrunner — one scout when intel is stale
 *   4. Stormvermin  — when under threat
 *   5. Warlock      — count-based (exactly 1), no energy threshold
 *   6. Clanrats     — only when energyRatio >= SPAWN_ENERGY_THRESHOLD
 */

const Bodies = require('spawn.bodies');
const {
  ROLE_LIMITS,
  ROLE_KEY_PART,
  DEADWEIGHT,
  PREEMPT_TTL,
  NAMES,
  SPAWN_ENERGY_THRESHOLD
} = require('spawn.config');

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

    // Pass 1: excess count cull
    const excessKill = this.checkExcessCreeps(room, creeps);
    if (excessKill) creeps = creeps.filter(c => c.name !== excessKill);

    // Pass 2: dead weight cull
    const deadKill = this.checkDeadWeight(room, creeps);
    if (deadKill) creeps = creeps.filter(c => c.name !== deadKill);

    this.spawnByDemand(room, spawn, creeps);
  },

  // ───────────────────────────────────── Limit helpers ──

  _getMinCount(role, rcl) {
    const limits = ROLE_LIMITS[role];
    if (!limits) return 0;
    return limits.minCount[rcl] !== undefined
      ? limits.minCount[rcl]
      : limits.minCount[limits.minCount.length - 1];
  },

  _getMaxCount(role, rcl) {
    const limits = ROLE_LIMITS[role];
    if (!limits) return 99;
    return limits.maxCount[rcl] !== undefined
      ? limits.maxCount[rcl]
      : limits.maxCount[limits.maxCount.length - 1];
  },

  // ───────────────────────────────────── Culling: excess ──

  /**
   * Kill the weakest creep of any role that exceeds maxCount[rcl].
   * Never reduces a role below minCount[rcl].
   * @return {string|null}
   */
  checkExcessCreeps(room, creeps) {
    const rcl = room.controller ? room.controller.level : 0;

    for (const role in ROLE_LIMITS) {
      const maxCount   = this._getMaxCount(role, rcl);
      const minCount   = this._getMinCount(role, rcl);
      const roleCreeps = creeps.filter(c => c.memory.role === role);

      if (roleCreeps.length <= maxCount) continue;
      if (roleCreeps.length <= minCount) continue;

      const keyPart = ROLE_KEY_PART[role];

      roleCreeps.sort((a, b) => {
        const aParts = keyPart ? a.body.filter(p => p.type === keyPart && p.hits > 0).length : 0;
        const bParts = keyPart ? b.body.filter(p => p.type === keyPart && p.hits > 0).length : 0;
        if (aParts !== bParts) return aParts - bParts;
        return (a.ticksToLive || 0) - (b.ticksToLive || 0);
      });

      const victim = roleCreeps[0];
      console.log(
        `[warren:${room.name}] excess ${role}: ${roleCreeps.length}/${maxCount} ` +
        `@ RCL${rcl} — suiciding ${victim.name} ` +
        `(${keyPart ? victim.body.filter(p => p.type === keyPart && p.hits > 0).length : '?'} ${keyPart})`
      );
      victim.suicide();
      return victim.name;
    }

    return null;
  },

  // ─────────────────────────────────── Culling: dead weight ──

  /**
   * Kill a creep whose active key parts have decayed below 40% of ideal.
   * Never reduces a role below minCount[rcl].
   * Only fires when room can afford a minimum viable replacement.
   * @return {string|null}
   */
  checkDeadWeight(room, creeps) {
    const rcl = room.controller ? room.controller.level : 0;

    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      const minCount      = this._getMinCount(creep.memory.role, rcl);
      const sameRoleAlive = creeps.filter(c => c.memory.role === creep.memory.role).length;
      if (sameRoleAlive <= minCount) continue;

      if (creep.body.some(b => b.hits < 100)) continue;
      if (creep.ticksToLive !== undefined && creep.ticksToLive < 200) continue;

      const bodyFn = Bodies[creep.memory.role];
      if (!bodyFn) continue;

      const idealBody   = bodyFn(room.energyCapacityAvailable);
      const idealCount  = idealBody.filter(p => p === config.part).length;
      if (idealCount === 0) continue;

      // Never cull a creep that meets minParts — it's the minimum viable body,
      // not dead weight. Dead weight = a creep that WAS good and has since decayed.
      const limits   = ROLE_LIMITS[creep.memory.role];
      const minParts = limits ? limits.minParts : 0;
      if (activeCount >= minParts) continue;
      if (activeCount >= idealCount * config.minRatio) continue;

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

  // ──────────────────────────────────────────── Spawn gate ──

  /**
   * Block spawn if live count >= maxCount[rcl] or body is undersized.
   * @return {boolean}  true = allow
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
          `[spawn:${room.name}] ${role} at maxCount (${current}/${maxCount} @ RCL${rcl}) — waiting`
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

  // ──────────────────────────────────────── Part targets ──

  calculatePartsTargets(room) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const cap     = room.energyCapacityAvailable;

    const minerWorkTarget = sources.length * 5;

    const pairsPerThrall  = Math.min(Math.floor(cap / 100), 10);
    const extensions      = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const hasStorage      = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE
    }).length > 0;
    const thrallCount     = (extensions === 0 && !hasStorage) ? 1
      : rcl <= 3 ? sources.length
        : sources.length + 1;
    const thrallCarryTarget = thrallCount * pairsPerThrall;

    const setsPerClanrat  = Math.min(Math.floor(cap / 200), 16);
    const clanratCountCap = rcl <= 2 ? sources.length
      : rcl <= 4 ? sources.length * 2
        : sources.length * 3;
    const clanratWorkTarget = Math.min(16, clanratCountCap) * setsPerClanrat;

    return {
      miner:   { parts: minerWorkTarget,   type: WORK  },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK, countCap: clanratCountCap }
    };
  },

  // ────────────────────────────────────── Spawn decisions ──

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

    // ── 1. MINERS ─────────────────────────────────────────────────────────────
    const effectiveMinerWork = this.countLivingParts(room.name, 'miner', WORK, PREEMPT_TTL.miner);
    const activeMinerCount   = Object.values(Game.creeps).filter(c =>
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
          console.log(`[spawn:${room.name}] miner — ${effectiveMinerWork}/${targets.miner.parts} WORK — ${body.length} parts, ${cost}e`);
          return;
        }
      }
      return; // hold — don't fall through while miners are needed
    }

    // ── 2. THRALLS ────────────────────────────────────────────────────────────
    const effectiveThrallCarry = this.countLivingParts(room.name, 'thrall', CARRY, PREEMPT_TTL.thrall);

    if (effectiveThrallCarry < targets.thrall.parts) {
      const body = Bodies.thrall(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost && this._checkRoleLimit(room, 'thrall', body)) {
          this.spawnRat(spawn, 'thrall', body);
          console.log(`[spawn:${room.name}] thrall — ${effectiveThrallCarry}/${targets.thrall.parts} CARRY — ${body.length} parts, ${cost}e`);
          return;
        }
      }
    }

    // ── 3. GUTTER RUNNER ──────────────────────────────────────────────────────
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

    // ── 4. STORMVERMIN ────────────────────────────────────────────────────────
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

    // ── 5. WARLOCK: exactly 1 ─────────────────────────────────────────────────
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

    // ── 6. CLANRATS (energy threshold required) ───────────────────────────────
    if (room.energyAvailable / room.energyCapacityAvailable < SPAWN_ENERGY_THRESHOLD) return;

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
          console.log(`[spawn:${room.name}] clanrat — ${totalClanratWork}/${targets.clanrat.parts} WORK — ${body.length} parts, ${cost}e`);
          return;
        }
      }
    }
  },

  // ──────────────────────────────────────────── Helpers ──

  countLivingParts(roomName, role, partType, minTTL) {
    return Object.values(Game.creeps)
      .filter(c => {
        if (c.memory.homeRoom !== roomName) return false;
        if (c.memory.role !== role) return false;
        if (minTTL !== undefined && c.ticksToLive !== undefined && c.ticksToLive < minTTL) return false;
        return true;
      })
      .reduce((sum, creep) => {
        return sum + creep.body.filter(p => p.type === partType && p.hits > 0).length;
      }, 0);
  },

  getRoleCount(roomName, role) {
    return Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === roomName && c.memory.role === role
    ).length;
  },

  /**
   * Minimum energy cost to produce a body with at least minParts of
   * the role's key part. Guards checkDeadWeight from culling when a
   * viable replacement is unaffordable.
   */
  _minViableCost(room, role, bodyFn) {
    const limits  = ROLE_LIMITS[role];
    const keyPart = ROLE_KEY_PART[role];

    if (!limits || !keyPart || limits.minParts <= 0) {
      return this._bodyCost(bodyFn(room.energyCapacityAvailable));
    }

    let testEnergy = 100;
    while (testEnergy <= room.energyCapacityAvailable) {
      const testBody = bodyFn(testEnergy);
      if (testBody.filter(p => p === keyPart).length >= limits.minParts) {
        return this._bodyCost(testBody);
      }
      testEnergy += 50;
    }

    return this._bodyCost(bodyFn(room.energyCapacityAvailable));
  },

  getWarrenCreeps(room) {
    return Object.values(Game.creeps).filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${NAMES[Game.time % NAMES.length]}${Math.floor(Game.time / 10) % 100}`;
    spawn.spawnCreep(body, name, { memory: { role, homeRoom: spawn.room.name } });
  },

  _bodyCost(body) {
    const costs = { work: 100, carry: 50, move: 50, attack: 80,
      ranged_attack: 150, tough: 10, heal: 250, claim: 600 };
    return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
  }

};