/**
 * spawn.director.js
 *
 * FIXES in this version:
 *
 * 1. MINERS BEFORE THRALLS — hard rule.
 *    If activeMinerCount < sources.length, thralls do not spawn.
 *    Period. A source sitting idle costs more than a thrall waiting.
 *
 * 2. THRALL TARGET SIMPLIFIED.
 *    At RCL2 with 300 cap: old formula gave target=3 CARRY (3 tiny thralls).
 *    New formula: target = pairs in ONE ideal thrall body.
 *    We want 1 well-sized thrall, not 3 tiny ones clogging traffic.
 *    At RCL3+ scales to sources+1 thralls worth of CARRY.
 *
 * 3. DEAD WEIGHT minimum raised to 3 alive (was 2).
 *    Extra guard: never suicide if TTL < 200.
 */

const Bodies = require('spawn.bodies');

const SPAWN_ENERGY_THRESHOLD = 0.9;

const PREEMPT_TTL = {
  miner:  80,
  thrall: 150
};

const NAMES = ['gnaw','skritt','queek','lurk','ruin','blight','fang','scab','gash','rot',
  'skulk','twitch','snikk','claw','filth','mangle','reek','slit','spite','pox',
  'rattle','skree','chitter','bleed','warp','snarl','scrape','bite','mire','fester',
  'hook','tatter','scurry','crack','nibble','scour','screech','itch','grime','rend'
  ];

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

  calculatePartsTargets(room) {
    const rcl     = room.controller.level;
    const sources = room.find(FIND_SOURCES);
    const cap     = room.energyCapacityAvailable;

    // MINERS: 5 WORK per source saturates it
    const minerWorkTarget = sources.length * 5;

    // THRALLS: target = CARRY parts in one ideal thrall body at current cap.
    // At RCL2 (300 cap): 1 thrall with 3 CARRY = 3 target.
    // BUT we spawn one at a time so this just means "get one good thrall".
    // At RCL3+: scale to sources+1 thralls worth.
    const pairsPerThrall = Math.min(Math.floor(cap / 100), 10);

    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_EXTENSION
    }).length;
    const hasStorage = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType === STRUCTURE_STORAGE
    }).length > 0;
    
    const thrallCount = (extensions === 0 && !hasStorage)
      ? 1                        // nowhere to put energy except spawn — one thrall is enough
      : rcl <= 3
        ? sources.length          // a few extensions exist, modest thrall count
        : sources.length + 1;     // storage/many extensions, full thrall complement

    const thrallCarryTarget = thrallCount * pairsPerThrall;

    // CLANRATS: conservative at low RCL
    const setsPerClanrat  = Math.min(Math.floor(cap / 200), 16);
    const clanratCountCap = rcl <= 2
      ? sources.length
      : rcl <= 4
        ? sources.length * 2
        : sources.length * 3;
    const clanratWorkTarget = Math.min(16, clanratCountCap) * setsPerClanrat;

    // WARLOCK: one dedicated upgrader
    const warlockWorkTarget = Math.min(Math.floor((cap - 150) / 100), 10);

    return {
      miner:   { parts: minerWorkTarget,   type: WORK  },
      thrall:  { parts: thrallCarryTarget, type: CARRY },
      clanrat: { parts: clanratWorkTarget, type: WORK, countCap: clanratCountCap },
      warlock: { parts: warlockWorkTarget, type: WORK  }
    };
  },

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

    // ---- MINERS: absolute first priority ----
    // If any source is uncovered, nothing else spawns until it's fixed.
    const effectiveMinerWork = this.countLivingParts(
      room.name, 'miner', WORK, PREEMPT_TTL.miner
    );

    const activeMinerCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      c.memory.role === 'miner' &&
      (c.ticksToLive === undefined || c.ticksToLive >= PREEMPT_TTL.miner)
    ).length;

    const minersNeeded = activeMinerCount < sources.length;

    if (effectiveMinerWork < targets.miner.parts && minersNeeded) {
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
      // FIX: if we need a miner but can't afford one yet, WAIT.
      // Don't fall through to spawn thralls with energy we need for the miner.
      return;
    }

    // ---- THRALLS: only spawn when miners are covered ----
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

    // ---- CLANRATS ----
    const currentClanratWork  = this.countLivingParts(room.name, 'clanrat', WORK);
    const workerWork          = this.countLivingParts(room.name, 'worker',  WORK);
    const totalClanratWork    = currentClanratWork + workerWork;
    const currentClanratCount = Object.values(Game.creeps).filter(c =>
      c.memory.homeRoom === room.name &&
      (c.memory.role === 'clanrat' || c.memory.role === 'worker')
    ).length;

    if (currentClanratCount >= targets.clanrat.countCap) return;

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

        const needsScouting = Object.values(roomExits).some(rName => {
          const entry = intel[rName];
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

    // ---- STORMVERMIN: spawn one when threatened, regardless of energy ----
    const { ROOM_STATE } = require('warren.memory');
    const roomState   = room.memory.state;
    const underThreat = roomState === ROOM_STATE.WAR ||
                        roomState === ROOM_STATE.FORTIFY;
    
    const hasHostiles = room.find(FIND_HOSTILE_CREEPS).filter(h =>
      h.getActiveBodyparts(WORK)         > 0 ||
      h.getActiveBodyparts(ATTACK)       > 0 ||
      h.getActiveBodyparts(RANGED_ATTACK) > 0
    ).length > 0;
    
    const needsStormvermin = underThreat || hasHostiles;
    
    if (needsStormvermin) {
      const svCount = Object.values(Game.creeps).filter(c =>
        c.memory.homeRoom === room.name &&
        c.memory.role === 'stormvermin'
      ).length;
    
      // One stormvermin at RCL2-3, two at RCL4+
      const svTarget = rcl >= 4 ? 2 : 1;
    
      if (svCount < svTarget) {
        const body = Bodies.stormvermin(energy);
        if (body && body.length > 0) {
          const cost = this._bodyCost(body);
          if (energy >= cost) {
            this.spawnRat(spawn, 'stormvermin', body);
            console.log(
              `[spawn:${room.name}] ⚔️  stormvermin — ${body.length} parts, ${cost}e`
            );
            return;
          }
        }
      }
    }    
  },

  checkDeadWeight(room, creeps) {
    for (const creep of creeps) {
      const config = DEADWEIGHT[creep.memory.role];
      if (!config) continue;

      const sameRoleAlive = creeps.filter(c => c.memory.role === creep.memory.role).length;
      if (sameRoleAlive <= 2) continue;

      const hasCombatDamage = creep.body.some(b => b.hits < 100);
      if (hasCombatDamage) continue;

      if (creep.ticksToLive !== undefined && creep.ticksToLive < 200) continue;

      const bodyFn = Bodies[creep.memory.role];
      if (!bodyFn) continue;

      const idealBody = bodyFn(room.energyCapacityAvailable);
      const idealCost = this._bodyCost(idealBody);
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

  getWarrenCreeps(room) {
    return Object.values(Game.creeps)
      .filter(c => c.memory.homeRoom === room.name);
  },

  spawnRat(spawn, role, body) {
    const name = `${role}_${NAMES[Game.time % NAMES.length]}${Math.floor(Game.time/10) % 100}`;
    spawn.spawnCreep(body, name, {
      memory: { role, homeRoom: spawn.room.name }
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
