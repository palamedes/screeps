/**
 * rat.worker.js
 *
 * Worker behavior — builds construction sites and upgrades the controller.
 * Workers do NOT harvest. They pick up dropped energy then spend it.
 *
 * State toggle (memory.working):
 *   false = gathering energy (pickup dropped resources)
 *   true  = spending energy (running assigned job)
 *
 * Emergency mode: if miners are down, workers harvest directly and
 * feed the spawn so the director can recover the miner population.
 */

Creep.prototype.runWorker = function () {

  const sources = this.room.find(FIND_SOURCES);

  // Use homeRoom-based miner count to match spawn.director logic
  const miners = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.memory.homeRoom &&
    c.memory.role === 'miner'
  );

  // --- Emergency Recovery Mode ---
  // Miners are down. Workers become harvesters temporarily to keep
  // the spawn fed so the director can spawn new miners.
  if (miners.length < sources.length) {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];

    if (this.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const source = this.pos.findClosestByPath(FIND_SOURCES);
      if (source) {
        if (this.harvest(source) === ERR_NOT_IN_RANGE) {
          this.moveTo(source, { visualizePathStyle: {} });
        }
      }
      return;
    }

    if (spawn) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(spawn, { visualizePathStyle: {} });
      }
    }
    return;
  }

  // --- Energy State Toggle ---
  // Drain: if we were working and ran out of energy, stop working and clear job
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
    this.memory.job = null;
  }

  // Fill: if we were gathering and are now full, start working
  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // --- Spending Phase ---
  if (this.memory.working) {
    if (!this.memory.job) {
      this.memory.job = this.findJob();
    }

    if (this.memory.job) {
      this.runJob();
    } else {
      // No job available — idle near controller as a fallback
      // (prevents workers from wandering randomly)
      if (this.room.controller) {
        this.moveTo(this.room.controller, { range: 3, visualizePathStyle: {} });
      }
    }
    return;
  }

  // --- Gathering Phase ---
  // Prefer dropped energy (miners drop it at source)
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      this.moveTo(dropped, { visualizePathStyle: {} });
    }
    return;
  }

  // Fallback: withdraw from spawn only if spawn has a strong surplus
  // (never starve the spawn of energy needed for spawning)
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 250) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn, { visualizePathStyle: {} });
    }
    return;
  }

  // Nothing to pick up — wait near the highest-yield source
  const source = this.pos.findClosestByPath(FIND_SOURCES);
  if (source) {
    this.moveTo(source, { range: 2, visualizePathStyle: {} });
  }
};