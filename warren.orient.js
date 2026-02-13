const { ROOM_STATE } = require('warren.memory');

Room.prototype.orient = function () {
  const snap = this._snapshot;

  // Threat override
  if (snap.hostiles.length > 0) {
    return this.setState(ROOM_STATE.WAR);
  }

  // Early survival phase
  if (snap.rcl === 1) {
    return this.setState(ROOM_STATE.BOOTSTRAP);
  }

  // Economic pressure signal:
  // If we are frequently energy capped, we should be expanding
  const energyCapped =
    snap.energyAvailable === snap.energyCapacityAvailable;

  if (energyCapped) {
    return this.setState(ROOM_STATE.GROW);
  }

  // If construction is already in progress, remain in growth posture
  if (snap.constructionSites.length > 0) {
    return this.setState(ROOM_STATE.GROW);
  }

  // Otherwise we are in maintenance mode
  return this.setState(ROOM_STATE.STABLE);
};
