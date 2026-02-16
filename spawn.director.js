/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 * Called exclusively from warren.act.js — nothing else should call this.
 *
 * Spawn priority order (RCL2+):
 *   1. Emergency slave if warren is completely empty
 *   2. Miners until all sources are covered — spawns immediately (no threshold)
 *   3. Thralls up to thrallTarget          — spawns immediately (no threshold)
 *   4. Clanrats up to clanratTarget        — waits for SPAWN_ENERGY_THRESHOLD
 *   5. Warlock Engineer                    — waits for SPAWN_ENERGY_THRESHOLD
 *
 * Preemptive spawning (PREEMPT_TTL):
 *   For miners and thralls, a creep nearing death is treated as already absent.
 *   This fires a replacement spawn before the old one dies, preventing the
 *   synchronized-death crash cycle seen in the blackbox data.
 *
 * Dead weight detection (DEADWEIGHT_THRESHOLD):
 *   Creeps with too few active body parts contribute almost nothing and
 *   waste CPU. They are suicided and filtered from the working set so the
 *   director immediately sees the vacancy and queues a proper replacement.
 */

const Bodies = require('spawn.bodies');

// Extensions must be this full before spawning clanrats and warlocks.
// Miners and thralls are exempt — they fill the extensions.
const SPAWN_ENERGY_THRESHOLD = 0.9;

// If a creep of this role has fewer ticks to live than the threshold,
// treat it as already absent so a replacement is queued before it dies.
// Threshold must exceed: body_parts × 3 ticks/part + reasonable travel time.
const PREEMPT_TTL = {
  miner:  80,   // max miner: 6 parts × 3 = 18 ticks + travel buffer
  thrall: 150   // max thrall: 26 parts × 3 = 78 ticks + travel buffer
};

// Minimum useful active body parts per role.
// Creeps below these thresholds are suicided and replaced properly.
const DEADWEIGHT_THRESHOLD = {
  miner:   { WORK:  2 },  // 1 WORK = 2 energy/tick; can't keep pace with source
  thrall:  { CARRY: 3 },  // < 3 CARRY barely moves any energy
  clanrat: { WORK:  2 }   // 1 WORK clanrat is nearly useless for building
};

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    let creeps = this.getWarrenCreeps(room);

    // Emergency: warren completely empty — spawn whatever we can afford
    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    // Dead weight check: suicide any creep too small to be useful.
    // Returns the name of the suicided creep, or null.
    // Filter the suicided creep from the working set so spawnByDemand
    // sees the vacancy this tick rather than waiting until next tick.
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

    const miners   = creeps.filter(c => c.memory.role === 'miner');
    const thralls  = creeps.filter(c => c.memory.role === 'thrall');
    const clanrats = creeps.filter(c => c.memory.role === 'clanrat');
    const warlocks = creeps.filter(c => c.memory.role === 'warlock');

    // RCL1 — slaves only
    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    // --- No energy threshold below this line for miners and thralls ---

    // Miners: preemptive — treat dying miners as already absent.
    // effectiveMiners excludes any miner whose TTL is below the preempt threshold.
    // This fires a replacement before the old miner dies, preventing income gaps.
    const effectiveMiners = miners.filter(c =>
      c.ticksToLive === undefined || c.ticksToLive > PREEMPT_TTL.miner
    );

    if (effectiveMiners.length < sources.length) {
      this.spawnRat(spawn, 'miner', Bodies.miner(energy));
      return;
    }

    // Thrall target
    const sourceContainerCount = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        sources.some(src => s.pos.inRangeTo(src, 2))
    }).length;

    const thrallTarget = sourceContainerCount > 0
      ? sourceContainerCount
      : rcl >= 3 ? 2 : 1;

    // Thralls: preemptive — same logic as miners.
    const effectiveThralls = thralls.filter(c =>
      c.ticksToLive === undefined || c.ticksToLive > PREEMPT_TTL.thrall
    );

    if (effectiveThralls.length < thrallTarget) {
      this.spawnRat(spawn, 'thrall', Bodies.thrall(energy));
      return;
    }

    // --- Energy threshold applies to everything below ---
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    // Clanrat target
    const energyCapped  = room.energyAvailable === room.energyCapacityAvailable;
    const baseClanrats  = sources.length * 2;
    const bonusClanrats = energyCapped ? sources.length : 0;
    const clanratCap    = sources.length * 4;
    const clanratTarget = Math.min(baseClanrats + bonusClanrats, clanratCap);

    if (clanrats.length < clanratTarget) {
      this.spawnRat(spawn, 'clanrat', Bodies.clanrat(energy));
      return;
    }

    // Warlock: one per warren, only when controller container exists
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
   * Detects and suicides creeps too small to be worth running.
   *
   * Safety guards:
   *   - Miners and thralls require minimum replacement energy before suicide.
   *     Never suicide a miner if we can't immediately spawn a real one.
   *   - Only one suicide per tick to avoid cascade failures.
   *
   * @returns {string|null} — name of suicided creep, or null if none
   */
  checkDeadWeight(room, creeps) {
    for (const creep of creeps) {
      const threshold = DEADWEIGHT_THRESHOLD[creep.memory.role];
      if (!threshold) continue;

      // Safety: don't suicide pipeline-critical roles unless we can replace them
      if (creep.memory.role === 'miner'  && room.energyAvailable < 350) continue;
      if (creep.memory.role === 'thrall' && room.energyAvailable < 300) continue;

      for (const [partType, minCount] of Object.entries(threshold)) {
        const activeCount = creep.body.filter(
          b => b.type === partType && b.hits > 0
        ).length;

        if (activeCount < minCount) {
          console.log(
            `[warren:${room.name}] dead weight: ${creep.name} ` +
            `(${creep.memory.role}, ${activeCount}/${minCount} active ${partType}) — suiciding`
          );
          creep.suicide();
          return creep.name; // one per tick — caller filters this from the working set
        }
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