/**
 * warren.decide.js
 *
 * Translates warren state into a concrete plan (this._plan).
 * Produces boolean flags only — no side effects, no Memory writes.
 *
 * The recovery guard runs before the state machine and can hard-override
 * the plan to ensure miners are always replenished first.
 *
 * Spawn placement is NOT handled here — that's empire.js territory.
 * By the time a warren.tick() runs, a spawn already exists.
 *
 * Called by: warren.js (OODA step 4 of 5)
 * Reads:     this.memory.state
 * Writes:    this._plan (in-memory only, not persisted)
 */

const { ROOM_STATE } = require('warren.memory');

Room.prototype.decide = function () {

  // Initialize all flags to false — act() only does what's explicitly enabled
  this._plan = {
    buildExtensions:          false,
    buildControllerContainer: false,
    buildRoads:               false,
    publishHarvest:           false,
    publishBuild:             false,
    publishUpgrade:           false,
    publishDefense:           false
  };

  // --- Economic Recovery Guard ---
  // If miners are below source count, the economy is stalled.
  // Override everything: just publish harvest jobs so the spawn director
  // can see demand and spawn new miners immediately.
  // Uses homeRoom to match spawn.director.js logic.
  const sources = this.find(FIND_SOURCES);
  const miners = Object.values(Game.creeps).filter(c =>
    c.memory.homeRoom === this.name &&
    c.memory.role === 'miner'
  );

  if (miners.length < sources.length) {
    this._plan.publishHarvest = true;
    return; // hard override — nothing else matters until miners are back
  }
  // --- End Recovery Guard ---

  const state = this.memory.state;

  switch (state) {

    case ROOM_STATE.BOOTSTRAP:
      // RCL1: harvest to stay alive, upgrade to reach RCL2.
      // Still queue the controller container — it costs nothing to place the
      // site early and workers will build it whenever energy allows.
      this._plan.buildControllerContainer = true;
      this._plan.publishHarvest           = true;
      this._plan.publishUpgrade           = true;
      break;

    case ROOM_STATE.GROW:
      // Actively expanding: build extensions, roads, keep economy flowing,
      // build construction sites, and keep upgrading.
      this._plan.buildExtensions           = true;
      this._plan.buildControllerContainer  = true;
      this._plan.buildRoads                = true;
      this._plan.publishHarvest            = true;
      this._plan.publishBuild              = true;
      this._plan.publishUpgrade            = true;
      break;

    case ROOM_STATE.WAR:
      // Under attack: stop everything except defense
      this._plan.publishDefense = true;
      break;

    case ROOM_STATE.STABLE:
    default:
      // Normal operation: keep upgrading and opportunistically build
      // extensions and roads. All three planners are self-guarding so
      // it's safe to call them every tick — they no-op if conditions
      // aren't met (energy ratio, RCL cap, existing sites, etc.).
      this._plan.buildExtensions           = true;
      this._plan.buildControllerContainer  = true;
      this._plan.buildRoads                = true;
      this._plan.publishUpgrade            = true;
      break;
  }
};