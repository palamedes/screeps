/**
 * warren.blackbox.js
 *
 * Single unified instrumentation system for the Skaven warren.
 * Replaces warren.profiler.js — everything lives here, one tick call,
 * one Memory key, shared event log and creep registry.
 *
 * TWO MODES, ONE SYSTEM:
 *
 *   ROLLING RECORDER (always-on flight data recorder)
 *   ─────────────────────────────────────────────────
 *   Continuously maintains the last ~5 minutes of data.
 *   If something goes wrong, the evidence is already there.
 *   Data stored as 60-tick buckets; oldest auto-dropped when > 5 buckets.
 *
 *     blackbox()             start the recorder
 *     blackbox('stop')       pause the recorder (data retained)
 *     blackbox('report')     dump last ~300 ticks as JSON
 *     blackbox('status')     is it running, how much history
 *     blackbox('clear')      wipe all data
 *
 *   PROFILE RUN (manual fixed 300-tick snapshot)
 *   ─────────────────────────────────────────────
 *   Start a named run, walk away for 5 minutes, come back to a report.
 *   Shares the rolling recorder's infrastructure — no double-counting,
 *   no extra Memory cost. When the run completes a frozen snapshot is
 *   saved so profile('report') works any time afterward.
 *
 *     profile()              start a 300-tick profile run
 *     profile('status')      how many ticks collected so far
 *     profile('report')      dump the completed (or in-progress) run
 *     profile('stop')        cancel the run
 *
 *   NOTE: The blackbox recorder does NOT need to be running for profile()
 *   to work. But if it IS running, they share the same registry/event log
 *   — there is no duplication or conflict.
 *
 * MEMORY STRUCTURE:
 *   Memory.blackbox = {
 *     active:        bool          — recorder on/off
 *     startedAt:     tick
 *     totalTicks:    number
 *     buckets:       { roomName: [bucket, ...] }   max 5 per room
 *     currentBucket: { roomName: bucket }          in-progress
 *     eventLog:      [event, ...]                  last 300 ticks, auto-pruned
 *     anomalyLog:    [snapshot, ...]               last 5, kept forever
 *     creepRegistry: { name: entry }               pruned after 300 ticks
 *     profileRun:    { ... } | null                active/completed profile run
 *   }
 *
 * Called from: main.js — BlackBox.tick() once per tick, before game logic.
 */

const BUCKET_SIZE     = 60;
const MAX_BUCKETS     = 5;
const MAX_EVENTS      = 100;
const MAX_ANOMALIES   = 5;
const PROFILE_TICKS   = 300;

// ─────────────────────────────────────────────────────────────────────────────

const BlackBox = {

  // ───────────────────────────────────────────────────────────── Public API ──

  /**
   * blackbox(cmd)
   * Controls the rolling recorder.
   */
  blackbox(cmd) {
    if (!cmd) return this._recorderStart();
    switch (cmd) {
      case 'stop':   return this._recorderStop();
      case 'report': return this._recorderReport();
      case 'status': return this._recorderStatus();
      case 'clear':  return this._recorderClear();
      default:
        console.log('[blackbox] unknown command: ' + cmd +
          '. Use: blackbox() | blackbox("stop") | blackbox("report") | blackbox("status") | blackbox("clear")');
    }
  },

  /**
   * profile(cmd)
   * Controls a fixed 300-tick snapshot run.
   */
  profile(cmd) {
    if (!cmd) return this._profileStart();
    switch (cmd) {
      case 'status': return this._profileStatus();
      case 'report': return this._profileReport();
      case 'stop':   return this._profileStop();
      default:
        console.log('[profile] unknown command: ' + cmd +
          '. Use: profile() | profile("status") | profile("report") | profile("stop")');
    }
  },

  // ─────────────────────────────────────────────── Rolling recorder commands ──

  _recorderStart() {
    this._ensureMemory();
    const bb = Memory.blackbox;

    if (bb.active) {
      console.log('[blackbox] already running. blackbox("status") to check, blackbox("report") to dump.');
      return;
    }

    bb.active    = true;
    bb.startedAt = Game.time;

    this._seedRegistry(bb);
    this._initRoomBuckets(bb);

    console.log('[blackbox] ▶ recorder started at tick ' + Game.time +
      '. Type blackbox("report") any time to see the last ~5 min.');
  },

  _recorderStop() {
    if (!Memory.blackbox || !Memory.blackbox.active) {
      console.log('[blackbox] not running.');
      return;
    }
    Memory.blackbox.active = false;
    console.log('[blackbox] ■ recorder paused. Data retained. blackbox("report") to view.');
  },

  _recorderStatus() {
    if (!Memory.blackbox) {
      console.log('[blackbox] no data. Run blackbox() to start.');
      return;
    }
    const bb = Memory.blackbox;
    const bucketsStr = Object.entries(bb.buckets || {})
      .map(([room, b]) => room + ':' + b.length + ' buckets (' + (b.length * BUCKET_SIZE) + ' ticks)')
      .join(', ');
    console.log('[blackbox] ' + (bb.active ? '▶ running' : '■ paused') +
      ' — started tick ' + bb.startedAt +
      ' — total ticks collected: ' + bb.totalTicks +
      ' — history: ' + (bucketsStr || 'building first bucket...') +
      ' — events: ' + (bb.eventLog || []).length +
      ' — anomalies: ' + (bb.anomalyLog || []).length);
  },

  _recorderClear() {
    delete Memory.blackbox;
    console.log('[blackbox] data cleared.');
  },

  _recorderReport() {
    if (!this._hasValidMemory()) {
      console.log('[blackbox] no data. Run blackbox() to start.');
      return;
    }
    const bb = Memory.blackbox;
    if (bb.totalTicks === 0) {
      console.log('[blackbox] no ticks collected yet.');
      return;
    }
    console.log(JSON.stringify(this._buildReport(bb), null, 2));
  },

  // ─────────────────────────────────────────────────── Profile run commands ──

  _profileStart() {
    this._ensureMemory();
    const bb = Memory.blackbox;

    if (bb.profileRun && bb.profileRun.active) {
      const remaining = bb.profileRun.endTick - Game.time;
      console.log('[profile] already running — ' + bb.profileRun.ticks + '/' + PROFILE_TICKS +
        ' ticks (' + Math.round(bb.profileRun.ticks / PROFILE_TICKS * 100) + '%) — ' +
        remaining + ' ticks remaining. profile("stop") to cancel.');
      return;
    }

    bb.profileRun = {
      active:    true,
      startTick: Game.time,
      endTick:   Game.time + PROFILE_TICKS,
      ticks:     0,
      snapshot:  null   // frozen at completion
    };

    // Seed registry if the recorder isn't already running
    if (!bb.active) {
      this._seedRegistry(bb);
      this._initRoomBuckets(bb);
    }

    console.log('[profile] ====== PROFILE STARTED ====== tick ' + Game.time +
      ' — running for ' + PROFILE_TICKS + ' ticks (~5 min).' +
      ' profile("status") to check progress.');
  },

  _profileStatus() {
    if (!Memory.blackbox || !Memory.blackbox.profileRun) {
      console.log('[profile] no active run. Use profile() to start.');
      return;
    }
    const run = Memory.blackbox.profileRun;
    if (run.active) {
      const remaining = run.endTick - Game.time;
      const pct = Math.round(run.ticks / PROFILE_TICKS * 100);
      console.log('[profile] running — ' + run.ticks + '/' + PROFILE_TICKS +
        ' ticks (' + pct + '%) — ' + remaining + ' ticks remaining (~' +
        Math.round(remaining / 60) + ' min)');
    } else {
      console.log('[profile] complete — ' + run.ticks +
        ' ticks collected. Use profile("report") to see results.');
    }
  },

  _profileReport() {
    if (!Memory.blackbox || !Memory.blackbox.profileRun) {
      console.log('[profile] no data. Run profile() to start.');
      return;
    }
    const run = Memory.blackbox.profileRun;

    if (run.ticks === 0) {
      console.log('[profile] run started but no ticks collected yet.');
      return;
    }

    // If run is complete use the frozen snapshot; otherwise use live rolling data
    if (!run.active && run.snapshot) {
      console.log(JSON.stringify(run.snapshot, null, 2));
    } else {
      // Mid-run: report on the rolling window so far
      console.log(JSON.stringify(
        Object.assign(this._buildReport(Memory.blackbox), {
          meta: {
            mode:           'profile_run_in_progress',
            startTick:      run.startTick,
            currentTick:    Game.time,
            ticksCollected: run.ticks,
            targetTicks:    PROFILE_TICKS,
            pct:            Math.round(run.ticks / PROFILE_TICKS * 100)
          }
        }),
        null, 2
      ));
    }
  },

  _profileStop() {
    if (!Memory.blackbox || !Memory.blackbox.profileRun) {
      console.log('[profile] no active run.');
      return;
    }
    if (!Memory.blackbox.profileRun.active) {
      console.log('[profile] run already complete. profile("report") to see results.');
      return;
    }
    Memory.blackbox.profileRun.active = false;
    console.log('[profile] cancelled after ' + Memory.blackbox.profileRun.ticks + ' ticks.');
  },

  // ──────────────────────────────────────────────────── Per-tick collection ──

  tick() {
    // Nothing to do if neither mode is active
    if (!Memory.blackbox) return;
    const bb = Memory.blackbox;
    if (!bb.active && (!bb.profileRun || !bb.profileRun.active)) return;

    const cpuUsed = Game.cpu.getUsed();

    bb.totalTicks = (bb.totalTicks || 0) + 1;

    // Profile run tick counter
    if (bb.profileRun && bb.profileRun.active) {
      bb.profileRun.ticks++;

      if (Game.time >= bb.profileRun.endTick) {
        bb.profileRun.active   = false;
        bb.profileRun.snapshot = this._buildReport(bb);
        bb.profileRun.snapshot.meta = {
          mode:           'profile_run_complete',
          startTick:      bb.profileRun.startTick,
          endTick:        Game.time,
          ticksCollected: bb.profileRun.ticks,
          targetTicks:    PROFILE_TICKS,
          pct:            100
        };
        console.log('[profile] ====== PROFILE COMPLETE ====== ' +
          bb.profileRun.ticks + ' ticks. Type profile("report") to see results.');
      }
    }

    // Creep lifecycle
    this._trackCreepLifecycle(bb);

    // Prune old data
    const cutoff = Game.time - (MAX_BUCKETS * BUCKET_SIZE);
    bb.eventLog  = (bb.eventLog || []).filter(e => e.tick > cutoff);
    for (const name in bb.creepRegistry) {
      const e = bb.creepRegistry[name];
      if (e.outcome !== 'alive' && e.deathTick && e.deathTick < cutoff) {
        delete bb.creepRegistry[name];
      }
    }

    // Collect per-room data
    for (const roomName in (bb.currentBucket || {})) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      // Finalize bucket when full
      if (bb.currentBucket[roomName].ticks >= BUCKET_SIZE) {
        this._finalizeBucket(bb, roomName);
      }

      this._collectTick(bb, roomName, room, cpuUsed);
    }

    // Pick up any newly owned rooms
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      if (!bb.currentBucket[roomName]) {
        if (!bb.buckets[roomName]) bb.buckets[roomName] = [];
        bb.currentBucket[roomName] = this._initBucket(room);
      }
    }
  },

  // ──────────────────────────────────────────────────────── Data collection ──

  _collectTick(bb, roomName, room, cpuUsed) {
    const bucket   = bb.currentBucket[roomName];
    const sources  = room.find(FIND_SOURCES);
    const spawns   = room.find(FIND_MY_SPAWNS);
    const dropped  = room.find(FIND_DROPPED_RESOURCES, {filter: d => d.resourceType === RESOURCE_ENERGY});
    const droppedTotal = dropped.reduce((s, d) => s + d.amount, 0);
    const roads    = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD});
    const containers = room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_CONTAINER});
    const creeps   = Object.values(Game.creeps).filter(c => c.memory.homeRoom === roomName);
    const miners   = creeps.filter(c => c.memory.role === 'miner');
    const exts     = room.find(FIND_MY_STRUCTURES, {filter: s => s.structureType === STRUCTURE_EXTENSION});

    const energyRatio   = room.energyAvailable / room.energyCapacityAvailable;
    const damagedRoads  = roads.filter(r => r.hits < r.hitsMax * 0.5).length;
    const criticalRoads = roads.filter(r => r.hits < r.hitsMax * 0.25).length;

    bucket.ticks++;
    bucket.tickEnd = Game.time;

    // Energy
    bucket.energyRatioSum += energyRatio;
    bucket.energyRatioMin  = Math.min(bucket.energyRatioMin, energyRatio);
    bucket.energyRatioMax  = Math.max(bucket.energyRatioMax, energyRatio);
    if (energyRatio >= 1.0) bucket.energyCapEvents++;
    if (energyRatio < 0.2)  bucket.energyDroughtEvents++;

    // Spawn
    spawns.forEach(spawn => {
      if (spawn.spawning) {
        bucket.spawnBusyTicks++;
        if (spawn.spawning.remainingTime === 1) {
          bucket.spawnCount++;
          bucket.spawnEnergySum += room.energyAvailable;
        }
      }
    });

    // Controller
    bucket.controllerProgressEnd   = room.controller.progress;
    bucket.controllerProgressTotal = room.controller.progressTotal;
    bucket.rclEnd                  = room.controller.level;

    // Extensions
    bucket.extensionsBuilt = exts.length;
    bucket.extensionsMax   = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller.level] || 0;

    // Dropped energy
    bucket.droppedSum += droppedTotal;
    bucket.droppedMax  = Math.max(bucket.droppedMax, droppedTotal);

    // Roads
    bucket.roadDamagedEnd  = damagedRoads;
    bucket.roadCriticalEnd = criticalRoads;

    // Containers
    containers.forEach(c => {
      const fillPct = Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100);
      if (c.pos.inRangeTo(room.controller, 3)) {
        bucket.containerControllerSum += fillPct;
        bucket.containerControllerTicks++;
      } else if (sources.some(src => c.pos.inRangeTo(src, 2))) {
        bucket.containerSourceSum += fillPct;
        bucket.containerSourceTicks++;
      }
    });

    // CPU
    bucket.cpuSum += cpuUsed;
    bucket.cpuMax  = Math.max(bucket.cpuMax, cpuUsed);

    // Creep snapshot
    const byRole = {};
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });
    bucket.creepsEnd = byRole;

    // Role gaps
    if (miners.length < sources.length) bucket.roleGapTicks++;

    // Role gap events
    const hasGap  = miners.length < sources.length;
    const prevGap = bucket._lastHadGap;
    if (hasGap && !prevGap) {
      this._logEvent(bb, roomName, 'ROLE_GAP_OPEN', {
        role: 'miner', missing: sources.length - miners.length,
        miners: miners.length, sources: sources.length
      });
    } else if (!hasGap && prevGap) {
      this._logEvent(bb, roomName, 'ROLE_GAP_CLOSE', { role: 'miner' });
    }
    bucket._lastHadGap = hasGap;

    // Anomaly detection every 10 ticks
    if (bucket.ticks > 10 && bucket.ticks % 10 === 0) {
      const avgEnergy    = bucket.energyRatioSum / bucket.ticks;
      const energyCrash  = energyRatio < avgEnergy - 0.25;
      const droppedSpike = droppedTotal > 500;
      const minerGap     = miners.length < sources.length;

      if (energyCrash || droppedSpike || minerGap) {
        const recentAnomaly = bb.anomalyLog.length > 0 &&
          (Game.time - bb.anomalyLog[bb.anomalyLog.length - 1].tick) < 20;

        if (!recentAnomaly) {
          if (bb.anomalyLog.length >= MAX_ANOMALIES) bb.anomalyLog.shift();
          bb.anomalyLog.push(this._captureAnomaly(room, roomName, creeps, containers, spawns, droppedTotal, {
            trigger:      energyCrash ? 'energy_crash' : droppedSpike ? 'dropped_spike' : 'miner_gap',
            energyPct:    Math.round(energyRatio * 100),
            avgEnergyPct: Math.round(avgEnergy * 100),
            droppedTotal,
            minerCount:   miners.length,
            sourceCount:  sources.length
          }));
          console.log('[blackbox] ⚠️  ANOMALY tick ' + Game.time + ' — ' +
            (energyCrash  ? 'energy crash (' + Math.round(energyRatio * 100) + '% vs avg ' + Math.round(avgEnergy * 100) + '%)' :
             droppedSpike ? 'dropped spike (' + droppedTotal + ')' :
                            'miner gap (' + miners.length + '/' + sources.length + ')'));
        }
      }
    }

    // Trend sample at end of each bucket
    if (bucket.ticks === BUCKET_SIZE) {
      bucket.sample = {
        tick:          Game.time,
        energyPct:     Math.round(energyRatio * 100),
        energyAvgPct:  Math.round(bucket.energyRatioSum / bucket.ticks * 100),
        droppedAvg:    Math.round(bucket.droppedSum / bucket.ticks),
        droppedMax:    bucket.droppedMax,
        creepCount:    creeps.length,
        byRole:        Object.assign({}, byRole),
        cpuAvg:        parseFloat((bucket.cpuSum / bucket.ticks).toFixed(2)),
        damagedRoads,
        spawnBusyPct:  Math.round(bucket.spawnBusyTicks / bucket.ticks * 100),
        containerControllerAvgPct: bucket.containerControllerTicks > 0
          ? Math.round(bucket.containerControllerSum / bucket.containerControllerTicks)
          : null
      };
    }
  },

  // ──────────────────────────────────────────────────────────── Bucket mgmt ──

  _finalizeBucket(bb, roomName) {
    const bucket = bb.currentBucket[roomName];
    const room   = Game.rooms[roomName];

    bucket.pipeline = this._analyzePipeline(roomName, bb.creepRegistry);

    bb.buckets[roomName].push(bucket);
    if (bb.buckets[roomName].length > MAX_BUCKETS) {
      bb.buckets[roomName].shift();
    }

    bb.currentBucket[roomName] = room
      ? this._initBucket(room, bucket.controllerProgressEnd, bucket.rclEnd)
      : this._initBucket(null);
  },

  _initBucket(room, controllerProgressStart, rclStart) {
    const roads  = room ? room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_ROAD}) : [];
    const creeps = room ? Object.values(Game.creeps).filter(c => c.memory.homeRoom === room.name) : [];
    const byRole = {};
    creeps.forEach(c => { byRole[c.memory.role] = (byRole[c.memory.role] || 0) + 1; });

    return {
      tickStart:                Game.time,
      tickEnd:                  Game.time,
      ticks:                    0,
      rclStart:                 rclStart || (room ? room.controller.level : 0),
      rclEnd:                   rclStart || (room ? room.controller.level : 0),
      energyRatioSum:           0,
      energyRatioMin:           Infinity,
      energyRatioMax:           0,
      energyCapEvents:          0,
      energyDroughtEvents:      0,
      spawnBusyTicks:           0,
      spawnCount:               0,
      spawnEnergySum:           0,
      controllerProgressStart:  controllerProgressStart || (room ? room.controller.progress : 0),
      controllerProgressEnd:    controllerProgressStart || (room ? room.controller.progress : 0),
      controllerProgressTotal:  room ? room.controller.progressTotal : 0,
      extensionsBuilt:          0,
      extensionsMax:            0,
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
      _lastHadGap:              false,
      sample:                   null,
      pipeline:                 null
    };
  },

  // ─────────────────────────────────────────────────────────── Report builder ──

  _buildReport(bb) {
    const output = {
      meta: {
        startedAt:   bb.startedAt,
        currentTick: Game.time,
        active:      bb.active,
        totalTicks:  bb.totalTicks,
        windowTicks: Math.min(bb.totalTicks, MAX_BUCKETS * BUCKET_SIZE),
        windowMin:   parseFloat((Math.min(bb.totalTicks, MAX_BUCKETS * BUCKET_SIZE) / 60).toFixed(1))
      },
      rooms:         {},
      eventLog:      bb.eventLog || [],
      anomalyLog:    bb.anomalyLog || [],
      creepRegistry: this._summarizeRegistry(bb.creepRegistry || {})
    };

    for (const roomName in (bb.buckets || {})) {
      const completed = bb.buckets[roomName] || [];
      const current   = bb.currentBucket && bb.currentBucket[roomName];
      const allBuckets = current ? [...completed, Object.assign({}, current, {partial: true})] : completed;
      if (!allBuckets.length) continue;
      output.rooms[roomName] = this._combineRoomBuckets(roomName, allBuckets, bb);
    }

    return output;
  },

  _combineRoomBuckets(roomName, buckets, bb) {
    const first = buckets[0];
    const last  = buckets[buckets.length - 1];
    const totalTicks = buckets.reduce((s, b) => s + b.ticks, 0);
    if (totalTicks === 0) return null;

    let energyRatioSum = 0, energyRatioMin = Infinity, energyRatioMax = 0;
    let energyCapEvents = 0, energyDroughtEvents = 0;
    let spawnBusyTicks = 0, spawnCount = 0, spawnEnergySum = 0;
    let droppedSum = 0, droppedMax = 0;
    let cpuSum = 0, cpuMax = 0;
    let roleGapTicks = 0;
    let ccSum = 0, ccTicks = 0, csSum = 0, csTicks = 0;

    buckets.forEach(b => {
      energyRatioSum      += b.energyRatioSum;
      energyRatioMin       = Math.min(energyRatioMin, b.energyRatioMin === Infinity ? 1 : b.energyRatioMin);
      energyRatioMax       = Math.max(energyRatioMax, b.energyRatioMax);
      energyCapEvents     += b.energyCapEvents;
      energyDroughtEvents += b.energyDroughtEvents;
      spawnBusyTicks      += b.spawnBusyTicks;
      spawnCount          += b.spawnCount;
      spawnEnergySum      += b.spawnEnergySum;
      droppedSum          += b.droppedSum;
      droppedMax           = Math.max(droppedMax, b.droppedMax);
      cpuSum              += b.cpuSum;
      cpuMax               = Math.max(cpuMax, b.cpuMax);
      roleGapTicks        += b.roleGapTicks;
      ccSum               += b.containerControllerSum;
      ccTicks             += b.containerControllerTicks;
      csSum               += b.containerSourceSum;
      csTicks             += b.containerSourceTicks;
    });

    const progressDelta = last.controllerProgressEnd - first.controllerProgressStart;
    const ratePerTick   = totalTicks > 0 ? progressDelta / totalTicks : 0;
    const remaining     = last.controllerProgressTotal - last.controllerProgressEnd;
    const estTicks      = ratePerTick > 0 ? Math.round(remaining / ratePerTick) : null;

    const spawnedCount = (bb.eventLog || [])
      .filter(e => e.type === 'SPAWN' && e.room === roomName && e.tick >= first.tickStart)
      .reduce((acc, e) => { acc[e.role] = (acc[e.role] || 0) + 1; return acc; }, {});

    return {
      rcl:         last.rclEnd,
      windowTicks: totalTicks,

      extensions: {
        built:              last.extensionsBuilt,
        rclMax:             last.extensionsMax,
        missing:            Math.max(0, last.extensionsMax - last.extensionsBuilt),
        energyCapacityLost: Math.max(0, last.extensionsMax - last.extensionsBuilt) * 50
      },

      energy: {
        avgPct:        Math.round(energyRatioSum / totalTicks * 100),
        minPct:        Math.round(energyRatioMin * 100),
        maxPct:        Math.round(energyRatioMax * 100),
        capEvents:     energyCapEvents,
        droughtEvents: energyDroughtEvents,
        capPct:        Math.round(energyCapEvents / totalTicks * 100),
        droughtPct:    Math.round(energyDroughtEvents / totalTicks * 100)
      },

      spawn: {
        utilizationPct:   Math.round(spawnBusyTicks / totalTicks * 100),
        idleTicks:        totalTicks - spawnBusyTicks,
        spawnedCount,
        avgEnergyAtSpawn: spawnCount > 0 ? Math.round(spawnEnergySum / spawnCount) : null
      },

      controller: {
        progressStart:   first.controllerProgressStart,
        progressEnd:     last.controllerProgressEnd,
        delta:           progressDelta,
        ratePerTick:     parseFloat(ratePerTick.toFixed(2)),
        estTicksToLevel: estTicks,
        estHoursToLevel: estTicks ? parseFloat((estTicks / 3600).toFixed(1)) : null
      },

      containers: {
        controller: ccTicks > 0 ? { avgPct: Math.round(ccSum / ccTicks) } : null,
        source:     csTicks > 0 ? { avgPct: Math.round(csSum / csTicks) } : null
      },

      droppedEnergy: {
        avg:        Math.round(droppedSum / totalTicks),
        max:        droppedMax,
        assessment: droppedSum / totalTicks < 200 ? 'healthy' :
                    droppedSum / totalTicks < 500 ? 'mild backlog' : 'thralls overwhelmed'
      },

      roads: {
        damagedStart:  first.roadDamagedStart,
        damagedEnd:    last.roadDamagedEnd,
        criticalEnd:   last.roadCriticalEnd,
        decayRate:     parseFloat(((last.roadDamagedEnd - first.roadDamagedStart) / totalTicks).toFixed(4)),
        assessment:    last.roadDamagedEnd > first.roadDamagedStart ? 'deteriorating' :
                       last.roadDamagedEnd < first.roadDamagedStart ? 'improving' : 'stable'
      },

      cpu: {
        avg: parseFloat((cpuSum / totalTicks).toFixed(2)),
        max: parseFloat(cpuMax.toFixed(2))
      },

      creeps: {
        start:        first.creepsStart,
        end:          last.creepsEnd,
        roleGapTicks,
        roleGapPct:   Math.round(roleGapTicks / totalTicks * 100)
      },

      pipeline: last.pipeline || null,

      // Chronological trend — one point per completed bucket
      trend: buckets.filter(b => b.sample).map(b => b.sample)
    };
  },

  // ─────────────────────────────────────────────────────── Creep lifecycle ──

  _trackCreepLifecycle(bb) {
    const registry = bb.creepRegistry;

    for (const name in Game.creeps) {
      if (!registry[name]) {
        const c = Game.creeps[name];
        registry[name] = this._registerCreep(c, true);
        this._logEvent(bb, c.memory.homeRoom || '?', 'SPAWN', {
          name:       c.name,
          role:       c.memory.role,
          body:       registry[name].body,
          energyCost: registry[name].energyCost,
          ttl:        c.ticksToLive
        });
      }
    }

    for (const name in registry) {
      const entry = registry[name];
      if (entry.outcome !== 'alive') continue;
      if (!Game.creeps[name]) {
        const wasKilled  = entry.lastTTL > 50;
        entry.outcome    = wasKilled ? 'died_killed' : 'died_natural';
        entry.deathTick  = Game.time;
        entry.ticksLived = Game.time - entry.spawnTick;
        this._logEvent(bb, entry.homeRoom || '?',
          wasKilled ? 'DEATH_KILLED' : 'DEATH_NATURAL', {
          name:       name,
          role:       entry.role,
          ticksLived: entry.ticksLived,
          lastTTL:    entry.lastTTL,
          body:       entry.body
        });
      } else {
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
    const nameParts = creep.name.split('_');
    const spawnTick = nameParts.length > 1 ? parseInt(nameParts[nameParts.length - 1]) : Game.time;
    return {
      role: creep.memory.role, homeRoom: creep.memory.homeRoom,
      body, energyCost, spawnTick,
      lastTTL: creep.ticksToLive, spawnedDuringRun,
      outcome: 'alive', deathTick: null, ticksLived: null
    };
  },

  _summarizeRegistry(registry) {
    const summary = { byRole: {}, deaths: [], kills: [], alive: [] };
    for (const name in registry) {
      const e = registry[name];
      const rb = summary.byRole[e.role] = summary.byRole[e.role] ||
        { count: 0, spawnedDuringRun: 0, avgEnergyCost: 0, _costSum: 0 };
      rb.count++;
      rb._costSum += e.energyCost;
      rb.avgEnergyCost = Math.round(rb._costSum / rb.count);
      if (e.spawnedDuringRun) rb.spawnedDuringRun++;

      if      (e.outcome === 'died_natural') summary.deaths.push({name, role: e.role, ticksLived: e.ticksLived, body: e.body});
      else if (e.outcome === 'died_killed')  summary.kills.push({name, role: e.role, ticksLived: e.ticksLived, lastTTL: e.lastTTL, body: e.body});
      else                                   summary.alive.push({name, role: e.role, ttlRemaining: e.lastTTL, body: e.body});
    }
    for (const role in summary.byRole) delete summary.byRole[role]._costSum;
    return summary;
  },

  // ───────────────────────────────────────────────────── Pipeline analysis ──

  _analyzePipeline(roomName, registry) {
    const room = Game.rooms[roomName];
    if (!room) return null;

    const sources = room.find(FIND_SOURCES);
    const srcMax  = sources.length * 5;
    const srcRate = sources.length * 10;

    let minerWork = 0, thrallCarry = 0, clanratWork = 0, warlockWork = 0;
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

    const estThrallDemand = Math.ceil(srcRate / 1.25);

    return {
      mining: {
        activeWorkParts: minerWork, targetWorkParts: srcMax,
        utilizationPct:  Math.round(minerWork / srcMax * 100),
        assessment:      minerWork >= srcMax ? 'full drain' :
                         minerWork >= srcMax * 0.6 ? 'partial drain' : 'severely undersourced'
      },
      transport: {
        activeCarryParts: thrallCarry, estimatedDemand: estThrallDemand,
        utilizationPct:   Math.round(thrallCarry / estThrallDemand * 100),
        assessment:       thrallCarry >= estThrallDemand ? 'sufficient' :
                          thrallCarry >= estThrallDemand * 0.7 ? 'mild shortage' : 'bottleneck'
      },
      spending: {
        clanratWorkParts: clanratWork, warlockWorkParts: warlockWork,
        totalSpendWork:   clanratWork + warlockWork,
        vsProductionRate: srcRate > 0 ? parseFloat(((clanratWork + warlockWork) / srcRate).toFixed(2)) : null,
        assessment:       (clanratWork + warlockWork) < srcRate * 0.5 ? 'underutilizing production' :
                          (clanratWork + warlockWork) < srcRate        ? 'slight underspend' :
                          (clanratWork + warlockWork) < srcRate * 1.5  ? 'balanced' : 'aggressive spending'
      }
    };
  },

  // ───────────────────────────────────────────────────── Anomaly snapshot ──

  _captureAnomaly(room, roomName, creeps, containers, spawns, droppedTotal, meta) {
    return Object.assign({ tick: Game.time, room: roomName }, meta, {
      energy: {
        available: room.energyAvailable, capacity: room.energyCapacityAvailable,
        pct: Math.round(room.energyAvailable / room.energyCapacityAvailable * 100)
      },
      spawn: spawns.map(s => ({
        name: s.name,
        spawning: s.spawning
          ? { name: s.spawning.name, role: s.spawning.name.split('_')[0], ticksLeft: s.spawning.remainingTime }
          : null
      })),
      containers: containers.map(c => ({
        type:   c.pos.inRangeTo(room.controller, 3) ? 'controller' : 'source',
        energy: c.store[RESOURCE_ENERGY],
        pct:    Math.round(c.store[RESOURCE_ENERGY] / c.store.getCapacity(RESOURCE_ENERGY) * 100)
      })),
      creeps: creeps.map(c => ({
        name: c.name, role: c.memory.role, ttl: c.ticksToLive,
        working: c.memory.working || c.memory.delivering || null,
        store: c.store[RESOURCE_ENERGY]
      })).sort((a, b) => a.ttl - b.ttl)
    });
  },

  // ──────────────────────────────────────────────────────────────── Helpers ──

  _ensureMemory() {
    if (!Memory.blackbox) {
      Memory.blackbox = {
        active: false, startedAt: null, totalTicks: 0,
        buckets: {}, currentBucket: {},
        eventLog: [], anomalyLog: [], creepRegistry: {},
        profileRun: null
      };
    }
    // Ensure all fields exist (safe upgrade from older structure)
    const bb = Memory.blackbox;
    if (!bb.buckets)       bb.buckets       = {};
    if (!bb.currentBucket) bb.currentBucket = {};
    if (!bb.eventLog)      bb.eventLog      = [];
    if (!bb.anomalyLog)    bb.anomalyLog    = [];
    if (!bb.creepRegistry) bb.creepRegistry = {};
    if (bb.totalTicks === undefined) bb.totalTicks = 0;
  },

  _seedRegistry(bb) {
    for (const name in Game.creeps) {
      if (!bb.creepRegistry[name]) {
        bb.creepRegistry[name] = this._registerCreep(Game.creeps[name], false);
      }
    }
  },

  _initRoomBuckets(bb) {
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (!room.controller || !room.controller.my) continue;
      if (!bb.buckets[roomName])       bb.buckets[roomName]       = [];
      if (!bb.currentBucket[roomName]) bb.currentBucket[roomName] = this._initBucket(room);
    }
  },

  _hasValidMemory() {
    const bb = Memory.blackbox;
    return bb && bb.buckets !== undefined && bb.eventLog !== undefined && bb.creepRegistry !== undefined;
  },

  _logEvent(bb, roomName, type, data) {
    if (!bb.eventLog) bb.eventLog = [];
    if (bb.eventLog.length >= MAX_EVENTS) bb.eventLog.shift();
    bb.eventLog.push(Object.assign({ tick: Game.time, type, room: roomName }, data));
  }

};

// ─────────────────────────────────────────────────────────── Global exports ──

global.BlackBox = BlackBox;
global.blackbox = function(cmd) { return BlackBox.blackbox(cmd); };
global.profile  = function(cmd) { return BlackBox.profile(cmd); };

module.exports = BlackBox;