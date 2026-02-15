/**
 * rat.warlock.js
 *
 * Warlock Engineer behavior — sits on the controller container and upgrades forever.
 * The highest-caste specialist in the warren. Never leaves its tile once seated.
 *
 * Position strategy:
 *   The warlock targets the controller container tile and stands ON it.
 *   From that tile it can:
 *     - Withdraw from the container (range 0 satisfies withdraw's range-1 requirement)
 *     - Upgrade the controller (container is always placed within range 3 of controller)
 *   Zero travel between refueling and upgrading once seated.
 *
 * Energy gathering priority:
 *   1. Controller container (stand on it, withdraw directly)
 *   2. Dropped energy — near controller if container exists, whole room if not.
 *      Early RCL2 has no container yet and miners drop at source tiles, so
 *      restricting search to controller range 5 means the warlock sees nothing.
 *   3. Tombstones — same radius logic as dropped energy
 *   4. Spawn surplus (last resort, >150 only)
 *
 * KEY FIX 1: Empty container falls through immediately to other sources.
 * KEY FIX 2: Dropped/tombstone search covers whole room when no container exists.
 * KEY FIX 3: "Spend what you have" fallback — if gathering finds nothing but the
 *   warlock is holding any energy, flip to working rather than idling. The old code
 *   only flipped to working when completely full, so partial pickups caused the
 *   warlock to sit idle with energy in store.
 *
 * All movement routed through Traffic.requestMove / Traffic.pin.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.containers.js

Creep.prototype.runWarlock = function () {

  // --- Energy State Toggle ---
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
  }
  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // --- Spending Phase ---
  if (this.memory.working) {
    const result = this.upgradeController(this.room.controller);

    if (result === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, this.room.controller, { range: 3 });
    } else {
      Traffic.pin(this);
    }
    return;
  }

  // --- Gathering Phase ---
  // Use room.find for the container — do NOT use findClosestByPath.
  const container = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  })[0];

  // Priority 1: Container exists AND has energy — stand on it and withdraw.
  // Explicitly check store amount before committing to walk there.
  if (container && container.store[RESOURCE_ENERGY] > 0) {
    if (this.pos.isEqualTo(container.pos)) {
      this.withdraw(container, RESOURCE_ENERGY);
      Traffic.pin(this);
    } else {
      Traffic.requestMove(this, container.pos, { range: 0 });
    }
    return;
  }

  // Priority 2: Dropped energy.
  // If a container exists, stay near the controller (hauler is en route).
  // If NO container exists yet (early RCL2), search the whole room —
  // miners are dropping at source tiles which may be far from the controller.
  const droppedFilter = container
    ? r => r.resourceType === RESOURCE_ENERGY && r.pos.inRangeTo(this.room.controller, 8)
    : r => r.resourceType === RESOURCE_ENERGY;

  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: droppedFilter
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Priority 3: Tombstones — same radius logic as dropped energy.
  const tombstoneFilter = container
    ? t => t.store[RESOURCE_ENERGY] > 0 && t.pos.inRangeTo(this.room.controller, 8)
    : t => t.store[RESOURCE_ENERGY] > 0;

  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: tombstoneFilter
  })[0];

  if (tombstone) {
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Priority 4: Spawn surplus — last resort only.
  // Threshold lowered to 150: early RCL2 spawn rarely holds much surplus,
  // but we still don't want to starve the spawn of its spawn-cost buffer.
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 150) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, spawn);
    }
    return;
  }

  // --- Spend partial load rather than idling ---
  // If we've exhausted all gather options but are holding any energy,
  // flip to working and spend it. The old code only flipped on getFreeCapacity() === 0,
  // so partial pickups (e.g. 40/100) left the warlock idle with energy in store.
  if (this.store[RESOURCE_ENERGY] > 0) {
    this.memory.working = true;
    return;
  }

  // Truly nothing available — hold position at container if built,
  // otherwise wait near controller to be ready when hauler arrives.
  if (container) {
    if (!this.pos.isEqualTo(container.pos)) {
      Traffic.requestMove(this, container.pos, { range: 0 });
    } else {
      Traffic.pin(this);
    }
  } else if (this.room.controller) {
    Traffic.requestMove(this, this.room.controller, { range: 3 });
  }
};