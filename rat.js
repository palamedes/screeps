require('rat.worker');
require('rat.miner');
require('rat.hauler');
require('rat.slave');

const JobBoard = require('job.board');

Creep.prototype.tick = function () {
  switch (this.memory.role) {
    case 'miner': return this.runMiner();
    case 'hauler': return this.runHauler();
    case 'worker': return this.runWorker();
    case 'slave': return this.runSlave();
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
};
