Creep.prototype.tick = function () {

  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};

Creep.prototype.findJob = function () {
  const jobs = Memory.rooms[this.room.name].jobs;
  if (!jobs || jobs.length === 0) return null;

  return jobs[0]; // naive for now
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
};
