/**
 * rat.warlock.js
 *
 * Warlock Engineer behavior — sits on the controller container and upgrades forever.
 * The highest-caste specialist in the warren. Never leaves its tile once seated.
 *
 * Core philosophy:
 *   A 6 WORK warlock sitting still waiting for a thrall is worth far more
 *   than that same warlock spending 20 ticks walking to a dropped pile and back.
 *   Once a container exists, the warlock is ANCHORED. It does not roam.
 *   The thrall pipeline exists precisely to feed it.
 *
 * Behavior when container EXISTS (normal operation):
 *   1. Move to container tile (once, on spawn)
 *   2. Withdraw from container when it has energy
 *   3. Upgrade when holding energy
 *   4. Pin and wait when container is empty — do NOT leave
 *   The warlock never leaves this tile for any reason.
 *
 * Behavior when NO container exists (early RCL2):
 *   Hunt dropped energy across the whole room.
 *   Hunt tombstones across the whole room.
 *   Upgrade when holding energy.
 *   Move toward controller when idle.
 *   This phase ends permanently once the container is built.
 *
 * Dire emergency spawn tap:
 *   Only fires when NO container exists AND spawn has > 280 stored.
 *   Once a container exists this branch is never reached.
 *
 * All movement routed through Traffic.requestMove / Traffic.pin.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.container.controller.js

Creep.prototype.runWarlock = function () {

  // --- Find container (if built) ---
  const container = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  })[0];

  // =========================================================================
  // ANCHORED MODE — container exists
  // The warlock never leaves this tile. Withdraw, upgrade, wait. That's all.
  // =========================================================================
  if (container) {

    // Not on container tile yet — walk there once
    if (!this.pos.isEqualTo(container.pos)) {
      Traffic.requestMove(this, container.pos, { range: 0 });
      return;
    }

    // Seated on container tile — pin permanently
    Traffic.pin(this);

    // Upgrade if holding energy
    if (this.store[RESOURCE_ENERGY] > 0) {
      this.upgradeController(this.room.controller);
      return;
    }

    // Withdraw if container has energy
    if (container.store[RESOURCE_ENERGY] > 0) {
      this.withdraw(container, RESOURCE_ENERGY);
      return;
    }

    // Container empty — sit and wait. Thrall is coming.
    // Pin is already registered above. Nothing else to do.
    return;
  }

  // =========================================================================
  // ROAMING MODE — no container yet (early RCL2)
  // Hunt energy across the whole room until the container is built.
  // =========================================================================

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

  // --- Gathering Phase (roaming, no container) ---

  // Dropped energy — whole room
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Tombstones — whole room
  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: t => t.store[RESOURCE_ENERGY] > 0
  })[0];

  if (tombstone) {
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Dire emergency spawn tap — no container, spawn essentially full
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 280) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, spawn);
    }
    return;
  }

  // Nothing available — wait near controller
  if (this.room.controller) {
    Traffic.requestMove(this, this.room.controller, { range: 3 });
  }
};