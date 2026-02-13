/**
 * rat.slave.js
 *
 * Slave behavior — RCL1 bootstrap generalist.
 * The lowest caste of the Skaven horde. Cheap, dumb, expendable.
 *
 * Slaves bypass the job board entirely. At RCL1 the economy is too fragile
 * to rely on job assignment — they just run a hardcoded two-phase loop:
 *   gathering phase: harvest from nearest source until full
 *   spending phase:  fill spawn first, then upgrade controller
 *
 * Spending priority:
 *   1. Spawn (must stay fed so the director can spawn more rats)
 *   2. Controller (upgrading gets us to RCL2 and unlocks specialist roles)
 *
 * Promotion:
 *   When the warren reaches RCL2, slaves are immediately promoted to worker.
 *   All slave-specific memory is cleared on promotion so the worker
 *   starts with a clean slate.
 */

Creep.prototype.runSlave = function () {

  // --- Promotion Check ---
  // As soon as RCL2 is reached, this slave becomes a worker.
  // The spawn director will stop making slaves and start making miners/haulers/workers.
  if (this.room.controller && this.room.controller.level >= 2) {
    this.memory.role = 'worker';
    delete this.memory.job;
    delete this.memory.working;
    delete this.memory.sourceId;
    console.log(`[warren:${this.room.name}] slave ${this.name} promoted to worker`);
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

    // Priority 1: Keep the spawn fed so the director can spawn reinforcements
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];
    if (spawn && spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(spawn, { visualizePathStyle: {} });
      }
      return;
    }

    // Priority 2: Upgrade the controller — getting to RCL2 is the entire goal
    if (this.room.controller) {
      if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
        this.moveTo(this.room.controller, { visualizePathStyle: {} });
      }
    }

    return;
  }

  // --- Gathering Phase ---
  const source = this.pos.findClosestByPath(FIND_SOURCES);
  if (source) {
    if (this.harvest(source) === ERR_NOT_IN_RANGE) {
      this.moveTo(source, { visualizePathStyle: {} });
    }
  }
};