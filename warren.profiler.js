/**
 * warren.profiler.js
 *
 * Comprehensive 5-minute profiling system for the Skaven warren.
 * Designed to answer two questions:
 *   1. "What happened?" — anomaly detection, event log, death tracking
 *   2. "What should we do next?" — pipeline analysis, capacity gaps, efficiency
 *
 * Console commands:
 *   profile()           — start a new 300-tick run
 *   profile('status')   — progress check
 *   profile('report')   — dump full JSON report (works mid-run or after)
 *   profile('stop')     — cancel early
 *
 * Data collected:
 *
 *   AGGREGATED (every tick, running sums — low memory cost):
 *     - Energy ratio avg/min/max, cap/drought events
 *     - Spawn utilization, idle ticks
 *     - Controller progress rate → ETA to next level
 *     - Dropped energy avg/max
 *     - Road damage start vs end
 *     - CPU avg/max
 *     - Container fill avg per type (controller/source)
 *     - Extension saturation vs RCL max
 *
 *   EVENT LOG (max 100 entries — timestamped significant moments):
 *     - SPAWN: role, body breakdown, energy cost, energy available at spawn
 *     - DEATH_NATURAL: role, name, ticks lived
 *     - DEATH_KILLED: role, name, ticks lived (ttl > 0 at death)
 *     - ROLE_GAP_OPEN: which role, how many missing
 *     - ROLE_GAP_CLOSE: role recovered
 *
 *   ANOMALY LOG (max 5 full snapshots — triggered automatically):
 *     Triggers when:
 *       - Energy drops >25% between sample points
 *       - Dropped energy spike > 500
 *       - Miner count falls below source count
 *     Snapshot captures: full creep roster with TTL, container fills,
 *     spawn state, energy, what each role was doing (working/gathering)
 *
 *   CREEP REGISTRY (all creeps seen during run):
 *     - Role, body composition (parts by type), estimated energy cost
 *     - TTL at run start (or spawn tick if spawned during run)
 *     - TTL at run end, or death tick + cause
 *     - Outcome: alive | died_natural | died_killed
 *
 *   PIPELINE ANALYSIS (computed at report time):
 *     - Mining: total active WORK parts vs source max (sources * 5)
 *     - Transport: total CARRY parts vs estimated demand
 *     - Spending: total clanrat WORK parts vs energy production rate
 *     - Upgrade: warlock WORK parts
 *
 *   TREND LINE (sample every 60 ticks — 5 points):
 *     - Energy %, dropped energy, creep count, CPU, damaged roads,
 *       container fills, spawn state
 *
 * Called from: main.js — Profiler.tick() once per tick, before game logic.
 */

const PROFILE_TICKS   = 300;
const SAMPLE_INTERVAL = 60;
const MAX_EVENTS      = 100;
const MAX_ANOMALIES   = 5;

const Profiler = {

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  command(cmd) {
    if (!cmd) return this.start();
    switch (cmd) {
      case 'status': return this.status();
      case 'report': return this.report();
      case 'stop':   return this.stop();
      default:
        console.log('[profiler] unknown command: ' + cmd +
          '. Use: profile() | profile("status") | profile("report") | profile("stop")');
    }
  },

  start() {
    if (Memory.profiler && Memory.profiler.active) {
      console.log('[profiler] already running — ' + this._ticksRemaining() +
        ' ticks remaining. Use profile("stop") to cancel.');
      return;
    }

    Memory.profiler = {
      active:    true,
      startTick: Game.time,
      endTick:   Game.time + PROFILE_TICKS,
      ticks:     0,
      rooms:     {},
      // Global logs shared across rooms (most runs are single-room)
      eventLog:     [],
      anomalyLog:   [],
      creepRegistry: {}
    };

    // Seed creep registry with all currently alive creeps
    for (const name in Game.creeps) {
      const c = Game.creeps[name];
      Memory.profiler.creepRegistry[name] = this._registerCreep(c, false);
    }

    // Initialize per-room buckets
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      Memory.profiler.rooms[roomName] = this._initRoom(room);
    }

    console.log('[profiler] ====== PROFILE STARTED ====== tick ' + Game.time +
      ' — running for ' + PROFILE_TICKS + ' ticks (~5 min).' +
      ' profile("status") to check progress.');
  },

  stop() {
    if (!Memory.profiler || !Memory.profiler.active) {
      console.log('[profiler] no active run.');
      return;
    }
    Memory.profiler.active = false;
    console.log('[profiler] stopped after ' + Memory.profiler.ticks + ' ticks.');
  },

  status() {
    if (!Memory.profiler) {
      console.log('[profiler] no data. Run profile() to start.');
      return;
    }
    const p = Memory.profiler;
    if (p.active) {
      const remaining = p.endTick - Game.time;
      const pct = Math.round(p.ticks / PROFILE_TICKS * 100);
      console.log('[profiler] running — ' + p.ticks + '/' + PROFILE_TICKS +
        ' ticks (' + pct + '%) — ' + remaining + ' ticks remaining (~' +
        Math.round(remaining / 60) + ' min)');
    } else {
      console.log('[profiler] complete — ' + p.ticks +
        ' ticks collected. Use profile("report") to see results.');
    }
  },

  report() {
    if (!Memory.profiler) {
      console.log('[profiler] no data. Run profile() to start.');
      return;
    }

    const p       = Memory.profiler;
    const elapsed = p.ticks;

    if (elapsed === 0) {
      console.log('[profiler] no ticks collected yet.');
      return;
    }

    const output = {
      meta: {
        startTick:      p.startTick,
        currentTick:    Game.time,
        ticksCollected: elapsed,
        targetTicks:    PROFILE_TICKS,
        complete:       !p.active,
        pct:            Math.round(elapsed / PROFILE_TICKS * 100)
      },
      rooms:         {},
      eventLog:      p.eventLog,
      anomalyLog:    p.anomalyLog,
      creepRegistry: this._summarizeRegistry(p.creepRegistry)
    };

    for (const roomName in p.rooms) {
      const r  = p.rooms[roomName];
      const et = elapsed;

      // ETA calculation
      const progressDelta = r.controllerProgressEnd - r.controllerProgressStart;
      const ratePerTick   = progressDelta / et;
      const remaining     = r.controllerProgressTotal - r.controllerProgressEnd;
      const estTicks      = ratePerTick > 0 ? Math.round(remaining / ratePerTick) : null;
      const estHours      = estTicks ? parseFloat((estTicks / 3600).toFixed(1)) : null;

      // Spawn actual count (spawns completed = ticks where remainingTime hit 0)
      const spawnedRoles  = p.eventLog
        .filter(e => e.type === 'SPAWN' && e.room === roomName)
        .reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});

      // Pipeline analysis
      const pipeline = this._analyzePipeline(roomName, r, p.creepRegistry);

      output.rooms[roomName] = {
        rcl: r.rclEnd || r.rclStart,

        extensions: {
          built:   r.extensionsBuilt,
          rclMax:  r.extensionsMax,
          missing: Math.max(0, r.extensionsMax - r.extensionsBuilt),
          energyCapacityLost: Math.max(0, r.extensionsMax - r.extensionsBuilt) * 50
        },

        energy: {
          avgPct:        Math.round(r.energyRatioSum / et * 100),
          minPct:        Math.round(r.energyRatioMin * 100),
          maxPct:        Math.round(r.energyRatioMax * 100),
          capEvents:     r.energyCapEvents,
          droughtEvents: r.energyDroughtEvents,
          capPct:        Math.round(r.energyCapEvents / et * 100),
          droughtPct:    Math.round(r.energyDroughtEvents / et * 100)
        },

        spawn: {
          utilizationPct: Math.round(r.spawnBusyTicks / et * 100),
          idleTicks:      et - r.spawnBusyTicks,
          // spawnedTicks = time spent spawning per role (from rolling counter)
          spawnedTicks:   r.spawned,
          // spawnedCount = actual completed spawns (from event log)
          spawnedCount:   spawnedRoles,
          avgEnergyAtSpawn: r.spawnCount > 0
            ? Math.round(r.spawnEnergySum / r.spawnCount)
            : null
        },

        controller: {
          progressStart:   r.controllerProgressStart,
          progressEnd:     r.controllerProgressEnd,
          delta:           progressDelta,
          ratePerTick:     parseFloat(ratePerTick.toFixed(2)),
          estTicksToLevel: estTicks,
          estHoursToLevel: estHours
        },

        containers: {
          controller: r.containerControllerSum > 0
            ? { avgPct: Math.round(r.containerControllerSum / r.containerControllerTicks) }
            : null,
          source: r.containerSourceSum > 0
            ? { avgPct: Math.round(r.containerSourceSum / r.containerSourceTicks) }
            : null
        },

        droppedEnergy: {
          avg:        Math.round(r.droppedSum / et),
          max:        r.droppedMax,
          assessment: r.droppedSum / et < 200 ? 'healthy' :
            r.droppedSum / et < 500 ? 'mild backlog' : 'thralls overwhelmed'
        },

        roads: {
          damagedStart:  r.roadDamagedStart,
          damagedEnd:    r.roadDamagedEnd,
          criticalEnd:   r.roadCriticalEnd,
          decayRate:     parseFloat(((r.roadDamagedEnd - r.roadDamagedStart) / et).toFixed(4)),
          assessment:    r.roadDamagedEnd > r.roadDamagedStart ? 'deteriorating' :
            r.roadDamagedEnd < r.roadDamagedStart ? 'improving' : 'stable'
        },

        cpu: {
          avg: parseFloat((r.cpuSum / et).toFixed(2)),
          max: parseFloat(r.cpuMax.toFixed(2))
        },

        creeps: {
          start:        r.creepsStart,
          end:          r.creepsEnd,
          roleGapTicks: r.roleGapTicks,
          roleGapPct:   Math.round(r.roleGapTicks / et * 100)
        },

        pipeline,

        trend: r.samples
      };
    }

    console.log(JSON.stringify(output, null, 2));
  },

  // -------------------------------------------------------------------------
  // Per-tick collection
  // -------------------------------------------------------------------------

  tick() {
    if (!Memory.profiler || !Memory.profiler.active) return;

    const p       = Memory.profiler;
    const cpuUsed = Game.cpu.getUsed();

    // Check completion
    if (Game.time >= p.endTick) {
      p.active = false;
      this._markSurvivors(p.creepRegistry);
      console.log('[profiler] ====== PROFILE COMPLETE ====== ' +
        p.ticks + ' ticks collected. Type profile("report") to see results.');
      return;
    }

    p.ticks++;

    // --- Creep lifecycle tracking ---
    // Detect new spawns and deaths by diffing known registry
    this._trackCreepLifecycle(p);

    for (const roomName in p.rooms) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      const r       = p.rooms[roomName];
      const sources = room.find(FIND_SOURCES);
      const spawns  = room.find(FIND_MY_SPAWNS);
      const dropped = room.find(FIND_DROPPED_RESOURCES, {
        filter: d => d.resourceType === RESOURCE_ENERGY
      });
      const droppedTotal = dropped.reduce((s, d) => s + d.amount, 0);
      const roads        = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_ROAD
      });
      const containers = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER
      });
      const creeps  = Object.values(Game.creeps).filter(c => c.memory.homeRoom === roomName);
      const miners  = creeps.filter(c => c.memory.role === 'miner');
      const thralls = creeps.filter(c => c.memory.role === 'thrall');

      const energyRatio    = room.energyAvailable / room.energyCapacityAvailable;
      const damagedRoads   = roads.filter(rd => rd.hits < rd.hitsMax * 0.5).length;
      const criticalRoads  = roads.filter(rd => rd.hits < rd.hitsMax * 0.25).length;
      const extensions     = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_EXTENSION
      });

      // Energy
      r.energyRatioSum += energyRatio;
      r.energyRatioMin  = Math.min(r.energyRatioMin, energyRatio);
      r.energyRatioMax  = Math.max(r.energyRatioMax, energyRatio);
      if (energyRatio >= 1.0) r.energyCapEvents++;
      if (energyRatio < 0.2)  r.energyDroughtEvents++;

      // Spawn — detect new creep spawns completing this tick
      spawns.forEach(spawn => {
        if (spawn.spawning) {
          r.spawnBusyTicks++;
          const role = spawn.spawning.name.split('_')[0];
          r.spawned[role] = (r.spawned[role] || 0) + 1;

          // Record spawn completing (remainingTime === 1 means it finishes next tick)
          if (spawn.spawning.remainingTime === 1) {
            r.spawnCount++;
            r.spawnEnergySum += room.energyAvailable;
          }
        }
      });

      // Controller
      r.controllerProgressEnd   = room.controller.progress;
      r.controllerProgressTotal = room.controller.progressTotal;
      r.rclEnd                  = room.controller.level;

      // Extensions
      r.extensionsBuilt = extensions.length;
      r.extensionsMax   = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;

      // Dropped energy
      r.droppedSum += droppedTotal;
      r.droppedMax  = Math.max(r.droppedMax, droppedTotal);

      // Roads
      r.roadDamagedEnd  = damagedRoads;
      r.roadCriticalEnd = criticalRoads;

      // Container fill tracking
      containers.forEach(c => {
        const fillPct = Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100);
        if (c.pos.inRangeTo(room.controller, 3)) {
          r.containerControllerSum += fillPct;
          r.containerControllerTicks++;
        } else if (sources.some(src => c.pos.inRangeTo(src, 2))) {
          r.containerSourceSum += fillPct;
          r.containerSourceTicks++;
        }
      });

      // CPU
      r.cpuSum += cpuUsed;
      r.cpuMax  = Math.max(r.cpuMax, cpuUsed);

      // Creep end state
      const byRole = {};
      creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });
      r.creepsEnd = byRole;

      // Role gap tracking + events
      const prevGap = r._hadRoleGap;
      const hasGap  = miners.length < sources.length;
      if (hasGap) {
        r.roleGapTicks++;
        if (!prevGap) {
          this._logEvent(p, roomName, 'ROLE_GAP_OPEN', {
            role:    'miner',
            missing: sources.length - miners.length,
            sources: sources.length,
            miners:  miners.length
          });
        }
      } else if (prevGap) {
        this._logEvent(p, roomName, 'ROLE_GAP_CLOSE', {
          role: 'miner'
        });
      }
      r._hadRoleGap = hasGap;

      // Anomaly detection — check on sample ticks against previous sample
      if (p.ticks % SAMPLE_INTERVAL === 0) {
        const lastSample = r.samples[r.samples.length - 1];

        if (lastSample) {
          const energyDrop   = lastSample.energyPct - Math.round(energyRatio * 100);
          const droppedSpike = droppedTotal > 500;

          if ((energyDrop > 25 || droppedSpike) && p.anomalyLog.length < MAX_ANOMALIES) {
            const snapshot = this._captureAnomalySnapshot(room, roomName, creeps, containers, spawns, droppedTotal, {
              trigger:     energyDrop > 25 ? 'energy_crash' : 'dropped_spike',
              energyDrop:  energyDrop,
              droppedTotal
            });
            p.anomalyLog.push(snapshot);
            console.log('[profiler] ⚠️  ANOMALY at tick ' + Game.time +
              ' — ' + snapshot.trigger +
              (energyDrop > 25 ? ' (energy dropped ' + energyDrop + '%)' : '') +
              (droppedSpike ? ' (dropped energy: ' + droppedTotal + ')' : ''));
          }
        }

        // Trend sample
        r.samples.push({
          tick:         Game.time,
          energyPct:    Math.round(energyRatio * 100),
          droppedEnergy: droppedTotal,
          creepCount:   creeps.length,
          byRole:       Object.assign({}, byRole),
          cpuUsed:      parseFloat(cpuUsed.toFixed(2)),
          damagedRoads,
          spawnBusy:    spawns.some(s => s.spawning),
          containerController: (() => {
            const cc = containers.find(c => c.pos.inRangeTo(room.controller, 3));
            return cc ? Math.round(cc.store[RESOURCE_ENERGY] / cc.store.getCapacity(RESOURCE_ENERGY) * 100) : null;
          })()
        });
      }
    }
  },

  // -------------------------------------------------------------------------
  // Creep lifecycle tracking
  // -------------------------------------------------------------------------

  _trackCreepLifecycle(p) {
    const registry = p.creepRegistry;

    // Detect new spawns — creeps in Game not yet in registry
    for (const name in Game.creeps) {
      if (!registry[name]) {
        const c = Game.creeps[name];
        registry[name] = this._registerCreep(c, true);
        this._logEvent(p, c.memory.homeRoom || '?', 'SPAWN', {
          name:        c.name,
          role:        c.memory.role,
          body:        registry[name].body,
          energyCost:  registry[name].energyCost,
          ttl:         c.ticksToLive
        });
      }
    }

    // Detect deaths — creeps in registry (alive) not in Game
    for (const name in registry) {
      const entry = registry[name];
      if (entry.outcome !== 'alive') continue;
      if (!Game.creeps[name]) {
        // Dead — was it natural (ttl expired) or killed?
        // We can't know for certain but if their last recorded TTL was > 50
        // and they disappeared, they were likely killed
        const wasKilled = entry.lastTTL > 50;
        entry.outcome   = wasKilled ? 'died_killed' : 'died_natural';
        entry.deathTick = Game.time;
        entry.ticksLived = Game.time - entry.spawnTick;

        this._logEvent(p, entry.homeRoom || '?',
          wasKilled ? 'DEATH_KILLED' : 'DEATH_NATURAL', {
            name:      name,
            role:      entry.role,
            ticksLived: entry.ticksLived,
            lastTTL:   entry.lastTTL,
            body:      entry.body
          });
      } else {
        // Still alive — update last known TTL
        entry.lastTTL = Game.creeps[name].ticksToLive;
      }
    }
  },

  _registerCreep(creep, spawnedDuringRun) {
    const body     = {};
    const partCost = {
      [WORK]: 100, [CARRY]: 50, [MOVE]: 50,
      [ATTACK]: 80, [RANGED_ATTACK]: 150,
      [TOUGH]: 10, [HEAL]: 250, [CLAIM]: 600
    };

    let energyCost = 0;
    creep.body.forEach(part => {
      body[part.type] = (body[part.type] || 0) + 1;
      energyCost += partCost[part.type] || 0;
    });

    // Estimate spawn tick from name (e.g. "miner_237500")
    const nameParts = creep.name.split('_');
    const spawnTick = nameParts.length > 1 ? parseInt(nameParts[nameParts.length - 1]) : Game.time;

    return {
      role:             creep.memory.role,
      homeRoom:         creep.memory.homeRoom,
      body,
      energyCost,
      spawnTick,
      ttlAtRegistration: creep.ticksToLive,
      lastTTL:          creep.ticksToLive,
      spawnedDuringRun,
      outcome:          'alive',
      deathTick:        null,
      ticksLived:       null
    };
  },

  _markSurvivors(registry) {
    for (const name in registry) {
      if (registry[name].outcome === 'alive' && Game.creeps[name]) {
        registry[name].ttlAtEnd = Game.creeps[name].ticksToLive;
      }
    }
  },

  _summarizeRegistry(registry) {
    // Group by role for a cleaner summary, keep full details for deaths and kills
    const summary = {
      byRole:  {},
      deaths:  [],
      kills:   [],
      alive:   []
    };

    for (const name in registry) {
      const e = registry[name];

      summary.byRole[e.role] = summary.byRole[e.role] || {
        count: 0, spawnedDuringRun: 0, avgEnergyCost: 0, _costSum: 0
      };
      const rb = summary.byRole[e.role];
      rb.count++;
      rb._costSum += e.energyCost;
      rb.avgEnergyCost = Math.round(rb._costSum / rb.count);
      if (e.spawnedDuringRun) rb.spawnedDuringRun++;

      if (e.outcome === 'died_natural') {
        summary.deaths.push({name, role: e.role, ticksLived: e.ticksLived, body: e.body});
      } else if (e.outcome === 'died_killed') {
        summary.kills.push({name, role: e.role, ticksLived: e.ticksLived, lastTTL: e.lastTTL, body: e.body});
      } else {
        summary.alive.push({name, role: e.role, ttlAtEnd: e.ttlAtEnd || e.lastTTL, body: e.body});
      }
    }

    // Clean up internal sum fields
    for (const role in summary.byRole) {
      delete summary.byRole[role]._costSum;
    }

    return summary;
  },

  // -------------------------------------------------------------------------
  // Anomaly snapshot
  // -------------------------------------------------------------------------

  _captureAnomalySnapshot(room, roomName, creeps, containers, spawns, droppedTotal, meta) {
    return {
      tick:        Game.time,
      trigger:     meta.trigger,
      energyDrop:  meta.energyDrop || null,
      droppedTotal,
      energy: {
        available: room.energyAvailable,
        capacity:  room.energyCapacityAvailable,
        pct:       Math.round(room.energyAvailable / room.energyCapacityAvailable * 100)
      },
      spawn: spawns.map(s => ({
        name:     s.name,
        spawning: s.spawning
          ? { name: s.spawning.name, role: s.spawning.name.split('_')[0], ticksLeft: s.spawning.remainingTime }
          : null
      })),
      containers: containers.map(c => ({
        type:    c.pos.inRangeTo(room.controller, 3) ? 'controller' : 'source',
        energy:  c.store[RESOURCE_ENERGY],
        pct:     Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100),
        hits:    c.hits,
        hitsMax: c.hitsMax
      })),
      creeps: creeps.map(c => ({
        name:     c.name,
        role:     c.memory.role,
        ttl:      c.ticksToLive,
        working:  c.memory.working || c.memory.delivering || null,
        store:    c.store[RESOURCE_ENERGY]
      })).sort((a, b) => a.ttl - b.ttl)
    };
  },

  // -------------------------------------------------------------------------
  // Pipeline analysis
  // -------------------------------------------------------------------------

  _analyzePipeline(roomName, r, registry) {
    const room = Game.rooms[roomName];
    if (!room) return null;

    const sources  = room.find(FIND_SOURCES);
    const srcMax   = sources.length * 5;     // 5 WORK = full drain per source
    const srcRate  = sources.length * 10;    // 10 energy/tick per fully-drained source

    // Sum parts from alive creeps by role
    let minerWork    = 0;
    let thrallCarry  = 0;
    let clanratWork  = 0;
    let warlockWork  = 0;

    for (const name in registry) {
      const e = registry[name];
      if (e.outcome !== 'alive' || e.homeRoom !== roomName) continue;
      const b = e.body;
      switch (e.role) {
        case 'miner':   minerWork   += b[WORK]  || 0; break;
        case 'thrall':  thrallCarry += b[CARRY] || 0; break;
        case 'clanrat': clanratWork += b[WORK]  || 0; break;
        case 'warlock': warlockWork += b[WORK]  || 0; break;
      }
    }

    // Thrall demand estimate:
    // Each thrall CARRY part holds 50 energy.
    // Trip distance is hard to know without pathfinding, so we estimate
    // a round-trip of ~40 ticks (rough mid-size room). Throughput per CARRY
    // part = 50/40 = 1.25 energy/tick. We need to match srcRate.
    const estThrallDemand = Math.ceil(srcRate / 1.25);

    return {
      mining: {
        activeWorkParts: minerWork,
        targetWorkParts: srcMax,
        utilizationPct:  Math.round(minerWork / srcMax * 100),
        assessment:      minerWork >= srcMax ? 'full drain' :
          minerWork >= srcMax * 0.6 ? 'partial drain' : 'severely undersourced'
      },
      transport: {
        activeCarryParts:   thrallCarry,
        estimatedDemand:    estThrallDemand,
        utilizationPct:     Math.round(thrallCarry / estThrallDemand * 100),
        assessment:         thrallCarry >= estThrallDemand ? 'sufficient' :
          thrallCarry >= estThrallDemand * 0.7 ? 'mild shortage' : 'bottleneck'
      },
      spending: {
        clanratWorkParts: clanratWork,
        warlockWorkParts: warlockWork,
        totalSpendWork:   clanratWork + warlockWork,
        // If spending < production we accumulate; if > we drain
        vsProductionRate: srcRate > 0
          ? parseFloat(((clanratWork + warlockWork) / srcRate).toFixed(2))
          : null,
        assessment: (clanratWork + warlockWork) < srcRate * 0.5 ? 'underutilizing production' :
          (clanratWork + warlockWork) < srcRate ? 'slight underspend' :
            (clanratWork + warlockWork) < srcRate * 1.5 ? 'balanced' : 'aggressive spending'
      }
    };
  },

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _initRoom(room) {
    const roads    = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD});
    const creeps   = Object.values(Game.creeps).filter(c => c.memory.homeRoom === room.name);
    const byRole   = {};
    const exts     = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_EXTENSION});
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });

    return {
      rclStart:                 room.controller.level,
      rclEnd:                   room.controller.level,
      energyRatioSum:           0,
      energyRatioMin:           Infinity,
      energyRatioMax:           0,
      energyCapEvents:          0,
      energyDroughtEvents:      0,
      spawnBusyTicks:           0,
      spawnCount:               0,
      spawnEnergySum:           0,
      spawned:                  {},
      controllerProgressStart:  room.controller.progress,
      controllerProgressEnd:    room.controller.progress,
      controllerProgressTotal:  room.controller.progressTotal,
      extensionsBuilt:          exts.length,
      extensionsMax:            CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0,
      containerControllerSum:   0,
      containerControllerTicks: 0,
      containerSourceSum:       0,
      containerSourceTicks:     0,
      droppedSum:               0,
      droppedMax:               0,
      roadDamagedStart:         roads.filter(r => r.hits < r.hitsMax * 0.5).length,
      roadDamagedEnd:           roads.filter(r => r.hits < r.hitsMax * 0.5).length,
      roadCriticalEnd:          roads.filter(r => r.hits < r.hitsMax * 0.25).length,
      cpuSum:                   0,
      cpuMax:                   0,
      creepsStart:              byRole,
      creepsEnd:                byRole,
      roleGapTicks:             0,
      _hadRoleGap:              false,
      samples:                  []
    };
  },

  _logEvent(p, roomName, type, data) {
    if (p.eventLog.length >= MAX_EVENTS) return;
    p.eventLog.push(Object.assign({ tick: Game.time, type, room: roomName }, data));
  },

  _ticksRemaining() {
    return Memory.profiler ? Memory.profiler.endTick - Game.time : 0;
  }

};

global.Profiler = Profiler;
global.profile  = function(cmd) { return Profiler.command(cmd); };

module.exports = Profiler;