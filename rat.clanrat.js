/**
 * rat.clanrat.js
 *
 * Clanrat behavior — builds construction sites and upgrades the controller.
 * The backbone rank-and-file of the warren. Does the actual work of expanding.
 *
 * Clanrats do NOT harvest. They pick up dropped energy then spend it.
 *
 * All consumer/source lookups use room.find + findClosestByRange.
 * findClosestByPath is banned — it silently returns null on congested paths.
 */

const Traffic = require('traffic');

const CONTROLLER_CONTAINER_RANGE  = 3;
const CLANRAT_CONTAINER_USE_RANGE = 5;

Creep.prototype.runClanrat = function () {

  const sources = this.room.find(FIND_SOURCES);

  const miners = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.memory.homeRoom &&
    c.memory.role === 'miner'
  );

  // --- Emergency Recovery Mode ---
  if (miners.length < sources.length) {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];

    if (this.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      // Use room.find + findClosestByRange — NOT findClosestByPath
      const source = this.pos.findClosestByRange(sources);
      if (source) {
        if (this.harvest(source) === ERR_NOT_IN_RANGE) {
          Traffic.requestMove(this, source);
        }
      }
      return;
    }

    if (spawn) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
      }
    }
    return;
  }

  // --- Energy State Toggle ---
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
    this.memory.job = null;
  }

  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // --- Job Validation ---
  if (this.memory.job && this.memory.job.type === 'HARVEST') {
    this.memory.job = null;
  }

  // --- Spending Phase ---
  if (this.memory.working) {
    if (!this.memory.job) {
      this.memory.job = this.findJob();
    }

    if (this.memory.job) {
      this.runJob();
    } else {
      if (this.room.controller) {
        Traffic.requestMove(this, this.room.controller, { range: 3 });
      }
    }
    return;
  }

  // --- Gathering Phase ---

  // If near the controller, prefer the controller container.
  // Use room.find + findClosestByRange — NOT findClosestByPath.
  if (this.room.controller &&
    this.pos.inRangeTo(this.room.controller, CLANRAT_CONTAINER_USE_RANGE)) {

    const containers = this.room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(this.room.controller, CONTROLLER_CONTAINER_RANGE) &&
        s.store[RESOURCE_ENERGY] > 0
    });

    const controllerContainer = this.pos.findClosestByRange(containers);

    if (controllerContainer) {
      if (this.withdraw(controllerContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, controllerContainer);
      }
      return;
    }
  }

  // Tombstones
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
    filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 50
  }).sort((a, b) => b.amount - a.amount)[0];

  if (dropped) {
    if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, dropped);
    }
    return;
  }

  // Partial load — spend what we have rather than idling
  if (this.store[RESOURCE_ENERGY] > 0) {
    this.memory.working = true;
    return;
  }

  // Nothing available — wait near closest source.
  // Use room.find + findClosestByRange — NOT findClosestByPath.
  const source = this.pos.findClosestByRange(sources);
  if (source) {
    Traffic.requestMove(this, source, { range: 2 });
  }
};