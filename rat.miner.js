/**
 * rat.miner.js
 *
 * Miner behavior — claims a source and harvests it forever.
 * Once seated on the source, pins its tile every tick so the traffic
 * manager knows this tile is permanently occupied.
 */

const Traffic = require('traffic');

Creep.prototype.runMiner = function () {

  // --- Source Assignment ---
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

  // --- Harvest or Move ---
  if (this.harvest(source) === ERR_NOT_IN_RANGE) {
    // Still travelling to source — request move via traffic manager
    Traffic.requestMove(this, source);
  } else {
    // Seated on source — pin this tile so nobody routes through us
    Traffic.pin(this);
  }
};