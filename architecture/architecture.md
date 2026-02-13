# Skaven Screeps — Master Architecture Document
*Briefing doc for AI assistants and future contributors. Read this first. All of it.*

---

## What This Is

A Screeps codebase themed around the Skaven from Warhammer Fantasy. The Skaven are a race of
intelligent ratmen who survive through cunning, overwhelming numbers, and ruthless economic
efficiency. This maps perfectly to Screeps gameplay.

**The single overriding design goal:**
Drop the code into Screeps and walk away. It runs, grows, expands, and fights completely
on its own. No manual intervention. Ever. If a human has to touch the game to make something
work, that is a bug.

This codebase is a long-term learning project. The owner is iterating toward full automation
across four layers (see Development Layers below). Do not skip ahead. Do not add features
from Layer 3 while Layer 1 is still broken.

---

## Skaven Lore → Screeps Mapping

Everything in this codebase has a Skaven name. Use them consistently. Do not mix in generic
Screeps terminology in variable names, comments, or logs.

| Skaven Term    | Screeps Concept         | Notes                                              |
|----------------|-------------------------|----------------------------------------------------|
| **Warren**     | Owned Room              | A fully operational colony. Has state and opinions.|
| **Burrow**     | Newly claimed Room      | Still bootstrapping, not yet a Warren              |
| **Slave**      | Bootstrap creep         | Cheap generalist. Does everything badly. RCL1 only |
| **Miner**      | Dedicated harvester     | Sits on a source and never moves. RCL2+            |
| **Hauler**     | Energy transporter      | Moves energy from drop pile to consumers           |
| **Worker**     | Builder / Upgrader      | Consumes energy to build and upgrade               |
| **Rat Ogre**   | Heavy melee fighter     | Pure ATTACK body. Defender and room attacker       |
| **Gutter Runner** | Scout / Harasser     | MOVE-heavy, fast, light combat. Early raider       |
| **Jezzail**    | Ranged attacker         | RANGED_ATTACK specialist, long-range sniper        |
| **Grey Seer**  | Claimer / Reserver      | Expensive, used to claim or reserve new rooms      |
| **Stormvermin**| Mid-tier soldier        | Professional between Slaves and Rat Ogres          |
| **Empire**     | Global game state       | Multi-room coordination layer                      |
| **The Horde**  | All creeps collectively | —                                                  |

---

## Development Layers

Work proceeds strictly in layer order. Do not begin a layer until the previous one is stable
and hands-off.

### Layer 1 — Economic Engine (CURRENT FOCUS)
The Warren must bootstrap from nothing, grow to RCL8, and sustain itself indefinitely without
any human input. This means:
- Slave bootstraps at RCL1, transitions to specialist roles at RCL2
- Miners, Haulers, Workers spawn and replenish automatically at correct ratios
- Extensions build themselves via the extension planner
- Room recovers gracefully from any population collapse
- No edge case crashes the tick

### Layer 2 — Self-Sustaining Growth
The Warren climbs RCL on its own. It builds roads, containers, storage, towers. It manages
energy routing through containers and storage correctly at each RCL tier. It knows when it
is "saturated" and signals the Empire to expand.

### Layer 3 — Multi-Room Expansion
Empire detects when a Warren is saturated. Spawns a Grey Seer to claim a new room.
New Burrow bootstraps itself using the same Layer 1 engine. Empire coordinates energy
transfers between rooms if needed.

### Layer 4 — Combat and Domination
Rat Ogres defend. Gutter Runners scout enemy rooms. Jezzails provide ranged fire.
Empire plans and executes raids. Rooms can be taken, held, and exploited.
Player vs Player is in scope but far future.

### Future / Deep Future
- Mineral harvesting (Hydrogen, Oxygen, etc.) and boosting creep body parts
- Power creeps
- Market / terminal trading

---

## File Layout

All Screeps code lives flat (no real directories). Prefix = namespace = owner.
The prefix is not decoration — it is the architectural boundary.

```
main.js                  Entry point only. Requires + game loop. Zero logic.

empire.js                Global tick. Multi-room coordination. Mostly stub for now.
empire.memory.js         Empire-level memory schema and init helpers.

warren.js                Room.prototype.tick — OODA orchestrator.
warren.memory.js         Room state machine enum + memory init + setState().
warren.observe.js        Snapshot gathering. Side-effect free.
warren.orient.js         State selection. Reads snapshot, sets state.
warren.decide.js         Plan flags. Reads state, produces _plan object.
warren.act.js            Side effects. Executes _plan, delegates to directors/planners/jobs.
warren.profile.js        One-time room profiling (terrain, source open spots, exit count).

rat.js                   Creep.prototype.tick — role router + shared creep helpers.
rat.slave.js             Slave behavior (RCL1 bootstrap generalist).
rat.miner.js             Miner behavior (dedicated source sitter).
rat.hauler.js            Hauler behavior (pickup dropped energy → deliver to consumers).
rat.worker.js            Worker behavior (build + upgrade, energy-state toggled).
# Future files:
# rat.ogre.js            Rat Ogre (heavy melee combat)
# rat.runner.js          Gutter Runner (scout + harass)
# rat.jezzail.js         Jezzail (ranged attack)
# rat.greyseer.js        Grey Seer (claim + reserve)

spawn.director.js        Decides what to spawn and when. Called only from warren.act.js.
spawn.bodies.js          Body part recipes per role per energy tier. Pure functions only.

job.board.js             Runtime job coordination. Fully ephemeral. No Memory writes. Ever.
job.types.js             Job type constants, canDo() rules, role preference weights.

plan.extensions.js       Extension placement logic.
plan.roads.js            Road planning. (future)
plan.scoring.js          Tile scoring functions shared across planners.
plan.utils.js            Shared planner math: buildable tiles, range, bounds, adjacency.

architecture/            Documentation only. No code files here.
  ARCHITECTURE.md        This file.
  warren.md              OODA loop contract and state machine detail.
  rats.md                Creep role definitions, body philosophy, transition rules.
  empire.md              Multi-room design intent (stub).
```

---

## The OODA Loop (Warren Tick)

Each owned room runs one full OODA cycle per game tick, in this exact order:

```
warren.tick()
  → initMemory()     [warren.memory.js]   Ensure memory schema exists
  → profile()        [warren.profile.js]  One-time terrain scan, cached in memory
  → observe()        [warren.observe.js]  Build this._snapshot (READ ONLY)
  → orient()         [warren.orient.js]   Read snapshot → call setState() → sets memory.state
  → decide()         [warren.decide.js]   Read memory.state → build this._plan (flags only)
  → act()            [warren.act.js]      Read this._plan → perform all side effects
```

**The invariants. These must never be violated:**

1. `observe()` is side-effect free. It only reads and writes to `this._snapshot`.
2. `orient()` only calls `setState()`. No actions, no Memory writes beyond state.
3. `decide()` only builds `this._plan`. No actions, no Memory writes.
4. `act()` is the ONLY phase where side effects occur (spawning, building, publishing jobs).
5. Planners are self-capping. The state machine is not their safety net.
6. `job.board` never writes to Memory. It resets at the top of every `act()` call.
7. Dependency flow is strictly downward: `main → empire → warren → (rats, spawn, plan, jobs)`.
   Nothing flows back up the chain.

---

## Room State Machine

Defined in `warren.memory.js`. Owned exclusively by `orient()`.

```
BOOTSTRAP  RCL == 1. Survival mode. Only slaves. Harvest + upgrade.
STABLE     No threats, no construction pressure, economy running. Upgrade only.
GROW       Energy capped OR construction sites exist. Build + expand.
FORTIFY    (declared, not yet implemented) Wall up, repair, prepare defenses.
WAR        Hostiles detected. Suspend economy. Defend.
```

**Transition rules (orient.js):**
```
if hostiles > 0        → WAR        (hard override, checked first)
if rcl == 1            → BOOTSTRAP
if energy is capped    → GROW
if construction sites  → GROW
else                   → STABLE
```

**Plan flags per state (decide.js):**
```
BOOTSTRAP  → publishHarvest + publishUpgrade
GROW       → buildExtensions + publishHarvest + publishBuild + publishUpgrade
WAR        → publishDefense
STABLE     → publishUpgrade (default)
FORTIFY    → (not yet implemented)
```

---

## Creep Roles and Lifecycle

### Role Transition Rules
- **Slave** → promoted to `worker` role automatically when warren RCL reaches 2.
  On promotion: delete job, delete working, delete sourceId from memory.
- **Slave** is the ONLY role used at RCL1. No miners or haulers at RCL1.
- **Miner** stays a miner for life. It claims a sourceId on spawn and never changes.
- **Hauler** stays a hauler for life.
- **Worker** stays a worker for life.

### Spawn Priority (spawn.director.js)
```
Emergency: 0 creeps in room + energy >= 200 → spawn slave immediately

RCL1: creeps < sources.length → spawn slave

RCL2+:
  miners < sources.length       → spawn miner (highest priority)
  haulers < miners.length       → spawn hauler
  workers < miners.length * 2   → spawn worker
```

### Body Recipes (spawn.bodies.js)
All body recipes are pure functions: `createBody(role, energyCapacity) → bodyArray`.
Recipes scale to energy capacity. Always return valid bodies. Never throw.

---

## Job Board Contract

`job.board.js` is the only coordination layer between the warren and individual creeps.
It is reset at the start of every `act()` call. It holds no state between ticks.

**Job schema:**
```javascript
{
  type:     string,   // 'HARVEST' | 'BUILD' | 'UPGRADE' | 'HAUL' | 'DEFEND' | 'REPAIR'
  targetId: string,   // Game object ID
  priority: number,   // Higher = preferred. See weights below.
  slots:    number,   // Max creeps that can be assigned this job simultaneously
  assigned: []        // Creep names assigned this tick (runtime only)
}
```

**Priority weights (reference):**
```
BUILD    800   (highest — unfinished construction blocks growth)
HARVEST  100
DEFEND   200
UPGRADE   50
```

**Role preference weights (job.types.js):**
```
miner  + HARVEST  = +500   (miners must never do anything else)
hauler + HAUL     = +500   (haulers must never do anything else)
worker + BUILD    = +300
slave  + HARVEST  = +200
worker + UPGRADE  = +100
slave  + UPGRADE  = +50
```

---

## Planner Contracts

All `plan.*` files are pure calculation engines. They:
- Accept a room and relevant parameters
- Perform math / lookups
- Place at most one construction site per call (unless documented otherwise)
- Return early if conditions are not met (energy ratio too low, already at cap, etc.)
- Never write to Memory except for path caches in `plan.utils.js`

**Extension planner guard conditions:**
- Only runs when `energyAvailable / energyCapacityAvailable >= 0.7`
- Counts both existing extensions AND extension construction sites against the RCL cap
- Never places beyond `CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl]`

---

## Known Sharp Edges / Open Issues

**orient.js — "any construction site forces GROW"**
Currently any construction site (road, wall, container, anything) triggers GROW state.
This can cause over-planning. Future fix: only extension sites should trigger GROW, or
gate on energy saturation as a secondary condition.

**hauler.js — delivery targets**
Currently haulers only deliver to spawn. Extensions and towers go unfilled.
Future: hauler should fill spawn → extensions → towers → storage in priority order.

**worker.js — energy state toggle**
Workers need a `this.memory.working` boolean flag to properly toggle between
harvesting and spending. Without it, workers with 0 energy try to run jobs and stall.

**spawn.director.js — getRoomCreeps uses room.name filter**
Works correctly for single-room play. Will need updating for multi-room when creeps
may be travelling between rooms and temporarily not present in their home room.

**planner.utils.js — path cache has no TTL**
`_plannerPaths` in room memory grows indefinitely. Low risk (terrain is static) but
should be cleared when structures change significantly.

---

## Coding Conventions

- **No magic numbers.** Extract constants to the top of the file or to a constants file.
- **No Memory writes in observe/orient/decide.** If you're writing Memory outside of act(), stop.
- **Fail gracefully.** Every function that touches a Game object must null-check it.
  `Game.getObjectById()` returns null. Creeps die. Spawns get destroyed. Code for it.
- **Log with context.** `console.log(`[warren:${room.name}] spawning miner`)` not `console.log('spawning')`.
- **Comments explain WHY, not WHAT.** The code says what. Comments say why.
- **Skaven names in logs and comments.** `rat`, `warren`, `slave`, `miner` — not `creep`, `room`, `worker1`.

---

## What "Done" Looks Like for Layer 1

A Layer 1 warren is complete when:
- Starting from a fresh room with only a spawn, it reaches RCL3 with no human input
- It recovers from total population loss (all creeps die) without stalling
- It never crashes the game tick under normal operation
- Extensions build automatically as RCL unlocks them
- Energy is never wasted (always being harvested, stored, or spent)
- A human can watch it run for 10,000 ticks and never need to touch anything

---

## Current Status
Layer: 1 — Economic Engine
Last session: Renamed all files to warren/rat/spawn/plan convention.
Fixed rat.slave, rat.worker, rat.hauler, warren.decide.
Next: Deploy to fresh room and observe bootstrap behavior.
