/**
 * rat.miner.js
 *
 * Miner behavior — claims a source seat and harvests it forever.
 * The seat is the optimal standing tile adjacent to the source, calculated
 * once and cached in room.memory.minerSeats by plan.container.source.js.
 * The miner targets this tile always — whether or not a container exists there.
 *
 * Once seated:
 *   - Harvests the source every tick
 *   - Transfers energy into the container beneath it (if built)
 *   - Hard pins its tile so traffic never displaces it
 *
 * Why seat-first rather than source-first?
 *   The miner must stand ON the container tile for energy to flow into it.
 *   Targeting the source directly (range 1) could land the miner on any
 *   adjacent tile. By targeting the seat at range 0, the miner and container
 *   are guaranteed to share the same tile once the container is built.
 *
 * Why transfer every tick rather than waiting for a full store?
 *   With only 1 CARRY part (50 capacity), the store fills in 5 harvest ticks.
 *   Transferring each tick the store has anything keeps energy flowing
 *   continuously into the container. The transfer call is cheap and
 *   silently does nothing when store is empty.
 *
 * Movement decision uses explicit range check, NOT harvest() return code.
 * The old pattern (else-pin on any non-ERR_NOT_IN_RANGE result) caused miners
 * to self-pin on transient errors (source cooldown, ERR_TIRED, etc.) and
 * stop moving entirely. Explicit range check is unambiguous:
 *   on seat    → harvest + transfer + pin
 *   not there  → move toward seat
 *
 * Source assignment: first come, first served by sourceId.
 * Seat assignment:   derived from sourceId via getMinerSeat().
 * Both cached in creep.memory — survive reboots.
 */

require('plan.container.source');

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

  // --- Seat Lookup ---
  // getMinerSeat() calculates and caches the optimal standing tile for this
  // source. Falls back to source position at range 1 if seat unavailable
  // (e.g. spawn not yet built — should never happen in normal operation).
  const seat = this.room.getMinerSeat(this.memory.sourceId);
  if (!seat) {
    // Fallback: no seat cached yet, move toward source normally
    if (!this.pos.inRangeTo(source, 1)) {
      Traffic.requestMove(this, source);
    } else {
      this.harvest(source);
      Traffic.pin(this);
    }
    return;
  }

  // --- Harvest or Move ---
  if (this.pos.x === seat.x && this.pos.y === seat.y) {
    // Seated — harvest, transfer to container, pin tile
    this.harvest(source);

    // Transfer any harvested energy into the container beneath us.
    // silently fails if no container exists yet or store is empty — both fine.
    if (this.store[RESOURCE_ENERGY] > 0) {
      const container = this.room.lookForAt(LOOK_STRUCTURES, seat.x, seat.y)
        .find(s => s.structureType === STRUCTURE_CONTAINER);

      if (container) {
        this.transfer(container, RESOURCE_ENERGY);
      }
    }

    Traffic.pin(this);
  } else {
    // Not at seat yet — request move via traffic manager at range 0
    Traffic.requestMove(this, seat, { range: 0 });
  }
};