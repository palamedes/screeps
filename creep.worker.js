Creep.prototype.runWorker = function () {

  if (this.memory.job && this.memory.job.type === 'HARVEST') {
    delete this.memory.job;
  }

  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
