const { ROOM_STATE } = require('room.memory');

Room.prototype.orient = function () {
  const snap = this._snapshot;

  const extensions = snap.structures.filter(
    s => s.structureType === STRUCTURE_EXTENSION
  );

  const extensionSites = snap.constructionSites.filter(
    s => s.structureType === STRUCTURE_EXTENSION
  );

  const totalExtensions = extensions.length + extensionSites.length;

  const maxExtensions =
    CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][snap.rcl] || 0;

  if (snap.hostiles.length > 0) {
    return this.setState(ROOM_STATE.WAR);
  }

  if (snap.rcl === 1) {
    return this.setState(ROOM_STATE.BOOTSTRAP);
  }

  if (snap.rcl === 2) {
    if (totalExtensions < 2) {
      return this.setState(ROOM_STATE.GROW);
    }
  } else {
    if (totalExtensions < maxExtensions) {
      return this.setState(ROOM_STATE.GROW);
    }
  }

  if (snap.constructionSites.length > 0) {
    return this.setState(ROOM_STATE.GROW);
  }

  return this.setState(ROOM_STATE.STABLE);
};
