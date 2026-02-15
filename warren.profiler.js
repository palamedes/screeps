/**
 * warren.profiler.js
 *
 * 5-minute profiling system for the Skaven warren.
 * Collects rolling metrics over a 300-tick window and produces a
 * structured JSON report for AI-assisted analysis.
 *
 * Console commands (all via the global profile() function):
 *   profile()           — start a new 300-tick profiling run
 *   profile('status')   — how far along the current run is
 *   profile('report')   — dump the JSON report (works mid-run or after)
 *   profile('stop')     — cancel the current run
 *
 * Data collected per tick (aggregated, not raw — Memory footprint stays small):
 *   - Energy ratio: avg/min/max, cap events (=100%), drought events (<20%)
 *   - Spawn: utilization %, list of what was spawned
 *   - Controller: progress delta → rate → ticks-to-next-level
 *   - Dropped energy: avg/max (high = thralls overwhelmed)
 *   - Road damage: start vs end (decay rate per tick)
 *   - CPU: avg/max
 *   - Creep population: start/end per role, ticks with role gaps (miner < sources)
 *   - Trend samples: lightweight snapshot every 60 ticks (5 points total)
 *
 * Called from: main.js (Profiler.tick() once per tick)
 */

const PROFILE_TICKS    = 300; // ~5 minutes at 1 tick/sec
const SAMPLE_INTERVAL  = 60;  // trend line sample every N ticks

const Profiler = {

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Main entry point. Call profile(cmd) from the console.
   *   profile()           → start
   *   profile('status')   → progress check
   *   profile('report')   → get results
   *   profile('stop')     → cancel
   */
  command(cmd) {
    if (!cmd) {
      return this.start();
    }
    switch (cmd) {
      case 'status': return this.status();
      case 'report': return this.report();
      case 'stop':   return this.stop();
      default:
        console.log('[profiler] unknown command: ' + cmd + '. Use: profile() | profile("status") | profile("report") | profile("stop")');
    }
  },

  start() {
    if (Memory.profiler && Memory.profiler.active) {
      console.log('[profiler] already running — ' + this._ticksRemaining() + ' ticks remaining. Use profile("stop") to cancel.');
      return;
    }

    Memory.profiler = {
      active:    true,
      startTick: Game.time,
      endTick:   Game.time + PROFILE_TICKS,
      ticks:     0,
      rooms:     {}
    };

    // Initialize per-room buckets
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      Memory.profiler.rooms[roomName] = this._initRoom(room);
    }

    console.log('[profiler] ====== PROFILE STARTED ====== tick ' + Game.time +
      ' — will run for ' + PROFILE_TICKS + ' ticks (~5 min). profile("status") to check progress.');
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
      console.log('[profiler] complete — ' + p.ticks + ' ticks collected. Use profile("report") to see results.');
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
        startTick:    p.startTick,
        currentTick:  Game.time,
        ticksCollected: elapsed,
        targetTicks:  PROFILE_TICKS,
        complete:     !p.active,
        pct:          Math.round(elapsed / PROFILE_TICKS * 100)
      },
      rooms: {}
    };

    for (const roomName in p.rooms) {
      const r  = p.rooms[roomName];
      const et = elapsed;

      output.rooms[roomName] = {
        rcl: r.rclEnd || r.rclStart,

        energy: {
          avgPct:       Math.round(r.energyRatioSum / et * 100),
          minPct:       Math.round(r.energyRatioMin * 100),
          maxPct:       Math.round(r.energyRatioMax * 100),
          capEvents:    r.energyCapEvents,
          droughtEvents: r.energyDroughtEvents,
          capPct:       Math.round(r.energyCapEvents / et * 100),
          droughtPct:   Math.round(r.energyDroughtEvents / et * 100)
        },

        spawn: {
          utilizationPct: Math.round(r.spawnBusyTicks / et * 100),
          idleTicks:      et - r.spawnBusyTicks,
          spawned:        r.spawned
        },

        controller: {
          progressStart:  r.controllerProgressStart,
          progressEnd:    r.controllerProgressEnd,
          delta:          r.controllerProgressEnd - r.controllerProgressStart,
          ratePerTick:    parseFloat(((r.controllerProgressEnd - r.controllerProgressStart) / et).toFixed(2)),
          estTicksToLevel: r.controllerProgressEnd > r.controllerProgressStart
            ? Math.round((r.controllerProgressTotal - r.controllerProgressEnd) /
              ((r.controllerProgressEnd - r.controllerProgressStart) / et))
            : null
        },

        droppedEnergy: {
          avg:   Math.round(r.droppedSum / et),
          max:   r.droppedMax,
          // High avg = thralls can't keep up with miners
          // Healthy target is < 200 avg
          assessment: r.droppedSum / et < 200 ? 'healthy' :
            r.droppedSum / et < 500 ? 'mild backlog' : 'thralls overwhelmed'
        },

        roads: {
          damagedStart:  r.roadDamagedStart,
          damagedEnd:    r.roadDamagedEnd,
          criticalEnd:   r.roadCriticalEnd,
          decayRate:     parseFloat(((r.roadDamagedEnd - r.roadDamagedStart) / et).toFixed(3)),
          assessment:    r.roadDamagedEnd > r.roadDamagedStart ? 'deteriorating' :
            r.roadDamagedEnd < r.roadDamagedStart ? 'improving' : 'stable'
        },

        cpu: {
          avg: parseFloat((r.cpuSum / et).toFixed(2)),
          max: parseFloat(r.cpuMax.toFixed(2))
        },

        creeps: {
          start:         r.creepsStart,
          end:           r.creepsEnd,
          roleGapTicks:  r.roleGapTicks,
          roleGapPct:    Math.round(r.roleGapTicks / et * 100)
        },

        // Trend line — 5 samples spaced across the window
        trend: r.samples
      };
    }

    console.log(JSON.stringify(output, null, 2));
  },

  // -------------------------------------------------------------------------
  // Per-tick collection (called from main.js)
  // -------------------------------------------------------------------------

  tick() {
    if (!Memory.profiler || !Memory.profiler.active) return;

    const p = Memory.profiler;

    // Check if run is complete
    if (Game.time >= p.endTick) {
      p.active = false;
      this._finalizeAll();
      console.log('[profiler] ====== PROFILE COMPLETE ====== ' +
        p.ticks + ' ticks collected. Type profile("report") to see results.');
      return;
    }

    const cpuUsed = Game.cpu.getUsed();
    p.ticks++;

    for (const roomName in p.rooms) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      const r           = p.rooms[roomName];
      const energyRatio = room.energyAvailable / room.energyCapacityAvailable;
      const sources     = room.find(FIND_SOURCES);
      const spawns      = room.find(FIND_MY_SPAWNS);
      const dropped     = room.find(FIND_DROPPED_RESOURCES, {filter: d => d.resourceType === RESOURCE_ENERGY});
      const droppedTotal = dropped.reduce((s, d) => s + d.amount, 0);
      const roads       = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD});
      const damagedRoads   = roads.filter(rd => rd.hits < rd.hitsMax * 0.5).length;
      const criticalRoads  = roads.filter(rd => rd.hits < rd.hitsMax * 0.25).length;
      const creeps      = Object.values(Game.creeps).filter(c => c.memory.homeRoom === roomName);
      const miners      = creeps.filter(c => c.memory.role === 'miner').length;

      // Energy stats
      r.energyRatioSum     += energyRatio;
      r.energyRatioMin      = Math.min(r.energyRatioMin, energyRatio);
      r.energyRatioMax      = Math.max(r.energyRatioMax, energyRatio);
      if (energyRatio >= 1.0) r.energyCapEvents++;
      if (energyRatio < 0.2)  r.energyDroughtEvents++;

      // Spawn stats
      const spawning = spawns.some(s => s.spawning);
      if (spawning) {
        r.spawnBusyTicks++;
        const sp = spawns.find(s => s.spawning);
        if (sp) {
          const role = sp.spawning.name.split('_')[0];
          r.spawned[role] = (r.spawned[role] || 0) + 1;
        }
      }

      // Controller
      r.controllerProgressEnd    = room.controller.progress;
      r.controllerProgressTotal  = room.controller.progressTotal;
      r.rclEnd                   = room.controller.level;

      // Dropped energy
      r.droppedSum += droppedTotal;
      r.droppedMax  = Math.max(r.droppedMax, droppedTotal);

      // Roads (update end state each tick — only start is frozen)
      r.roadDamagedEnd  = damagedRoads;
      r.roadCriticalEnd = criticalRoads;

      // CPU
      r.cpuSum += cpuUsed;
      r.cpuMax  = Math.max(r.cpuMax, cpuUsed);

      // Creep snapshot for end state
      const byRole = {};
      creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });
      r.creepsEnd = byRole;

      // Role gap detection — miner count below source count = economy stalled
      if (miners < sources.length) r.roleGapTicks++;

      // Trend sample every SAMPLE_INTERVAL ticks
      if (p.ticks % SAMPLE_INTERVAL === 0) {
        r.samples.push({
          tick:         Game.time,
          energyPct:    Math.round(energyRatio * 100),
          droppedEnergy: droppedTotal,
          creepCount:   creeps.length,
          cpuUsed:      parseFloat(cpuUsed.toFixed(2)),
          damagedRoads
        });
      }
    }
  },

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  _initRoom(room) {
    const sources     = room.find(FIND_SOURCES);
    const roads       = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD});
    const creeps      = Object.values(Game.creeps).filter(c => c.memory.homeRoom === room.name);
    const byRole      = {};
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });

    return {
      rclStart:                  room.controller.level,
      rclEnd:                    room.controller.level,
      energyRatioSum:            0,
      energyRatioMin:            Infinity,
      energyRatioMax:            0,
      energyCapEvents:           0,
      energyDroughtEvents:       0,
      spawnBusyTicks:            0,
      spawned:                   {},
      controllerProgressStart:   room.controller.progress,
      controllerProgressEnd:     room.controller.progress,
      controllerProgressTotal:   room.controller.progressTotal,
      droppedSum:                0,
      droppedMax:                0,
      roadDamagedStart:          roads.filter(r => r.hits < r.hitsMax * 0.5).length,
      roadDamagedEnd:            roads.filter(r => r.hits < r.hitsMax * 0.5).length,
      roadCriticalEnd:           roads.filter(r => r.hits < r.hitsMax * 0.25).length,
      cpuSum:                    0,
      cpuMax:                    0,
      creepsStart:               byRole,
      creepsEnd:                 byRole,
      roleGapTicks:              0,
      samples:                   []
    };
  },

  _finalizeAll() {
    // Nothing extra needed — end state is updated every tick
    // This hook exists for any future cleanup
  },

  _ticksRemaining() {
    return Memory.profiler ? Memory.profiler.endTick - Game.time : 0;
  }

};

// Expose as global so it works from the console
global.Profiler = Profiler;
global.profile  = function(cmd) { return Profiler.command(cmd); };

module.exports = Profiler;