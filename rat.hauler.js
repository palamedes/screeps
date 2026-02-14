/**
 * rat.hauler.js
 *
 * Hauler behavior — picks up dropped energy and delivers it to consumers.
 * Haulers have no WORK parts. They only move energy around.
 *
 * Pickup priority:   dropped resources (largest pile first)
 * Delivery priority: spawn → controller container → extensions → towers
 *
 * Controller container is prioritized above extensions because the Warlock
 * Engineer upgrading every tick is worth more than slightly better spawn
 * bodies occasionally. An empty container means the warlock wanders and
 * wastes ticks — extensions being slightly less than full costs almost nothing
 * since spawns are infrequent relative to upgrade cycles.
 *
 * Haulers also pick up from tombstones and ruins to recover lost energy.
 *
 * State toggle (memory.delivering):
 *   false = gathering (until store is full)
 *   true  = delivering (until store is completely empty)
 *
 * The delivering flag ensures haulers don't flip back to gathering when
 * partially full after a deliver — e.g. spawn takes 50% and hauler still
 * has energy left. It stays in delivery mode and finds the next consumer
 * rather than heading back to pick up more.
 *
 * All movement routed through Traffic.requestMove — no direct moveTo calls.
 */

const Traffic = require('traffic');

Creep.prototype.runHauler = function () {

  // --- State Toggle ---
  // Only start delivering when full, only start gathering when completely empty.
  // This prevents the partial-load bug where hauler flips back to gathering
  // after spawn takes less than a full load.
  if (this.store.getFreeCapacity() === 0) {
    this.memory.delivering = true;
  }
  if (this.store[RESOURCE_ENERGY] === 0) {
    this.memory.delivering = false;
  }

  // --- Delivery Phase ---
  if (this.memory.delivering) {

    // Priority 1: Spawn — must stay fed so the director can spawn reinforcements
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
      }
      return;
    }

    // Priority 2: Controller container — feeds the Warlock Engineer
    // Prioritized above extensions: the warlock upgrading every tick gives
    // more value than keeping extensions topped up between infrequent spawns.
    const controllerContainer = this.pos.findClosestByPath(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(this.room.controller, 3) &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (controllerContainer) {
      if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, controllerContainer);
      }
      return;
    }

    // Priority 3: Extensions (fill any that aren't full)
    const extension = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (extension) {
      if (this.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, extension);
      }
      return;
    }

    // Priority 4: Towers (keep them loaded for defense)
    const tower = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (tower) {
      if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, tower);
      }
      return;
    }

    // Everything is full — drop delivering flag and go gather more.
    // Prevents hauler freezing when all consumers are satisfied.
    this.memory.delivering = false;
    return;
  }

  // --- Gathering Phase ---

  // Check tombstones first — free energy, recover losses
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

  // Pick up the largest dropped pile
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Nothing to pick up — wait near the source so we're in position
  // when the miner drops more
  const sources = this.room.find(FIND_SOURCES);
  if (sources.length) {
    const target = this.pos.findClosestByPath(sources);
    Traffic.requestMove(this, target, { range: 2 });
  }
};