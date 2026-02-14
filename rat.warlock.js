/**
 * rat.warlock.js
 *
 * Warlock Engineer behavior — sits on the controller container and upgrades forever.
 * The highest-caste specialist in the warren. Never leaves its tile.
 *
 * Position strategy:
 *   The warlock targets the controller container tile and stands ON it.
 *   From that tile it can:
 *     - Withdraw from the container (range 0 satisfies withdraw's range-1 requirement)
 *     - Upgrade the controller (container is always placed within range 3 of controller)
 *   This means zero travel between refueling and upgrading — the warlock
 *   never moves once it reaches the container.
 *
 * State toggle (memory.working):
 *   false = empty, need to withdraw from container
 *   true  = full, upgrading controller
 *
 * Fallback energy sources (if container not yet built or empty):
 *   1. Dropped energy near controller
 *   2. Tombstones near controller
 *   3. Spawn surplus (last resort, >250 only)
 *
 * The warlock bypasses the job board entirely — same pattern as rat.miner.js.
 * All movement routed through Traffic.requestMove / Traffic.pin.
 */

const Traffic = require('traffic');

// Must match plan.containers.js placement range
const CONTROLLER_CONTAINER_RANGE = 3;

Creep.prototype.runWarlock = function () {

  // --- Energy State Toggle ---
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
  }
  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // --- Find controller container ---
  // Look for it every tick (it could be built mid-life).
  // If found, the container tile IS our permanent position.
  const container = this.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  });

  // --- Spending Phase ---
  if (this.memory.working) {
    const result = this.upgradeController(this.room.controller);

    if (result === ERR_NOT_IN_RANGE) {
      // Not at controller yet — move toward it
      Traffic.requestMove(this, this.room.controller, { range: 3 });
    } else {
      // Upgrading — pin our tile so nobody routes through us
      Traffic.pin(this);
    }
    return;
  }

  // --- Gathering Phase ---

  // Priority 1: Container — stand on it and withdraw.
  // Moving TO the container tile (range 0) means we withdraw and upgrade
  // from the same spot with no travel between the two actions.
  if (container) {
    if (!this.pos.isEqualTo(container.pos)) {
      // Not on the container yet — walk to it
      Traffic.requestMove(this, container.pos, { range: 0 });
      return;
    }

    // Standing on the container — withdraw directly
    const result = this.withdraw(container, RESOURCE_ENERGY);
    if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES) {
      // Either withdrew successfully or container is empty — pin and wait
      Traffic.pin(this);
    }
    return;
  }

  // Priority 2: Dropped energy near controller
  // Handles the window before the container is built or while hauler is en route
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r =>
      r.resourceType === RESOURCE_ENERGY &&
      r.pos.inRangeTo(this.room.controller, 5)
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Priority 3: Tombstones near controller
  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: t =>
      t.store[RESOURCE_ENERGY] > 0 &&
      t.pos.inRangeTo(this.room.controller, 5)
  })[0];

  if (tombstone) {
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Priority 4: Last resort — spawn surplus only
  // Never starve the spawn. Only touch it if well above spawning threshold.
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 250) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, spawn);
    }
    return;
  }

  // Nothing available — move to controller and wait in position
  if (container) {
    Traffic.requestMove(this, container.pos, { range: 0 });
  } else if (this.room.controller) {
    Traffic.requestMove(this, this.room.controller, { range: 3 });
  }
};