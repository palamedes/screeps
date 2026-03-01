/**
 * spawn.config.js
 *
 * Pure data. No logic. No Game object access. No side effects.
 * All spawn tuning lives here — director.js reads it, never writes it.
 *
 * ADDING A NEW ROLE:
 *   1. Add entry to ROLE_LIMITS with minParts, minCount, maxCount
 *   2. Add entry to ROLE_KEY_PART
 *   3. Add entry to DEADWEIGHT if the role should be culled when degraded
 *   4. Add entry to PREEMPT_TTL if the role needs preemptive replacement
 *   5. Add body recipe to spawn.bodies.js
 *   6. Add behavior to rat.<role>.js
 *   That's it. spawn.director.js needs no changes.
 *
 * THREE-CONSTRAINT SYSTEM (per role, per RCL):
 *
 *   minCount — culling floor. Neither culling pass will reduce a role below
 *              this count. Prevents suiciding useful creeps during drought
 *              before a replacement can be afforded.
 *
 *   maxCount — culling ceiling. Excess culling kills the weakest creep over
 *              this limit every tick until the count is back in range.
 *              Set to 0 at RCLs where the role shouldn't exist at all.
 *
 *   minParts — spawn quality floor. The spawn gate won't fire if the best
 *              affordable body has fewer key parts than this value.
 *              The spawn waits for energy to accumulate rather than producing
 *              an undersized body that clogs traffic.
 *
 * When minCount === maxCount the band is zero-width: the room will always
 * try to have exactly that many (e.g. warlock = exactly 1 at RCL2+).
 *
 * ROLE_KEY_PART:
 *   The defining body part for each role. Used for:
 *     - minParts enforcement (spawn gate)
 *     - Excess culling sort order (weakest = fewest of this part)
 *     - Dead-weight ratio check (active parts vs ideal parts)
 */

// ─────────────────────────────────────────────────────── Spawn limits ──

/**
 * Three constraints per role, indexed by RCL [0..8].
 * Arrays must be length 9. Use 0 to disable a role at a given RCL.
 */
const ROLE_LIMITS = {
  //              RCL: [0, 1,  2,  3,  4,  5,  6,  7,  8]
  slave: {
    minParts:  1,
    minCount: [0, 1,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 4,  0,  0,  0,  0,  0,  0,  0]
  },
  miner: {
    minParts:  1,
    minCount: [0, 1,  2,  2,  2,  2,  2,  2,  2],
    maxCount: [0, 1,  2,  2,  2,  2,  2,  2,  2]
  },
  thrall: {
    minParts:  3,   // 3 CARRY pairs = 300e minimum. Below this, wait.
    minCount: [0, 0,  1,  2,  2,  3,  3,  4,  5],
    maxCount: [0, 0,  2,  3,  4,  5,  6,  7,  8]
  },
  clanrat: {
    minParts:  1,
    minCount: [0, 0,  1,  1,  2,  2,  3,  3,  3],
    maxCount: [0, 0,  2,  4,  4,  6,  8,  8,  8]
  },
  warlock: {
    minParts:  1,
    minCount: [0, 0,  1,  1,  1,  1,  1,  1,  1],  // zero-width band: exactly 1
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]
  },
  gutterrunner: {
    minParts:  2,
    minCount: [0, 0,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 0,  1,  1,  1,  1,  1,  1,  1]
  },
  stormvermin: {
    minParts:  1,
    minCount: [0, 0,  0,  0,  0,  0,  0,  0,  0],
    maxCount: [0, 0,  1,  1,  2,  2,  3,  3,  3]
  }
};

// ─────────────────────────────────────────────────────── Key parts ──

/**
 * The defining body part for each role.
 * "Weakest" creep = fewest active parts of this type.
 */
const ROLE_KEY_PART = {
  slave:        'work',
  miner:        'work',
  thrall:       'carry',
  clanrat:      'work',
  warlock:      'work',
  gutterrunner: 'move',
  stormvermin:  'attack'
};

// ─────────────────────────────────────────────────────── Dead weight ──

/**
 * Roles subject to dead-weight culling (active part decay check).
 *
 * part     — the body part to measure against the ideal body.
 * minRatio — cull if (active parts / ideal parts) < minRatio.
 *            0.4 = cull when below 40% of ideal capacity.
 *
 * Culling is additionally gated by minCount and minViableCost —
 * see spawn.director.js checkDeadWeight().
 */
const DEADWEIGHT = {
  miner:   { part: 'work',  minRatio: 0.4 },
  thrall:  { part: 'carry', minRatio: 0.4 },
  clanrat: { part: 'work',  minRatio: 0.4 },
  warlock: { part: 'work',  minRatio: 0.4 }
};

// ─────────────────────────────────────────────── Preemptive TTL ──

/**
 * Ticks-to-live threshold below which the director treats a creep as
 * "about to die" and starts counting it as absent for spawn decisions.
 * This creates overlap — the replacement is spawned and walking to its
 * post before the old one expires.
 *
 * Higher values = more overlap = smoother handoff, at the cost of
 * briefly running one extra creep of that role.
 */
const PREEMPT_TTL = {
  miner:   80,
  thrall:  150,
  warlock: 200   // warlock must walk to container seat — needs generous lead time
};

// ─────────────────────────────────────────────────── Spawn names ──

/**
 * Name pool for generated creep names.
 * Format: <role>_<name><twoDigitNumber>  e.g. thrall_screech75
 */
const NAMES = [
  'gnaw',   'skritt', 'queek',   'lurk',    'ruin',   'blight', 'fang',
  'scab',   'gash',   'rot',     'skulk',   'twitch', 'snikk',  'claw',
  'filth',  'mangle', 'reek',    'slit',    'spite',  'pox',    'rattle',
  'skree',  'chitter','bleed',   'warp',    'snarl',  'scrape', 'bite',
  'mire',   'fester', 'hook',    'tatter',  'scurry', 'crack',  'nibble',
  'scour',  'screech','itch',    'grime',   'rend'
];

// ─────────────────────────────────────────────────────── Thresholds ──

/**
 * Energy ratio the spawn must be at or above before clanrats are queued.
 * Miners, thralls, and warlocks ignore this threshold — they spawn whenever
 * affordable. Clanrats are discretionary and wait for a healthy economy.
 */
const SPAWN_ENERGY_THRESHOLD = 0.9;

// ─────────────────────────────────────────────────────────── Export ──

module.exports = {
  ROLE_LIMITS,
  ROLE_KEY_PART,
  DEADWEIGHT,
  PREEMPT_TTL,
  NAMES,
  SPAWN_ENERGY_THRESHOLD
};