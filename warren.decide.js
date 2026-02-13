const { ROOM_STATE } = require('warren.memory');

Room.prototype.decide = function () {
  const state = this.memory.state;

  this._plan = {
    buildExtensions: false,
    publishHarvest: false,
    publishBuild: false,
    publishUpgrade: false,
    publishDefense: false
  };

  // --- Economic recovery guard ---
  const sources = this.find(FIND_SOURCES);
  const creeps = Object.values(Game.creeps)
    .filter(c => c.room.name === this.name);

  const miners = creeps.filter(c => c.memory.role === 'miner');

  if (miners.length < sources.length) {
    this._plan.publishHarvest = true;
    return; // hard override
  }
  // --- End recovery guard ---

  switch (state) {

    case ROOM_STATE.BOOTSTRAP:
      this._plan.publishHarvest = true;
      this._plan.publishUpgrade = true;
      break;

    case ROOM_STATE.GROW:
      this._plan.buildExtensions = true;
      this._plan.publishHarvest = true; // keep economy flowing
      this._plan.publishBuild = true;
      this._plan.publishUpgrade = true;
      break;

    case ROOM_STATE.WAR:
      this._plan.publishDefense = true;
      break;

    default:
      this._plan.publishUpgrade = true;
      break;
  }
};
