const { ROOM_STATE } = require('warren.memory');

// How long to stay in FORTIFY after an attack clears (ticks)
const FORTIFY_DURATION = 1000;
const RAMPART_EXIT_HP  = 10000;

Room.prototype.orient = function () {
  const snap = this._snapshot;

  // --- Threat override ---
  const combatHostiles = snap.hostiles.filter(h =>
    h.getActiveBodyparts(ATTACK) > 0 ||
    h.getActiveBodyparts(RANGED_ATTACK) > 0
  );
  
  if (combatHostiles.length > 0) {
    this._logAttackEvent(combatHostiles);
    return this.setState(ROOM_STATE.WAR);
  }

  // --- FORTIFY: recent attack, no active safe mode ---
  // Hold a defensive posture until ramparts are healthy and some time has passed.
  const recentAttack = this.memory.lastAttackTick &&
    (Game.time - this.memory.lastAttackTick) < FORTIFY_DURATION;
  
  if (recentAttack) {
    // If we have a tower and ramparts are healthy enough, don't hold FORTIFY
    const hasTower = snap.towers.length > 0;
    const allRamparts = this.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_RAMPART
    });
    const rampartsHealthy = allRamparts.length === 0 ||
      allRamparts.every(r => r.hits >= RAMPART_EXIT_HP);
  
    if (!hasTower || !rampartsHealthy) {
      return this.setState(ROOM_STATE.FORTIFY);
    }
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
