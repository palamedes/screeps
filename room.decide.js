const { ROOM_STATE } = require('room.memory');

Room.prototype.decide = function () {
  const state = this.memory.state;

  this._plan = {
    buildExtensions: false,
    publishHarvest: false,
    publishBuild: false,
    publishUpgrade: false,
    publishDefense: false
  };

  switch (state) {

    case ROOM_STATE.BOOTSTRAP:
      this._plan.publishHarvest = true;
      this._plan.publishUpgrade = true;
      break;

    case ROOM_STATE.GROW:
      this._plan.buildExtensions = true;
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
