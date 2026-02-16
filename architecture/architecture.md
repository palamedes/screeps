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

### Layer 2 — Infrastructure (RCL4–5) ← approaching
Controller container online. Source containers online. Extensions at RCL cap.
Warlock Engineer permanently seated.
Hauler routing: source containers → controller container → storage (when built) → consumers.
Road repair system active.
Tower operational.

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
Sits on a source container tile (miner seat) and harvests every tick.
Harvested energy is transferred immediately into the container beneath it.
Never moves after seating.

**Miner Seats:**
Each source has one optimal standing tile calculated by `plan.container.source.js`
and cached in `room.memory.minerSeats[sourceId]`. The seat is the walkable tile
adjacent to the source that is closest to spawn. This minimizes thrall travel
distance. Miners target their assigned seat at range 0 (standing directly on it).

Body: 5 WORK + 1 CARRY + 1 MOVE at full energy (600).
With 1 CARRY (50 capacity), the miner fills every 5 harvest ticks and transfers
continuously into the container. Energy flows at the full 10/tick rate.

Pin type: **hard pin** — traffic manager never displaces a miner.

---

### Thrall (`rat.thrall.js`)
*Formerly: hauler*
Bound servant of the warren. Pure energy transport — no WORK parts.
Picks up energy from various sources and delivers to consumers.

Pickup priority:   tombstones → ruins → dropped piles → **source containers**
Delivery priority: spawn → extensions → controller container → towers

Source containers are the LAST resort in gathering — they're the steady-state
buffer that never decays. Tombstones and dropped piles are lossy and must be
collected first to avoid waste.

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

**ANCHORED MODE** (when container exists):
The warlock walks to the container tile once on spawn, then NEVER leaves.
It does not roam for dropped energy. It does not walk to the spawn.
When the container is empty, the warlock pins its tile and waits for a thrall.
A 6 WORK warlock sitting still waiting is worth far more than 20 ticks wandering.

Energy priority when NO container exists (early RCL2 only):
1. Dropped energy — whole room
2. Tombstones — whole room
3. Spawn — DIRE EMERGENCY ONLY (>280 of 300 capacity)

Once the container is built, these priorities are irrelevant — the warlock is anchored.

Body: maximize WORK, fixed 2 CARRY + 1 MOVE overhead.
1 MOVE was chosen over 2 MOVE to maximize WORK parts. The warlock only walks once.
The tradeoff is slower movement on plains and significant fatigue on swamp (30 ticks
per swamp tile with 6 WORK + 2 CARRY + 1 MOVE). Traffic's per-creep swamp cost
calculation heavily penalizes swamp routing for the warlock to avoid this.

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
- **Miner**: `floor((energy - 100) / 100)` WORK parts, capped at 5, plus 1 CARRY + 1 MOVE
- **Thrall**: `floor(energy / 100)` CARRY+MOVE pairs
- **Clanrat**: `floor(energy / 200)` WORK+CARRY+MOVE sets
- **Warlock**: maximize WORK with 150 energy overhead reserved for 2 CARRY+1 MOVE
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
| Warlock   | No (anchored mode never reaches spawn tap) |

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
- **Swamp: per-creep calculation** based on actual fatigue economics
    - Formula: `ceil((nonMove × 10) / (move × 2))`
    - Balanced thrall (7 CARRY + 7 MOVE): cost 5
    - Heavy warlock (6 WORK + 2 CARRY + 1 MOVE): cost 30
    - This prevents warlocks from routing through swamp and spending 30 ticks per tile immobile
- Blocking structures/sites: cost 0xff
- Hard + soft pinned tiles: cost 20
- Creeps with active move intents: cost 10

### Push Logic
When a moving creep's next step is soft-pinned (idle rat parked there),
`resolve()` looks for any adjacent free tile and shoves the idle rat there.
"Free" means: walkable terrain, not hard-pinned, not a blocking structure
or site, and not a tile another creep is already moving into this tick.

### Stuck Detection
If position unchanged for `STUCK_THRESHOLD = 3` ticks (and fatigue is zero),
a `FALLBACK_DURATION = 3` tick countdown begins. During fallback: native
`moveTo(ignoreCreeps: true)` with red path visualization. After fallback:
cache wiped, traffic resumes fresh.

**Note on fatigue:** Stuck counter only increments when `creep.fatigue === 0`.
A creep recovering from swamp fatigue hasn't moved but isn't stuck.

### Range 0 Bug Fix
**CRITICAL:** `Traffic.requestMove` now correctly handles `{ range: 0 }`.
Old code: `range: opts.range || 1` coerced 0 to 1 because 0 is falsy.
New code: `range: opts.range !== undefined ? opts.range : 1`
This fix was essential for miners and warlocks targeting their container tiles.

---

## Planners

All planners: one site placed at a time, self-guarding, energy ratio guarded,
called by `warren.act.js` only.

### `plan.extensions.js`
Places extensions up to RCL cap. Energy ratio guard: 0.7.
Uses passability guard — hard rejects tiles with fewer than 2 open cardinal
neighbours. Prevents impassable clusters.

### `plan.container.controller.js` (formerly `plan.containers.js`)
Controller container placed on the tile adjacent to the controller closest to
spawn (minimizes thrall travel). Warlock stands ON this tile permanently.

### `plan.container.source.js` **← NEW**
**Two responsibilities:**

1. **`Room.prototype.getMinerSeat(sourceId)`** — calculates and caches the
   optimal standing tile for a miner at each source. Cached in
   `room.memory.minerSeats[sourceId]`. The seat is the walkable tile adjacent
   to the source that is closest to spawn, minimizing thrall travel distance.

2. **`Room.prototype.planSourceContainers()`** — places container sites at
   each miner seat. One site at a time. Waits for controller container to
   exist first (build order enforced by calling order in `warren.act.js`).

**Why seat-first?**
The miner must stand ON the container tile for harvested energy to transfer
into it. By calculating the seat first and caching it in memory, both the
miner and the planner target the same tile — they naturally converge.

### `plan.roads.js`
Roads along spawn→source and spawn→controller paths.
Uses `PathFinder.search` with the same CostMatrix as `traffic.js` — roads are
placed on tiles creeps actually walk.

### `plan.tower.js`
One tower per warren at RCL3. Placed range 3-4 from spawn.
Energy guard: 0.7.

### `plan.ramparts.js`
Ramparts on spawn and tower tiles. One site at a time.
No energy guard — defense placement is always worth it.

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
- Clanrats prefer BUILD, then REPAIR, then UPGRADE
- Clanrats are explicitly excluded from HARVEST (they have their own gather phase)

Build job priorities:
- 900: controller container (unlocks warlock continuous upgrade)
- 875: tower (defense infrastructure)
- 850: rampart (immediate structural protection)
- 800: everything else (extensions, roads, etc.)

Source containers inherit the standard 800 priority. Controller container
finishing first is enforced by calling order in `warren.act.js`, not priority.

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
Clanrats never touch it. Warlock never reaches it (anchored mode).

**One construction site at a time.**
Ensures infrastructure completes in priority order.

**Hard pins never cleared by traffic.**
Only the owning rat clears its pin by not calling `Traffic.pin()` in a given tick.

**Miner seats are cached in room memory.**
`room.memory.minerSeats[sourceId]` is the source of truth for where miners stand.
Never recalculate — terrain and spawn position are static.

---

## Current Status (as of last session)

**Room:** E32S59  
**RCL:** 3, approaching RCL4 (ETA ~1.4 hours)  
**Controller progress:** +11.81/tick (was crashing at -127.7/tick before fixes)  
**Extensions:** 10/10 (RCL3 cap)  
**Energy capacity:** 800  
**Creep population:**
- 2 miners (5 WORK + 1 CARRY + 1 MOVE)
- 2-3 thralls (7-8 CARRY + 7-8 MOVE pairs)
- 6 clanrats (4 WORK + 4 CARRY + 4 MOVE)
- 1 warlock (6 WORK + 2 CARRY + 1 MOVE)

**Infrastructure:**
- Controller container: online, averaging 6% full (warlock draining fast)
- Source containers: implemented but not yet built in-game
- Roads: 22 damaged (stable, repair jobs active)
- Tower: not yet built (unlocks at RCL3, planner active)

**CPU usage:** 0.61 avg, well below 20 limit

---

## What's Next

### Priority 1 — Source containers (IN PROGRESS)
**Status:** Code complete, waiting for in-game build.
Once built, dropped energy should fall dramatically and controller container
fill rate should improve. This is the foundation for the rest of Layer 2.

### Priority 2 — Parts-based spawn director
**Most important architectural redesign.**
Creep count is the wrong metric at RCL3+. Replace head-count targets with
parts-based targets:
- Miner: spawn until `sum(miner WORK parts) >= sources * 5`
- Thrall: spawn until `sum(thrall CARRY parts) >= carryDemand`
- Clanrat: spawn until `sum(clanrat WORK parts) >= workDemand`

Emergent behavior: one big creep naturally replaces two small ones as energy
capacity grows. Fewer creeps = less traffic = better throughput.

### Priority 3 — Tower (RCL3)
One auto-placed tower per warren. Thrall delivery already wired for towers
(priority 4 in `rat.thrall.js`). Planner already active. Should appear once
energy ratio supports it or a rampart/extension site completes.

Needs: auto-attack in `warren.act.js` (already implemented), thrall feeding
(already implemented). Just waiting for the build.

### Priority 4 — Storage (RCL4)
Significant thrall routing redesign. All energy flows through storage.
Worth designing carefully — split thralls into source-thralls (container→storage)
and demand-thralls (storage→consumers).

**Prerequisite:** Source containers must be stable first. Storage routing builds
on top of the container system, not instead of it.

### Priority 5 — Military layer
Stormvermin, Gutter Runner, Jezzail, Rat Ogre stubs exist.
Bodies need implementing in `spawn.bodies.js`.
Combat behavior needs implementing in each `rat.*.js` file.
Spawn director needs military demand logic.

### Priority 6 — Road repair at scale
Current repair jobs work but only target 3 worst roads at a time.
At higher RCL with extensive road networks, may need smarter prioritization
(main arteries vs side paths) and possibly dedicated repair crews.

### Longer term
- **Remote mining** (multi-room traffic coordination required)
- **Scouting** (cheap, can start earlier — 1 MOVE scout costs almost nothing
  and builds a map of adjacent rooms for future expansion planning)
- **Empire layer** (claim flags, spawn placement, room prioritization)
- **Lab reactions / mineral processing**
- **Market automation**

### When to consider multi-room operations

Don't rush it. The rough readiness checklist:
- **Storage online (RCL4)** — without a buffer, remote ops can destabilize home economy
- **Controller progressing cleanly** — want RCL5 in sight before splitting attention
- **CPU headroom** — check avg vs limit ratio; remote rooms add meaningful tick cost
- **Home economy saturated** — energy consistently capping, all infrastructure built

Scouting is cheaper and can start earlier — a 1 MOVE scout builds a map of
adjacent rooms well before you're ready to exploit them. Room layouts, source
counts, controller ownership, exit positions — all useful for planning.

Current target: **finish Layer 2 before considering Layer 3.**

---

## Known Issues / Tech Debt

**None currently tracked.** The major bugs (traffic range 0, warlock roaming,
thrall findClosestByPath failures) have been resolved.

---

## File Organization

```
warren.js              — OODA loop coordinator
warren.memory.js       — Memory interface, ROOM_STATE enum
warren.observe.js      — Snapshot builder
warren.orient.js       — State classification
warren.decide.js       — Plan builder (boolean flags)
warren.act.js          — Plan executor (only place with side effects)
warren.blackbox.js     — Instrumentation (rolling recorder + profiler)

rat.js                 — Creep tick router
rat.slave.js           — RCL1 generalist
rat.miner.js           — Source harvester (stands on container)
rat.thrall.js          — Energy transport specialist
rat.clanrat.js         — Builder and upgrader
rat.warlock.js         — Dedicated controller upgrader
rat.stormvermin.js     — Elite melee (stub)
rat.gutterrunner.js    — Fast raider (stub)
rat.jezzail.js         — Long-range sniper (stub)
rat.ratogre.js         — Heavy brute (stub)

spawn.director.js      — Decides what to spawn and when
spawn.bodies.js        — Body part recipes (formulaic, no tiers)

plan.extensions.js            — Extension placement
plan.container.controller.js  — Controller container placement
plan.container.source.js      — Source container placement + seat calculation
plan.roads.js                 — Road placement
plan.tower.js                 — Tower placement
plan.ramparts.js              — Rampart placement
plan.spawn.js                 — Spawn placement (one-time, first boot)
plan.scoring.js               — Tile scoring utilities
plan.utils.js                 — Shared planner utilities

job.board.js           — Ephemeral per-tick job assignment
traffic.js             — Movement coordination (pins, intents, resolution)

empire.js              — Multi-room coordination (minimal, watching Claim flags)
main.js                — Game loop entry point
```