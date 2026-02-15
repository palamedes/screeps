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
 * Miners and thralls bypass the energy threshold because they ARE the pipeline
 * that fills extensions. Gating them on extension fill % creates a deadlock.
 *
 * Thrall target formula:
 *   Source containers present:  1 per source container (Layer 2 pipeline)
 *   RCL3+, no containers:       2 thralls
 *     At RCL3 there are 10+ extensions (600+ energy to fill) plus spawn plus
 *     controller container. One thrall cannot make enough round trips to keep
 *     everything stocked. Two thralls split the delivery burden.
 *   RCL2, no containers:        1 thrall
 *     5 extensions, 300-550 capacity. One thrall is enough.
 *
 * Clanrat target formula:
 *   Base:  sources * 2      (minimum viable spending capacity)
 *   Bonus: +sources         (if energy is capped — economy saturated)
 *   Cap:   sources * 4      (hard ceiling)
 *
 * Warlock Engineer:
 *   One per warren. Only after controller container exists.
 *   Lowest priority — economy must be healthy first.
 *
 * At RCL1, only slaves are spawned.
 */

const Bodies = require('spawn.bodies');

// Wait until extensions are this full before spawning clanrats and warlock.
// Miners and thralls are exempt — they fill the extensions.
const SPAWN_ENERGY_THRESHOLD = 0.9;

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    const creeps = this.getWarrenCreeps(room);

    // Emergency: warren completely empty — spawn whatever we can afford
    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  spawnByDemand(room, spawn, creeps) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    const miners    = creeps.filter(c => c.memory.role === 'miner');
    const thralls   = creeps.filter(c => c.memory.role === 'thrall');
    const clanrats  = creeps.filter(c => c.memory.role === 'clanrat');
    const warlocks  = creeps.filter(c => c.memory.role === 'warlock');

    // RCL1 — slaves only
    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    // --- No energy threshold below this line for miners and thralls ---

    // Miners: immediate — dead miner = economy stalled
    if (miners.length < sources.length) {
      this.spawnRat(spawn, 'miner', Bodies.miner(energy));
      return;
    }

    // Thrall target:
    //   Source containers present → 1 per container (Layer 2 pipeline)
    //   RCL3+ no containers       → 2 (10+ extensions overwhelms a single thrall)
    //   RCL2  no containers       → 1 (5 extensions, one thrall sufficient)
    const sourceContainerCount = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        sources.some(src => s.pos.inRangeTo(src, 2))
    }).length;

    const thrallTarget = sourceContainerCount > 0
      ? sourceContainerCount
      : rcl >= 3 ? 2 : 1;

    // Thralls: immediate — they fill extensions, can't gate on what they produce
    if (thralls.length < thrallTarget) {
      this.spawnRat(spawn, 'thrall', Bodies.thrall(energy));
      return;
    }

    // --- Energy threshold applies to everything below ---
    // Miners and thralls are live so extensions are being filled right now.
    // Wait for near-full extensions before spending spawn capacity on clanrats.
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