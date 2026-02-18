/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 * Called exclusively from warren.act.js — nothing else should call this.
 *
 * PARTS-BASED TARGETING (v2):
 * Instead of targeting creep counts, the director targets total PART counts
 * across all living creeps of a role. This enables emergent optimization:
 * as energy capacity grows, the system naturally spawns fewer, larger creeps
 * to achieve the same throughput, reducing traffic and CPU overhead.
 *
 *   Old: "spawn 4 clanrats"
 *   New: "spawn enough clanrats to have 16 total WORK parts"
 *
 * At RCL3 (800 cap): spawns 4x 4-WORK clanrats (can't afford bigger)
 * At RCL4 (1300 cap): spawns 3x 6-WORK clanrats (same throughput, fewer bodies)
 * At RCL8 (12900 cap): could spawn 1x 16-WORK clanrat (ultimate efficiency)
 *
 * Preemptive spawning: dying miners/thralls are treated as already absent
 * so a replacement is queued before death, preventing income gaps.
 * Preemption uses part counts too — parts from dying creeps don't count.
 *
 * Dead weight detection: suicides creeps whose key part count is below
 * 50% of what the ideal body at current room capacity would have.
 * Uses ratio comparison so early-game small bodies are never wrongly killed.
 */

const Bodies = require('spawn.bodies');

const SPAWN_ENERGY_THRESHOLD = 0.9;

const PREEMPT_TTL = {
  miner:  80,
  thrall: 150
};

// Which part determines a role's usefulness, and what fraction of
// the ideal body's count must be present to avoid the dead weight cut.
// Uses lowercase string literals — these match creep.body[i].type values.
const DEADWEIGHT = {
  miner:   { part: 'work',  minRatio: 0.5 },
  thrall:  { part: 'carry', minRatio: 0.5 },
  clanrat: { part: 'work',  minRatio: 0.5 }
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

  // ---------------------------------------------------------------------------
  // Parts counting
  // ---------------------------------------------------------------------------

  /**
   * Count total ACTIVE parts of a given type across all living creeps of a role.
   * "Active" means hits > 0 — injured parts don't contribute throughput.
   *
   * @param {string} roomName  - Room to count in
   * @param {string} role      - Creep role (miner, thrall, clanrat, warlock)
   * @param {string} partType  - WORK, CARRY, MOVE, etc. (uppercase constant)
   * @param {number} [minTTL]  - If set, exclude creeps with TTL below this threshold
   * @return {number}          Total count of active parts of that type
   */
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

  // ---------------------------------------------------------------------------
  // Parts targets
  // ---------------------------------------------------------------------------

  /**
   * Calculate target part counts for each role based on current room state.
   * These are FORMULAS — they scale with sources, RCL, and infrastructure.
   *
   * @param {Room} room
   * @return {object} { miner, thrall, clanrat, warlock } each with { parts, type }
   */
  calculatePartsTargets(room) {
    const sources = room.find(FIND_SOURCES);
    const sourceContainers = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        sources.some(src => s.pos.inRangeTo(src, 2))
    });

    // --- MINERS: 5 WORK per source ---
    // Each source yields 10 energy/tick. 1 WORK harvests 2/tick. 10/2 = 5 WORK.
    const minerWorkTarget = sources.length * 5;

    // --- THRALLS: scale with production and infrastructure ---
    // Without containers, thralls need to run to the source directly — keep it simple.
    // With containers, target enough CARRY to handle ~80% of peak production
    // buffered by ~30-tick round trips.
    // Each CARRY holds 50 energy; at 30-tick round trip = 1.67 energy/tick per CARRY.
    // Production rate = sources * 10/tick. Need: (production * 0.8) / 1.67 CARRY.
    // Simplified: productionRate * 0.5 ≈ adequate CARRY with some buffer.
    let thrallCarryTarget;
    if (sourceContainers.length > 0) {
      const productionRate = sources.length * 10;
      // 1.5× multiplier accounts for round-trip time and traffic delays
      thrallCarryTarget = Math.ceil(productionRate * 1.5);
      // Enforce a sensible minimum (at least sourceContainerCount + 1 thrall worth of CARRY)
      const minCarry = (sourceContainers.length + 1) *
        Math.floor(room.energyCapacityAvailable / 100); // pairs per thrall at capacity
      thrallCarryTarget = Math.max(thrallCarryTarget, sources.length * 8);
    } else {
      // No containers yet — mirror old logic: 1–2 thralls' worth of CARRY
      const rcl = room.controller.level;
      const thrallCount = rcl >= 3 ? 2 : 1;
      // Use capacity to estimate thrall body size
      const pairsPerThrall = Math.min(Math.floor(room.energyCapacityAvailable / 100), 25);
      thrallCarryTarget = thrallCount * pairsPerThrall;
    }

    // --- CLANRATS: fixed WORK target, conservative baseline ---
    // 16 WORK = 16 upgrade/build points per tick — plenty for RCL3–5.
    // Could scale later: Math.min(productionRate * 0.6, rcl * 5, 50)
    const clanratWorkTarget = 16;

    // --- WARLOCK: fixed, sized for one dedicated upgrader ---
    // 6 WORK parts = 6 upgrade points/tick, reasonable baseline.
    // Warlock is only spawned when controller container exists (checked in spawnByDemand).
    const warlockWorkTarget = 6;

    return {
      miner:   { parts: minerWorkTarget,   type: WORK },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK },
      warlock: { parts: warlockWorkTarget, type: WORK }
    };
  },

  // ---------------------------------------------------------------------------
  // Spawn decision
  // ---------------------------------------------------------------------------

  spawnByDemand(room, spawn, creeps) {
    const rcl    = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    const targets = this.calculatePartsTargets(room);

    // ---- MINERS: preemptive, parts-based ----
    // Exclude creeps within PREEMPT_TTL ticks of death so replacement spawns early.
    const effectiveMinerWork = this.countLivingParts(
      room.name, 'miner', WORK, PREEMPT_TTL.miner
    );

    if (effectiveMinerWork < targets.miner.parts) {
      const shortage = targets.miner.parts - effectiveMinerWork;
      const body = Bodies.miner(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'miner', body);
          console.log(
            `[spawn:${room.name}] miner — ` +
            `${effectiveMinerWork}/${targets.miner.parts} WORK ` +
            `(shortage: ${shortage}) — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- THRALLS: preemptive, parts-based ----
    const effectiveThrallCarry = this.countLivingParts(
      room.name, 'thrall', CARRY, PREEMPT_TTL.thrall
    );

    if (effectiveThrallCarry < targets.thrall.parts) {
      const shortage = targets.thrall.parts - effectiveThrallCarry;
      const body = Bodies.thrall(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'thrall', body);
          console.log(
            `[spawn:${room.name}] thrall — ` +
            `${effectiveThrallCarry}/${targets.thrall.parts} CARRY ` +
            `(shortage: ${shortage}) — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- CLANRATS & WARLOCK: wait for energy threshold ----
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    // ---- CLANRATS: parts-based ----
    const currentClanratWork = this.countLivingParts(room.name, 'clanrat', WORK);
    // Also count workers (backward-compat promoted slaves)
    const workerWork = this.countLivingParts(room.name, 'worker', WORK);
    const totalClanratWork = currentClanratWork + workerWork;

    if (totalClanratWork < targets.clanrat.parts) {
      const shortage = targets.clanrat.parts - totalClanratWork;
      const body = Bodies.clanrat(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'clanrat', body);
          console.log(
            `[spawn:${room.name}] clanrat — ` +
            `${totalClanratWork}/${targets.clanrat.parts} WORK ` +
            `(shortage: ${shortage}) — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- WARLOCK: parts-based, requires controller container ----
    const controllerContainer = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(room.controller, 3)
    })[0];

    if (controllerContainer) {
      const currentWarlockWork = this.countLivingParts(room.name, 'warlock', WORK);

      if (currentWarlockWork < targets.warlock.parts) {
        const shortage = targets.warlock.parts - currentWarlockWork;
        const body = Bodies.warlock(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost) {
            this.spawnRat(spawn, 'warlock', body);
            console.log(
              `[spawn:${room.name}] warlock — ` +
              `${currentWarlockWork}/${targets.warlock.parts} WORK ` +
              `(shortage: ${shortage}) — ${body.length} parts, ${cost}e`
            );
          }
        }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Dead weight detection (unchanged from v1)
  // ---------------------------------------------------------------------------

  /**
   * Suicides creeps too weak to be worth running.
   *
   * Compares the creep's active key-part count against the ideal body
   * we could spawn at current room energy CAPACITY. Only fires if the
   * ideal body is meaningfully better (ratio check) AND we have enough
   * energy available to spawn a replacement.
   *
   * This prevents early-game small bodies from being wrongly suicided —
   * if the best possible clanrat at 300 capacity is 1 WORK, a 1 WORK
   * clanrat passes (1/1 = 100% >= 50%).
   */
  checkDeadWeight(room, creeps) {
    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      // Never suicide the last creep of this role.
      const sameRoleAlive = creeps.filter(
        c => c.memory.role === creep.memory.role
      ).length;
      if (sameRoleAlive <= 1) continue;

      // Skip creeps that have taken combat damage
      const hasCombatDamage = creep.body.some(b => b.hits < 100);
      if (hasCombatDamage) continue;

      const bodyFn = Bodies[creep.memory.role];
      if (!bodyFn) continue;

      // Ideal body at full room capacity
      const idealBody = bodyFn(room.energyCapacityAvailable);

      // Only suicide if we can afford to spawn the ideal replacement RIGHT NOW.
      const idealCost = this._bodyCost(idealBody);
      if (room.energyAvailable < idealCost) continue;

      const idealCount = idealBody.filter(p => p === config.part).length;
      if (idealCount === 0) continue;

      // Count active key parts in this creep
      const activeCount = creep.body.filter(
        b => b.type === config.part && b.hits > 0
      ).length;

      // Suicide only if current is below the minimum ratio of ideal
      if (activeCount < idealCount * config.minRatio) {
        console.log(
          `[warren:${room.name}] dead weight: ${creep.name} ` +
          `(${creep.memory.role}, ${activeCount}/${idealCount} ${config.part} ` +
          `vs ideal — ${Math.round(activeCount / idealCount * 100)}% of capacity) — suiciding`
        );
        creep.suicide();
        return creep.name;
      }
    }
    return null;
  },

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${Game.time}`;
    spawn.spawnCreep(body, name, {
      memory: {
        role,
        homeRoom: spawn.room.name
      }
    });
  },

  /**
   * Calculate the energy cost of a body array.
   * Uses lowercase part names to match spawn.bodies.js conventions.
   */
  _bodyCost(body) {
    const costs = {
      work: 100, carry: 50, move: 50,
      attack: 80, ranged_attack: 150,
      tough: 10, heal: 250, claim: 600
    };
    return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
  }

};