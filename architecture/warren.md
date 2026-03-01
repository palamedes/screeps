# Room Architecture (OODA)

This codebase treats each owned Room as an OODA loop:
Observe → Orient → Decide → Act.

The Room is responsible for:
- Understanding current conditions (snapshot)
- Selecting an operating state (state machine)
- Translating state into a concrete plan (plan flags)
- Executing the plan by delegating to planners, job board, and directors

The Room is NOT responsible for:
- Individual creep behavior logic
- Complex structure placement algorithms (that belongs in planners)
- Job execution (that belongs to creeps + job system)


## OODA Loop: Responsibilities

### Observe (`warren.observe.js`)
Produces a snapshot (`this._snapshot`) of room facts for the rest of the tick.

Snapshot fields:
- `rcl` — controller level (0 if no controller)
- `energyAvailable` / `energyCapacity`
- `sources`
- `structures` (owned)
- `constructionSites` (owned)
- `hostiles`
- `towers`
- `spawns`
- `safeMode` — `{ active, available, cooldown }`

Observe must be:
- Side-effect free (no building, no spawning, no job publishing)
- Run once per tick (snapshot should be stable within the tick)


### Orient (`warren.orient.js`)

Reads `this._snapshot` and selects the current Room state by calling `this.setState(...)`.

Orient determines **operational posture**, not structure policy.

State selection rules (evaluated in order):

1. **WAR** — combat hostiles present (ATTACK or RANGED_ATTACK parts). Logs attack event.
2. **FORTIFY** — recent attack (within 1000 ticks) AND (no tower OR ramparts below 10k HP)
3. **BOOTSTRAP** — RCL1
4. **GROW** — energy fully capped, OR construction sites exist
5. **STABLE** — default

Notes:
- orient() only sets state, never performs actions.
- It does not encode structure thresholds.
- Structure build policies belong to Planner modules.
- Attack events are logged to `Memory.attackLog` (last 20 waves, deduped within 50 ticks).


### Decide (`warren.decide.js`)
Translates `this.memory.state` into a plan (`this._plan`) consisting of boolean flags.

Plan flags:
```javascript
{
  buildExtensions,
  buildControllerContainer,
  buildSourceContainers,
  buildRoads,
  buildRamparts,
  buildTower,
  activateSafeMode,
  publishHarvest,
  publishBuild,
  publishUpgrade,
  publishRepair,
  publishDefense
}
```

**Economic Recovery Guard (pre-state):**
If `miners < sources`, `publishHarvest` is set to signal the spawn director —
but execution does NOT return early. Clanrats still get upgrade jobs while
waiting for miners to respawn.

**Safe Mode Trigger (pre-state):**
If hostiles present + safe mode available + not active:
- No tower → activate (any combat hostile is existential)
- Tower exists but `hostileHP > towerStrength × 10` → activate

**State → plan mapping:**

| State     | Build flags                          | Job flags                          |
|-----------|--------------------------------------|------------------------------------|
| BOOTSTRAP | controllerContainer, ramparts        | harvest, upgrade                   |
| GROW      | extensions, controllerContainer, sourceContainers, roads, ramparts, tower (RCL≥3) | harvest, build, upgrade, repair |
| STABLE    | extensions, controllerContainer, sourceContainers, roads, ramparts, tower (RCL≥3) | upgrade, repair |
| FORTIFY   | ramparts, tower (RCL≥3), controllerContainer, sourceContainers | harvest, build, repair, upgrade |
| WAR       | —                                    | defense, harvest                   |

Safe mode active (any state): override to build ramparts + tower + build + repair.

Decide must be:
- Deterministic based on state
- Side-effect free (no building, no spawning, no job publishing)


### Act (`warren.act.js`)
Executes `this._plan` and delegates actual work.

**Tower logic runs independently of plan flags** — towers fire every tick
regardless of room state. Focus fire on lowest-HP hostile. Idle repair targets
ramparts through HP floors (20k → 75k → 250k), then structures below 50% hits.

Order (as implemented):
1. Safe mode activation (if `plan.activateSafeMode`)
2. Tower: attack or repair
3. Planners in priority order (each self-guards, places at most 1 site):
    - Extensions → Controller container → Source containers → Roads → Ramparts → Tower
4. Job publishing (harvest / build / upgrade / repair / defense)
5. `SpawnDirector.run(room)`

Act is where all side effects occur.


## State Machine

State enum values (`warren.memory.js`):
```javascript
const ROOM_STATE = {
  BOOTSTRAP: 0,
  STABLE:    1,
  GROW:      2,
  FORTIFY:   3,
  WAR:       4
};
```

Contract:
- `orient()` owns state transitions
- `decide()` reacts to state
- `act()` reacts to plan


## FORTIFY State

FORTIFY is a post-attack defensive posture. It activates when:
- An attack occurred within the last `FORTIFY_DURATION = 1000` ticks, AND
- Either: no tower present, OR ramparts haven't reached `RAMPART_EXIT_HP = 10000`

FORTIFY behavior:
- Continues building source containers and controller container (economy stability)
- Prioritizes rampart construction
- Builds tower if RCL ≥ 3
- Publishes repair jobs to get structures back up
- Does NOT publish build jobs for non-defensive structures (roads, extensions)
- Upgrade jobs still published (warlock keeps going)

Exit conditions (checked every tick in orient):
- No attack in last 1000 ticks, OR
- Tower present AND all ramparts ≥ 10k HP


## Safe Mode

Safe mode activation is evaluated in `decide()` every tick while hostiles are present.
Once activated (via `act()`), all planners shift to defensive building.

Safe mode is a last resort — it prevents creep death entirely for its duration
but has a long cooldown. Only triggers when:
- No tower → any combat hostile could kill spawn
- Tower present but outnumbered 10:1 by hitpoint ratio

During safe mode, `decide()` overrides any state's plan with:
- Build ramparts, build tower, publish build + repair


## Extension Policy

Extensions are a growth gating metric:
- Planners check `CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl]` for max allowed
- Energy guard: 0.7 ratio required before placing extension sites
- One site at a time — waits for current site to complete (prevents worker energy drain)
- Passability guard: tiles with <2 open cardinal neighbors are hard-rejected


## Known Behavior / Sharp Edges

### "Any construction site forces GROW"
`orient()` returns GROW if any construction site exists, regardless of type.

Impact: If roads or containers are under construction, the room stays in GROW.
This is intentional — we want full build resources until all queued infrastructure
completes. Individual planners are self-capping so over-planning isn't an issue.

### Warlock container fill race
The controller container fills to nearly 0% average because the warlock drains
it immediately. This is correct behavior — the warlock should never be idle.
The "0%" reading is a measurement artifact; the warlock's upgrade rate reflects
the true throughput.

### FORTIFY duration is wall-clock ticks, not real time
1000 ticks ≈ ~17 minutes at 1 tick/sec. At the default Screeps server rate
(~1 tick/sec), FORTIFY lasts about 17 minutes after an attack clears.


## Invariants (Must Always Hold)

1. Observe is side-effect free.
2. Orient only sets state (no actions).
3. Decide only builds `_plan` (no actions).
4. Act is the only layer that performs actions.
5. Planners must be self-capping (state machine is not a safety net).
6. No rat file calls `moveTo()` directly (Stormvermin exception: combat).
7. Miners and warlocks always call `Traffic.pin()` when on their target tile.


## Tick Flow Summary

Per tick, per room:

```
1) observe()  → builds this._snapshot
2) orient()   → sets this.memory.state
3) decide()   → builds this._plan
4) act()      → executes side effects based on plan
               → JobBoard.reset()
               → tower logic (always)
               → planners (conditionally)
               → job publishing (conditionally)
               → SpawnDirector.run()
```

Global tick (before room loop):
```
BlackBox.tick()   → instrumentation
Traffic.reset()   → clear all movement intents
Empire.tick()     → watch Claim flags
```

Global tick (after creep loop):
```
Traffic.resolve() → execute all registered movements
```


## Future Extensions

- **Storage-aware routing** (RCL4): split thralls into source-thralls and demand-thralls
- **Second spawn** (RCL5): `plan.spawn.js` supports it; needs Claim flag + manual claim
- **Remote room OODA**: same BOOTSTRAP→STABLE pipeline for newly claimed rooms
- **Economy-aware GROW exit**: currently any construction site holds GROW; could
  refine to "non-defensive sites" or "sites that aren't roads"