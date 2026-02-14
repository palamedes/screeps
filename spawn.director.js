/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 * Called exclusively from warren.act.js — nothing else should call this.
 *
 * Spawn priority order (RCL2+):
 *   1. Emergency slave if warren is completely empty
 *   2. Miners until all sources are covered — spawns immediately (economy stalls fast)
 *   3. All other roles — only after SPAWN_ENERGY_THRESHOLD is met (see below)
 *   4. Haulers up to haulerTarget
 *   5. Workers up to workerTarget
 *   6. Warlock Engineer — one per warren, only after controller container exists
 *
 * Spawn readiness threshold (SPAWN_ENERGY_THRESHOLD):
 *   Non-emergency, non-miner spawns wait until energyAvailable is at least
 *   90% of energyCapacityAvailable. This prevents the most common failure mode:
 *   a creep dies → spawn has 300 base energy → director fires immediately →
 *   Bodies() returns the cheapest 3-part tier → hauler fills extensions 2 ticks
 *   later, too late to matter.
 *   Waiting a few ticks for extensions to fill means every replacement creep
 *   spawns at the best body the warren can afford, not just the bare minimum.
 *
 * Hauler target formula:
 *   No source containers (RCL2 baseline):  1 hauler per warren.
 *     One hauler is enough to keep spawn and extensions topped up.
 *     More haulers just compete with workers for the same dropped pile
 *     and clog traffic near sources with idle rats.
 *   Source containers present (Layer 2):   1 hauler per source container.
 *     The pipeline is now container → hauler → consumers, which is
 *     efficient enough to justify scaling back up to 1 hauler per source.
 *
 * Worker target formula:
 *   Base:  sources * 2      (minimum viable spending capacity)
 *   Bonus: +sources         (if energy is currently capped — economy is saturated)
 *   Cap:   sources * 4      (hard ceiling, prevents runaway spawning)
 *
 * Warlock Engineer:
 *   Spawned only when the controller container exists — the warlock has no
 *   reliable energy supply until then and would just wander uselessly.
 *   One per warren. Lowest spawn priority so economy is healthy before
 *   committing to an expensive dedicated upgrader.
 *
 * At RCL1, only slaves are spawned.
 *
 * Emergency note: when all creeps are dead, extensions are empty and only
 * the spawn's base 300 energy is available. The emergency spawn MUST use
 * energyAvailable (not energyCapacityAvailable) or it will try to build a
 * body it can't afford and stall indefinitely.
 */

const Bodies = require('spawn.bodies');

// Wait until extensions are this full before spawning non-critical roles.
// At RCL2 with 5 extensions (550 capacity): 0.9 × 550 = 495 energy required.
// Hauler fills extensions within a few ticks — worth the wait for a good body.
const SPAWN_ENERGY_THRESHOLD = 0.9;

module.exports = {

  /**
   * Main entry point. Called once per tick per warren.
   */
  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    const creeps = this.getWarrenCreeps(room);

    // Emergency: warren is completely empty.
    // Use energyAvailable (not energyCapacityAvailable) — extensions are empty
    // when all creeps are dead so capacity is misleading. Spawn whatever we
    // can actually afford right now to get at least one rat alive.
    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  /**
   * Spawn decisions based on current population and room state.
   *
   * Always passes energyAvailable (not energyCapacityAvailable) to body recipes.
   * In normal operation extensions are full so the two values are equal — no
   * difference in body quality. During recovery extensions are empty, so passing
   * capacity would request a body we can't afford and stall indefinitely.
   * Passing available means we always spawn the best body we can right now.
   */
  spawnByDemand(room, spawn, creeps) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    const miners   = creeps.filter(c => c.memory.role === 'miner');
    const haulers  = creeps.filter(c => c.memory.role === 'hauler');
    const workers  = creeps.filter(c => c.memory.role === 'worker');
    const warlocks = creeps.filter(c => c.memory.role === 'warlock');

    // RCL1 — slaves only
    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    // RCL2+ — specialist roles

    // Miners are always urgent — a dead miner stalls the entire economy.
    // Spawn immediately with whatever energy is available.
    if (miners.length < sources.length) {
      this.spawnRat(spawn, 'miner', Bodies.miner(energy));
      return;
    }

    // Hauler target scales with infrastructure.
    //
    // Without source containers (RCL2 baseline), one hauler per warren is enough.
    // The single hauler handles spawn → extensions → controller container delivery.
    // Extra haulers just compete with workers for the same dropped pile and idle
    // near sources waiting for energy that workers are already picking up.
    //
    // With source containers (Layer 2), miners drop into containers and haulers
    // pull from them. The pipeline can support one hauler per source container.
    const sourceContainerCount = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        sources.some(src => s.pos.inRangeTo(src, 2))
    }).length;

    const haulerTarget = sourceContainerCount > 0 ? sourceContainerCount : 1;

    // Haulers are also exempt from the energy threshold — the hauler IS the
    // thing that fills extensions. If it's dead and we wait for 90% energy
    // before spawning it, we deadlock: extensions never fill, threshold never
    // clears, hauler never spawns. Spawn it immediately on whatever is available.
    if (haulers.length < haulerTarget) {
      this.spawnRat(spawn, 'hauler', Bodies.hauler(energy));
      return;
    }

    // Workers and warlock: wait until extensions are well-stocked before spawning.
    // Miners and hauler are already live (handled above), so extensions are being
    // filled right now. Waiting for 90% means the next worker/warlock spawn gets
    // the best body the warren can afford rather than a cheap 3-part body.
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    // Worker target is energy-responsive.
    // Base count handles normal operation.
    // Bonus fires when extensions are capped — we're producing more than we spend.
    // Hard cap prevents runaway spawning in rooms with many sources.
    const energyCapped = room.energyAvailable === room.energyCapacityAvailable;
    const baseWorkers  = sources.length * 2;
    const bonusWorkers = energyCapped ? sources.length : 0;
    const workerCap    = sources.length * 4;
    const workerTarget = Math.min(baseWorkers + bonusWorkers, workerCap);

    if (workers.length < workerTarget) {
      this.spawnRat(spawn, 'worker', Bodies.worker(energy));
      return;
    }

    // Warlock Engineer: one per warren, only when controller container exists.
    // The container must be built first — the warlock has no fallback energy
    // supply until it is. Once the container is up, one warlock saturates
    // upgrade throughput and the warren climbs RCL without touching workers.
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
   * Returns all creeps belonging to this warren.
   */
  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  /**
   * Spawns a rat with the correct name, role, and home warren.
   */
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