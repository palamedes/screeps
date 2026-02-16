/**
 * rat.slave.js
 *
 * Slave behavior — RCL1 bootstrap generalist.
 * Hardcoded two-phase loop: harvest → fill spawn → upgrade controller.
 *
 * Promotes to 'clanrat' at RCL2. Any existing 'worker' creeps are handled
 * by the rat.js backward-compat alias so they run clanrat logic until natural death.
 *
 * All source lookups use room.find + findClosestByRange.
 * findClosestByPath is banned — silently returns null on congested paths.
 */

const Traffic = require('traffic');

Creep.prototype.runSlave = function () {

  // --- Promotion Check ---
  if (this.room.controller && this.room.controller.level >= 2) {
    this.memory.role = 'clanrat'; // ← was 'worker', now correctly 'clanrat'
    delete this.memory.job;
    delete this.memory.working;
    delete this.memory.sourceId;
    console.log(`[warren:${this.room.name}] slave ${this.name} promoted to clanrat`);
    return;
  }

  // --- Energy State Toggle ---
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
  }
  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // --- Spending Phase ---
  if (this.memory.working) {

    // Priority 1: Keep spawn fed
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, spawn);
      }
      return;
    }

    // Priority 2: Upgrade to RCL2
    if (this.room.controller) {
      if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
        Traffic.requestMove(this, this.room.controller, { range: 3 });
      }
    }

    return;
  }

  // --- Gathering Phase ---
  // Use room.find + findClosestByRange — NOT findClosestByPath
  const sources = this.room.find(FIND_SOURCES);
  const source  = this.pos.findClosestByRange(sources);
  if (source) {
    if (this.harvest(source) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, source);
    }
  }
};