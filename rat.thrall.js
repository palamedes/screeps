/**
 * rat.thrall.js
 *
 * Thrall behavior — picks up dropped energy and delivers it to consumers.
 * Thralls are bound servants of the warren: no fighting, no building, pure transport.
 * They have no WORK parts. They only move energy around.
 *
 * Pickup priority:   tombstones → ruins → dropped pile (largest first)
 * Delivery priority: spawn → extensions → controller container → towers
 *
 * Extensions are prioritized above the controller container because they
 * directly determine spawn body quality. Empty extensions = every replacement
 * creep spawns at minimum body regardless of capacity.
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

const CONTROLLER_CONTAINER_RANGE = 3; // must match plan.containers.js

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

    // Priority 2: Extensions — fill before container.
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

    // Priority 3: Controller container.
    // Use room.find — do NOT use findClosestByPath (fails silently on congested paths).
    const controllerContainer = this.room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE) &&
        s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    })[0];

    if (controllerContainer) {
      if (this.transfer(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, controllerContainer);
      }
      return;
    }

    // Priority 4: Towers
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

  // Largest dropped pile
  const dropped = this.room.find(FIND_DROPPED_RESOURCES, {
    filter: r => r.resourceType === RESOURCE_ENERGY
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Nothing to pick up — wait near closest source
  const sources = this.room.find(FIND_SOURCES);
  if (sources.length) {
    const target = this.pos.findClosestByRange(sources);
    Traffic.requestMove(this, target, { range: 2 });
  }
};