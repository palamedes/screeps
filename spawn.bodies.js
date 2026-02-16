/**
 * spawn.bodies.js
 *
 * Pure body part recipes for each rat role.
 * All functions are stateless — they take available energy and return a body array.
 * No Memory reads. No Game object access. No side effects.
 *
 * All recipes are formulaic — they scale continuously with available energy
 * rather than using discrete tiers. No thresholds to miscalibrate, no tiers
 * to add when a new extension unlocks. The body is always the best possible
 * given exactly the energy provided.
 *
 * Body array ordering convention:
 *   Parts are ordered so the most expendable die first.
 *   WORK/CARRY first → MOVE last.
 *   MOVE surviving longest keeps the creep mobile even when damaged.
 *   (Screeps deals damage from the front of the body array.)
 *
 * Part costs (for reference):
 *   WORK   = 100
 *   CARRY  = 50
 *   MOVE   = 50
 *   ATTACK = 80
 *   RANGED_ATTACK = 150
 *   TOUGH  = 10
 *   HEAL   = 250
 */

module.exports = {

  /**
   * Slave body — RCL1 bootstrap generalist.
   * Already formulaic: starts with minimum [WORK, CARRY, MOVE] and
   * stacks additional WORK parts with any remaining energy.
   */
  slave(energy) {
    const body = [WORK, CARRY, MOVE];
    let remaining = energy - 200;

    while (remaining >= 100 && body.length < 50) {
      body.unshift(WORK);
      remaining -= 100;
    }

    return body;
  },

  /**
   * Miner body — sits on source container, harvests into store, transfers to container.
   * Maximize WORK parts (2 energy/tick each) with 1 CARRY + 1 MOVE.
   * Hard cap at 5 WORK — that's 10 energy/tick which exactly drains a source.
   * Beyond 5 WORK is pure waste.
   *
   * The 1 CARRY allows the miner to hold harvested energy and transfer it
   * into the container beneath it. With 50 CARRY capacity, the store fills
   * every 5 ticks and the transfer keeps energy flowing continuously.
   *
   * Formula: reserve 100 for CARRY+MOVE, rest → WORK parts, capped at 5.
   * Min viable: 200 energy → [WORK, CARRY, MOVE]
   * Full drain:  600 energy → [WORK×5, CARRY, MOVE]
   */
  miner(energy) {
    const OVERHEAD = 100;  // 1 CARRY + 1 MOVE
    const workCount = Math.min(
      Math.floor((energy - OVERHEAD) / 100),
      5  // 5 WORK = 10 energy/tick = full source drain, more is wasteful
    );

    if (workCount < 1) return [WORK, CARRY, MOVE]; // absolute floor

    const body = [];
    for (let i = 0; i < workCount; i++) body.push(WORK);
    body.push(CARRY);
    body.push(MOVE);
    return body;
  },

  /**
   * Thrall body — pure energy transport, no WORK parts.
   * Equal CARRY and MOVE so it moves at full speed when loaded.
   *
   * Formula: pairs of [CARRY + MOVE] = 100 each.
   * Each pair carries 50 energy per trip and moves without fatigue penalty.
   * Min viable: 100 energy → [CARRY, MOVE]
   */
  thrall(energy) {
    const pairs = Math.min(
      Math.floor(energy / 100),
      25  // 25 pairs = 50 parts (Screeps body part limit)
    );

    if (pairs < 1) return [CARRY, MOVE]; // absolute floor

    const body = [];
    for (let i = 0; i < pairs; i++) body.push(CARRY);
    for (let i = 0; i < pairs; i++) body.push(MOVE);
    return body;
  },

  /**
   * Clanrat body — builds and upgrades.
   * Balanced sets of [WORK + CARRY + MOVE] = 200 each.
   * Each set contributes 1 WORK action per trip and moves without penalty.
   *
   * Formula: sets of 200 energy → one WORK + one CARRY + one MOVE.
   * Ordering within array: all WORKs, then all CARRYs, then all MOVEs.
   * Min viable: 200 energy → [WORK, CARRY, MOVE]
   */
  clanrat(energy) {
    const sets = Math.min(
      Math.floor(energy / 200),
      16  // 16 sets = 48 parts, leaves 2 slots — stays safely under 50 limit
    );

    if (sets < 1) return [WORK, CARRY, MOVE]; // absolute floor

    const body = [];
    for (let i = 0; i < sets; i++) body.push(WORK);
    for (let i = 0; i < sets; i++) body.push(CARRY);
    for (let i = 0; i < sets; i++) body.push(MOVE);
    return body;
  },

  /**
   * Warlock Engineer body — sits at controller, upgrades forever.
   * Maximize WORK parts for upgrade throughput. Fixed CARRY and MOVE
   * since the warlock only needs to walk to the controller once.
   *
   * Formula: reserve fixed overhead for CARRY + MOVE, stack WORK with the rest.
   *   2 CARRY = 100 (enough to make each container withdrawal worthwhile)
   *   1 MOVE  = 50  (gets to controller; 2 MOVE was causing 30-tick swamp paralysis)
   *   Overhead = 150 energy reserved
   *   Remaining → WORK parts
   *
   * Min viable: 250 energy → [WORK, CARRY, CARRY, MOVE]
   * At 850 energy → [WORK×7, CARRY×2, MOVE×1]
   */
  warlock(energy) {
    const CARRY_COUNT = 2;
    const MOVE_COUNT  = 1;
    const OVERHEAD    = (CARRY_COUNT * 50) + (MOVE_COUNT * 50); // 150

    const workCount = Math.min(
      Math.floor((energy - OVERHEAD) / 100),
      50 - CARRY_COUNT - MOVE_COUNT  // respect 50-part body limit
    );

    if (workCount < 1) return [WORK, CARRY, MOVE]; // absolute floor

    const body = [];
    for (let i = 0; i < workCount; i++) body.push(WORK);
    for (let i = 0; i < CARRY_COUNT; i++) body.push(CARRY);
    for (let i = 0; i < MOVE_COUNT; i++) body.push(MOVE);
    return body;
  },

  /**
   * Stormvermin body — @TODO
   * Elite melee shock troops. Heavy ATTACK, TOUGH for survivability, enough MOVE.
   */
  stormvermin(energy) {
    // @TODO implement
    return [ATTACK, MOVE];
  },

  /**
   * Gutter Runner body — @TODO
   * Fast scout/raider. High MOVE ratio, some ATTACK and RANGED_ATTACK.
   */
  gutterrunner(energy) {
    // @TODO implement
    return [MOVE, MOVE, ATTACK];
  },

  /**
   * Jezzail body — @TODO
   * Long-range sniper. Maximize RANGED_ATTACK, enough MOVE to reposition.
   */
  jezzail(energy) {
    // @TODO implement
    return [RANGED_ATTACK, MOVE];
  },

  /**
   * Rat Ogre body — @TODO
   * Big dumb muscle. Massive ATTACK and TOUGH, minimal MOVE.
   */
  ratogre(energy) {
    // @TODO implement
    return [TOUGH, ATTACK, MOVE];
  },

};