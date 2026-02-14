/**
 * spawn.bodies.js
 *
 * Pure body part recipes for each rat role.
 * All functions are stateless — they take energy capacity and return a body array.
 * No Memory reads. No Game object access. No side effects.
 *
 * Body arrays are ordered intentionally: tough parts first so they die last,
 * MOVE parts last so they survive longest.
 *
 * Threshold calibration rule:
 *   Each tier's threshold should be the actual body cost plus a small buffer (~50).
 *   This ensures the spawn can always afford the body it requests.
 *   Do NOT set thresholds significantly higher than body cost — that causes
 *   the cheaper tier to fire even when extensions are full and the better
 *   body is completely affordable.
 *
 * Part costs (for reference):
 *   WORK  = 100
 *   CARRY = 50
 *   MOVE  = 50
 *   ATTACK = 80
 *   RANGED_ATTACK = 150
 *   HEAL = 250
 *   TOUGH = 10
 *   CLAIM = 600
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
   *
   * Costs: 550 / 450 / 250 / 150
   * Thresholds match actual costs.
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
   *
   * Costs: 600 / 400 / 200 / 100
   * Thresholds match actual costs.
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
   * Balanced ratio: enough CARRY to make trips worthwhile, enough WORK to spend fast.
   *
   * Costs:
   *   [WORK×3, CARRY×3, MOVE×3] = 300+150+150 = 600
   *   [WORK×2, CARRY×2, MOVE×2] = 200+100+100 = 400
   *   [WORK,   CARRY,   MOVE  ] = 100+ 50+ 50 = 200
   *
   * IMPORTANT: Thresholds are set just above actual body costs (~+50 buffer).
   * Previous thresholds (800 / 550 / 300) were 150-200 higher than body costs,
   * causing the cheap 3-part body to spawn even when extensions were full and
   * the better body was completely affordable.
   *
   * Example of the old failure:
   *   RCL2, 5 extensions, 3 filled → energyAvailable = 450
   *   Bodies.worker(450) with old threshold 550 → fell through to >= 300 → 3 parts
   *   Bodies.worker(450) with new threshold 450 → hits >= 450 → 6 parts ✓
   */
  worker(energyCapacity) {
    if (energyCapacity >= 650) return [WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energyCapacity >= 450) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    if (energyCapacity >= 200) return [WORK, CARRY, MOVE];
    return [WORK, CARRY, MOVE];
  },

  /**
   * Warlock Engineer body — sits at controller container and upgrades forever.
   * Heavy on WORK parts for maximum upgrade throughput.
   * Minimal MOVE — only needs to walk to the controller once on spawn.
   * Enough CARRY to make each container withdrawal worthwhile.
   *
   * Costs:
   *   800: 6×100 + 2×50 + 2×50 = 800 ✓
   *   700: 5×100 + 2×50 + 2×50 = 700 ✓
   *   550: 4×100 + 2×50 + 1×50 = 550 ✓
   *   400: 3×100 + 1×50 + 1×50 = 400 ✓
   * Thresholds match actual costs.
   */
  warlock(energyCapacity) {
    if (energyCapacity >= 800) return [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    if (energyCapacity >= 700) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    if (energyCapacity >= 550) return [WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE];
    if (energyCapacity >= 400) return [WORK, WORK, WORK, CARRY, MOVE];
    return [WORK, CARRY, MOVE];
  },

};