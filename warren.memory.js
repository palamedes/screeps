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

Room.prototype._logAttackEvent = function (hostiles) {
  if (!Memory.attackLog) Memory.attackLog = [];

  // Deduplicate by attacker username within this wave
  const attackers = {};
  for (const h of hostiles) {
    const name = h.owner ? h.owner.username : 'unknown';
    if (!attackers[name]) {
      attackers[name] = {
        bodyParts: {},
        count: 0
      };
    }
    attackers[name].count++;
    for (const part of h.body) {
      if (part.hits > 0) {
        attackers[name].bodyParts[part.type] =
          (attackers[name].bodyParts[part.type] || 0) + 1;
      }
    }
  }

  const existing = Memory.attackLog;

  // Only write a new entry if this is a new wave (not same tick range as last entry)
  const lastEntry = existing[existing.length - 1];
  const isNewWave = !lastEntry ||
    lastEntry.room !== this.name ||
    (Game.time - lastEntry.lastSeen) > 50; // 50 tick gap = new wave

  if (isNewWave) {
    Memory.attackLog.push({
      room:      this.name,
      tick:      Game.time,
      lastSeen:  Game.time,
      attackers: Object.entries(attackers).map(([username, data]) => ({
        username,
        creepCount: data.count,
        bodyParts:  data.bodyParts
      }))
    });
    console.log(`[warren:${this.name}] ⚔️  ATTACK by: ${Object.keys(attackers).join(', ')}`);
  } else {
    // Update lastSeen on the current wave
    lastEntry.lastSeen = Game.time;
  }

  // Keep last 20 attack records
  if (Memory.attackLog.length > 20) Memory.attackLog.shift();
};

module.exports = { ROOM_STATE };
