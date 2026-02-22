/**
 * warren.decide.js
 *
 * FIX: Recovery guard no longer hard-returns.
 * Previous behavior: if miners < sources, set publishHarvest and RETURN.
 * This meant clanrats got no upgrade jobs and controller sat at 0 progress.
 * New behavior: set publishHarvest (so spawn director knows to prioritize
 * miners) but still fall through to the state machine so upgrade/build
 * jobs get published. Clanrats can upgrade while miners are being replaced.
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
      if (snap.towers.length === 0) {
        // No tower — any combat hostile is existential
        this._plan.activateSafeMode = true;
      } else {
        const towerStrength    = snap.towers.length * 150;
        const hostileHitpoints = combatHostiles.reduce((s, h) => s + h.hits, 0);
        if (hostileHitpoints > towerStrength * 10) {
          this._plan.activateSafeMode = true;
        }
      }
    }
  }

  // --- Build defenses during safe mode ---
  if (snap.safeMode && snap.safeMode.active) {
    this._plan.buildRamparts  = true;
    this._plan.buildTower     = snap.rcl >= 3;
    this._plan.publishBuild   = true;
    this._plan.publishRepair  = true;
  }

  // --- Economic Recovery Guard ---
  // FIX: Set publishHarvest as a SIGNAL to spawn director, but do NOT return.
  // Clanrats still need upgrade jobs even while we wait for miners to respawn.
  const sources = this.find(FIND_SOURCES);
  const miners  = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.name &&
    c.memory.role === 'miner'
  );

  if (miners.length < sources.length) {
    this._plan.publishHarvest = true;
    // Fall through — don't return. Let clanrats keep upgrading.
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
