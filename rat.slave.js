Creep.prototype.runSlave = function () {

  if (this.room.controller.level >= 2) {
    this.memory.role = 'worker';

    // FULL reset of slave-specific state
    delete this.memory.job;
    delete this.memory.working;
    delete this.memory.sourceId;

    return;
  }

  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
