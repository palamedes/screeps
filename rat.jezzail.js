/**
 * rat.jezzail.js
 *
 * Jezzail behavior — long-range snipers of the Skaven war machine.
 * A Jezzail team fires warp-powered rifles from maximum range, cutting
 * down enemies before they can close to melee.
 *
 * Intended role: ranged room defense, tower supplement, siege support.
 * Body: maximize RANGED_ATTACK, enough MOVE to reach firing position,
 *       some TOUGH to survive return fire.
 *
 * @TODO implement
 */

const Traffic = require('traffic');

Creep.prototype.runJezzail = function () {
  // @TODO implement Jezzail behavior
  // Planned behavior:
  //   - Find and hold a firing position at max range from hostiles
  //   - Ranged attack priority: hostile creeps → hostile structures
  //   - Kite backward if hostile closes within melee range
};