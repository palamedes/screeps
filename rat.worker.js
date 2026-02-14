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
 * Gathering priority depends on current job:
 *   Upgrading: controller container first (already at controller, no travel cost)
 *              then tombstones → ruins → dropped pile → spawn fallback
 *   Building:  tombstones → ruins → dropped pile → spawn fallback
 *              (don't trek to controller container and back for a build site elsewhere)
 *
 * Emergency mode: if miners are down, workers harvest directly and
 * feed the spawn so the director can recover the miner population.
 *
 * All movement routed through Traffic.requestMove — no direct moveTo calls.
 * Stuck detection removed: the traffic manager handles blocked creeps by
 * resolving conflicts before movement executes.
 */

const Traffic = require('traffic');

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
          Traffic.requestMove(this, source);
        }
      }
      return;
    }

    if (spawn) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
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

  // --- Job Validation ---
  // Clear any job type a worker should never be running.
  // Can happen when a slave promotes mid-job and inherits a stale HARVEST.
  // findJob() only fires when memory.job is null so without this the worker
  // runs its old job forever and never re-evaluates.
  if (this.memory.job && this.memory.job.type === 'HARVEST') {
    this.memory.job = null;
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
        Traffic.requestMove(this, this.room.controller, { range: 3 });
      }
    }
    return;
  }

  // --- Gathering Phase ---

  // If current job is UPGRADE, try the controller container first.
  // The worker is already standing at the controller — withdrawing from the
  // adjacent container costs zero travel ticks vs running back to the source
  // drop pile. Workers building elsewhere skip this to avoid a detour.
  if (this.memory.job && this.memory.job.type === 'UPGRADE') {
    const controllerContainer = this.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(this.room.controller, 3) &&
        s.store[RESOURCE_ENERGY] > 0
    });

    if (controllerContainer) {
      if (this.withdraw(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, controllerContainer);
      }
      return;
    }
  }

  // Check tombstones — dead rats shouldn't waste their energy
  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: t => t.store[RESOURCE_ENERGY] > 0
  })[0];

  if (tombstone) {
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Check ruins
  const ruin = this.room.find(FIND_RUINS, {
    filter: r => r.store[RESOURCE_ENERGY] > 0
  })[0];

  if (ruin) {
    if (this.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, ruin);
    }
    return;
  }

  // Prefer dropped energy (miners drop it at source)
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Fallback: withdraw from spawn only if spawn has a strong surplus
  // (never starve the spawn of energy needed for spawning)
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 250) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, spawn);
    }
    return;
  }

  // Nothing to gather — spend whatever we're holding rather than idling.
  // Handles partial-load edge case: worker acquired a small amount of energy
  // (below the fill threshold) and can't find more. Spend it rather than
  // oscillating near the source with a useless trickle in store.
  if (this.store[RESOURCE_ENERGY] > 0) {
    this.memory.working = true;
    return;
  }

  // Nothing to pick up — wait near the highest-yield source
  const source = this.pos.findClosestByPath(FIND_SOURCES);
  if (source) {
    Traffic.requestMove(this, source, { range: 2 });
  }
};