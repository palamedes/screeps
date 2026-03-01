# Traffic Manager — `traffic.js`

## Purpose

The traffic manager is a **centralized movement coordination layer** that sits
between creep behavior logic and the Screeps engine. No rat file calls
`creep.moveTo()` directly. Instead, creeps register *intentions* (where they
want to go), and the traffic manager resolves all movement at the end of the
tick — handling conflicts, pushing idle creeps out of the way, and recovering
stuck creeps.

This design separates "what does this creep want?" from "how do all creeps
actually move without blocking each other?" Those are different problems and
they should be solved in different places.

The one exception is **Stormvermin** — combat creeps bypass traffic entirely
and call `moveTo()` directly. Speed and freedom of movement matter more than
coordination during combat.

---

## API

```javascript
Traffic.pin(creep)
// Hard-pin this creep to its current tile.
// Used by: miners (permanently on seat), warlocks (permanently on container tile).
// Hard-pinned tiles cost 20 in the CostMatrix — moving creeps route around them.
// A hard-pinned creep can ONLY be displaced by a miner claiming that tile.

Traffic.requestMove(creep, target, { range })
// Register this creep's intent to move toward target.
// target can be a game object (uses .pos) or a raw {x, y}.
// range defaults to 1. Use range: 0 for standing directly on a tile (miners, warlock).
// CRITICAL: range uses !== undefined check, not ||, because 0 is falsy.

Traffic.resolve()
// Called once per tick after ALL creeps have ticked.
// Executes all registered moves, resolves conflicts, pushes idle creeps.
// Called from main.js after the creep loop.

Traffic.reset()
// Clears all intents and pins from the previous tick.
// Called from main.js at the start of each tick, before any game logic.
```

---

## Tick Flow

```
main.js:
  Traffic.reset()          ← wipe previous tick's state

  Empire.tick()
  room.tick() × N          ← rooms observe/orient/decide/act
                              creeps register pins and move intents

  creep.tick() × N         ← each creep calls Traffic.requestMove() or Traffic.pin()

  Traffic.resolve()        ← execute everything
```

Everything between `reset()` and `resolve()` is registration only — no movement
happens until `resolve()` fires.

---

## Resolve: Step by Step

### Step 0 — Auto soft-pin idle creeps
Any creep that registered no move intent (didn't call `requestMove`) is
automatically soft-pinned to its current tile. Soft pins have two effects:
- Their tile costs 8 in the CostMatrix (discourages routing through but not impassable)
- They can be pushed to an adjacent free tile if a motivated creep needs their tile

This is how the warren avoids gridlock: idle creeps get out of the way rather
than forming permanent obstacles.

### Step 1 & 2 — Calculate next step for each intent
For each registered intent, the manager calculates which direction to move
(one tile toward the target). This uses the cached path or recalculates if
the cache is invalid. See "Path Caching" below.

Creeps already in range of their target are skipped — no movement needed.

### Step 3 — Resolve mutual swaps
If creep A wants to move to B's tile AND creep B wants to move to A's tile,
both moves execute freely. This handles the common case of two creeps passing
each other on a road without deadlock.

Swapped pairs are marked and excluded from conflict resolution.

### Step 4–7 — Group by destination, resolve conflicts
Remaining moves are grouped by their destination tile. For each contested tile:

**Miner hard-pin override:**
If the tile has a hard pin (not soft) and the mover is a miner:
- The miner can displace the pinned creep — IF the pinned creep is NOT also a miner
- The displaced creep is pushed to any adjacent free tile
- The miner then moves to the tile it just vacated

If the mover is not a miner, hard-pinned tiles block movement entirely.

**Soft-pin push:**
If the tile has a soft pin (idle creep parked there):
- Find a free adjacent tile and push the idle creep there
- The winning mover takes the tile
- Other contenders for the same tile get a yield direction (step sideways)

**Uncontested moves:**
Move executes. If multiple creeps wanted this tile, the highest-priority role wins
(see Role Priority below). Losers get a yield direction to step sideways rather
than standing still and registering as stuck next tick.

---

## Role Priority

When multiple creeps want the same tile, higher priority wins:

```javascript
const ROLE_PRIORITY = {
  miner:   100,
  warlock:  80,
  clanrat:  50,
  thrall:   30,
  slave:    10
};
```

Roles not in this table get 0. Miners win almost all tile conflicts.

---

## Path Caching

Paths are stored in `creep.memory._trafficPath` as an array of `{x, y}` steps.

### Cache hit conditions
A cached path is used when:
- The target hasn't changed (same `x,y,range` key)
- The path isn't too old (< 50 ticks — `PATH_TTL`)
- The next step hasn't become structure-blocked or hard-pinned
- The creep hasn't been pushed more than 1 tile away from the expected next step

### Cache invalidation triggers
- **Target changes**: `_trafficTarget` key changes → wipe and recalculate
- **Path TTL expired**: older than 50 ticks → wipe. Structures and construction
  sites change as the room grows; stale paths route through new extensions.
- **Off-path displacement**: if the next cached step is more than 1 tile from
  the creep's current position, the creep was pushed off-path → wipe
- **Next step blocked**: if the next step has a structure/site that blocks
  movement, or is hard-pinned by another creep → wipe

### Path recalculation
Uses `PathFinder.search` with a CostMatrix built fresh each recalculation.

The CostMatrix accounts for:
- Road tiles: cost 1
- Plain tiles: cost 2
- Swamp tiles: **per-creep calculation** (see Swamp Cost below)
- Blocking structures and construction sites: cost 0xff (impassable)
- Hard-pinned tiles: cost 20
- Soft-pinned (idle) tiles: cost 8 (was 20, reduced to prevent huge detours)
- Creeps with active move intents: cost 5

Result is stored in `_trafficPath` and stamped with `_trafficPathAge = Game.time`.

---

## Swamp Cost Calculation

Swamp fatigue is creep-specific: `fatigue per tile = nonMove_parts × 5`.
Recovery rate = `move_parts × 2` per tick.
Ticks to clear = `ceil((nonMove × 5) / (move × 2))` per swamp tile.

The CostMatrix swamp cost is set to match this in-game cost:

```javascript
const swampCost = activeMoves > 0 && activeNonMoves > 0
  ? Math.max(2, Math.ceil((activeNonMoves * 10) / (activeMoves * 2)))
  : 5;
```

Examples:
- **Balanced thrall** (7 CARRY + 7 MOVE): `ceil(70/14)` = 5 — full speed even on swamp
- **Heavy warlock** (6 WORK + 2 CARRY + 1 MOVE): `ceil(80/2)` = 40 — 40 ticks per swamp tile
- **Miner** (5 WORK + 1 CARRY + 1 MOVE): `ceil(60/2)` = 30

This prevents warlocks from routing through swamp and spending dozens of ticks
immobile. The high swamp cost makes swamp tiles nearly impassable in the planner,
so the path goes around even if it's longer in tile count.

Note: uses `activeMoves` (parts with `hits > 0`) not total parts, so damaged
creeps get accurate fatigue calculations after combat.

---

## Stuck Detection (Tiered Recovery)

Each tick, the manager compares the creep's current position against
`_trafficLastPos`. If the position hasn't changed AND `creep.fatigue === 0`
(so swamp recovery doesn't count as stuck), the stuck counter increments.

Three tiers of escalating intervention:

### Tier 1 — moveTo fallback (5 ticks stuck)
Activates `ignoreCreeps: true` mode for `FALLBACK_DURATION = 4` ticks.
During fallback, the manager calls `creep.moveTo()` directly with the red
path visualization. This bulldozes through any creeps in the way.
Path cache is cleared so normal routing resumes cleanly after fallback ends.

### Tier 2 — Random nudge (25 ticks stuck)
Something is structurally blocking normal pathing. A random walkable direction
is chosen (terrain-checked, structure-checked, not hard-pinned). The creep
moves there and the path cache is cleared so it recalculates from the new position.

The direction shuffle is genuinely random each tick so the creep doesn't
just bounce between two tiles.

### Tier 3 — Suicide (50 ticks stuck)
The creep is truly stuck — no recovery is possible. It suicides and the spawn
director will queue a replacement. This is a last resort; the thresholds are
generous enough that legitimate cases (navigating around large construction zones)
don't hit this.

**Key invariant:** The stuck counter only increments when `creep.fatigue === 0`.
A warlock crossing one swamp tile may be immobile for 40 ticks — that's correct
behavior, not being stuck.

---

## Push Logic

Three functions handle physically moving creeps out of the way:

### `_getPushDir(blocker, destinations)`
Called when a miner needs to displace a hard-pinned non-miner, or when a
soft-pinned idle creep needs to be moved. Tries cardinal directions first
(TOP, RIGHT, BOTTOM, LEFT), then diagonals. Returns the first direction where:
- Terrain is walkable
- Not hard-pinned by another creep
- Not already being moved into by another creep this tick
- Not blocked by an impassable structure or site

### `_getYieldDir(loser, destinations)`
Called when a creep loses a tile conflict. Same logic as push but uses a
different direction priority (diagonals first — they're less disruptive to
the primary traffic flow on cardinal roads).

### `_getNudgeDir(creep)`
Called during Tier 2 stuck recovery. Same logic but directions are shuffled
randomly to escape local minima. Returns the first walkable, unblocked,
non-hard-pinned direction.

---

## Design Decisions & Rationale

### Why not just use moveTo() everywhere?
`moveTo()` recalculates paths independently for each creep every tick,
often routing them into each other. Two thralls going opposite directions
on a road will oscillate back and forth indefinitely. The traffic manager
sees all intents at once and can resolve conflicts before they happen.

### Why soft-pin cost 8 instead of 20?
The original cost of 20 caused creeps to take 5+ tile detours around a cluster
of parked clanrats waiting near the controller. At cost 8, idle creeps are
"prefer to route around" but not "actively avoid at all costs." A motivated
creep will step through one idle creep on a road rather than going around the
entire extension cluster.

### Why PATH_TTL = 50 ticks?
Terrain is static but structures and construction sites appear constantly as
the room grows. A path cached before an extension was built would route through
that extension indefinitely without TTL expiry. 50 ticks is short enough to
catch new structures quickly, long enough to avoid constant recalculation CPU cost.

### Why does the range: 0 check use !== undefined?
```javascript
range: opts.range !== undefined ? opts.range : 1
```
The old code used `opts.range || 1`. The `||` operator treats 0 as falsy,
so `range: 0` would silently become `range: 1`. Miners and warlocks use
`range: 0` to stand directly on their target tile. With the old code, they'd
stop one tile away and never actually seat themselves on the container.
This was a critical bug that prevented the miner/container system from working.

### Why hard-pin cost 20 instead of 0xff?
Miners and warlocks are hard-pinned, but other creeps sometimes need to path
*adjacent* to them (thralls delivering to the container, for example). Cost 0xff
would make those tiles completely impassable, blocking final approach. Cost 20
discourages routing through hard-pinned tiles but still allows final-approach
pathing to adjacent targets.

---

## Constants Reference

```javascript
const STUCK_FALLBACK = 5;    // ticks stuck before moveTo fallback
const STUCK_NUDGE    = 25;   // ticks stuck before random nudge
const STUCK_SUICIDE  = 50;   // ticks stuck before suicide

const FALLBACK_DURATION = 4; // ticks of moveTo fallback mode

const PATH_TTL = 50;         // ticks before cached path expires

const ROLE_PRIORITY = {
  miner:   100,
  warlock:  80,
  clanrat:  50,
  thrall:   30,
  slave:    10
};
```

---

## Memory Keys Used Per Creep

| Key | Purpose |
|-----|---------|
| `_trafficPath` | Cached path as `[{x,y}, ...]` array |
| `_trafficPathAge` | Tick the path was calculated (for TTL) |
| `_trafficTarget` | `"x,y,range"` string of current target (detects target change) |
| `_trafficLastPos` | `{x,y}` from last tick (for stuck detection) |
| `_trafficStuck` | Counter of stuck ticks (fatigue-adjusted) |
| `_trafficFallback` | Countdown for fallback moveTo mode |

These are internal to the traffic manager. Rat behavior files should not read
or write these directly.

---

## Common Issues

**Creep oscillates between two tiles:**
Usually means two creeps are soft-pinning each other's targets. Should resolve
naturally via push logic. If it persists, check that `Traffic.reset()` is being
called at the start of each tick.

**Creep takes a wildly long path:**
Check the CostMatrix — likely there's a cluster of hard-pinned tiles or a
construction site creating a bottleneck. The soft-pin cost reduction (8 vs 20)
was specifically to address this.

**Miner never reaches its seat:**
Confirm `range: 0` is being passed to `requestMove`. If range defaults to 1,
the miner stops adjacent to the seat and the hard pin is registered on the
wrong tile.

**Stuck counter rising on a warlock:**
Likely crossing swamp. Check `creep.fatigue` — if it's > 0, the stuck counter
won't increment and this is correct behavior. If fatigue is 0 but the warlock
isn't moving, there may be a hard pin blocking its path to the container tile.