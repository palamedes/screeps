/**
 * rat.miner.js
 *
 * Miner behavior — claims a source and harvests it forever.
 * Once seated on the source, pins its tile every tick so the traffic
 * manager knows this tile is permanently occupied.
 *
 * Movement decision is based on explicit range check, NOT harvest() return code.
 * The old pattern (else-pin on any non-ERR_NOT_IN_RANGE result) caused miners
 * to self-pin on transient errors (source cooldown, ERR_TIRED, etc.) and
 * stop moving entirely. Explicit range check is unambiguous:
 *   adjacent  → harvest + pin
 *   not adjacent → move
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
  // Use explicit range check rather than relying on harvest()'s return code.
  // harvest() can return non-ERR_NOT_IN_RANGE codes (cooldown, fatigue, etc.)
  // that would cause the old else-pin pattern to freeze the miner in place.
  if (this.pos.inRangeTo(source, 1)) {
    // Seated on source — harvest whatever the result, pin this tile
    this.harvest(source);
    Traffic.pin(this);
  } else {
    // Not there yet — request move via traffic manager
    Traffic.requestMove(this, source);
  }
};