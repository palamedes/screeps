Creep.prototype.runSlave = function () {

  // If we are RCL2+, convert to worker
  if (this.room.controller.level >= 2) {
    this.memory.role = 'worker';
    delete this.memory.job;
    return;
  }

  // RCL1 behavior
  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
