Creep.prototype.runSlave = function () {
  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
