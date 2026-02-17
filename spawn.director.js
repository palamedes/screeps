/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 * Called exclusively from warren.act.js — nothing else should call this.
 *
 * Preemptive spawning: dying miners/thralls are treated as already absent
 * so a replacement is queued before death, preventing income gaps.
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

// Minimum energy available before we'll suicide a pipeline-critical role.
// Don't kill a miner unless we can spawn at least a minimal replacement.
const DEADWEIGHT_ENERGY_FLOOR = {
  miner:   150,
  thrall:  100,
  clanrat: 200
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

  spawnByDemand(room, spawn, creeps) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    // Count workers as clanrats — they run clanrat logic via the rat.js alias
    const miners   = creeps.filter(c => c.memory.role === 'miner');
    const thralls  = creeps.filter(c => c.memory.role === 'thrall');
    const clanrats = creeps.filter(c =>
      c.memory.role === 'clanrat' || c.memory.role === 'worker'
    );
    const warlocks = creeps.filter(c => c.memory.role === 'warlock');

    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    // Miners: preemptive
    const effectiveMiners = miners.filter(c =>
      c.ticksToLive === undefined || c.ticksToLive > PREEMPT_TTL.miner
    );

    if (effectiveMiners.length < sources.length) {
      this.spawnRat(spawn, 'miner', Bodies.miner(energy));
      return;
    }

    // Thrall target — UPDATED for better throughput
    const sourceContainerCount = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        sources.some(src => s.pos.inRangeTo(src, 2))
    }).length;

    let thrallTarget;
    if (sourceContainerCount > 0) {
      // With source containers, scale by RCL:
      // RCL3 = 3 thralls (was 2)
      // RCL4 = 3 thralls
      // RCL5 = 4 thralls
      // Formula ensures minimum coverage plus scaling
      thrallTarget = Math.max(
        sourceContainerCount + 1,  // minimum: one per container + 1 extra
        Math.ceil(room.controller.level * 0.75)  // scales with RCL
      );
    } else {
      // No containers yet — use simpler logic
      thrallTarget = rcl >= 3 ? 2 : 1;
    }

    // Thralls: preemptive
    const effectiveThralls = thralls.filter(c =>
      c.ticksToLive === undefined || c.ticksToLive > PREEMPT_TTL.thrall
    );

    if (effectiveThralls.length < thrallTarget) {
      this.spawnRat(spawn, 'thrall', Bodies.thrall(energy));
      return;
    }

    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    const energyCapped  = room.energyAvailable === room.energyCapacityAvailable;
    const baseClanrats  = sources.length * 2;
    const bonusClanrats = energyCapped ? sources.length : 0;
    const clanratCap    = sources.length * 4;
    const clanratTarget = Math.min(baseClanrats + bonusClanrats, clanratCap);

    if (clanrats.length < clanratTarget) {
      this.spawnRat(spawn, 'clanrat', Bodies.clanrat(energy));
      return;
    }

    if (warlocks.length === 0) {
      const controllerContainer = room.find(FIND_STRUCTURES, {
        filter: s =>
          s.structureType === STRUCTURE_CONTAINER &&
          s.pos.inRangeTo(room.controller, 3)
      })[0];

      if (controllerContainer) {
        this.spawnRat(spawn, 'warlock', Bodies.warlock(energy));
      }
    }
  },

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
      // A weak thrall/miner is always better than none.
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
      // If we can't, keep the weak creep working — a bad thrall is better than no thrall.
      const partCosts = {
        work: 100, carry: 50, move: 50,
        attack: 80, ranged_attack: 150,
        tough: 10, heal: 250, claim: 600
      };
      const idealCost = idealBody.reduce(
        (sum, part) => sum + (partCosts[part] || 0), 0
      );
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
  }

};