/**
 * warren.decide.js
 *
 * Translates warren state into a concrete plan (this._plan).
 * Produces boolean flags only — no side effects, no Memory writes.
 *
 * Safe mode is now SELECTIVE — only activates for real combat threats,
 * not scouts. This preserves the charge for when it actually matters.
 *
 * During active safe mode, build defenses aggressively so you're not
 * naked when it expires.
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

  // --- Safe Mode: only spend the charge on real combat threats ---
  // Scouts and reservers don't warrant blowing your one save.
  // Trigger when: has ATTACK/RANGED_ATTACK/WORK (dismantle) parts AND
  //               the tower likely can't handle it alone.
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

    // Tower can absorb ~150 damage/tick at close range per tower
    const towerStrength    = snap.towers.length * 150;
    const hostileHitpoints = combatHostiles.reduce((s, h) => s + h.hits, 0);

    // Activate if there are combat creeps AND (no tower OR tower is outmatched)
    const towerOutmatched  = snap.towers.length === 0 ||
      hostileHitpoints > towerStrength * 10; // 10 ticks to kill them all

    if (combatHostiles.length > 0 && towerOutmatched) {
      this._plan.activateSafeMode = true;
    }
  }

  // --- Build defenses while safe mode is active ---
  // This is the ONLY time you'll get to safely build ramparts/tower.
  // Don't waste it.
  if (snap.safeMode && snap.safeMode.active) {
    this._plan.buildRamparts = true;
    this._plan.buildTower    = snap.rcl >= 3;
    this._plan.publishBuild  = true;
    this._plan.publishRepair = true;
    this._plan.publishHarvest = true;
    this._plan.publishUpgrade = true;
    // Don't return — fall through so the state machine can add more flags
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
      // Hold position, build defenses, minimal economy expansion.
      // Don't lay new extension sites — keep clanrats building ramparts.
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
      // Clanrats do NOT build during combat.
      this._plan.publishDefense = true;
      this._plan.publishHarvest = true;
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
