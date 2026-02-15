# Skaven Warren — Architecture Reference

## Working with an AI Assistant

Before asking for any code changes, diagnosis, or planning help, always provide
**both** of the following. Without them, diagnosis is guesswork.

### 1. Current Snapshot
```javascript
blackbox('snapshot')
```

### 2. BlackBox Report
The blackbox recorder is the **primary diagnostic tool** for the warren.
It runs continuously in the background, maintaining a rolling ~5 minute window
of aggregated data. If something goes wrong, the evidence is already recorded —
you do not need to anticipate the problem and start a run first.

Start it once and leave it running:
```javascript
blackbox()             // start the rolling recorder — do this once after deploy
blackbox('status')     // check that it's running and how much history exists
blackbox('report')     // dump last ~5 min as JSON — paste this for AI diagnosis
blackbox('stop')       // pause (data retained)
blackbox('clear')      // wipe all data
blackbox('snapshot')   // current point-in-time state (use before asking for help)
```

The blackbox report contains:
- Energy stability (avg/min/max %, cap/drought events)
- Spawn utilization and what was spawned at what energy level
- Controller progress rate and ETA to next level
- Dropped energy avg/max (pipeline health)
- Road damage trend (improving / stable / deteriorating)
- CPU avg/max
- Creep population stability and role gap ticks
- Pipeline analysis (WORK parts vs source capacity, CARRY vs demand)
- Event log (spawns, deaths, role gaps — timestamped)
- Anomaly log (frozen snapshots auto-captured when energy crashes, dropped spikes,
  or miner gaps are detected)
- Creep registry (every creep seen: body composition, TTL, outcome)
- 60-tick trend buckets

**The blackbox should always be running.** If you ask for help without a blackbox
report, expect to be asked for one before any diagnosis proceeds.

### Manual Profile Run
For a focused 300-tick (~5 min) deep-dive with a completion alert:
```javascript
profile()              // start — walk away for ~5 min
profile('status')      // check progress
profile('report')      // get results (also works mid-run)
profile('stop')        // cancel early
```

Profile and blackbox share the same data infrastructure — no duplication,
no extra Memory cost. Both are implemented in `warren.blackbox.js`.

---

## Philosophy

Screeps is an economy simulation before it is a game. Every design decision flows
from one principle: **maximize energy throughput, minimize CPU and creep overhead**.
Fewer, larger creeps beat many small creeps. Specialist roles beat generalists.
Infrastructure (roads, containers, storage) beats throwing more bodies at a problem.

The codebase is organized around a single warren per room. Multi-room expansion
(empire layer) is deferred until the single-warren economy is solid.

---

## System Layers

### Layer 0 — Bootstrap (RCL1)
Slaves only. Harvest, upgrade, survive. No specialization.
Transition to Layer 1 when RCL2 is reached.

### Layer 1 — Economic Engine (RCL2–3)
Specialist roles: miners, thralls, clanrats, warlock engineer.
Source containers and roads being built.
Transition to Layer 2 when source containers are built and RCL4 is approaching.

### Layer 2 — Infrastructure (RCL4–5) ← current
Controller container online. Extensions at or near RCL cap.
Warlock Engineer permanently seated.
Hauler routing shifts from dropped pile → container → storage → consumers.
Road repair system needed (roads decay without active maintenance).

### Layer 3 — Expansion (RCL6+)
Remote mining, multi-room claims, military.
Not yet designed.

---

## OODA Loop

Every warren runs one OODA cycle per tick via `warren.js`:

```
Observe  → warren.observe.js   reads room state into this._data
Orient   → warren.orient.js    classifies into ROOM_STATE (BOOTSTRAP / GROW / STABLE / WAR)
Decide   → warren.decide.js    produces this._plan (boolean flags, no side effects)
Act      → warren.act.js       executes the plan (only place side effects occur)
```

`warren.memory.js` owns all Memory read/write for the warren layer.
`warren.act.js` is the only file that may call spawning, job publishing, or planners.

---

## Creep Roles

### Hierarchy (lowest to highest caste)
```
Slave → Thrall → Clanrat → Miner / Warlock Engineer
                         → Stormvermin / Gutter Runner / Jezzail / Rat Ogre (combat, not yet implemented)
```

---

### Slave (`rat.slave.js`)
RCL1 generalist. Harvests, upgrades, builds. Replaced by specialists at RCL2.
Also used in emergency recovery when miners are down (promoted temporarily).
Body: `[WORK×N, CARRY, MOVE]` — scales with available energy.

---

### Miner (`rat.miner.js`)
Sits on a source tile and harvests every tick. Never moves after seating.
Bypasses job board — hardcoded behavior.
Body: maximize WORK up to 5 (10 energy/tick = full source drain), 1 MOVE.
Pin type: **hard pin** — traffic manager never displaces a miner.

---

### Thrall (`rat.thrall.js`)
*Formerly: hauler*
Bound servant of the warren. Pure energy transport — no WORK parts.
Picks up dropped energy and delivers it to consumers.

Pickup priority:   tombstones → ruins → dropped pile (largest first)
Delivery priority: spawn → extensions → controller container → towers

**Do NOT withdraw from spawn.** Thralls fill the spawn; they must never drain it.
Uses `room.find` + `findClosestByRange` for all consumer lookups.
`findClosestByPath` was deliberately removed — it returns null silently on
congested paths, causing thralls to silently skip delivery targets.

Body: equal CARRY+MOVE pairs, scales with energy.

---

### Clanrat (`rat.clanrat.js`)
*Formerly: worker*
Rank-and-file backbone of the warren. Builds construction sites and upgrades
the controller. Does NOT harvest from sources directly. Does NOT withdraw from spawn.

Gather priority: controller container (if nearby) → tombstones → ruins →
dropped pile → wait near source

If all gather sources are dry and clanrat holds any energy, it flips to spending
mode rather than idling (partial-load edge case).

Emergency mode: if miners are down, clanrats harvest directly and feed the spawn
so the director can recover the miner population.

Body: equal WORK+CARRY+MOVE sets, scales with energy.

---

### Warlock Engineer (`rat.warlock.js`)
Dedicated upgrader. Stands ON the controller container tile permanently.
From that position it can both withdraw (range 0) and upgrade (range ≤ 3).
Zero travel between refuel and upgrade once seated.
Bypasses job board — hardcoded behavior.
One per warren. Only spawns after controller container exists.

Energy priority:
1. Controller container (stand on it, withdraw directly)
2. Dropped energy — whole room if no container, range 8 from controller if container exists
3. Tombstones — same radius logic
4. Spawn — **DIRE EMERGENCY ONLY** (>280 of 300 capacity)

The spawn threshold of >280 is intentionally set so high it almost never fires.
The warlock gets this one last-resort tap because it is pinned at the controller
and physically cannot go elsewhere for energy.

**Key behavior:** checks `container.store[RESOURCE_ENERGY] > 0` before committing
to walk to the container. Empty container falls through immediately — does not
pin and wait.

Body: maximize WORK, fixed 2 CARRY + 2 MOVE overhead.

---

### Stormvermin (`rat.stormvermin.js`) — STUB
Elite melee shock troops. Heavy ATTACK, TOUGH for survivability.
**Not yet implemented.**

### Gutter Runner (`rat.gutterrunner.js`) — STUB
Fast scouts and raiders. High MOVE ratio, hit-and-run attacks.
**Not yet implemented.**

### Jezzail (`rat.jezzail.js`) — STUB
Long-range snipers. Maximize RANGED_ATTACK, kite to maintain distance.
**Not yet implemented.**

### Rat Ogre (`rat.ratogre.js`) — STUB
Massive brutes. Heavy ATTACK and TOUGH, minimal MOVE. No retreat.
**Not yet implemented.**

---

## Spawn System

### `spawn.bodies.js`
Purely formulaic body recipes — no discrete tiers.
Each role scales continuously with available energy:
- **Slave**: `[WORK×N, CARRY, MOVE]` — stacks WORK with remaining energy
- **Miner**: `floor((energy - 50) / 100)` WORK parts, capped at 5, plus 1 MOVE
- **Thrall**: `floor(energy / 100)` CARRY+MOVE pairs
- **Clanrat**: `floor(energy / 200)` WORK+CARRY+MOVE sets
- **Warlock**: maximize WORK with 200 energy overhead reserved for 2 CARRY+2 MOVE
- **Combat roles**: stubbed with minimum viable bodies pending implementation

### `spawn.director.js`
Priority order:
1. Emergency slave (warren empty) — no threshold
2. Miners — no threshold (dead miner stalls entire economy)
3. Thralls — no threshold (**thralls fill extensions — gating them creates a deadlock**)
4. Clanrats — waits for `energyAvailable / energyCapacityAvailable >= 0.9`
5. Warlock — same threshold, only spawns when controller container exists

Thrall target:
- Source containers present: 1 per source container
- RCL3+, no containers: 2 thralls (10+ extensions overwhelm a single thrall)
- RCL2, no containers: 1 thrall

Clanrat target:
- Base: `sources * 2`
- Bonus: `+sources` when energy is capped (economy saturated)
- Cap: `sources * 4`

**Known limitation / next redesign:**
Creep count is the wrong metric at higher RCL. What matters is total parts.
See "What's Next" — parts-based spawn director is the priority redesign.

---

## Spawn Buffer Rules

The spawn's 300-energy buffer is **sacrosanct**. Violating it causes undersized
replacement creeps and stalls economic recovery.

| Role      | May withdraw from spawn? |
|-----------|--------------------------|
| Slave     | Yes (emergency harvest → transfer, never withdraw) |
| Miner     | Never |
| Thrall    | Never (thralls fill it, never drain it) |
| Clanrat   | **Never** |
| Warlock   | Yes — DIRE EMERGENCY ONLY (>280 stored) |

---

## Traffic Manager (`traffic.js`)

All movement is coordinated through the traffic layer.
No rat file ever calls `creep.moveTo()` directly.

### API
```javascript
Traffic.pin(creep)                          // hard pin — never displaced
Traffic.requestMove(creep, target, {range}) // register move intent
Traffic.resolve()                           // called once after all creep ticks
```

### Pin Types
**Hard pin**: explicit `pin()` call. Miners and warlocks. Never displaced.
**Soft pin**: auto-assigned in `resolve()` to any creep that registered no intent.
A motivated moving creep that needs their tile will push them to any adjacent
free tile rather than waiting.

### Path Caching
Paths stored in `creep.memory._trafficPath` as `{x,y}` arrays.
Cache invalidated when:
- Target changes
- Creep is pushed off-path
- Next step has any pin on it (hard or soft)
- Next step blocked by structure or construction site

### CostMatrix
- Roads: cost 1
- Plains: cost 2
- Swamp: cost 5
- Blocking structures/sites: cost 0xff
- Hard + soft pinned tiles: cost 20
- Creeps with active move intents: cost 10

### Stuck Detection
If position unchanged for `STUCK_THRESHOLD = 3` ticks, a `FALLBACK_DURATION = 3`
tick countdown begins. During fallback: native `moveTo(ignoreCreeps: true)` with
red path visualization. After fallback: cache wiped, traffic resumes fresh.

---

## Planners

All planners: one site placed at a time, self-guarding, energy ratio guarded,
called by `warren.act.js` only.

### `plan.extensions.js`
Places extensions up to RCL cap. Energy ratio guard: 0.7.
Uses passability guard — hard rejects tiles with fewer than 2 open cardinal
neighbours. Prevents impassable clusters.

### `plan.containers.js`
Controller container placed on the tile adjacent to the controller closest to
spawn (minimizes thrall travel). Warlock stands ON this tile permanently.

### `plan.roads.js`
Roads along spawn→source and spawn→controller paths.
Uses `PathFinder.search` with the same CostMatrix as `traffic.js` — roads are
placed on tiles creeps actually walk.

### `plan.scoring.js`
Scoring logic for extension placement. Passability guard replaces the old
clustering feedback loop that caused impassable walls.

---

## Job Board (`job.board.js`)

Fully ephemeral — reset and repopulated every tick.
No stale job assignments survive between ticks.

Job types: `HARVEST`, `BUILD`, `UPGRADE`, `REPAIR`, `HAUL`, `DEFEND`

Role preferences are wired in `rolePreference()`:
- Miners strongly prefer HARVEST
- Thralls strongly prefer HAUL
- Clanrats prefer BUILD, then UPGRADE
- Clanrats are explicitly excluded from HARVEST (they have their own gather phase)

---

## Instrumentation (`warren.blackbox.js`)

Single file. Two modes. One Memory key (`Memory.blackbox`).

**Rolling recorder** — always-on, 5-bucket rolling window (300 ticks total).
**Profile run** — manual fixed 300-tick snapshot with completion alert.

Both modes share: creep registry, event log, anomaly log. No duplication.
Data aggregated into 60-tick buckets — low Memory footprint.

Anomaly auto-detection (every 10 ticks):
- Energy drops >25% below bucket average
- Dropped energy spike >500
- Miner count falls below source count

Anomaly log stores the last 5 full frozen snapshots: every creep with TTL and
store contents, container fills, spawn state — everything needed to reconstruct
what was happening at the moment things went wrong.

**Always start the blackbox after a code deploy:**
```javascript
blackbox()
```

---

## Key Design Rules

**`room.find` not `findClosestByPath` for target lookup.**
`findClosestByPath` silently returns null on congested paths. Always use
`room.find` + `findClosestByRange`. Let traffic handle navigation.

**`energyAvailable` not `energyCapacityAvailable` for body cost checks.**
Always pass `energyAvailable` to body recipes — never request a body that
can't be afforded with current energy.

**Miners and thralls bypass the spawn energy threshold.**
They ARE the pipeline. Gating them creates a deadlock.

**The spawn buffer is sacrosanct.**
Clanrats never touch it. Warlock only above 280/300. See spawn buffer rules table.

**One construction site at a time.**
Ensures infrastructure completes in priority order.

**Hard pins never cleared by traffic.**
Only the owning rat clears its pin by not calling `Traffic.pin()` in a given tick.

---

## What's Next

### Priority 1 — Road repair
**Roads are currently decaying with no repair system.**
`job.board.js` needs `publishRepairJobs()` targeting roads below 50% health.
Clanrats pick up repair jobs between build assignments.
Without this every road eventually disappears, slowing all creeps permanently.

### Priority 2 — Parts-based spawn director
**Most important architectural redesign.**
Creep count is the wrong metric at RCL3+. Replace head-count targets with
parts-based targets:
- Miner: spawn until `sum(miner WORK parts) >= sources * 5`
- Thrall: spawn until `sum(thrall CARRY parts) >= carryDemand`
- Clanrat: spawn until `sum(clanrat WORK parts) >= workDemand`
  Emergent behavior: one big creep naturally replaces two small ones as energy
  capacity grows. Fewer creeps = less traffic = better throughput.

### Priority 3 — Source containers
Eliminates energy decay at sources. Miners drop into containers, thralls withdraw
cleanly. `spawn.director.js` already auto-scales thrall target to 1-per-source-
container when detected. Needs: `plan.sourceContainers.js`, miner behavior update
to sit on container tile, thrall withdrawal priority update.

### Priority 4 — Tower (RCL3)
One auto-placed tower per warren. Thrall delivery already wired for towers
(priority 4 in `rat.thrall.js`). Needs: `plan.tower.js`, auto-attack in `warren.act.js`.

### Priority 5 — Storage (RCL4)
Significant thrall routing redesign. All energy flows through storage.
Worth designing carefully — split thralls into source-thralls (container→storage)
and demand-thralls (storage→consumers).

### Priority 6 — Military layer
Stormvermin, Gutter Runner, Jezzail, Rat Ogre stubs exist.
Bodies need implementing in `spawn.bodies.js`.
Combat behavior needs implementing in each `rat.*.js` file.
Spawn director needs military demand logic.

### Longer term
- Remote mining (multi-room traffic coordination required)
- Empire layer (claim flags, spawn placement, room prioritization)
- Lab reactions / mineral processing