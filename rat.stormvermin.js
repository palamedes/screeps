/**
 * rat.stormvermin.js
 *
 * Early game harasser / room defender.
 *
 * Priority:
 *   1. Attack any hostile in the room
 *   2. If no hostiles, patrol between sources to intercept harvesters
 *
 * Body at RCL2 (300 cap): [ATTACK, MOVE, MOVE] = 180e
 *   - 30 damage/tick
 *   - 2 MOVE = full speed on roads/plains even with 1 ATTACK
 *   - Outruns any harvester which typically has equal MOVE to non-MOVE parts
 *
 * Body at RCL3+ scales up automatically via spawn.bodies.js
 *
 * Does NOT use Traffic system — combat creeps need to move freely
 * without being blocked by soft pins or yield logic.
 */

Creep.prototype.runStormvermin = function () {

  // --- Find target: prioritize creeps ON or NEAR sources ---
  const hostiles = this.room.find(FIND_HOSTILE_CREEPS);

  if (hostiles.length === 0) {
    return this._svPatrol();
  }

  // Target selection: prefer harvesters (WORK parts) on sources,
  // then closest hostile by range
  const sources = this.room.find(FIND_SOURCES);

  let target = null;

  // First priority: hostile sitting on a source tile
  for (const source of sources) {
    const onSource = hostiles.find(h => h.pos.isNearTo(source));
    if (onSource) {
      target = onSource;
      break;
    }
  }

  // Second priority: closest hostile
  if (!target) {
    target = this.pos.findClosestByRange(hostiles);
  }

  if (!target) return this._svPatrol();

  const result = this.attack(target);

  if (result === ERR_NOT_IN_RANGE) {
    // Move directly — bypass traffic, this is combat
    this.moveTo(target, {
      reusePath: 3,
      visualizePathStyle: { stroke: '#ff0000', opacity: 0.6 }
    });
  } else if (result === OK) {
    // Already adjacent — if we can move toward them, do it (corner cases)
    if (!this.pos.isNearTo(target)) {
      this.moveTo(target, { reusePath: 3 });
    }
  }
};

Creep.prototype._svPatrol = function () {
  const sources = this.room.find(FIND_SOURCES);
  if (!sources.length) return;

  // Alternate between sources based on name hash for variety
  if (!this.memory.svPatrolIdx) {
    this.memory.svPatrolIdx = 0;
  }

  const target = sources[this.memory.svPatrolIdx % sources.length];

  if (this.pos.isNearTo(target)) {
    // Reached this source — switch to next on next tick
    this.memory.svPatrolIdx = (this.memory.svPatrolIdx + 1) % sources.length;
  } else {
    this.moveTo(target, {
      reusePath: 10,
      visualizePathStyle: { stroke: '#ff8800', opacity: 0.3 }
    });
  }
};
