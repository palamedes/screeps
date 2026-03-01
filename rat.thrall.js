/**
 * rat.thrall.js
 *
 * Thrall behavior — picks up dropped energy and delivers it to consumers.
 * Thralls are bound servants of the warren: no fighting, no building, pure transport.
 * They have no WORK parts. They only move energy around.
 *
 * Pickup priority:   tombstones → ruins → dropped pile (largest first) → source containers
 *
 * Delivery priority:
 *   1. Spawn
 *   2. Controller container EMPTY — warlock is idle without this. Beats tower top-up.
 *      An empty container means zero upgrade progress every tick until filled.
 *      Towers can sustain from existing charge. A stalled warlock cannot.
 *   3. Tower emergency (<50%) — fill before extensions.
 *      A half-empty tower can't sustain repair or survive a fight.
 *   4. Extensions — determines spawn body quality
 *   5. Towers (normal top-up, already above 50%)
 *   6. Controller container (normal top-up — keep warlock fed once not empty)
 *
 * COMMITTED DELIVERY (fix for mid-trip abandonment):
 *   Once a thrall selects a delivery target it stores the target ID in
 *   memory.deliveryTarget and commits to completing that delivery.
 *   Priority selection only runs when there is no committed target, or when
 *   the committed target is no longer valid (gone, or already full).
 *   This prevents the thrash where two thralls race to the same target,
 *   the first fills it, and the second abandons mid-trip and wastes the journey.
 *
 * TOWER EMERGENCY THRESHOLD: 50% (raised from 20%).
 * A tower at 29% might look "okay" but loses repair/attack capacity for hundreds
 * of ticks during spawn cycles. At 50% threshold, the tower always has enough
 * energy to handle a fight or keep up with rampart repair, even if a large spawn
 * fires immediately after. Extensions can wait one thrall cycle.
 *
 * Source containers are the LAST resort in gathering — they're the steady-state
 * buffer that never decays. Tombstones and dropped piles are lossy and must be
 * collected first to avoid waste.
 *
 * KEY FIX: All consumer lookups use room.find instead of findClosestByPath.
 * findClosestByPath returns null silently when the room is congested.
 * room.find always returns the object if it exists. Traffic handles pathing.
 *
 * State toggle (memory.delivering):
 *   false = gathering (until store is full)
 *   true  = delivering (until store is completely empty)
 *
 * memory.deliveryTarget:
 *   ID of the structure this thrall is committed to delivering to.
 *   Cleared when: store empties, target disappears, or target becomes full.
 *
 * All movement routed through Traffic.requestMove — no direct moveTo calls.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.container.controller.js

// Tower must stay above this fraction or it jumps the extension queue.
const TOWER_EMERGENCY_THRESHOLD = 0.5;

Creep.prototype.runThrall = function () {

  const controllerContainer = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
  })[0];

  // --- State Toggle ---
  if (!this.memory.delivering && this.store.getFreeCapacity() === 0) {
    this.memory.delivering = true;
  }

  if (this.store[RESOURCE_ENERGY] === 0) {
    this.memory.delivering     = false;
    this.memory.deliveryTarget = null; // always clear commitment on empty
  }

  // --- Full But Waiting Check ---
  if (!this.memory.delivering && this.store.getFreeCapacity() === 0) {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    const needsEnergy =
      (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) ||
      this.room.find(FIND_MY_STRUCTURES, {
        filter: s =>
          (s.structureType === STRUCTURE_EXTENSION ||
            s.structureType === STRUCTURE_TOWER) &&
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      }).length > 0;

    if (needsEnergy) {
      this.memory.delivering = true;
    }
  }

  // --- Delivery Phase ---
  if (this.memory.delivering) {

    // --- Committed target: honor an in-progress delivery ---
    // If we already picked a target, drive to completion before re-evaluating.
    // Only abandon if the target no longer exists or is already full.
    if (this.memory.deliveryTarget) {
      const committed = Game.getObjectById(this.memory.deliveryTarget);

      if (committed && committed.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        // Still valid — complete the delivery
        if (this.transfer(committed, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, committed);
        }
        return;
      }

      // Target gone or full — clear and fall through to priority selection
      this.memory.deliveryTarget = null;
    }

    // --- Priority selection (only runs without a committed target) ---

    // Priority 1: Spawn
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      this.memory.deliveryTarget = spawn.id;
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
      }
      return;
    }

    // Priority 2: Controller container EMPTY
    // A warlock staring at an empty container contributes zero upgrade progress
    // every tick it sits idle. Towers can sustain from existing charge for many
    // ticks. Get the warlock fed first.
    if (controllerContainer &&
      controllerContainer.store[RESOURCE_ENERGY] === 0 &&
      controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      this.memory.deliveryTarget = controllerContainer.id;
      if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, controllerContainer);
      }
      return;
    }

    // Priority 3: Tower emergency (<50%)
    // A half-empty tower can't sustain repair or survive a fight.
    const emergencyTowers = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store[RESOURCE_ENERGY] / s.store.getCapacity(RESOURCE_ENERGY) < TOWER_EMERGENCY_THRESHOLD
    });

    if (emergencyTowers.length > 0) {
      const tower = this.pos.findClosestByRange(emergencyTowers);
      this.memory.deliveryTarget = tower.id;
      if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, tower);
      }
      return;
    }

    // Priority 4: Extensions
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (extensions.length > 0) {
      const extension = this.pos.findClosestByRange(extensions);
      this.memory.deliveryTarget = extension.id;
      if (this.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, extension);
      }
      return;
    }

    // Priority 5: Towers (normal top-up, already above 50%)
    const towers = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (towers.length > 0) {
      const tower = this.pos.findClosestByRange(towers);
      this.memory.deliveryTarget = tower.id;
      if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, tower);
      }
      return;
    }

    // Priority 6: Controller container (normal top-up)
    // Keeps the warlock fed between delivery cycles once the container
    // is no longer empty. Fills when below 50%, or below 80% with
    // no warlock actively draining it.
    if (controllerContainer) {
      const energyPct = controllerContainer.store[RESOURCE_ENERGY] /
        controllerContainer.store.getCapacity(RESOURCE_ENERGY);

      const warlock = this.room.find(FIND_MY_CREEPS, {
        filter: c => c.memory.role === 'warlock'
      })[0];

      const warlockActive = warlock &&
        warlock.pos.getRangeTo(controllerContainer) <= 1 &&
        warlock.store[RESOURCE_ENERGY] < warlock.store.getCapacity(RESOURCE_ENERGY);

      const shouldFill = energyPct < 0.5 || (energyPct < 0.8 && !warlockActive);

      if (shouldFill && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        this.memory.deliveryTarget = controllerContainer.id;
        if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, controllerContainer);
        }
        return;
      }
    }

    // Everything full — return to gathering
    this.memory.delivering     = false;
    this.memory.deliveryTarget = null;
    return;
  }

  // --- Gathering Phase ---

  // Tombstones first — free energy, recover losses
  const tombstone = this.room.find(FIND_TOMBSTONES, {
    filter: t => t.store[RESOURCE_ENERGY] > 0
  })[0];

  if (tombstone) {
    if (this.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, tombstone);
    }
    return;
  }

  // Ruins
  const ruin = this.room.find(FIND_RUINS, {
    filter: r => r.store[RESOURCE_ENERGY] > 0
  })[0];

  if (ruin) {
    if (this.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, ruin);
    }
    return;
  }

  // Largest dropped pile — decays if not collected
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => {
      if (r.resourceType !== RESOURCE_ENERGY) return false;
      if (r.amount < 50) return false;
      const dist = this.pos.getRangeTo(r);
      return dist === 0 || (r.amount / dist) >= 2;
    }
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Source containers — steady-state buffer, no decay.
  const sources = this.room.find(FIND_SOURCES);
  const sourceContainers = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      sources.some(src => s.pos.inRangeTo(src, 2)) &&
      s.store[RESOURCE_ENERGY] > 0
  });

  if (sourceContainers.length > 0) {
    sourceContainers.sort((a, b) => {
      const aFill = a.store[RESOURCE_ENERGY] / a.store.getCapacity(RESOURCE_ENERGY);
      const bFill = b.store[RESOURCE_ENERGY] / b.store.getCapacity(RESOURCE_ENERGY);

      if (Math.abs(aFill - bFill) > 0.2) {
        return bFill - aFill;
      }

      return this.pos.getRangeTo(a) - this.pos.getRangeTo(b);
    });

    const container = sourceContainers[0];
    if (this.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, container);
    }
    return;
  }

  // Nothing to pick up — wait near closest source
  if (sources.length) {
    const target = this.pos.findClosestByRange(sources);
    Traffic.requestMove(this, target, { range: 2 });
  }
};