/**
 * spawn.director.js
 *
 * Decides WHAT to spawn and WHEN.
 *
 * PARTS-BASED TARGETING (v2 - simplified):
 * Targets total part counts, not creep counts. Bodies auto-scale with cap.
 * Targets are now RCL-stepped to avoid over-spawning tiny creeps at low RCL.
 *
 * Dead weight detection has been relaxed:
 * - minRatio raised to 0.4 (was 0.5) — don't suicide a creep that's 45% effective
 * - Only suicides when you can afford the replacement AND 3+ creeps of that role exist
 *   (was 2) to avoid the "last two miners kill each other" scenario
 */

const Bodies = require('spawn.bodies');

const SPAWN_ENERGY_THRESHOLD = 0.9;

const PREEMPT_TTL = {
  miner:  80,
  thrall: 150
};

const DEADWEIGHT = {
  miner:   { part: 'work',  minRatio: 0.4 },
  thrall:  { part: 'carry', minRatio: 0.4 },
  clanrat: { part: 'work',  minRatio: 0.4 }
};

module.exports = {

  run(room) {
    const spawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning);
    if (!spawn) return;

    let creeps = this.getWarrenCreeps(room);

    if (creeps.length === 0 && room.energyAvailable >= 200) {
      this.spawnRat(spawn, 'slave', Bodies.slave(room.energyAvailable));
      return;
    }

    const suicided = this.checkDeadWeight(room, creeps);
    if (suicided) {
      creeps = creeps.filter(c => c.name !== suicided);
    }

    this.spawnByDemand(room, spawn, creeps);
  },

  // ---------------------------------------------------------------------------
  // Parts counting
  // ---------------------------------------------------------------------------

  countLivingParts(roomName, role, partType, minTTL) {
    return Object.values(Game.creeps)
      .filter(c => {
        if (c.memory.homeRoom !== roomName) return false;
        if (c.memory.role !== role) return false;
        if (minTTL !== undefined && c.ticksToLive !== undefined && c.ticksToLive < minTTL) return false;
        return true;
      })
      .reduce((sum, creep) => {
        const count = creep.body.filter(p => p.type === partType && p.hits > 0).length;
        return sum + count;
      }, 0);
  },

  // ---------------------------------------------------------------------------
  // Parts targets — simplified, RCL-stepped
  // ---------------------------------------------------------------------------

  calculatePartsTargets(room) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const cap     = room.energyCapacityAvailable;

    // --- MINERS: 5 WORK per source saturates it (10 energy/tick / 2 per WORK) ---
    const minerWorkTarget = sources.length * 5;

    // --- THRALLS: 1 at RCL2, sources+1 otherwise ---
    // Body auto-scales with cap. Capped at 10 CARRY pairs to keep bodies manageable.
    const pairsPerThrall    = Math.min(Math.floor(cap / 100), 10);
    const thrallCount       = rcl <= 2 ? 1 : sources.length + 1;
    const thrallCarryTarget = thrallCount * pairsPerThrall;

    // --- CLANRATS: conservative at low RCL, scale up later ---
    // At RCL2 just need 1 to build the controller container.
    // At RCL3+ need enough to handle build backlog and upgrade.
    const setsPerClanrat   = Math.min(Math.floor(cap / 200), 16);
    const clanratCountCap  = rcl <= 2
      ? sources.length
      : rcl <= 4
        ? sources.length * 2
        : sources.length * 3;
    const clanratWorkTarget = Math.min(16, clanratCountCap) * setsPerClanrat;

    // --- WARLOCK: sized for available energy, 1 dedicated upgrader ---
    const warlockWorkTarget = Math.min(
      Math.floor((cap - 150) / 100),  // overhead for CARRY+MOVE
      10
    );

    return {
      miner:   { parts: minerWorkTarget,   type: WORK  },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK  },
      warlock: { parts: warlockWorkTarget, type: WORK  }
    };
  },

  // ---------------------------------------------------------------------------
  // Spawn decision
  // ---------------------------------------------------------------------------

  spawnByDemand(room, spawn, creeps) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const energy  = room.energyAvailable;

    if (rcl === 1) {
      if (creeps.length < sources.length) {
        this.spawnRat(spawn, 'slave', Bodies.slave(energy));
      }
      return;
    }

    const targets = this.calculatePartsTargets(room);

    // ---- MINERS: preemptive, parts-based, hard capped at one per source ----
    const effectiveMinerWork = this.countLivingParts(
      room.name, 'miner', WORK, PREEMPT_TTL.miner
    );

    const activeMinerCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      c.memory.role === 'miner' &&
      (c.ticksToLive === undefined || c.ticksToLive >= PREEMPT_TTL.miner)
    ).length;

    if (effectiveMinerWork < targets.miner.parts && activeMinerCount < sources.length) {
      const body = Bodies.miner(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'miner', body);
          console.log(
            `[spawn:${room.name}] miner — ` +
            `${effectiveMinerWork}/${targets.miner.parts} WORK — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- THRALLS: preemptive, parts-based ----
    const effectiveThrallCarry = this.countLivingParts(
      room.name, 'thrall', CARRY, PREEMPT_TTL.thrall
    );

    if (effectiveThrallCarry < targets.thrall.parts) {
      const body = Bodies.thrall(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'thrall', body);
          console.log(
            `[spawn:${room.name}] thrall — ` +
            `${effectiveThrallCarry}/${targets.thrall.parts} CARRY — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- CLANRATS & WARLOCK: wait for energy threshold ----
    const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
    if (energyRatio < SPAWN_ENERGY_THRESHOLD) return;

    // ---- CLANRATS: parts-based ----
    const currentClanratWork = this.countLivingParts(room.name, 'clanrat', WORK);
    const workerWork         = this.countLivingParts(room.name, 'worker',  WORK);
    const totalClanratWork   = currentClanratWork + workerWork;

    if (totalClanratWork < targets.clanrat.parts) {
      const body = Bodies.clanrat(energy);
      if (body && body.length > 0) {
        const cost = this._bodyCost(body);
        if (energy >= cost) {
          this.spawnRat(spawn, 'clanrat', body);
          console.log(
            `[spawn:${room.name}] clanrat — ` +
            `${totalClanratWork}/${targets.clanrat.parts} WORK — ${body.length} parts, ${cost}e`
          );
          return;
        }
      }
    }

    // ---- WARLOCK: requires controller container ----
    const controllerContainer = room.find(FIND_STRUCTURES, {
      filter: s =>
        s.structureType === STRUCTURE_CONTAINER &&
        s.pos.inRangeTo(room.controller, 3)
    })[0];

    if (controllerContainer) {
      const currentWarlockWork = this.countLivingParts(room.name, 'warlock', WORK);

      if (currentWarlockWork < targets.warlock.parts) {
        const body = Bodies.warlock(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost) {
            this.spawnRat(spawn, 'warlock', body);
            console.log(
              `[spawn:${room.name}] warlock — ` +
              `${currentWarlockWork}/${targets.warlock.parts} WORK — ${body.length} parts, ${cost}e`
            );
          }
        }
      }
    }

    // ---- GUTTER RUNNER: one scout per room, RCL2+ ----
    if (rcl >= 2) {
      const hasScout = Object.values(Game.creeps).some(c =>
        c.memory.homeRoom === room.name &&
        c.memory.role === 'gutterrunner'
      );

      if (!hasScout) {
        const roomExits     = Game.map.describeExits(room.name);
        const intel         = Memory.intelligence || {};
        const STALE_AGE     = 5000;

        const needsScouting = Object.values(roomExits).some(roomName => {
          const entry = intel[roomName];
          return !entry || (Game.time - entry.scoutedAt) > STALE_AGE;
        });

        if (needsScouting) {
          const body = Bodies.gutterrunner(energy);
          if (body && body.length > 0) {
            const cost = this._bodyCost(body);
            if (energy >= cost) {
              this.spawnRat(spawn, 'gutterrunner', body);
              console.log(`[spawn:${room.name}] gutterrunner — ${body.length} MOVE, ${cost}e`);
              return;
            }
          }
        }
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Dead weight — relaxed thresholds to avoid suiciding during transitions
  // ---------------------------------------------------------------------------

  checkDeadWeight(room, creeps) {
    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      // Need at least 3 alive to suicide one (was 2 — "last two kill each other" bug)
      const sameRoleAlive = creeps.filter(c => c.memory.role === creep.memory.role).length;
      if (sameRoleAlive <= 2) continue;

      // Never suicide a creep that has taken combat damage
      const hasCombatDamage = creep.body.some(b => b.hits < 100);
      if (hasCombatDamage) continue;

      // Never suicide creeps close to natural death — let them live out their ticks
      if (creep.ticksToLive !== undefined && creep.ticksToLive < 200) continue;

      const bodyFn = Bodies[creep.memory.role];
      if (!bodyFn) continue;

      const idealBody = bodyFn(room.energyCapacityAvailable);
      const idealCost = this._bodyCost(idealBody);

      // Only suicide if we can afford the replacement right now
      if (room.energyAvailable < idealCost) continue;

      const idealCount = idealBody.filter(p => p === config.part).length;
      if (idealCount === 0) continue;

      const activeCount = creep.body.filter(
        b => b.type === config.part && b.hits > 0
      ).length;

      if (activeCount < idealCount * config.minRatio) {
        console.log(
          `[warren:${room.name}] dead weight: ${creep.name} ` +
          `(${creep.memory.role}, ${activeCount}/${idealCount} ${config.part} ` +
          `— ${Math.round(activeCount / idealCount * 100)}% of ideal) — suiciding`
        );
        creep.suicide();
        return creep.name;
      }
    }
    return null;
  },

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${Game.time}`;
    spawn.spawnCreep(body, name, {
      memory: {
        role,
        homeRoom: spawn.room.name
      }
    });
  },

  _bodyCost(body) {
    const costs = {
      work: 100, carry: 50, move: 50,
      attack: 80, ranged_attack: 150,
      tough: 10, heal: 250, claim: 600
    };
    return body.reduce((sum, part) => sum + (costs[part] || 0), 0);
  }

};
