const { ROOM_STATE } = require('warren.memory');

// How long to stay in FORTIFY after an attack clears (ticks)
const FORTIFY_DURATION = 3000;

Room.prototype.orient = function () {
  const snap = this._snapshot;

  // --- Threat override ---
  if (snap.hostiles.length > 0) {
    this._logAttackEvent(snap.hostiles);
    return this.setState(ROOM_STATE.WAR);
  }

  // --- FORTIFY: recent attack, no active safe mode ---
  // Hold a defensive posture until ramparts are healthy and some time has passed.
  const recentAttack = this.memory.lastAttackTick &&
    (Game.time - this.memory.lastAttackTick) < FORTIFY_DURATION;

  if (recentAttack) {
    return this.setState(ROOM_STATE.FORTIFY);
  }

  // --- Early survival phase ---
  if (snap.rcl === 1) {
    return this.setState(ROOM_STATE.BOOTSTRAP);
  }

  // --- Economic pressure signal ---
  const energyCapped =
    snap.energyAvailable === snap.energyCapacityAvailable;

  if (energyCapped) {
    return this.setState(ROOM_STATE.GROW);
  }

  if (snap.constructionSites.length > 0) {
    return this.setState(ROOM_STATE.GROW);
  }

  return this.setState(ROOM_STATE.STABLE);
};
