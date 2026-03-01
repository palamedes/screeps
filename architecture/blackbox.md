# BlackBox Instrumentation — `warren.blackbox.js`

## Purpose

The BlackBox is a **flight data recorder for the warren**. It runs continuously
in the background, collecting data every tick and aggregating it into rolling
60-tick buckets. If something goes wrong — energy crashes, miner gaps, dropped
spikes — the evidence is already recorded. You don't need to anticipate problems
and start a capture first.

It also supports a manual **profile run** mode for focused 300-tick snapshots,
**per-creep diagnostics** for tracking individual behavior tick-by-tick, and
a **point-in-time snapshot** command for quickly reading current room state.

Everything lives in a single file and a single Memory key (`Memory.blackbox`).

---

## Quick Reference

```javascript
// Rolling recorder — start once after a deploy, leave it running
blackbox()                             // start
blackbox('status')                     // is it running? how much history?
blackbox('report')                     // dump last ~5 min as JSON
blackbox('stop')                       // pause (data retained)
blackbox('clear')                      // wipe all data
blackbox('snapshot')                   // point-in-time room state (not rolling)

// Profile run — focused 300-tick capture with completion alert
profile()                              // start
profile('status')                      // how many ticks collected?
profile('report')                      // results (works mid-run too)
profile('stop')                        // cancel

// Creep diagnostics — per-creep tick-by-tick logging
blackbox('diagnose', 'creepName', 50)  // track creepName for 50 ticks
blackbox('diagnose')                   // list active diagnostics
blackbox('diagnose', 'creepName')      // view completed report
```

**Always start the blackbox after a code deploy.** Data is wiped on clear or
when Memory is reset, but persists across reboots and restarts otherwise.

---

## Two Modes, One System

Profile runs and the rolling recorder share the same data infrastructure:
the same creep registry, event log, and anomaly log. There is no duplication
and no extra Memory cost when both are running simultaneously.

The profile run adds a tick counter and completion trigger on top of the same
bucket system the recorder uses. When the profile completes, a frozen snapshot
is saved to `Memory.blackbox.profileRun.snapshot` so `profile('report')` works
any time afterward, even after the data has rolled off the live window.

---

## Data Architecture

### Memory layout

```javascript
Memory.blackbox = {
  active:        bool,              // recorder on/off
  startedAt:     tick,
  totalTicks:    number,

  buckets:       { roomName: [bucket, ...] },   // completed, max 5 per room
  currentBucket: { roomName: bucket },           // in-progress

  eventLog:      [event, ...],      // last 100 events, auto-pruned
  anomalyLog:    [snapshot, ...],   // last 5 anomalies, kept until cleared

  creepRegistry: { creepName: entry },  // all seen creeps, pruned after 300 ticks
  profileRun:    { ... } | null,        // active or completed profile run
  diagnostics:   { creepName: diag },   // per-creep tick logs
}
```

### Buckets

Data is aggregated into **60-tick buckets**. At most 5 completed buckets are
kept per room, giving a rolling window of ~300 ticks (~5 minutes at 1 tick/sec).

Each bucket tracks accumulating sums across its 60 ticks:
- `energyRatioSum` / `Min` / `Max` / cap events / drought events
- `spawnBusyTicks` / spawn count / energy at spawn (for spawn utilization)
- Controller progress start/end (for upgrade rate calculation)
- Extensions built vs RCL max
- Container fill sums and hits (controller and source, tracked separately)
- Tower energy sums
- Rampart hits sums, min, and critical count
- Dropped energy sum and max
- Road damaged/critical counts at start and end
- CPU sum and max
- Creep counts by role (start and end of bucket)
- Role gap ticks (ticks where miners < sources)

When a bucket hits 60 ticks, it's finalized:
- A pipeline analysis snapshot is attached (`_analyzePipeline`)
- It's pushed to the completed buckets array
- If more than 5 buckets exist, the oldest is dropped
- A fresh bucket is initialized for the next 60 ticks

At the 60-tick mark, a **trend sample** is also captured — a point-in-time
snapshot of the key metrics at that moment, used to build the trend array in
the report.

---

## What Gets Collected Each Tick

`_collectTick()` runs once per owned room per tick. It reads:

| Data | What's measured |
|------|----------------|
| Energy | `energyAvailable / energyCapacityAvailable` ratio, cap/drought events |
| Spawn | Busy ticks, completed spawns, energy level when spawn finished |
| Controller | Progress value (end-of-bucket delta = upgrade rate) |
| Extensions | Count vs RCL max (tracks missing extension energy capacity) |
| Dropped energy | Sum and max per tick |
| Roads | Count of damaged (<50% hits) and critical (<25% hits) roads |
| Containers | Fill % and hits % for controller and source containers separately |
| Towers | Energy fill % |
| Ramparts | Hits %, min hits %, critical count (<1000 hits) |
| CPU | `Game.cpu.getUsed()` — sampled before any game logic runs |
| Creeps | Count by role (snapshot at bucket end) |
| Role gaps | Ticks where active miners < source count |

Anomaly detection runs every 10 ticks (see Anomaly Detection below).
A trend sample is captured once at tick 60 of each bucket.

---

## Report Structure

`blackbox('report')` outputs a JSON object combining all completed buckets
and the partial current bucket for each owned room.

### Top-level fields

```javascript
{
  meta: {
    startedAt, currentTick, active, totalTicks, windowTicks, windowMin
  },
  rooms: { roomName: roomReport },
  eventLog: [...],       // timestamped events
  anomalyLog: [...],     // frozen anomaly snapshots
  creepRegistry: {       // summary of all creeps seen
    byRole: { role: { count, spawnedDuringRun, avgEnergyCost } },
    deaths: [...],
    kills:  [...],
    alive:  [...]
  }
}
```

### Room report fields

```javascript
{
  rcl, windowTicks,

  extensions: { built, rclMax, missing, energyCapacityLost },

  energy: {
    avgPct, minPct, maxPct,
    capEvents, droughtEvents, capPct, droughtPct
  },

  spawn: {
    utilizationPct, idleTicks, spawnedCount, avgEnergyAtSpawn
  },

  controller: {
    progressStart, progressEnd, delta, ratePerTick,
    estTicksToLevel, estHoursToLevel
  },

  containers: {
    controller: { avgPct, avgHitsPct },
    source:     { avgPct, avgHitsPct }
  },

  towers:   { avgEnergyPct, assessment },          // 'healthy' | 'low' | 'critical'
  ramparts: { avgHitsPct, minHitsPct, criticalCount, assessment },  // 'failing' | 'critical' | 'weak' | 'healthy'

  droppedEnergy: { avg, max, assessment },         // 'healthy' | 'mild backlog' | 'thralls overwhelmed'

  roads: { damagedStart, damagedEnd, criticalEnd, decayRate, assessment }, // 'deteriorating' | 'stable' | 'improving'

  cpu: { avg, max },

  creeps: { start, end, roleGapTicks, roleGapPct },

  pipeline: {
    mining:    { activeWorkParts, targetWorkParts, utilizationPct, assessment },
    transport: { activeCarryParts, estimatedDemand, utilizationPct, assessment },
    spending:  { clanratWorkParts, warlockWorkParts, totalSpendWork, vsProductionRate, assessment }
  },

  trend: [{ tick, energyPct, energyAvgPct, droppedAvg, droppedMax,
            creepCount, byRole, cpuAvg, damagedRoads, spawnBusyPct,
            containerControllerAvgPct, towerAvgPct, rampartAvgPct }, ...]
}
```

### Assessments

Assessments are plain-English summaries calculated from the aggregated data:

| Metric | Values |
|--------|--------|
| Tower energy | `'healthy'` (>50%), `'low'` (20–50%), `'critical'` (<20%) |
| Rampart health | `'healthy'`, `'weak'` (<50% avg), `'critical'` (<10% min), `'failing'` (<1% min) |
| Dropped energy | `'healthy'` (<200 avg), `'mild backlog'` (<500), `'thralls overwhelmed'` (≥500) |
| Roads | `'improving'`, `'stable'`, `'deteriorating'` (based on damaged count change) |
| Mining pipeline | `'full drain'`, `'partial drain'`, `'severely undersourced'` |
| Transport pipeline | `'sufficient'`, `'mild shortage'`, `'bottleneck'` |
| Spending pipeline | `'balanced'`, `'slight underspend'`, `'underutilizing production'`, `'aggressive spending'` |

---

## Anomaly Detection

The blackbox auto-detects problems without manual monitoring. Every 10 ticks,
`_collectTick` checks for three anomaly types:

| Trigger | Condition |
|---------|-----------|
| `energy_crash` | Current energy ratio < bucket average − 0.25 |
| `dropped_spike` | Total dropped energy > 500 |
| `miner_gap` | Active miners < source count |

When an anomaly is detected and no anomaly was logged in the last 20 ticks
(deduplication window), a full frozen snapshot is captured:

```javascript
{
  tick, room, trigger,
  energyPct, avgEnergyPct, droppedTotal, minerCount, sourceCount,
  energy: { available, capacity, pct },
  spawn: [{ name, spawning: { name, role, ticksLeft } }],
  containers: [{ type, energy, pct }],
  creeps: [{ name, role, ttl, working, store }]  // sorted by TTL ascending
}
```

The anomaly log keeps the last 5 snapshots. Unlike the rolling event log,
anomalies are **never auto-pruned** — they stay in Memory until you call
`blackbox('clear')`. This is intentional: anomalies are rare and high-value;
you want to be able to examine them long after the fact.

---

## Event Log

The event log records **lifecycle events** for every creep seen during the run:

| Event type | Fired when |
|-----------|-----------|
| `SPAWN` | A new creep appears that wasn't in the registry |
| `DEATH_NATURAL` | A creep disappears with last TTL ≤ 50 (lived a full life) |
| `DEATH_KILLED` | A creep disappears with last TTL > 50 (probably combat) |
| `ROLE_GAP_OPEN` | Miners drop below source count |
| `ROLE_GAP_CLOSE` | Miners recover to meet source count |

The event log keeps the last 100 events, pruning entries older than the rolling
window cutoff (5 buckets × 60 ticks = 300 ticks). Each event carries its tick,
room, and relevant data (body composition, energy cost, TTL for deaths).

---

## Creep Registry

The registry tracks every creep seen during the run. For each creep it records:

```javascript
{
  role, homeRoom,
  body: { work: N, carry: N, move: N, ... },   // part counts
  energyCost,                                   // calculated from body
  spawnTick,                                    // estimated from name
  lastTTL,                                      // updated each tick while alive
  spawnedDuringRun: bool,                       // false if creep existed before recorder started
  outcome: 'alive' | 'died_natural' | 'died_killed',
  deathTick, ticksLived                         // filled in on death
}
```

Entries for dead creeps are pruned 300 ticks after death to keep Memory footprint low.

The registry summary in reports groups by role and shows: total count, count
spawned during the run, and average energy cost.

---

## Pipeline Analysis

The pipeline section in each report shows whether your energy economy is
fundamentally balanced. It's recalculated at the end of each bucket.

```
Mining:    how many WORK parts do miners have vs the source drain target (sources × 5)
Transport: how many CARRY parts do thralls have vs estimated demand
Spending:  how many WORK parts do clanrats + warlock have vs production rate
```

The transport estimate uses `ceil(sourceRate / 1.25)` where sourceRate is
`sources × 10 energy/tick`. This approximates how much carry capacity is needed
to keep up with miner output, accounting for travel time.

The spending section compares total spender WORK parts against source production
rate. A ratio near 1.0 means spending keeps up with production. Much less than
1.0 means energy will cap. Much more than 1.0 means energy will drought.

---

## Creep Diagnostics

For debugging individual creep behavior, the diagnostic system logs every tick's
state for a named creep:

```javascript
blackbox('diagnose', 'thrall_rend59', 50)
// Logs for 50 ticks, then marks complete.

blackbox('diagnose')
// Shows all active diagnostics and their progress.

blackbox('diagnose', 'thrall_rend59')
// If complete: dumps the full log.
// If active: shows progress.
```

Each tick's log entry contains:
```javascript
{
  tick, pos: { x, y, roomName },
  store, capacity, ttl, fatigue,
  memory: { working, delivering, job: { type, targetId, priority } },
  target: { id, type, pos, range }   // if a job target exists
}
```

Diagnostics persist in `Memory.blackbox.diagnostics` until `blackbox('clear')`.
If the creep dies during a diagnostic, the log is marked `incomplete` and
preserved for review.

**Good use cases:**
- A thrall that seems to be idling — diagnose it for 50 ticks and check whether
  `delivering` is toggling, whether it has a job, and whether its target range
  is closing
- A clanrat that isn't building — check if it's stuck in gathering mode
  (`working: false`) with a full store, which indicates a state toggle bug

---

## Point-in-Time Snapshot

`blackbox('snapshot')` is separate from the rolling recorder and outputs the
current tick's state for all owned rooms. It doesn't require the recorder to
be running.

Output includes:
- RCL, state, controller progress %
- Energy available/capacity/pct
- Spawn state (currently spawning what, ticks left)
- All structures (counts by type)
- All construction sites (counts by type)
- All containers (energy %, hits %, type: controller/source/other)
- Roads (total, damaged, critical counts)
- Towers (energy %)
- Ramparts (hits %, max %)
- Creeps (total, by role, dying list sorted by TTL)
- Dropped energy total and pile count
- Hostiles count
- CPU used so far this tick, limit, bucket

Use this for quick "what's happening right now" checks without parsing the full
rolling report.

---

## Memory Footprint

The blackbox is designed to be Memory-efficient:

- **5 buckets × 60 ticks** per room — constant size, old data dropped automatically
- **100 event log entries** max — auto-pruned by time window
- **5 anomaly snapshots** — kept forever, each is a few KB
- **Creep registry** — dead entries pruned 300 ticks after death
- **Diagnostics** — only store what you explicitly track, no automatic capture

Total Memory usage for a single room with a mature warlock is typically 20–40KB
depending on anomaly and diagnostic content. This is well within Screeps' Memory
limits (2MB).

---

## Implementation Notes

### CPU cost
`BlackBox.tick()` is called before any game logic in `main.js`. This is
intentional — `Game.cpu.getUsed()` at that point reflects the CPU consumed by
the engine's tick setup, not by game code. All per-tick collection code is
lightweight (no pathfinding, no room.find calls except for already-cached structures).

### Profile vs recorder
The profile run shares data with the recorder when both are active. There is
no double-collection. The profile adds:
- A tick counter (`profileRun.ticks`)
- A completion check (`Game.time >= profileRun.endTick`)
- A frozen snapshot on completion (`profileRun.snapshot = _buildReport(bb)`)

When the profile completes, `profile('report')` reads the frozen snapshot
regardless of what the live rolling data shows. This means you can run a profile,
wait for completion, and then read the report days later — the results are preserved.

### `_buildReport` combines buckets
Reports are built by combining all completed buckets and the partial current bucket.
This means `blackbox('report')` always gives you the full available window, not just
completed buckets. The partial bucket is included with lower accuracy on its metrics
(incomplete sums), which is fine for diagnostic purposes.