/**
 * rat.thrall.js
 *
 * Thrall behavior — picks up dropped energy and delivers it to consumers.
 * Thralls are bound servants of the warren: no fighting, no building, pure transport.
 * They have no WORK parts. They only move energy around.
 *
 * Pickup priority:   tombstones → ruins → dropped pile (largest first) → source containers
 * Delivery priority: spawn → extensions → towers → controller container
 *
 * CRITICAL FIX: Towers moved ahead of controller container.
 * The controller container is an infinite sink when the warlock is anchored
 * and actively upgrading. If thralls prioritize it, they get stuck in a loop
 * filling the container while the warlock drains it, starving the tower.
 * An empty tower is a 5000-energy paperweight that can't attack or repair.
 * The warlock can wait 5 extra ticks for the next thrall cycle.
 *
 * Extensions are prioritized above towers because they directly determine
 * spawn body quality. Empty extensions = every replacement creep spawns at
 * minimum body regardless of capacity.
 *
 * Source containers are the LAST resort in gathering — they're the steady-state
 * buffer that never decays. Tombstones and dropped piles are lossy and must be
 * collected first to avoid waste.
 *
 * KEY FIX: All consumer lookups now use room.find instead of findClosestByPath.
 * findClosestByPath returns null silently when the room is congested and it
 * cannot calculate a path to the target. This caused the thrall to think
 * "no container found" and skip delivery entirely — the container was there,
 * but findClosestByPath gave up and returned null.
 * room.find always returns the object if it exists. The traffic manager
 * handles all actual pathing — thrall just needs the target reference.
 *
 * State toggle (memory.delivering):
 *   false = gathering (until store is full)
 *   true  = delivering (until store is completely empty)
 *
 * All movement routed through Traffic.requestMove — no direct moveTo calls.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.container.controller.js

Creep.prototype.runThrall = function () {

  // --- State Toggle ---
  if (this.store.getFreeCapacity() === 0) {
    this.memory.delivering = true;
  }
  if (this.store[RESOURCE_ENERGY] === 0) {
    this.memory.delivering = false;
  }

  // --- Delivery Phase ---
  if (this.memory.delivering) {

    // Priority 1: Spawn
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
      }
      return;
    }

    // Priority 2: Extensions — fill before towers and controller container.
    // Use room.find + filter, pick closest by range (no pathfinding needed
    // for selection — traffic handles the actual path).
    const extensions = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_EXTENSION &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (extensions.length > 0) {
      const extension = this.pos.findClosestByRange(extensions);
      if (this.transfer(extension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, extension);
      }
      return;
    }

    // Priority 3: Towers (MOVED UP from priority 4)
    // An empty tower is a 5000-energy paperweight. Defense and repair
    // infrastructure must stay powered. The warlock can wait.
    const towers = this.room.find(FIND_MY_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_TOWER &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });

    if (towers.length > 0) {
      const tower = this.pos.findClosestByRange(towers);
      if (this.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, tower);
      }
      return;
    }

    // Priority 4: Controller container (MOVED DOWN from priority 3)
    // Only fill when below 50% AND warlock isn't actively draining it.
    // This prevents the infinite sink problem where thralls endlessly
    // feed the container while the warlock drains it continuously.
    // Use room.find — do NOT use findClosestByPath (fails silently on congested paths).
    const controllerContainer = this.room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE)
    })[0];

    if (controllerContainer) {
      const energyPct = controllerContainer.store[RESOURCE_ENERGY] /
        controllerContainer.store.getCapacity(RESOURCE_ENERGY);

      // Check if warlock is nearby and actively using the container
      const warlock = this.room.find(FIND_MY_CREEPS, {
        filter: c => c.memory.role === 'warlock'
      })[0];

      const warlockActive = warlock &&
        warlock.pos.getRangeTo(controllerContainer) <= 1 &&
        warlock.store[RESOURCE_ENERGY] < warlock.store.getCapacity(RESOURCE_ENERGY);

      // Fill when container is low (<50%), UNLESS warlock is actively draining a fuller container
      // If container is empty or very low, ALWAYS fill regardless of warlock
      const shouldFill = energyPct < 0.5 || (energyPct < 0.8 && !warlockActive);

      if (shouldFill && controllerContainer.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, controllerContainer);
        }
        return;
      }
    }

    // Everything full — return to gathering
    this.memory.delivering = false;
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
    filter: r => r.resourceType === RESOURCE_ENERGY
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Source containers — steady-state buffer, no decay.
  // Only withdraw when all lossy sources (tombstones, drops) are dry.
  const sources = this.room.find(FIND_SOURCES);
  const sourceContainers = this.room.find(FIND_STRUCTURES, {
    filter: s =>
      s.structureType === STRUCTURE_CONTAINER &&
      sources.some(src => s.pos.inRangeTo(src, 2)) &&
      s.store[RESOURCE_ENERGY] > 0
  });

  if (sourceContainers.length > 0) {
    // Prefer fullest container, but if they're close in fill level, prefer closest
    // This prevents uneven draining where everyone goes to the nearest one
    sourceContainers.sort((a, b) => {
      const aFill = a.store[RESOURCE_ENERGY] / a.store.getCapacity(RESOURCE_ENERGY);
      const bFill = b.store[RESOURCE_ENERGY] / b.store.getCapacity(RESOURCE_ENERGY);

      // If one is significantly fuller (>20% difference), prefer the fuller one
      if (Math.abs(aFill - bFill) > 0.2) {
        return bFill - aFill;  // Sort descending by fill ratio
      }

      // Otherwise prefer closest
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