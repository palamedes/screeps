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

### Creep Diagnostics
For tracking a specific creep tick-by-tick:
```javascript
blackbox('diagnose', 'creepName', 50)   // track for 50 ticks
blackbox('diagnose')                    // check active diagnostics
blackbox('diagnose', 'creepName')       // view completed report
```

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

### Layer 2 — Infrastructure (RCL4–5) ← **CURRENT**
Controller container online. Source containers online. Extensions at RCL cap.
Warlock Engineer permanently seated.
Tower operational. Ramparts covering spawn and tower.
Road repair system active.
**Next milestone:** Storage online (RCL4 unlock).

### Layer 3 — Expansion (RCL6+)
Remote mining, multi-room claims, military at scale.
Not yet designed in detail.

---

## OODA Loop

Every warren runs one OODA cycle per tick via `warren.js`:

```
Observe  → warren.observe.js   reads room state into this._snapshot
Orient   → warren.orient.js    classifies into ROOM_STATE (BOOTSTRAP / STABLE / GROW / FORTIFY / WAR)
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
                         → Stormvermin (combat, melee)
                         → Gutter Runner (scout)
                         → Jezzail / Rat Ogre (combat, stubs)
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
Pure energy transport — no WORK parts.
Picks up energy from various sources and delivers to consumers.

Pickup priority:   tombstones → ruins → dropped piles → source containers
Delivery priority: spawn → emergency tower (<20%) → extensions → towers → controller container

Source containers are the LAST resort in gathering — they're the steady-state
buffer that never decays. Tombstones and dropped piles are lossy and must be
collected first to avoid waste.

Tower priority split: emergency towers (below 20%) jump ahead of extensions
to prevent the tower going dark. Normal top-up comes after extensions.

Controller container fill is conditional: only fills when container is below 50%,
OR below 80% when the warlock is not actively draining it.

**Do NOT withdraw from spawn.** Thralls fill the spawn; they must never drain it.
Uses `room.find` + `findClosestByRange` for all consumer lookups.

Body: equal CARRY+MOVE pairs, scales with energy.

---

### Clanrat (`rat.clanrat.js`)
Rank-and-file backbone of the warren. Builds construction sites and upgrades
the controller. Does NOT harvest from sources directly. Does NOT withdraw from spawn.

Gather priority (when not in emergency):
- Controller container (if within range 5 of controller) → tombstones → ruins →
  dropped pile (≥30, ratio ≥2/tile) → source containers → partial load → wait near source

Emergency mode: if miners < sources, clanrats harvest directly from sources and
feed the spawn so the director can recover the miner population.

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

Body: maximize WORK, fixed 2 CARRY + 1 MOVE overhead.
1 MOVE was chosen over 2 MOVE to maximize WORK parts. The warlock only walks once.
Traffic's per-creep swamp cost calculation heavily penalizes swamp routing for
the warlock to avoid immobility on swamp tiles (30 ticks per tile).

---

### Stormvermin (`rat.stormvermin.js`) — **IMPLEMENTED**
Early-game room defender and source harasser.
Priority: attack hostiles on or near sources → patrol between sources.
Does NOT use traffic system — combat creeps move freely.
Body: TOUGH + ATTACK + MOVE×2 per set. Scales up to 5 sets.
One at RCL2–3, two at RCL4+. Spawns whenever room is in WAR or FORTIFY state.

---

### Gutter Runner (`rat.gutterrunner.js`) — **IMPLEMENTED**
BFS scout. Hops one room at a time using `Game.map.findRoute`.
Writes intel to `Memory.intelligence` when reaching room center.
Intel: sources, controller owner/level, exits, hostiles, minerals.
One per warren. Spawns when adjacent rooms have stale intel (>5000 ticks old).
Body: pure MOVE, capped at 5 parts (250e). Cheap and fast.

---

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
- **Thrall**: `floor(energy / 100)` CARRY+MOVE pairs, capped at 10 pairs
- **Clanrat**: `floor(energy / 200)` WORK+CARRY+MOVE sets, capped at 16 sets
- **Warlock**: maximize WORK with 150 energy overhead reserved for 2 CARRY+1 MOVE
- **Stormvermin**: TOUGH+ATTACK+MOVE×2 per set, capped at 5 sets (900e)
- **Gutter Runner**: pure MOVE, capped at 5 parts (250e)
- **Jezzail / Rat Ogre**: stubs with minimum viable bodies

### `spawn.director.js`
**Parts-based targeting** — tracks total active body parts, not head count.
This allows large creeps to naturally replace multiple small ones as energy
capacity grows. One big thrall beats three tiny ones for traffic and CPU.

Priority order:
1. Emergency slave (warren empty) — no energy threshold
2. **Miners** — no threshold; dead miner stalls entire economy. If miners needed
   but unaffordable, WAIT. Do not fall through to spawn thralls with miner energy.
3. **Thralls** — no threshold; thralls fill extensions. Gating them causes deadlock.
4. Gutter Runner — one per warren when adjacent rooms have stale intel
5. Stormvermin — when WAR or FORTIFY, one at RCL2-3, two at RCL4+
6. **Clanrats + Warlock** — wait for `energyRatio >= 0.9`

Parts targets (calculated by `calculatePartsTargets`):
- Miner: `sources × 5` WORK parts
- Thrall: `thrallCount × pairsPerThrall` CARRY parts
    - thrallCount: 1 (no extensions/storage), sources (RCL≤3), sources+1 (RCL4+)
- Clanrat: capped by count (`sources × 2` at RCL≤2, `× 4` at RCL≤4, `× 6` at RCL5+)
- Warlock: `floor((cap - 150) / 100)` WORK parts, capped at 10

**Dead weight detection:** Spawns an upgraded replacement when a creep's active
functional parts fall below 40% of what an ideal body would have. Only fires when
≥3 of that role are alive and energy is available for the replacement.

**Preemptive replacement:** Miners with TTL < 80, thralls with TTL < 150 are not
counted toward parts targets — triggers early spawning to avoid coverage gaps.

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
No rat file ever calls `creep.moveTo()` directly (except Stormvermin — combat only).

### API
```javascript
Traffic.pin(creep)                          // hard pin — never displaced
Traffic.requestMove(creep, target, {range}) // register move intent
Traffic.resolve()                           // called once after all creep ticks
```

### Pin Types
**Hard pin**: explicit `pin()` call. Miners and warlocks. Never displaced except
by other miners who can push non-miner creeps off their target tile.
**Soft pin**: auto-assigned in `resolve()` to any creep that registered no intent.
A motivated moving creep will push soft-pinned creeps to any adjacent free tile.

### Path Caching & TTL
Paths stored in `creep.memory._trafficPath` as `{x,y}` arrays.
**Path TTL: 50 ticks** — stale paths are recalculated to account for new structures.
Cache also invalidated when:
- Target changes
- Creep is pushed off-path (displacement > 1 tile from next step)
- Next step is hard-pinned by another creep
- Next step blocked by structure or construction site

### CostMatrix
- Roads: cost 1
- Plains: cost 2
- **Swamp: per-creep calculation** based on actual fatigue economics
    - Formula: `ceil((nonMove × 10) / (move × 2))`
    - Balanced thrall (7 CARRY + 7 MOVE): cost 5
    - Heavy warlock (6 WORK + 2 CARRY + 1 MOVE): cost 30
- Blocking structures/sites: cost 0xff
- Hard-pinned tiles: cost 20
- **Soft-pinned tiles: cost 8** (was 20 — reduced to avoid forcing huge detours around idle clusters)
- Creeps with active move intents: cost 5

### Stuck Detection (tiered)
- **5 ticks**: moveTo fallback (ignoreCreeps: true) for `FALLBACK_DURATION = 4` ticks
- **25 ticks**: random direction nudge (path cache cleared)
- **50 ticks**: suicide; spawn director queues a replacement

Stuck counter only increments when `creep.fatigue === 0`.
A creep recovering from swamp fatigue hasn't moved but isn't stuck.

---

## Planners

All planners: one site placed at a time, self-guarding, called by `warren.act.js` only.
Most have an energy ratio guard to avoid building during economic recovery.

### `plan.spawn.js`
One-time placement on first boot. Scores all tiles in a 20-tile radius from
room center by: source proximity (40%), open space (30%), controller proximity (20%),
edge distance (10%). Hard rejects tiles adjacent to walls.
Triggered by Claim flags via `empire.js`.

### `plan.extensions.js`
Places extensions up to RCL cap. Energy ratio guard: 0.7.
One site at a time — waits for the current site to complete before placing the next.
Uses passability guard: hard rejects tiles with fewer than 2 open cardinal
neighbors to prevent impassable clusters.

### `plan.container.controller.js`
Controller container placed on the tile adjacent to the controller closest to
spawn (minimizes thrall travel). Warlock stands ON this tile permanently.
Waits for any existing container site to complete before placing.

### `plan.container.source.js`
**Two responsibilities:**

1. **`Room.prototype.getMinerSeat(sourceId)`** — calculates and caches the
   optimal standing tile for a miner at each source. Cached permanently in
   `room.memory.minerSeats[sourceId]`. The seat is the walkable tile adjacent
   to the source that is closest to spawn.

2. **`Room.prototype.planSourceContainers()`** — places container sites at
   each miner seat. One site at a time. Waits for controller container to
   exist first (enforced by calling order in `warren.act.js`).

### `plan.roads.js`
Roads along spawn→source and spawn→controller paths.
Uses `PathFinder.search` with the same CostMatrix as `traffic.js` — roads are
placed on tiles creeps actually walk, not geometrically shortest path.
**Threshold split:** spawn→source roads use a lower energy threshold (0.5 vs 0.7)
because hauler roads are critical infrastructure — decaying them slows recovery.
Paths cached in `room.memory._roadPaths` (separate from `_plannerPaths`).

### `plan.tower.js`
One tower per warren at RCL3. Placed range 2-5 from spawn (sweet spot: 3-4).
Energy guard: 0.7.

### `plan.ramparts.js`
Ramparts on spawn → tower → extensions (in priority order). One site at a time.
No energy guard — defense placement is always worth it (1e construction cost).
Tower repairs ramparts to tiered HP floors: 20k → 75k → 250k.
Lowest-HP rampart in each floor tier gets repaired first (triage priority).

### `plan.scoring.js`
Scoring logic for extension placement. Passability guard replaces the old
clustering feedback loop that caused impassable walls.

---

## Job Board (`job.board.js`)

Fully ephemeral — reset and repopulated every tick.
No stale job assignments survive between ticks.

Job types: `HARVEST`, `BUILD`, `UPGRADE`, `REPAIR`, `HAUL`, `DEFEND`

Role preferences are wired in `rolePreference()`:
- Miners strongly prefer HARVEST (+500)
- Thralls strongly prefer HAUL (+500)
- Clanrats prefer BUILD (+300) > UPGRADE (+250) > REPAIR (+150)
- Clanrats are explicitly excluded from HARVEST (they have their own gather phase)

Build job priorities:
- 900: controller container (unlocks warlock continuous upgrade)
- 875: tower (defense infrastructure)
- 850: rampart (immediate structural protection)
- 800: everything else (extensions, roads, source containers, etc.)

Repair job priorities:
- 975: controller container
- 950: source containers, critical ramparts (<1000 hits)
- 900: other containers, towers, ramparts
- 750: critical roads (<25% hits)
- 500: damaged roads (<50% hits)

Up to 3 repair jobs published per tick (worst first) to allow parallel repair.

Upgrade job priority is dynamic:
- 750: energy capped (≥95%) — upgrade is best use of clanrat time
- 600: no extensions exist at all — upgrading RCL is urgent
- 300: normal operation

---

## State Machine

See `warren.md` for full OODA loop details.

States:
- **BOOTSTRAP** (RCL1): harvest + upgrade only
- **STABLE**: upgrade + repair, build extensions and infrastructure
- **GROW**: triggered by energy cap OR construction sites existing. Full build mode.
- **FORTIFY**: triggered after attack clears. Hold defensive posture for 1000 ticks
  or until ramparts reach 10k HP and tower is present. Build ramparts + tower + upgrade.
- **WAR**: hostiles with ATTACK or RANGED_ATTACK present. Defense only.

Safe mode triggers in `decide()` when:
- Hostiles exist + safe mode available + no tower → activate
- Hostiles exist + tower but hostile HP > tower strength × 10 → activate

---

## Empire Layer (`empire.js`)

Watches for `Claim` flags placed by the player.
When found in a visible owned room with no spawn, triggers `room.planSpawn()`.
Removes the flag when the spawn site is placed.

This is the one manual act required for expansion — place a Claim flag,
then the code scores and places the spawn site automatically.

---

## Instrumentation (`warren.blackbox.js`)

Single file. Two modes. One Memory key (`Memory.blackbox`).

**Rolling recorder** — always-on, 5-bucket rolling window (300 ticks total).
**Profile run** — manual fixed 300-tick snapshot with completion alert.
**Creep diagnostics** — per-creep tick-by-tick logging for debugging behavior.

Both modes share: creep registry, event log, anomaly log. No duplication.
Data aggregated into 60-tick buckets — low Memory footprint.

Anomaly auto-detection (every 10 ticks):
- Energy drops >25% below bucket average
- Dropped energy spike >500
- Miner count falls below source count

Anomaly log stores the last 5 full frozen snapshots with every creep's TTL
and store contents, container fills, and spawn state.

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

**One construction site at a time (per type).**
Ensures infrastructure completes in priority order and workers stay focused.

**Hard pins never cleared by traffic.**
Only the owning rat clears its pin by not calling `Traffic.pin()` in a given tick.

**Miner seats are cached in room memory.**
`room.memory.minerSeats[sourceId]` is the source of truth for where miners stand.
Never recalculate — terrain and spawn position are static.

**Parts-based spawn targeting, not head count.**
At RCL3+, what matters is total functional body parts, not number of creeps.
A single 10-CARRY thrall outperforms two 5-CARRY thralls in every way.

---

## Current Status

**Room:** W23N1
**RCL:** 4
**Controller progress rate:** ~4.08/tick → ~19.4 hours to RCL5
**Energy capacity:** 1300 (20 extensions at 50e each + 300 spawn)

**Infrastructure:**
- Source containers: online (averaging 1% full — thralls draining quickly)
- Controller container: online (averaging 0% full — warlock + drought)
- Roads: 8 damaged, 4 critical, stable
- Tower: online, 54% energy, healthy
- Ramparts: built but at 8% health — **critical, needs tower repair time**
- Extensions: 20/20 (RCL4 cap)

**Creep population:**
- 2 miners (5 WORK + 1 CARRY + 1 MOVE each)
- 5 thralls (7–10 CARRY+MOVE pairs)
- 4 clanrats (5–6 WORK+CARRY+MOVE sets)
- 1 warlock (10 WORK + 2 CARRY + 1 MOVE)
- 1 gutter runner (3 MOVE)

**Active concerns:**
- **27% drought rate** — energy below 20% for over a quarter of ticks
- **Ramparts at 8% HP** — tower can't repair fast enough while also battling drought
- Spawn utilization 41% — energy drought prevents full spawn throughput
- Controller upgrade at 4.08/tick — slow; warlock container perpetually empty

**CPU:** 0.57 avg, 0.79 max — well below limit

---

## What's Next

### Priority 1 — Storage (RCL4 unlock, immediate)
Storage completely changes energy routing. All energy flows through storage.
See `architecture/storage-design.md` for the planned routing redesign.

Key changes required:
- Thrall routing split: source-thralls (container→storage) vs demand-thralls (storage→consumers)
- `warren.act.js` needs storage-aware job publishing
- `spawn.director.js` needs to account for storage thrall demand separately

**Prerequisite satisfied:** Source containers are online. Storage builds on top.

### Priority 2 — Energy drought investigation
27% drought rate at RCL4 with 20 extensions is abnormal. Likely causes:
- Thrall CARRY capacity not keeping pace with 20-extension spawn costs
- Source containers draining too fast (1% avg fill = thralls are barely ahead)
- Tower energy drain competing with extensions during spawning peaks

Diagnose with: `blackbox('diagnose', 'thrall_name', 100)` on a thrall during
a spawn cycle to see if it's struggling to fill extensions before the spawn fires.

### Priority 3 — Rampart health
At 8% average, ramparts are fragile. Tower is spending repair budget on ramparts
during idle ticks but can't keep up at current energy throughput.
Ramparts will naturally improve as storage stabilizes energy flow.

### Priority 4 — Military layer (Jezzail, Rat Ogre)
Stormvermin and Gutter Runner are implemented. Jezzail and Rat Ogre stubs remain.
Not urgent until multi-room expansion.

### Priority 5 — RCL5 planning
RCL5 unlocks: second spawn (spawn site needed), 10 more extensions.
At ~19 hours out, plan the second spawn placement now.
The `plan.spawn.js` + `empire.js` Claim flag system handles auto-placement.

### Longer term
- Remote mining (multi-room traffic coordination)
- Scouting infrastructure already built — Gutter Runner is online
- Empire layer (claim flags work; expansion planning is manual for now)
- Lab reactions / mineral processing
- Market automation

### When to consider multi-room operations

Don't rush it. Readiness checklist:
- **Storage online (RCL4)** — without buffer, remote ops destabilize home economy
- **Controller progressing cleanly** — RCL5 in sight before splitting attention
- **CPU headroom** — check avg vs limit; remote rooms add meaningful tick cost
- **Home economy saturated** — energy consistently capping, all infrastructure built

Current target: **finish Layer 2 (storage + stable energy) before Layer 3.**

---

## Known Issues / Tech Debt

**Energy drought (27%):** Source containers at 1% average fill suggests thrall
pipeline is barely keeping up. Likely worsened by RCL4 extension energy costs.
Will investigate after storage is online — storage buffering should absorb peaks.

**Rampart health (8% avg):** Not actively deteriorating but fragile. Tower
repair budget is split between ramparts and other structures. Will improve
as energy flow stabilizes.

**Source container hits at 58%:** Containers taking decay damage faster than
repair jobs are addressing them. Low priority but worth monitoring — a dead
container means a miner's energy spills as drops.

---

## File Organization

```
warren.js              — OODA loop coordinator
warren.memory.js       — Memory interface, ROOM_STATE enum
warren.observe.js      — Snapshot builder
warren.orient.js       — State classification + attack logging
warren.decide.js       — Plan builder (boolean flags, no side effects)
warren.act.js          — Plan executor (only place with side effects)
warren.blackbox.js     — Instrumentation (rolling recorder + profiler + diagnostics)

rat.js                 — Creep tick router
rat.slave.js           — RCL1 generalist
rat.miner.js           — Source harvester (stands on container)
rat.thrall.js          — Energy transport specialist
rat.clanrat.js         — Builder and upgrader
rat.warlock.js         — Dedicated controller upgrader
rat.stormvermin.js     — Room defender (IMPLEMENTED)
rat.gutterrunner.js    — BFS scout (IMPLEMENTED)
rat.jezzail.js         — Long-range sniper (stub)
rat.ratogre.js         — Heavy brute (stub)

spawn.director.js      — Parts-based demand targeting, dead weight detection
spawn.bodies.js        — Body part recipes (formulaic, no tiers)

plan.extensions.js            — Extension placement
plan.container.controller.js  — Controller container placement
plan.container.source.js      — Source container placement + seat calculation
plan.roads.js                 — Road placement (PathFinder-matched to traffic routing)
plan.tower.js                 — Tower placement
plan.ramparts.js              — Rampart placement (spawn → tower → extensions)
plan.spawn.js                 — Spawn placement (one-time, scored placement)
plan.scoring.js               — Tile scoring utilities
plan.utils.js                 — Shared planner utilities

job.board.js           — Ephemeral per-tick job assignment
traffic.js             — Movement coordination (pins, intents, resolution, stuck recovery)

empire.js              — Multi-room coordination (Claim flag watching, spawn placement)
main.js                — Game loop entry point
```