# Skaven Warren — Architecture Reference

## Philosophy

Screeps is an economy simulation before it is a game. Every design decision flows from one principle: **maximize energy throughput, minimize CPU and creep overhead**. Fewer, larger creeps beat many small creeps. Specialist roles beat generalists. Infrastructure (roads, containers, storage) beats throwing more bodies at a problem.

The codebase is organized around a single warren per room. Multi-room expansion (empire layer) is deferred until the single-warren economy is solid.

---

## System Layers

### Layer 0 — Bootstrap (RCL1)
Slaves only. Harvest, upgrade, survive. No specialization.
Transition to Layer 1 when RCL2 is reached.

### Layer 1 — Economic Engine (RCL2–3) ← current
Specialist roles: miners, haulers, workers, warlock.
Source containers and roads being built.
Transition to Layer 2 when source containers are built and RCL4 is approaching.

### Layer 2 — Infrastructure (RCL4–5)
Storage, tower network, source containers fully operational.
Hauler routing shifts from dropped pile → container → storage → consumers.
Not yet implemented.

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

### Slave (`rat.slave.js`)
RCL1 generalist. Harvests, upgrades, builds. Replaced by specialists at RCL2.
Body: `[WORK×N, CARRY, MOVE]` — scales with available energy.

### Miner (`rat.miner.js`)
Sits on a source tile and harvests every tick. Never moves after seating.
Bypasses job board — hardcoded behavior.
Body: maximize WORK up to 5 (10 energy/tick = full source drain), 1 MOVE.
Pin type: **hard pin** — traffic manager never displaces a miner.

### Hauler (`rat.hauler.js`)
Moves energy from dropped piles / containers to consumers.
No WORK parts — pure transport.
Delivery priority: spawn → extensions → controller container → towers.
Body: equal CARRY+MOVE pairs, scales with energy.
**Uses `room.find` + `findClosestByRange` for all consumer lookups.**
`findClosestByPath` was deliberately removed — it returns null silently on
congested paths, causing haulers to silently skip delivery targets.

### Worker (`rat.worker.js`)
Builds construction sites and upgrades controller.
Draws energy from dropped piles and tombstones.
Uses job board for task assignment.
Body: equal WORK+CARRY+MOVE sets, scales with energy.

### Warlock Engineer (`rat.warlock.js`)
Dedicated upgrader. Stands ON the controller container tile permanently.
From that position it can both withdraw (range 0) and upgrade (range ≤ 3).
Zero travel between refuel and upgrade once seated.
Bypasses job board — hardcoded behavior.
Energy priority: container (if has energy) → dropped near controller →
tombstones near controller → spawn surplus (>250 only).
**Key behavior: checks `container.store[RESOURCE_ENERGY] > 0` before
committing to walk to container. Empty container falls through immediately
to other sources — does not pin and wait.**
Body: maximize WORK, fixed 2 CARRY + 2 MOVE overhead.

---

## Spawn System

### `spawn.bodies.js`
Purely formulaic body recipes — no discrete tiers.
Each role scales continuously with available energy:
- **Miner**: `floor((energy - 50) / 100)` WORK parts, capped at 5, plus 1 MOVE
- **Hauler**: `floor(energy / 100)` CARRY+MOVE pairs
- **Worker**: `floor(energy / 200)` WORK+CARRY+MOVE sets
- **Warlock**: maximize WORK with 200 energy overhead reserved for 2 CARRY+2 MOVE

This means a 550-energy spawn produces exactly the same body as the old top tier,
but a 450-energy spawn also produces a good body instead of falling through to
a 3-part minimum. No thresholds to miscalibrate.

### `spawn.director.js`
Priority order:
1. Emergency slave (warren empty) — no threshold, uses `energyAvailable`
2. Miners — no threshold (dead miner stalls entire economy)
3. Haulers — no threshold (**haulers fill extensions — gating them on extension fill creates a deadlock**)
4. Workers — waits for `energyAvailable / energyCapacityAvailable >= 0.9`
5. Warlock — same threshold, only spawns when controller container exists

Hauler target:
- Source containers present: 1 per source container
- RCL3+, no containers: 2 haulers (10+ extensions overwhelm a single hauler)
- RCL2, no containers: 1 hauler

Worker target:
- Base: `sources * 2`
- Bonus: `+sources` when energy is capped (economy saturated, add spending capacity)
- Cap: `sources * 4`

**Known limitation / next redesign:**
Creep count is the wrong metric at higher RCL. What matters is:
- Total WORK parts mining vs `sources * 5` (full drain)
- Total CARRY capacity hauling vs demand
- Total WORK parts spending (building + upgrading) vs energy production rate
  See "What's Next" section — this is the priority redesign for the next session.

---

## Traffic Manager (`traffic.js`)

All movement is coordinated through the traffic layer.
No rat file ever calls `creep.moveTo()` directly — all movement goes through
`Traffic.requestMove()` or `Traffic.pin()`.

### API
```javascript
Traffic.pin(creep)                          // hard pin — never displaced
Traffic.requestMove(creep, target, {range}) // register move intent
Traffic.resolve()                           // called once after all creep ticks
```

### Pin Types
**Hard pin** (`_pins` only): explicit `pin()` call. Miners and warlocks.
Traffic never routes through, never displaces.

**Soft pin** (`_pins` + `_softPins`): auto-assigned in `resolve()` to any creep
that registered no intent. Idle rats. A motivated moving creep that needs their
tile will push them to any adjacent free tile rather than waiting.

### Path Caching
Paths stored in `creep.memory._trafficPath` as `{x,y}` arrays.
Cache invalidated when:
- Target changes
- Creep is pushed off-path (next step no longer adjacent)
- Next step has **any** pin on it (hard or soft) — recalculate for fresh routing
- Next step blocked by structure or construction site

**Important:** Both hard and soft pins now invalidate the cache. Previously
only hard pins did. Stale paths that routed around a now-moved soft-pinned creep
were causing convoys to follow wrong routes for many ticks.

### CostMatrix
- Roads: cost 1
- Plains: cost 2
- Swamp: cost 5 (not 10 — high swamp cost funnels all creeps into the same narrow plain corridor)
- Blocking structures / sites: cost 0xff
- Hard + soft pinned tiles: cost 20
- **Creeps with active move intents: cost 10** — later-ticking creeps see existing
  traffic and naturally compute slightly different paths, preventing all creeps
  from piling onto the exact same road tiles

### Stuck Detection & Fallback
Every tick a creep registers a move intent, its position is compared to
`creep.memory._trafficLastPos`. If unchanged for `STUCK_THRESHOLD = 3` ticks,
a `FALLBACK_DURATION = 3` tick countdown begins.
During fallback: native `creep.moveTo(ignoreCreeps: true)` with red path visualization.
After fallback: path cache wiped, traffic resumes with a fresh calculation.
Memory keys: `_trafficLastPos`, `_trafficStuck`, `_trafficFallback`

---

## Planners

All planners follow the same discipline:
- One construction site placed per call (at most)
- Self-guarding: check for existing structures/sites before placing
- Energy ratio guard: don't build during economic recovery
- Called by `warren.act.js` based on `_plan` flags

### `plan.extensions.js`
Places extensions up to RCL cap. Energy ratio guard: 0.7.
Placement logic: spiral outward from spawn, pick buildable tiles.

### `plan.containers.js`
Places one controller container on the tile adjacent to the controller
that is **closest to spawn** (minimizes hauler travel distance).
Warlock stands ON this tile permanently.
**Bug fixed:** previous version sorted by negative distance ascending = farthest
tile first. Now sorts by positive distance ascending = closest tile first.

### `plan.roads.js`
Places road sites along spawn→source and spawn→controller paths.
One site at a time, source paths complete before controller path starts.
**Uses `PathFinder.search` with the same CostMatrix as `traffic.js`** —
this guarantees roads are placed on tiles creeps actually walk, not tiles
a different algorithm happens to prefer. Previous version used `room.findPath`
which sometimes disagreed with the traffic manager's routing.
Paths cached in `room.memory._roadPaths` (terrain is static).

---

## Visual Layer (`rat.visual.js`)

Draws colored role indicators above each creep every tick via `RoomVisual`.
Pure cosmetic — no game state, no memory, no side effects.

| Symbol | Color  | Role    |
|--------|--------|---------|
| ⚙      | Grey   | Slave   |
| ⛏      | Gold   | Miner   |
| ⬆      | Blue   | Hauler  |
| 🔨     | Green  | Worker  |
| ⚡     | Purple | Warlock |

Called from `Creep.prototype.tick` in `rat.js` before role dispatch.

---

## Key Design Rules

**`room.find` not `findClosestByPath` for target lookup.**
`findClosestByPath` silently returns null when the room is congested and it
cannot pathfind to the target. Always use `room.find` + `findClosestByRange`
to get the object reference. Let the traffic manager handle actual navigation.

**`energyAvailable` not `energyCapacityAvailable` for body cost checks.**
Capacity is misleading during recovery (extensions empty). Always pass
`energyAvailable` to body recipes so spawns never request a body they can't afford.

**Miners and haulers bypass the spawn energy threshold.**
They ARE the pipeline that fills extensions. Gating them creates a deadlock.

**One construction site at a time.**
Prevents workers from spreading effort across a large backlog and ensures
infrastructure completes in priority order.

**Hard pins never cleared by traffic.**
Only the owning rat clears its pin by not calling `Traffic.pin()` in a given tick.
Traffic manager never touches hard pin state.

---

## What's Next

### Priority 1 — Parts-based spawn director (next session)
**This is the most important redesign.**
Creep count is the wrong metric at RCL3+. Replace head-count targets with
parts-based targets:
- Miner: spawn until `sum(miner WORK parts) >= sources * 5`
- Hauler: spawn until `sum(hauler CARRY parts) >= carryDemand` (function of distance + production rate)
- Worker: spawn until `sum(worker WORK parts) >= workDemand`
- Emergent behavior: one big creep replaces two small ones automatically as
  energy capacity grows. Fewer creeps = less traffic = better throughput.

### Priority 2 — Source containers
Eliminates energy decay. Miners drop into containers, haulers withdraw cleanly.
Once built, hauler routing changes: source container → consumer (no dropped-pile hunting).
`spawn.director.js` already auto-scales haulers to 1-per-source-container when detected.
Needs: `plan.sourceContainers.js`, miner behavior update to sit on container tile,
hauler withdrawal priority update.

### Priority 3 — Tower
One auto-placed tower per warren at RCL3.
Simple: `plan.tower.js` places site near spawn, hauler delivery already wired for towers
(priority 4 in `rat.hauler.js`), `warren.act.js` needs auto-attack logic.

### Priority 4 — Storage (RCL4)
Significant hauler routing redesign. All energy flows through storage.
Haulers split into two types: source-haulers (container→storage) and
demand-haulers (storage→consumers). Worth designing carefully before touching.

### Priority 5 — Road polish
Current roads follow the pathfinder's preferred route which can hug walls.
Upgrade `plan.roads.js` to use a CostMatrix that penalizes building-adjacency,
producing cleaner corridors with more space for creeps to pass each other.

### Longer term
- Remote mining (requires multi-room traffic coordination)
- Military layer (defenders, healers, attack squads)
- Empire layer (claim flags, spawn placement, room prioritization)
- Lab reactions / mineral processing