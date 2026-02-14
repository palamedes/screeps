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

| Skaven Term       | Screeps Concept          | Notes                                               |
|-------------------|--------------------------|-----------------------------------------------------|
| **Warren**        | Owned Room               | A fully operational colony. Has state and opinions. |
| **Burrow**        | Newly claimed Room       | Still bootstrapping, not yet a Warren               |
| **Slave**         | Bootstrap creep          | Cheap generalist. Does everything badly. RCL1 only  |
| **Miner**         | Dedicated harvester      | Sits on a source and never moves. RCL2+             |
| **Hauler**        | Energy transporter       | Moves energy from drop pile to consumers            |
| **Worker**        | Builder / Upgrader       | Consumes energy to build and upgrade                |
| **Warlock Engineer** | Dedicated upgrader    | Sits at controller and upgrades forever. RCL2+      |
| **Rat Ogre**      | Heavy melee fighter      | Pure ATTACK body. Defender and room attacker        |
| **Gutter Runner** | Scout / Harasser         | MOVE-heavy, fast, light combat. Early raider        |
| **Jezzail**       | Ranged attacker          | RANGED_ATTACK specialist, long-range sniper         |
| **Grey Seer**     | Claimer / Reserver       | Expensive, used to claim or reserve new rooms       |
| **Stormvermin**   | Mid-tier soldier         | Professional between Slaves and Rat Ogres           |
| **Empire**        | Global game state        | Multi-room coordination layer                       |
| **The Horde**     | All creeps collectively  | —                                                   |

---

## Development Layers

Work proceeds strictly in layer order. Do not begin a layer until the previous one is stable
and hands-off.

### Layer 1 — Economic Engine (CURRENT FOCUS)
The Warren must bootstrap from nothing, grow to RCL8, and sustain itself indefinitely without
any human input. This means:
- Slave bootstraps at RCL1, transitions to specialist roles at RCL2
- Miners, Haulers, Workers, Warlock Engineers spawn and replenish automatically at correct ratios
- Extensions build themselves via the extension planner, one at a time
- Controller container placed automatically, Warlock Engineer feeds from it
- Room recovers gracefully from any population collapse
- No edge case crashes the tick

**Layer 1 is considered done when:** the warren reaches a self-sustaining saturated state —
all sources covered, all extension slots filled, workers actively spending energy, Warlock
Engineer upgrading continuously, and the director no longer has anything urgent to spawn —
without any human input from tick 1. RCL progression is a side effect of this working, not
the goal itself.

### Layer 2 — Self-Sustaining Growth
The Warren climbs RCL on its own. It builds roads, containers at sources, storage, towers.
It manages energy routing through containers and storage correctly at each RCL tier. It knows
when it is "saturated" and signals the Empire to expand. Traffic manager road preference
becomes meaningful here — road tiles are already cost 1 in the CostMatrix.

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
                         Calls Traffic.reset() before ticks, Traffic.resolve() after.

traffic.js               Movement coordination layer. All creep movement goes through here.
                         Replaces direct moveTo calls across all rat files.

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
rat.warlock.js           Warlock Engineer (sits at controller, upgrades forever).
# Future files:
# rat.ogre.js            Rat Ogre (heavy melee combat)
# rat.runner.js          Gutter Runner (scout + harass)
# rat.jezzail.js         Jezzail (ranged attack)
# rat.greyseer.js        Grey Seer (claim + reserve)

spawn.director.js        Decides what to spawn and when. Called only from warren.act.js.
spawn.bodies.js          Body part recipes per role per energy tier. Pure functions only.

job.board.js             Runtime job coordination. Fully ephemeral. No Memory writes. Ever.
job.types.js             Job type constants, canDo() rules, role preference weights.

plan.extensions.js       Extension placement logic. One site at a time.
plan.containers.js       Container placement logic. Controller container only for now.
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

## Main Loop Order

```
Traffic.reset()          ← wipe all intents and pins from last tick
Empire.tick()
room.tick() × N          ← OODA per owned room (spawning, planning, job publishing)
creep.tick() × N         ← roles register move intents with Traffic
Traffic.resolve()        ← execute all movement, handle conflicts, after all ticks
```

This order is mandatory. Traffic.resolve() must see the complete picture of all creep
intents before executing any movement.

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
BOOTSTRAP  → buildControllerContainer + publishHarvest + publishUpgrade
GROW       → buildExtensions + buildControllerContainer + publishHarvest + publishBuild + publishUpgrade
WAR        → publishDefense
STABLE     → buildExtensions + buildControllerContainer + publishUpgrade
FORTIFY    → (not yet implemented)
```

Note: `buildExtensions` and `buildControllerContainer` run in STABLE as well as GROW.
Both planners are self-guarding and safe to call every tick — they no-op when conditions
are not met. Without this, extensions deadlock: workers drain spawn just enough to prevent
`energyCapped` from firing, so GROW state never triggers.

---

## Creep Roles and Lifecycle

### Role Transition Rules
- **Slave** → promoted to `worker` role automatically when warren RCL reaches 2.
  On promotion: delete job, delete working, delete sourceId from memory.
- **Slave** is the ONLY role used at RCL1. No miners, haulers, warlocks at RCL1.
- **Miner** stays a miner for life. Claims a sourceId on spawn, never changes.
- **Hauler** stays a hauler for life.
- **Worker** stays a worker for life.
- **Warlock Engineer** stays a warlock for life. Spawned when controller container exists.

### Spawn Priority (spawn.director.js)
```
Emergency: 0 creeps in room + energy >= 200 → spawn slave immediately

RCL1: creeps < sources.length → spawn slave

RCL2+:
  miners < sources.length         → spawn miner (highest priority)
  haulers < miners.length         → spawn hauler
  workers < workerTarget          → spawn worker
  warlock absent + container exists → spawn warlock
```

**Worker target formula:**
```
base:   sources.length * 2      (minimum viable spending capacity)
bonus:  +sources.length         (if energy is capped — economy is saturated)
cap:    sources.length * 4      (hard ceiling, prevents runaway spawning)
target: Math.min(base + bonus, cap)
```
The bonus fires when `energyAvailable === energyCapacityAvailable`. This spawns extra workers
when the hauler is delivering faster than workers can spend, draining the surplus. When
extensions are no longer full the bonus drops and the director stops at base count.

**CRITICAL:** All spawn calls use `room.energyAvailable` (not `room.energyCapacityAvailable`)
when building body recipes. During normal operation extensions are full so both values are
equal — no body quality difference. During recovery, extensions are empty and capacity is
misleading: passing capacity requests a body the spawn cannot afford and stalls indefinitely.
Always use available, always get the best body we can actually build right now.

### Body Recipes (spawn.bodies.js)
All body recipes are pure functions: `createBody(role, energyCapacity) → bodyArray`.
Recipes scale to energy capacity. Always return valid bodies. Never throw.

---

## Traffic Manager Contract

`traffic.js` is the movement coordination layer. It replaces all direct `moveTo` calls.
No creep file may call `creep.moveTo()` directly.

**API:**
```javascript
Traffic.reset()                          // called in main.js before all ticks
Traffic.pin(creep)                       // stationary creep locks its tile
Traffic.requestMove(creep, target, opts) // moving creep declares intent
Traffic.resolve()                        // called in main.js after all ticks
```

**How it works:**
- Each tick, roles call `pin()` or `requestMove()` — never `moveTo()`
- `resolve()` runs after all creep ticks. It auto-pins any creep that registered no intent
  (idle creeps are invisible blockers without this)
- Paths are calculated via `PathFinder.search` with a custom CostMatrix:
    - Roads: cost 1 (naturally preferred once built — Layer 2 hook already in place)
    - Pinned creep tiles: cost 5 (pathfinder routes around occupied positions proactively)
    - Other structures: cost 0xff (impassable)
- Mutual swaps are detected and executed cleanly (A wants B's tile, B wants A's tile)
- Contested tiles: first registrant wins (future: weight by role priority)
- Paths are cached in `creep.memory._trafficPath` and invalidated when target changes
  or creep is pushed off-path

**Who pins:**
- Miners: pin when `harvest()` succeeds (seated on source)
- Warlock Engineers: pin when `upgradeController()` succeeds (seated at controller)
- All idle creeps: auto-pinned by `resolve()` if no intent was registered

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

**Upgrade job slots** scale with source count: `Math.max(2, sources.length * 4)`.
This matches the worker hard cap so the upgrade job is never the bottleneck.

**Role preference weights (job.types.js):**
```
miner  + HARVEST  = +500   (miners must never do anything else)
hauler + HAUL     = +500   (haulers must never do anything else)
worker + BUILD    = +300
slave  + HARVEST  = +200
worker + UPGRADE  = +100
slave  + UPGRADE  = +50
```

**canDo rules:**
- Workers are explicitly excluded from HARVEST jobs. Workers have their own gathering
  phase (pickup dropped energy). Letting workers harvest from sources means they sit
  on sources instead of consuming the dropped pile, which breaks the miner → hauler →
  worker energy chain.
- Miners bypass the job board entirely. Their assignment is permanent — sourceId in
  memory. Running miners through the board every tick would be overhead with zero benefit.
- Warlock Engineers bypass the job board entirely. Same reasoning as miners.

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
- **Only one site at a time** — returns immediately if any extension site already exists.
  This prevents workers from over-committing energy to a build backlog.

**Controller container planner guard conditions:**
- Only runs if no container exists within range 3 of the controller
- Only runs if no container construction site exists within range 3 of the controller
- Places the site on the walkable tile adjacent to the controller closest to the spawn
  (minimizes hauler travel distance)

---

## Energy Flow

```
RCL2 (current):
  Miner → drops on ground at source
  Hauler → picks up pile → spawn → extensions → towers → controller container
  Worker → picks up dropped pile → builds / upgrades
  Warlock Engineer → withdraws from controller container → upgrades forever

RCL2 (with source containers, Layer 2):
  Miner → drops into source container
  Hauler → withdraws from source container → spawn → extensions → towers → controller container
  Worker → picks up dropped pile OR withdraws from source container
  Warlock Engineer → withdraws from controller container → upgrades forever

RCL4+ (with storage, Layer 2):
  Hauler → source container → storage → spawn / extensions / towers / controller container
```

**Hauler delivery priority:**
```
1. Spawn
2. Extensions (closest first)
3. Towers
4. Controller container
5. (Storage — Layer 2)
```

---

## Known Sharp Edges / Open Issues

**[RESOLVED] warren.decide.js — STABLE state never triggered extension placement**
Workers withdrew from spawn just enough to prevent `energyCapped` from firing, so
GROW state never triggered. Extensions never got placed. Fix: `buildExtensions` now
runs in STABLE state too. The planner's own guards make it safe to call every tick.

**[RESOLVED] spawn.director.js — emergency and demand spawns used energyCapacityAvailable**
After total population collapse, extensions are empty so spawn only has 300 base energy.
Requesting a body sized to full capacity silently fails every tick — spawn never fires.
Fix: all spawn calls now use `energyAvailable` so they build the best body actually
affordable right now. During normal operation both values are equal so quality is unchanged.

**[RESOLVED] rat.hauler.js — partial delivery caused premature flip to gather phase**
Hauler delivered to a full spawn (which took less than a full load), still had energy
remaining, but flipped back to gathering because `getFreeCapacity() > 0`. Extra energy
was never delivered to extensions. Fix: hauler now uses a `memory.delivering` state
toggle — full triggers delivery, completely empty triggers gathering.

**[RESOLVED] rat.worker.js — stale HARVEST job after slave promotion**
Slaves grab HARVEST jobs from the job board. On RCL2 promotion the role flips to worker
but `memory.job` persists. `findJob()` only fires when job is null, so the worker kept
running the stale HARVEST job indefinitely. Fix: job validation check at top of spending
phase clears any HARVEST job a worker is holding before the spending phase runs.

**[RESOLVED] job.board.js — workers could be assigned HARVEST jobs**
HARVEST priority * 100 score dominated role preference penalty. Workers would grab
HARVEST jobs and sit on sources instead of consuming the dropped pile. Fix: `canDo()`
now explicitly excludes workers from HARVEST jobs.

**[RESOLVED] spawn.director.js — worker ratio too rigid**
`workers < miners * 2` was a fixed ratio that didn't respond to energy pressure.
With full extensions the economy saturated and workers couldn't drain energy fast enough.
Fix: energy-responsive worker target formula with a cap of `sources * 4`.

**[RESOLVED] plan.extensions.js — all extension sites placed simultaneously**
Multiple sites queued at once caused all workers to converge on builds simultaneously,
draining the energy pool and leaving the hauler with nothing to deliver. Fix: one site
at a time — planner returns early if any extension site already exists.

**[RESOLVED] movement — direct moveTo caused oscillation and drug-creep syndrome**
`ignoreCreeps: true` told the pathfinder to route through occupied tiles. The creep
physically couldn't get there. Stuck detection fired random moves. Creeps oscillated.
Fix: traffic.js replaces all direct moveTo calls. Paths respect pinned tiles via
CostMatrix. Idle creeps are auto-pinned so they're never invisible blockers.

**orient.js — "any construction site forces GROW"**
Currently any construction site (road, wall, container, anything) triggers GROW state.
This can cause over-planning. Future fix: only extension sites should trigger GROW, or
gate on energy saturation as a secondary condition.

**hauler.js — delivery targets**
Hauler fills spawn → extensions → towers → controller container in priority order.
Storage not yet handled (Layer 2 feature). When all consumers are full, hauler clears
`delivering` flag and returns to gathering rather than freezing.

**spawn.director.js — warlock spawning not yet implemented**
The Warlock Engineer role is defined and functional but the spawn director does not yet
spawn one. Needs: check for existing warlock by homeRoom, check for controller container
existence, spawn when both conditions are met. Next immediate task.

**spawn.bodies.js — warlock body recipe not yet added**
Warlock needs a body recipe. Heavy on WORK parts (upgrade throughput), minimal MOVE
(it never travels far), enough CARRY to make container withdrawal worthwhile.

**spawn.director.js — getRoomCreeps uses room.name filter**
Works correctly for single-room play. Will need updating for multi-room when creeps
may be travelling between rooms and temporarily not present in their home room.

**plan.utils.js — path cache has no TTL**
`_plannerPaths` in room memory grows indefinitely. Low risk (terrain is static) but
should be cleared when structures change significantly.

**traffic.js — contested tiles use first-registrant wins**
When two creeps want the same tile, the first to register wins. Future improvement:
weight by role priority (hauler > worker > slave) so higher-value creeps don't get
blocked by lower-value ones.

**traffic.js — path cache invalidation on structure changes**
Cached paths in `creep.memory._trafficPath` are invalidated when target changes or the
creep is pushed off-path, but not when new structures are built (roads, extensions, etc.).
Low risk for now — paths naturally re-route around new structures once they're built and
added to the CostMatrix. Road preference (cost 1) will attract paths to new roads once
they appear without requiring explicit invalidation.

---

## Coding Conventions

- **No magic numbers.** Extract constants to the top of the file or to a constants file.
- **No Memory writes in observe/orient/decide.** If you're writing Memory outside of act(), stop.
- **Fail gracefully.** Every function that touches a Game object must null-check it.
  `Game.getObjectById()` returns null. Creeps die. Spawns get destroyed. Code for it.
- **Log with context.** `console.log(`[warren:${room.name}] spawning miner`)` not `console.log('spawning')`.
- **Comments explain WHY, not WHAT.** The code says what. Comments say why.
- **Skaven names in logs and comments.** `rat`, `warren`, `slave`, `miner` — not `creep`, `room`, `worker1`.
- **Always use energyAvailable for spawn body sizing.** Never energyCapacityAvailable.
- **No direct moveTo calls.** All movement goes through `Traffic.requestMove()` or `Traffic.pin()`.

---

## Current Status

**Layer:** 1 — Economic Engine
**RCL:** 2
**Room:** Single warren, two sources, one spawn (HQ)

**Current population (target):**
- 2 Miners — locked on sources, mining continuously
- 2 Haulers — picking up dropped pile, delivering to spawn / extensions / controller container
- 4 Workers — building extension sites one at a time, upgrading controller
- 1 Warlock Engineer — sits at controller, upgrades forever (pending spawn logic)

**Infrastructure:**
- 5+ Extensions built — energy capacity growing
- Controller container site placed automatically, workers building it
- No roads yet (Layer 2)
- No source containers yet (Layer 2)

**Last session work:**
- Energy-responsive worker ratio — bonus workers when energy caps, hard cap at sources * 4
- Upgrade job slots scaled to match worker cap — never a bottleneck
- Extension planner now places one site at a time — controlled build cadence
- Added plan.containers.js — places controller container adjacent to controller
- Added rat.warlock.js — Warlock Engineer role, dedicated controller upgrader
- Wired buildControllerContainer flag through warren.decide.js and warren.act.js
- Updated rat.hauler.js — fills controller container as delivery priority 4
- Added traffic.js — full movement coordination layer replacing all direct moveTo calls
- Updated main.js — Traffic.reset() before ticks, Traffic.resolve() after
- Updated all rat files — all movement through Traffic.requestMove() / Traffic.pin()
- Auto-pin for idle creeps in traffic.resolve() — idle creeps no longer invisible blockers
- Pinned tiles in PathFinder CostMatrix — proactive routing around occupied positions

**Next:**
- Add warlock body recipe to spawn.bodies.js
- Add warlock spawn logic to spawn.director.js
- Observe warren climbing toward RCL3 unassisted with Warlock Engineer active
- Begin planning Layer 2: source containers, roads, storage energy routing