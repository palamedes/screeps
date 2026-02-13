Creep.prototype.runMiner = function () {

  if (!this.memory.sourceId) {
    const sources = this.room.find(FIND_SOURCES);

    for (const source of sources) {
      const minersOnSource = Object.values(Game.creeps).filter(c =>
        c.memory.role === 'miner' &&
        c.memory.sourceId === source.id
      );

      if (minersOnSource.length === 0) {
        this.memory.sourceId = source.id;
        break;
      }
    }
  }

  const source = Game.getObjectById(this.memory.sourceId);

  if (!source) return;

  if (this.harvest(source) === ERR_NOT_IN_RANGE) {
    this.moveTo(source);
  }
};
