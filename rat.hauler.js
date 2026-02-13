/**
 * rat.hauler.js
 *
 * Hauler behavior — picks up dropped energy and delivers it to consumers.
 * Haulers have no WORK parts. They only move energy around.
 *
 * Pickup priority:   dropped resources (largest pile first)
 * Delivery priority: spawn → extensions → towers → (storage, future)
 *
 * Haulers also pick up from tombstones and ruins to recover lost energy.
 */

Creep.prototype.runHauler = function () {

  // --- Gathering Phase ---
  if (this.store.getFreeCapacity() > 0) {

    // Check tombstones first — free energy, recover losses
    const tombstone = this.room.find(FIND_TOMBSTONES, {
      filter: t => t.store[RESOURCE_ENERGY] > 0
    })[0];

    if (tombstone) {
      if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(tombstone, { visualizePathStyle: {} });
      }
      return;
    }

    // Check ruins
    const ruin = this.room.find(FIND_RUINS, {
      filter: r => r.store[RESOURCE_ENERGY] > 0
    })[0];

    if (ruin) {
      if (this.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(ruin, { visualizePathStyle: {} });
      }
      return;
    }

    // Pick up the largest dropped pile
    const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
      filter: r => r.resourceType === RESOURCE_ENERGY
    }).sort((a, b) => b.amount - a.amount)[0];

    if (dropped) {
      if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
        this.moveTo(dropped, { visualizePathStyle: {} });
      }
      return;
    }

    // Nothing to pick up — wait near the source with the most open spots
    // (so we're in position when the miner drops more)
    const sources = this.room.find(FIND_SOURCES);
    if (sources.length) {
      const target = this.pos.findClosestByPath(sources);
      this.moveTo(target, { range: 2, visualizePathStyle: {} });
    }

    return;
  }

  // --- Delivery Phase ---
  // Priority 1: Spawn
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];
  if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn, { visualizePathStyle: {} });
    }
    return;
  }

  // Priority 2: Extensions (fill any that aren't full)
  const extension = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_EXTENSION &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  if (extension) {
    if (this.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(extension, { visualizePathStyle: {} });
    }
    return;
  }

  // Priority 3: Towers (keep them loaded for defense)
  const tower = this.pos.findClosestByPath(FIND_MY_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_TOWER &&
      s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
  });

  if (tower) {
    if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(tower, { visualizePathStyle: {} });
    }
    return;
  }

  // Nothing needs filling — deliver surplus to spawn anyway
  // (this handles edge cases where spawn was full but then spent energy)
  if (spawn) {
    if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn, { visualizePathStyle: {} });
    }
  }
};