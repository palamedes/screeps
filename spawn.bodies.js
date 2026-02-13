/**
 * spawn.bodies.js
 *
 * Pure body part recipes for each rat role.
 * All functions are stateless — they take energy capacity and return a body array.
 * No Memory reads. No Game object access. No side effects.
 *
 * Body arrays are ordered intentionally: tough parts first so they die last,
 * MOVE parts last so they survive longest.
 */

module.exports = {

  /**
   * Slave body — RCL1 bootstrap generalist.
   * Scales up with available energy but always starts with the minimum viable body.
   * Prioritizes WORK parts to maximize harvest/upgrade throughput.
   */
  slave(energyCapacity) {
    const body = [WORK, CARRY, MOVE];
    let remaining = energyCapacity - 200;

    while (remaining >= 100 && body.length < 50) {
      body.unshift(WORK);
      remaining -= 100;
    }

    return body;
  },

  /**
   * Miner body — sits on a source and never moves.
   * 5x WORK = 10 energy/tick, exactly drains a source.
   * Only needs 1 MOVE to get to the source initially.
   */
  miner(energyCapacity) {
    if (energyCapacity >= 550) return [WORK, WORK, WORK, WORK, WORK, MOVE];
    if (energyCapacity >= 450) return [WORK, WORK, WORK, WORK, MOVE];
    if (energyCapacity >= 300) return [WORK, WORK, MOVE];
    return [WORK, MOVE];
  },

  /**
   * Hauler body — pure energy transport.
   * Needs CARRY and MOVE only. No WORK parts.
   * 1 CARRY + 1 MOVE ratio keeps it moving at full speed when loaded.
   */
  hauler(energyCapacity) {
    if (energyCapacity >= 600) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    if (energyCapacity >= 400) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
    if (energyCapacity >= 200) return [CARRY, CARRY, MOVE, MOVE];
    return [CARRY, MOVE];
  },

  /**
   * Worker body — builds and upgrades.
   * Needs WORK + CARRY + MOVE.
   * Balanced ratio: enough CARRY to make trips worthwhile, enough WORK to spend it fast.
   */
  worker(energyCapacity) {
    if (energyCapacity >= 800) return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energyCapacity >= 550) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    if (energyCapacity >= 300) return [WORK, CARRY, MOVE];
    return [WORK, CARRY, MOVE];
  },

};