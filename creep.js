const JobBoard = require('job.board');

Creep.prototype.tick = function () {

  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};

Creep.prototype.findJob = function () {
  return JobBoard.assignJob(this);
};

Creep.prototype.runJob = function () {

  const job = this.memory.job;
  const target = Game.getObjectById(job.targetId);

  if (!target) {
    this.memory.job = null;
    return;
  }

  switch (job.type) {
    case 'HARVEST':
      this.runWorkerCycle(target);
      break;

    case 'UPGRADE':
      if (this.upgradeController(target) === ERR_NOT_IN_RANGE) {
        this.moveTo(target);
      }
      break;

    case 'BUILD':
      if (this.build(target) === ERR_NOT_IN_RANGE) {
        this.moveTo(target);
      }
      break;
  }

  // Clear job if action completed
  if (job.type === 'BUILD' && target.progress === target.progressTotal) {
    this.memory.job = null;
  }
};

Creep.prototype.runWorkerCycle = function(source) {

  // State switching
  if (this.memory.working && this.store[RESOURCE_ENERGY] === 0) {
    this.memory.working = false;
  }

  if (!this.memory.working && this.store.getFreeCapacity() === 0) {
    this.memory.working = true;
  }

  // Harvest mode
  if (!this.memory.working) {
    if (this.harvest(source) === ERR_NOT_IN_RANGE) {
      this.moveTo(source);
    }
    return;
  }

  // Working mode
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];

  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn);
    }
    return;
  }

  if (this.upgradeController(this.room.controller) === ERR_NOT_IN_RANGE) {
    this.moveTo(this.room.controller);
  }
};


