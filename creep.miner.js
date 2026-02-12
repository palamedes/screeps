Creep.prototype.runMiner = function () {
  if (!this.memory.sourceId) {
    const sources = this.room.find(FIND_SOURCES);
    this.memory.sourceId = sources[0].id;
  }

  const source = Game.getObjectById(this.memory.sourceId);

  if (this.harvest(source) === ERR_NOT_IN_RANGE) {
    this.moveTo(source);
  }
};
