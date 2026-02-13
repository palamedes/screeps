const { ROOM_STATE } = require('room.memory');

Room.prototype.orient = function () {
  const snap = this._snapshot;

  if (snap.hostiles.length > 0) {
    return this.setState(ROOM_STATE.WAR);
  }

  if (snap.rcl === 1) {
    return this.setState(ROOM_STATE.BOOTSTRAP);
  }

  const extensions = snap.structures.filter(
    s => s.structureType === STRUCTURE_EXTENSION
  );

  if (extensions.length < 5) {
    return this.setState(ROOM_STATE.GROW);
  }

  if (snap.constructionSites.length > 0) {
    return this.setState(ROOM_STATE.GROW);
  }

  return this.setState(ROOM_STATE.STABLE);
};
