/**
 * Room lifecycle states.
 * These represent strategic posture, not tactical behavior.
 */
const ROOM_STATE = {
  BOOTSTRAP: 0, // fragile, early economy
  STABLE: 1,    // balanced economy
  GROW: 2,      // active construction
  FORTIFY: 3,   // defensive buildup
  WAR: 4        // hostile presence
};

const JobBoard = require('job.board');
const SpawnDirector = require('room.director.spawn');

/**
 * Main room OODA loop.
 * Observe → Orient → Decide.
 * Called once per tick for owned rooms.
 */
Room.prototype.tick = function () {
  this.initMemory();
  this.profile();
  this.observe();
  this.orient();
  this.decide();
};

/**
 * Initializes persistent room memory.
 * Only stores long-lived strategic data.
 */
Room.prototype.initMemory = function () {
  if (this.memory.state === undefined) {
    this.memory.state = ROOM_STATE.BOOTSTRAP;
  }
};

/**
 * Profiles permanent room characteristics.
 * Runs once and stores immutable traits.
 */
Room.prototype.profile = function () {
  if (this.memory.profile) return;

  const terrain = this.getTerrain();
  const sources = this.find(FIND_SOURCES);

  const sourceProfiles = sources.map(source => {
    let openSpots = 0;

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const x = source.pos.x + dx;
        const y = source.pos.y + dy;

        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
          openSpots++;
        }
      }
    }

    return {
      id: source.id,
      openSpots
    };
  });

  this.memory.profile = {
    sourceCount: sources.length,
    exitCount: this.find(FIND_EXIT).length,
    sources: sourceProfiles
  };
};


/**
 * Collects ephemeral tick data.
 * Stored on the room instance, not in Memory.
 */
Room.prototype.observe = function () {
  this._snapshot = {
    energyAvailable: this.energyAvailable,
    energyCapacity: this.energyCapacityAvailable,
    sources: this.find(FIND_SOURCES),
    constructionSites: this.find(FIND_MY_CONSTRUCTION_SITES),
    hostiles: this.find(FIND_HOSTILE_CREEPS)
  };
};

/**
 * Sets room strategic state if changed.
 * @param {number} state - ROOM_STATE enum value
 */
Room.prototype.setState = function (state) {
  if (this.memory.state !== state) {
    this.memory.state = state;
  }
};

/**
 * Determines strategic posture based on current snapshot.
 * Converts observed facts into a high-level state.
 */
Room.prototype.orient = function () {
  const snap = this._snapshot;

  if (snap.hostiles.length > 0) {
    return this.setState(ROOM_STATE.WAR);
  }

  if (snap.energyCapacity < 800) {
    return this.setState(ROOM_STATE.BOOTSTRAP);
  }

  if (snap.constructionSites.length > 0) {
    return this.setState(ROOM_STATE.GROW);
  }

  return this.setState(ROOM_STATE.STABLE);
};

/**
 * Publishes jobs for the current tick.
 * Strategy layer — no creep logic here.
 */
Room.prototype.decide = function () {
  const state = this.memory.state;

  JobBoard.reset(this.name);

  switch (state) {

    case ROOM_STATE.BOOTSTRAP:
      JobBoard.publishHarvestJobs(this);
      JobBoard.publishUpgradeJobs(this);
      break;

    case ROOM_STATE.GROW:
      JobBoard.publishBuildJobs(this);
      JobBoard.publishHarvestJobs(this);
      break;

    case ROOM_STATE.WAR:
      JobBoard.publishDefenseJobs(this);
      break;

    default:
      JobBoard.publishUpgradeJobs(this);
      break;
  }

  SpawnDirector.run(this);
};
