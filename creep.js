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
      if (this.harvest(target) === ERR_NOT_IN_RANGE) {
        this.moveTo(target);
      }
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
