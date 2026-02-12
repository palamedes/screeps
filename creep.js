const JobBoard = require('job.board');

Creep.prototype.tick = function() {
  switch (this.memory.role) {
    case 'miner': return this.runMiner();
    case 'hauler': return this.runHauler();
    case 'worker': return this.runWorker();
    case 'slave': return this.runBootstrap();
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


Creep.prototype.runWorker = function () {
  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};

Creep.prototype.runMiner = function () {
  if (!this.memory.sourceId) {
    const sources = this.room.find(FIND_SOURCES);
    this.memory.sourceId = sources[0].id; // later assign properly
  }

  const source = Game.getObjectById(this.memory.sourceId);

  if (this.harvest(source) === ERR_NOT_IN_RANGE) {
    this.moveTo(source);
  }
};

Creep.prototype.runHauler = function () {

  if (this.store.getFreeCapacity() > 0) {
    const dropped = this.pos.findClosestByPath(FIND_DROPPED_RESOURCES);

    if (dropped) {
      if (this.pickup(dropped) === ERR_NOT_IN_RANGE) {
        this.moveTo(dropped);
      }
    }
    return;
  }

  const spawn = this.room.find(FIND_MY_SPAWNS)[0];

  if (spawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
    if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
      this.moveTo(spawn);
    }
  }
};



