/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 * Called exclusively from warren.act.js — nothing else should call this.
 *
 * Spawn priority order (RCL2+):
 *   1. Emergency slave if warren is empty
 *   2. Miners until all sources are covered (1 miner per source)
 *   3. Haulers until haulers == miners (1 hauler per miner)
 *   4. Workers up to target count (see workerTarget below)
 *
 * Worker target formula:
 *   Base:  sources * 2      (minimum viable spending capacity)
 *   Bonus: +sources         (if energy is currently capped — economy is saturated)
 *   Cap:   sources * 4      (hard ceiling, prevents runaway spawning)
 *
 *   The bonus fires when energyAvailable == energyCapacityAvailable, meaning
 *   the hauler is delivering faster than workers can spend. Spawning an extra
 *   worker drains the surplus. When extensions are no longer full the bonus
 *   disappears and the director stops at the base count.
 *
 * At RCL1, only slaves are spawned.
 *
 * Emergency note: when all creeps are dead, extensions are empty and only
 * the spawn's base 300 energy is available. The emergency spawn MUST use
 * energyAvailable (not energyCapacityAvailable) or it will try to build a
 * body it can't afford and stall indefinitely.
 */

const Bodies = require('spawn.bodies');

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

    const miners  = creeps.filter(c => c.memory.role === 'miner');
    const haulers = creeps.filter(c => c.memory.role === 'hauler');
    const workers = creeps.filter(c => c.memory.role === 'worker');

    // RCL1 — slaves only
    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    // RCL2+ — specialist roles

    if (miners.length < sources.length) {
      this.spawnRat(spawn, 'miner', Bodies.miner(energy));
      return;
    }

    if (haulers.length < miners.length) {
      this.spawnRat(spawn, 'hauler', Bodies.hauler(energy));
      return;
    }

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