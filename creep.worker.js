Creep.prototype.runWorker = function () {

  // If empty, go get energy from spawn
  if (this.store[RESOURCE_ENERGY] === 0) {
    const spawn = this.room.find(FIND_MY_SPAWNS)[0];

    if (spawn.store[RESOURCE_ENERGY] > 0) {
      if (this.withdraw(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(spawn);
      }
    }
    return;
  }

  // Has energy → do job
  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
