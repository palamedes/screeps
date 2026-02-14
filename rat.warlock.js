/**
 * rat.warlock.js
 *
 * Warlock Engineer behavior — sits at the controller and upgrades forever.
 * The highest-caste specialist in the warren. Never leaves. Never does anything
 * else. Channels warp energy directly into the warren's growth.
 *
 * Energy source priority:
 *   1. Controller container (primary — hauler keeps it stocked)
 *   2. Dropped energy near controller (fallback if container isn't built yet)
 *   3. Withdraw from spawn if desperate (last resort, never starve the spawn)
 *
 * The warlock bypasses the job board entirely. Its assignment is permanent —
 * it claimed the controller on spawn and will upgrade it until it dies.
 * Same pattern as rat.miner.js.
 *
 * State toggle (memory.working):
 *   false = gathering energy
 *   true  = upgrading controller
 */

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
    if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
      this.moveTo(this.room.controller, { range: 3, visualizePathStyle: {}, ignoreCreeps: true });
    }
    return;
  }

  // --- Gathering Phase ---

  // Priority 1: Controller container — the dedicated supply line
  const container = this.pos.findClosestByPath(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, 3) &&
      s.store[RESOURCE_ENERGY] > 0
  });

  if (container) {
    if (this.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(container, { range: 1, visualizePathStyle: {}, ignoreCreeps: true });
    }
    return;
  }

  // Priority 2: Dropped energy near the controller
  // Handles the window before the container is built or while hauler is en route
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r =>
      r.resourceType === RESOURCE_ENERGY &&
      r.pos.inRangeTo(this.room.controller, 5)
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      this.moveTo(dropped, { visualizePathStyle: {}, ignoreCreeps: true });
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
      this.moveTo(tombstone, { visualizePathStyle: {}, ignoreCreeps: true });
    }
    return;
  }

  // Priority 4: Last resort — withdraw from spawn if it has a strong surplus
  // Never starve the spawn. Only touch it if it's well above spawning threshold.
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store[RESOURCE_ENERGY] > 250) {
    if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn, { visualizePathStyle: {}, ignoreCreeps: true });
    }
    return;
  }

  // Nothing available — move to controller and wait in position
  // so we're ready the moment the hauler delivers
  if (this.room.controller) {
    this.moveTo(this.room.controller, { range: 3, visualizePathStyle: {}, ignoreCreeps: true });
  }
};