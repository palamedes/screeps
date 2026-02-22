/**
 * rat.slave.js
 *
 * Slave behavior — RCL1 bootstrap generalist.
 * Hardcoded two-phase loop: harvest → fill spawn → upgrade controller.
 *
 * FIX: Slaves now claim a sourceId on first tick, like miners.
 * Without this, all slaves crowd the closest source and ignore the others.
 * Assignment is first-come-first-served: pick any source not already claimed
 * by another alive slave. Falls back to closest if all sources are claimed
 * (e.g. 3 slaves, 2 sources — third just helps on nearest).
 *
 * Promotes to 'clanrat' at RCL2.
 */

const Traffic = require('traffic');

Creep.prototype.runSlave = function () {

  // --- Promotion Check ---
  if (this.room.controller && this.room.controller.level >= 2) {
    this.memory.role = 'clanrat';
    delete this.memory.job;
    delete this.memory.working;
    delete this.memory.sourceId;
    console.log(`[warren:${this.room.name}] slave ${this.name} promoted to clanrat`);
    return;
  }

  // --- Source Assignment ---
  // Claim a source once and stick to it. Prevents all slaves piling on source 0.
  if (!this.memory.sourceId) {
    const sources = this.room.find(FIND_SOURCES);

    // Find sources not already claimed by another living slave
    const claimedIds = Object.values(Game.creeps)
      .filter(c => c.name !== this.name && c.memory.role === 'slave' && c.memory.sourceId)
      .map(c => c.memory.sourceId);

    const unclaimed = sources.filter(s => !claimedIds.includes(s.id));

    if (unclaimed.length > 0) {
      // Pick the unclaimed source closest to this slave
      const target = this.pos.findClosestByRange(unclaimed);
      this.memory.sourceId = target.id;
    } else {
      // All sources claimed — fall back to closest
      const fallback = this.pos.findClosestByRange(sources);
      this.memory.sourceId = fallback ? fallback.id : null;
    }
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
  const source = this.memory.sourceId
    ? Game.getObjectById(this.memory.sourceId)
    : this.pos.findClosestByRange(this.room.find(FIND_SOURCES));

  if (source) {
    if (this.harvest(source) === ERR_NOT_IN_RANGE) {
      Traffic.requestMove(this, source);
    }
  }
};
