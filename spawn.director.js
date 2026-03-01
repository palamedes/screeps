/**
 * spawn.director.js
 *
 * FIXES in this version:
 *
 * 1. MINERS BEFORE THRALLS — hard rule.
 *    If activeMinerCount < sources.length, thralls do not spawn.
 *    Period. A source sitting idle costs more than a thrall waiting.
 *
 * 2. THRALL TARGET SIMPLIFIED.
 *    At RCL2 with 300 cap: old formula gave target=3 CARRY (3 tiny thralls).
 *    New formula: target = pairs in ONE ideal thrall body at current cap.
 *    We want 1 well-sized thrall, not 3 tiny ones clogging traffic.
 *    At RCL3+ scales to sources+1 thralls worth of CARRY.
 *
 * 3. DEAD WEIGHT minimum raised to 3 alive (was 2).
 *    Extra guard: never suicide if TTL < 200.
 *
 * 4. WARLOCK moved before energy threshold.
 *    The warlock is as critical as a miner — a room without one runs at ~4%
 *    controller throughput. The 90% guard was protecting against repeated
 *    expensive spawns; warlock only spawns once per lifecycle (~1500 ticks).
 *    Remove the threshold entirely for warlock. Also added preemptive
 *    replacement at TTL < 200 so there is always overlap during the walk
 *    to the container seat.
 *
 * 5. TWO-CONSTRAINT SPAWN LIMITS (new).
 *    Each role now has two guards per RCL level:
 *
 *    minParts — minimum number of the role's key body part required before
 *    a spawn is allowed. Prevents the death spiral where 25 x [CARRY,MOVE]
 *    thralls are spawned because each costs only 100e. The spawn waits until
 *    enough energy has accumulated to produce a body that actually moves
 *    meaningful cargo. "Wait for a good spawn" beats "spawn immediately
 *    and clog the room with useless bodies."
 *
 *    maxCount — hard ceiling on live creep count for this role at this RCL.
 *    A safety net that caps runaway spawning even if the part-target logic
 *    misbehaves. Indexed by RCL (0–8). Values are conservative: a room
 *    should never need more than these creeps at a given controller level.
 *
 *    Together: the system won't spawn undersized bodies, and can't accumulate
 *    a swarm of them even if something else goes wrong.
 */

const Bodies = require('spawn.bodies');

const SPAWN_ENERGY_THRESHOLD = 0.9;

const PREEMPT_TTL = {
  miner:  80,
  thrall: 150,
  warlock: 200   // warlock walks to seat after spawn — needs generous overlap
};

const NAMES = ['gnaw','skritt','queek','lurk','ruin','blight','fang','scab','gash','rot',
  'skulk','twitch','snikk','claw','filth','mangle','reek','slit','spite','pox',
  'rattle','skree','chitter','bleed','warp','snarl','scrape','bite','mire','fester',
  'hook','tatter','scurry','crack','nibble','scour','screech','itch','grime','rend'
];

const DEADWEIGHT = {
  miner:   { part: 'work',  minRatio: 0.4 },
  thrall:  { part: 'carry', minRatio: 0.4 },
  clanrat: { part: 'work',  minRatio: 0.4 }
};

/**
 * Two-constraint spawn limits per role.
 *
 * minParts — minimum count of the role's key part the body must contain.
 *   The spawn director will NOT fire if the best affordable body falls below
 *   this count. It waits for energy to accumulate instead.
 *   This prevents the "25 tiny thralls" death spiral.
 *
 * maxCount — maximum live creep count indexed by RCL [0..8].
 *   Hard ceiling regardless of part-count targets.
 *   Use null at an index to mean "no cap at this RCL" (rare — prefer a number).
 *
 * Key part by role (used for minParts check):
 *   miner       → work
 *   thrall      → carry
 *   clanrat     → work
 *   warlock     → work
 *   gutterrunner→ move
 *   stormvermin → attack
 */
const ROLE_LIMITS = {
  //          RCL: [0, 1, 2, 3, 4,  5,  6,  7,  8]
  miner: {
    minParts: 1,  // even 1 WORK is useful — miner gets replaced by deadweight check
    maxCount: [0, 1, 2, 2, 2,  2,  2,  2,  2]
  },
  thrall: {
    minParts: 3,  // minimum 3 CARRY pairs = 300e body. Below this, wait.
    maxCount: [0, 0, 2, 3, 4,  5,  6,  7,  8]
  },
  clanrat: {
    minParts: 1,  // 1 WORK clanrat is still useful
    maxCount: [0, 0, 2, 4, 4,  6,  8,  8,  8]
  },
  warlock: {
    minParts: 1,  // 1 WORK warlock is better than none
    maxCount: [0, 0, 1, 1, 1,  1,  1,  1,  1]
  },
  gutterrunner: {
    minParts: 2,  // 2 MOVE minimum — single MOVE scout is pointless
    maxCount: [0, 0, 1, 1, 1,  1,  1,  1,  1]
  },
  stormvermin: {
    minParts: 1,
    maxCount: [0, 0, 1, 1, 2,  2,  3,  3,  3]
  }
};

/**
 * The key body part for each role, used for minParts enforcement.
 * Values match Screeps part-type strings (WORK === 'work', etc.).
 */
const ROLE_KEY_PART = {
  miner:        'work',
  thrall:       'carry',
  clanrat:      'work',
  warlock:      'work',
  gutterrunner: 'move',
  stormvermin:  'attack'
};

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    let creeps = this.getWarrenCreeps(room);

    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    const suicided = this.checkDeadWeight(room, creeps);
    if (suicided) {
      creeps = creeps.filter(c => c.name !== suicided);
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  countLivingParts(roomName, role, partType, minTTL) {
    return Object.values(Game.creeps)
      .filter(c => {
        if (c.memory.homeRoom !== roomName) return false;
        if (c.memory.role !== role) return false;
        if (minTTL !== undefined && c.ticksToLive !== undefined && c.ticksToLive < minTTL) return false;
        return true;
      })
      .reduce((sum, creep) => {
        const count = creep.body.filter(p => p.type === partType && p.hits > 0).length;
        return sum + count;
      }, 0);
  },

  /**
   * Count live creeps of a given role assigned to this room.
   */
  getRoleCount(roomName, role) {
    return Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === roomName &&
      c.memory.role === role
    ).length;
  },

  /**
   * Two-constraint spawn gate.
   *
   * Returns false (block the spawn) if either:
   *   a) live count for this role is already at or above maxCount for current RCL
   *   b) the proposed body has fewer key parts than minParts
   *
   * Returns true (allow the spawn) if both constraints pass.
   *
   * Logs the reason when blocking so it's visible in the console.
   *
   * @param  {Room}   room
   * @param  {string} role
   * @param  {Array}  body  — the body array that would be spawned
   * @return {boolean}
   */
  _checkRoleLimit(room, role, body) {
    const limits = ROLE_LIMITS[role];
    if (!limits) return true; // no limits defined for this role — allow

    const rcl = room.controller ? room.controller.level : 0;

    // --- maxCount check ---
    const maxCount = limits.maxCount[rcl] !== undefined
      ? limits.maxCount[rcl]
      : limits.maxCount[limits.maxCount.length - 1]; // clamp to last defined value

    const currentCount = this.getRoleCount(room.name, role);

    if (currentCount >= maxCount) {
      // Only log occasionally to avoid console spam
      if (Game.time % 20 === 0) {
        console.log(
          `[spawn:${room.name}] ${role} at maxCount (${currentCount}/${maxCount} @ RCL${rcl}) — waiting`
        );
      }
      return false;
    }

    // --- minParts check ---
    const keyPart = ROLE_KEY_PART[role];
    if (keyPart && limits.minParts > 0) {
      const partCount = body.filter(p => p === keyPart).length;
      if (partCount < limits.minParts) {
        // Only log occasionally to avoid console spam
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

  calculatePartsTargets(room) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const cap     = room.energyCapacityAvailable;

    // MINERS: 5 WORK per source saturates it
    const minerWorkTarget = sources.length * 5;

    // THRALLS: target = CARRY parts in one ideal thrall body at current cap.
    const pairsPerThrall = Math.min(Math.floor(cap / 100), 10);

    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const hasStorage = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE
    }).length > 0;

    const thrallCount = (extensions === 0 && !hasStorage)
      ? 1
      : rcl <= 3
        ? sources.length
        : sources.length + 1;

    const thrallCarryTarget = thrallCount * pairsPerThrall;

    // CLANRATS: conservative at low RCL
    const setsPerClanrat  = Math.min(Math.floor(cap / 200), 16);
    const clanratCountCap = rcl <= 2
      ? sources.length
      : rcl <= 4
        ? sources.length * 2
        : sources.length * 3;
    const clanratWorkTarget = Math.min(16, clanratCountCap) * setsPerClanrat;

    // WARLOCK: one dedicated upgrader
    const warlockWorkTarget = Math.min(Math.floor((cap - 150) / 100), 10);

    return {
      miner:   { parts: minerWorkTarget,   type: WORK  },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK, countCap: clanratCountCap },
      warlock: { parts: warlockWorkTarget, type: WORK  }
    };
  },

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

    // ---- MINERS: absolute first priority ----
    const effectiveMinerWork = this.countLivingParts(
      room.name, 'miner', WORK, PREEMPT_TTL.miner
    );

    const activeMinerCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      c.memory.role === 'miner' &&
      (c.ticksToLive === undefined || c.ticksToLive >= PREEMPT_TTL.miner)
    ).length;

    const minersNeeded = activeMinerCount < sources.length;

    if (effectiveMinerWork < targets.miner.parts && minersNeeded) {
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
      return;
    }

    // ---- THRALLS: only spawn when miners are covered ----
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

    // ---- GUTTER RUNNER: one scout per room, RCL2+ ----
    if (rcl >= 2) {
      const hasScout = Object.values(Game.creeps).some(c =>
        c.memory.homeRoom === room.name &&
        c.memory.role === 'gutterrunner'
      );

      if (!hasScout) {
        const roomExits     = Game.map.describeExits(room.name);
        const intel         = Memory.intelligence || {};
        const STALE_AGE     = 5000;

        const needsScouting = Object.values(roomExits).some(rName => {
          const entry = intel[rName];
          return !entry || (Game.time - entry.scoutedAt) > STALE_AGE;
        });

        if (needsScouting) {
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
    }

    // ---- STORMVERMIN: spawn when threatened ----
    const { ROOM_STATE } = require('warren.memory');
    const roomState   = room.memory.state;
    const underThreat = roomState === ROOM_STATE.WAR ||
      roomState === ROOM_STATE.FORTIFY;

    const hasHostiles = room.find(FIND_HOSTILE_CREEPS).filter(h =>
      h.getActiveBodyparts(WORK)         > 0 ||
      h.getActiveBodyparts(ATTACK)       > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0
    ).length > 0;

    const needsStormvermin = underThreat || hasHostiles;

    if (needsStormvermin) {
      const svCount = this.getRoleCount(room.name, 'stormvermin');
      const svTarget = rcl >= 4 ? 2 : 1;

      if (svCount < svTarget) {
        const body = Bodies.stormvermin(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost && this._checkRoleLimit(room, 'stormvermin', body)) {
            this.spawnRat(spawn, 'stormvermin', body);
            console.log(
              `[spawn:${room.name}] ⚔️  stormvermin — ${body.length} parts, ${cost}e`
            );
            return;
          }
        }
      }
    }

    // ---- WARLOCK: no energy threshold — as critical as a miner ----
    // The warlock is the entire controller upgrade engine. Without one the room
    // runs at ~4% of its upgrade potential. It spawns once per ~1500 ticks so
    // the 90% threshold guard was causing it to never queue during drought periods.
    // Preemptive replacement fires at TTL < 200 so the new warlock can walk to
    // its seat before the old one dies — no upgrade gap.
    if (room.controller) {
      const controllerContainer = room.find(FIND_STRUCTURES, {
        filter: s =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.pos.inRangeTo(room.controller, 3)
      })[0];

      if (controllerContainer) {
        const currentWarlockWork = this.countLivingParts(
          room.name, 'warlock', WORK, PREEMPT_TTL.warlock
        );

        if (currentWarlockWork < targets.warlock.parts) {
          const body = Bodies.warlock(energy);
          if (body && body.length > 0) {
            const cost = this._bodyCost(body);
            if (energy >= cost && this._checkRoleLimit(room, 'warlock', body)) {
              this.spawnRat(spawn, 'warlock', body);
              console.log(
                `[spawn:${room.name}] warlock — ` +
                `${currentWarlockWork}/${targets.warlock.parts} WORK — ${body.length} parts, ${cost}e`
              );
              return;
            }
          }
        }
      }
    }

    // ---- CLANRATS & remaining: wait for energy threshold ----
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    // ---- CLANRATS ----
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

      const idealBody = bodyFn(room.energyCapacityAvailable);
      const idealCost = this._bodyCost(idealBody);

      // FIX: Use minParts-based minimum viable cost rather than ideal cost.
      // The old check (energy >= idealCost) meant deadweight thralls were
      // immune during drought — ideal 1000e thrall never cleared the bar.
      // Now we check against the cost of the minimum viable body instead,
      // so undersized creeps can be culled even when energy is low.
      const limits  = ROLE_LIMITS[creep.memory.role];
      const keyPart = ROLE_KEY_PART[creep.memory.role];
      let minViableCost = idealCost; // default: same as before

      if (limits && keyPart) {
        // Build the body we'd get at the minimum viable part count.
        // We approximate by scaling energy until the body meets minParts.
        // Simple approach: find cost of body that produces exactly minParts.
        // For thrall: minParts=3 pairs = 3*100 = 300e minimum body.
        const partCosts = { work: 100, carry: 50, move: 50, attack: 80,
          ranged_attack: 150, tough: 10, heal: 250, claim: 600 };
        // Calculate cost of a body that just meets minParts for the key part.
        // Thrall: 3 CARRY + 3 MOVE = 300e. Miner: 1 WORK + 1 CARRY + 1 MOVE = 200e.
        // We iterate energy upward until Bodies[role](e) produces minParts key parts.
        let testEnergy = 100;
        while (testEnergy <= room.energyCapacityAvailable) {
          const testBody = bodyFn(testEnergy);
          const partCount = testBody.filter(p => p === keyPart).length;
          if (partCount >= limits.minParts) {
            minViableCost = this._bodyCost(testBody);
            break;
          }
          testEnergy += 50;
        }
      }

      if (room.energyAvailable < minViableCost) continue;

      const idealCount = idealBody.filter(p => p === config.part).length;
      if (idealCount === 0) continue;

      const activeCount = creep.body.filter(
        b => b.type === config.part && b.hits > 0
      ).length;

      if (activeCount < idealCount * config.minRatio) {
        console.log(
          `[warren:${room.name}] dead weight: ${creep.name} ` +
          `(${creep.memory.role}, ${activeCount}/${idealCount} ${config.part} ` +
          `— ${Math.round(activeCount / idealCount * 100)}% of ideal) — suiciding`
        );
        creep.suicide();
        return creep.name;
      }
    }
    return null;
  },

  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${NAMES[Game.time % NAMES.length]}${Math.floor(Game.time/10) % 100}`;
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