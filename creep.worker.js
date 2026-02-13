Creep.prototype.runWorker = function () {

  const sources = this.room.find(FIND_SOURCES);
  const spawn = this.room.find(FIND_MY_SPAWNS)[0];

  const miners = Object.values(Game.creeps)
    .filter(c =>
      c.room.name === this.room.name &&
      c.memory.role === 'miner'
    );

  const emergency = miners.length < sources.length;

  // --- Emergency Recovery Mode ---
  if (emergency) {

    if (this.store[RESOURCE_ENERGY] === 0) {
      const source = this.pos.findClosestByPath(FIND_SOURCES);
      if (this.harvest(source) === ERR_NOT_IN_RANGE) {
        this.moveTo(source);
      }
      return;
    }

    if (spawn) {
      if (this.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        this.moveTo(spawn);
      }
    }

    return;
  }

  // --- Normal Worker Behavior ---

  if (this.store[RESOURCE_ENERGY] === 0) {
    if (!this.memory.job) {
      this.memory.job = this.findJob();
    }

    if (this.memory.job) {
      this.runJob();
    }

    return;
  }

  if (!this.memory.job) {
    this.memory.job = this.findJob();
  }

  if (this.memory.job) {
    this.runJob();
  }
};
