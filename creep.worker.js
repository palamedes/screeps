Creep.prototype.runWorker = function () {

  const sources = this.room.find(FIND_SOURCES);
  const miners = Object.values(Game.creeps)
    .filter(c =>
      c.room.name === this.room.name &&
      c.memory.role === 'miner'
    );

  // --- If empty ---
  if (this.store[RESOURCE_ENERGY] === 0) {

    // Fallback: no miners → harvest directly
    if (miners.length < sources.length) {
      const source = this.pos.findClosestByPath(FIND_SOURCES);
      if (this.harvest(source) === ERR_NOT_IN_RANGE) {
        this.moveTo(source);
      }
      return;
    }

    // Otherwise use job system
    if (!this.memory.job) {
      this.memory.job = this.findJob();
    }

    if (this.memory.job) {
      this.runJob();
    }

    return;
  }

  // --- Has energy → perform job ---
  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
