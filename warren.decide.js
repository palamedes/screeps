/**
 * warren.decide.js
 *
 * Translates warren state into a concrete plan (this._plan).
 * Produces boolean flags only — no side effects, no Memory writes.
 *
 * The recovery guard runs before the state machine and can hard-override
 * the plan to ensure miners are always replenished first.
 *
 * Safe mode activation is evaluated before the recovery guard — it must
 * fire even when the economy is stalled.
 *
 * Called by: warren.js (OODA step 4 of 5)
 * Reads:     this.memory.state, this._snapshot
 * Writes:    this._plan (in-memory only, not persisted)
 */

const { ROOM_STATE } = require('warren.memory');

Room.prototype.decide = function () {

  const snap = this._snapshot;

  // Initialize all flags to false
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

  // --- Safe Mode ---
  // Evaluated first — fires regardless of economy state.
  // Only activates if hostiles are present, safe mode is not already running,
  // at least one charge is available, and cooldown is zero.
  if (snap.hostiles.length > 0 &&
    snap.safeMode &&
    !snap.safeMode.active &&
    snap.safeMode.available > 0 &&
    snap.safeMode.cooldown === 0) {
    this._plan.activateSafeMode = true;
  }

  // --- Economic Recovery Guard ---
  // Miners down = economy stalled. Hard-override to get them back first.
  const sources = this.find(FIND_SOURCES);
  const miners = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.name &&
    c.memory.role === 'miner'
  );

  if (miners.length < sources.length) {
    this._plan.publishHarvest = true;
    return; // hard override — nothing else matters until miners are back
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
      // Actively expanding: build everything, keep economy flowing.
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

    case ROOM_STATE.WAR:
      // Under attack: defend and keep the tower fed.
      // Tower attack fires independently in act() — no plan flag needed.
      // Clanrats do NOT build during combat — too dangerous.
      this._plan.publishDefense = true;
      this._plan.publishHarvest = true;  // keep tower energy supply alive
      break;

    case ROOM_STATE.STABLE:
    default:
      // Normal operation: maintain infrastructure and keep upgrading.
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