const ROOM_STATE = {
  BOOTSTRAP: 0,
  STABLE: 1,
  GROW: 2,
  FORTIFY: 3,
  WAR: 4
};

Room.prototype.initMemory = function () {
  if (this.memory.state === undefined) {
    this.memory.state = ROOM_STATE.BOOTSTRAP;
  }
};

Room.prototype.setState = function (state) {
  if (this.memory.state !== state) {
    this.memory.state = state;
  }
};

module.exports = { ROOM_STATE };
