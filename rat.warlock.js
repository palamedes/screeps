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
 *   2. Dropped energy near controller (pre-container window, or while hauler is en route)
 *   3. Tombstones near controller
 *   4. Spawn surplus (last resort, >250 only)
 *
 * KEY FIX: When the container exists but is empty, the warlock must fall through
 * to other energy sources rather than pinning and waiting. ERR_NOT_ENOUGH_RESOURCES
 * from withdraw() means "empty right now" — not "stay put forever."
 *
 * The warlock bypasses the job board entirely — same pattern as rat.miner.js.
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
  // findClosestByPath returns null silently when the room is congested and
  // it can't calculate a path. We want the object reference so the traffic
  // manager can handle the actual pathing. Separating target lookup from
  // pathing is the correct pattern.
  const container = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  })[0];

  // Priority 1: Container exists AND has energy — stand on it and withdraw.
  // Explicitly check store amount before committing to walk there.
  // If container is empty we fall through immediately to other sources
  // rather than walking to it and then discovering it's empty.
  if (container && container.store[RESOURCE_ENERGY] > 0) {
    if (this.pos.isEqualTo(container.pos)) {
      // Already on the container — withdraw directly
      this.withdraw(container, RESOURCE_ENERGY);
      Traffic.pin(this);
    } else {
      Traffic.requestMove(this, container.pos, { range: 0 });
    }
    return;
  }

  // Priority 2: Dropped energy near controller.
  // Handles: pre-container window, hauler en route, container temporarily empty.
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

  // Priority 4: Spawn surplus — last resort only
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 250) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, spawn);
    }
    return;
  }

  // Nothing available anywhere — hold position at container if built,
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