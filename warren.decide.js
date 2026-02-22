/**
 * warren.decide.js
 *
 * Translates warren state into a concrete plan (this._plan).
 *
 * Safe mode activation logic:
 *   - No tower: activate on ANY combat hostile (existential threat at low RCL)
 *   - Has tower: only activate if tower is likely outmatched
 *   - Never waste the charge on scouts/reservers (no attack/ranged/work parts)
 *
 * Safe mode is instant — activateSafeMode() works the same tick it is called.
 * After safe mode, FORTIFY state keeps defenses building for 3000 more ticks.
 */

const { ROOM_STATE } = require('warren.memory');

Room.prototype.decide = function () {

  const snap = this._snapshot;

  this._plan = {
    buildExtensions:          false,
    buildControllerContainer: false,
    buildSourceContainers:    false,
    buildRoads:               false,
    buildRamparts:            false,
    buildTower:               false,
    activateSafeMode:         false,
    publishHarvest:           false,
    publishBuild:             false,
    publishUpgrade:           false,
    publishRepair:            false,
    publishDefense:           false
  };

  // --- Safe Mode Trigger ---
  // Safe mode is instant — activates the same tick we call it.
  // Never waste the charge on non-combat visitors (scouts, reservers).
  if (snap.hostiles.length > 0 &&
      snap.safeMode &&
      !snap.safeMode.active &&
      snap.safeMode.available > 0 &&
      snap.safeMode.cooldown === 0) {

    const combatHostiles = snap.hostiles.filter(h =>
      h.getActiveBodyparts(ATTACK) > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0 ||
      h.getActiveBodyparts(WORK) > 0
    );

    if (combatHostiles.length > 0) {
      const hasTower = snap.towers.length > 0;

      if (!hasTower) {
        // No tower — any combat hostile is existential. Fire immediately.
        this._plan.activateSafeMode = true;
      } else {
        // Have a tower — only spend the charge if likely outmatched.
        // Rough estimate: ~150 damage/tick per tower at close range.
        const towerStrength    = snap.towers.length * 150;
        const hostileHitpoints = combatHostiles.reduce((s, h) => s + h.hits, 0);
        if (hostileHitpoints > towerStrength * 10) {
          this._plan.activateSafeMode = true;
        }
      }
    }
  }

  // --- Build defenses while safe mode is active ---
  // Use the window to get ramparts and tower built before it expires.
  if (snap.safeMode && snap.safeMode.active) {
    this._plan.buildRamparts  = true;
    this._plan.buildTower     = snap.rcl >= 3;
    this._plan.publishBuild   = true;
    this._plan.publishRepair  = true;
    this._plan.publishHarvest = true;
    this._plan.publishUpgrade = true;
    // Don't return — fall through so state machine can add more flags
  }

  // --- Economic Recovery Guard ---
  const sources = this.find(FIND_SOURCES);
  const miners  = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.name &&
    c.memory.role === 'miner'
  );

  if (miners.length < sources.length) {
    this._plan.publishHarvest = true;
    return;
  }

  const state = this.memory.state;

  switch (state) {

    case ROOM_STATE.BOOTSTRAP:
      // RCL1: survive, upgrade, get spawn rampart up ASAP.
      this._plan.buildControllerContainer = true;
      this._plan.buildRamparts            = true;
      this._plan.publishHarvest           = true;
      this._plan.publishUpgrade           = true;
      break;

    case ROOM_STATE.GROW:
      this._plan.buildExtensions          = true;
      this._plan.buildControllerContainer = true;
      this._plan.buildSourceContainers    = true;
      this._plan.buildRoads               = true;
      this._plan.buildRamparts            = true;
      this._plan.buildTower               = snap.rcl >= 3;
      this._plan.publishHarvest           = true;
      this._plan.publishBuild             = true;
      this._plan.publishUpgrade           = true;
      this._plan.publishRepair            = true;
      break;

    case ROOM_STATE.FORTIFY:
      // Hold position after an attack. Build defenses, no new extensions.
      this._plan.buildRamparts            = true;
      this._plan.buildTower               = snap.rcl >= 3;
      this._plan.buildControllerContainer = true;
      this._plan.buildSourceContainers    = true;
      this._plan.publishHarvest           = true;
      this._plan.publishBuild             = true;
      this._plan.publishRepair            = true;
      this._plan.publishUpgrade           = true;
      break;

    case ROOM_STATE.WAR:
      // Under attack. Tower fires independently in act().
      this._plan.publishDefense           = true;
      this._plan.publishHarvest           = true;
      break;

    case ROOM_STATE.STABLE:
    default:
      this._plan.buildExtensions          = true;
      this._plan.buildControllerContainer = true;
      this._plan.buildSourceContainers    = true;
      this._plan.buildRoads               = true;
      this._plan.buildRamparts            = true;
      this._plan.buildTower               = snap.rcl >= 3;
      this._plan.publishUpgrade           = true;
      this._plan.publishRepair            = true;
      break;
  }
};
