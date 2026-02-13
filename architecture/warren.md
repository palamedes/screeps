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

### Observe (Room.prototype.observe)
Produces a snapshot (`this._snapshot`) of room facts for the rest of the tick.

Snapshot fields:
- rcl: controller level (0 if no controller)
- energyAvailable / energyCapacity
- sources
- structures (owned)
- constructionSites (owned)
- hostiles

Observe must be:
- Side-effect free (no building, no spawning, no job publishing)
- Run once per tick (snapshot should be stable within the tick)

Source: room.observe.js


### Orient (Room.prototype.orient)

Reads `this._snapshot` and selects the current Room state by calling `this.setState(...)`.

Orient determines **operational posture**, not structure policy.

Current state rules (as implemented):

1. If hostiles exist → WAR
2. If RCL == 1 → BOOTSTRAP
3. If the room is energy capped → GROW
4. If construction sites exist → GROW
5. Else → STABLE

Important:
- orient() only sets state.
- It does not encode structure thresholds.
- It does not reference extension counts or structure caps.
- It does not perform actions.
- Structure build policies belong to Planner modules.

Source: room.orient.js, room.memory.js


### Decide (Room.prototype.decide)
Translates `this.memory.state` into a plan (`this._plan`) consisting of boolean flags.

Plan flags:
- buildExtensions
- publishHarvest
- publishBuild
- publishUpgrade
- publishDefense

Current mapping (as implemented):
- BOOTSTRAP: publishHarvest + publishUpgrade
- GROW: buildExtensions + publishBuild + publishUpgrade
- WAR: publishDefense
- default: publishUpgrade

Decide must be:
- Deterministic based on state
- Side-effect free (no building, no spawning, no job publishing)

Source: room.decide.js


### Act (Room.prototype.act)
Executes `this._plan` and delegates actual work:

Order (as implemented):
1. Reset JobBoard for the room
2. If buildExtensions → run extension planner (Room.prototype.planExtensions)
3. Publish jobs (harvest/build/upgrade/defense) as indicated
4. Run SpawnDirector

Act is where side effects occur.

Source: room.act.js


## State Machine

State enum values (room.memory.js):
- BOOTSTRAP
- STABLE
- GROW
- FORTIFY (declared, not currently used in decide())
- WAR

Contract:
- orient() owns state transitions
- decide() reacts to state
- act() reacts to plan


## Extension Policy

Extensions are treated as a growth gating metric:
- At RCL2, only 2 extensions are required before the room can leave "GROW"
- At RCL3+, the room tries to reach the RCL max

Notes:
- The policy counts both built extensions and extension construction sites.
- Planners must still be defensive: never place beyond `CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][rcl]`.


## Known Behavior / Sharp Edges

### "Any construction site forces GROW"
orient() currently returns GROW if *any* construction site exists, regardless of type.

Impact:
- If there are roads/walls/containers/etc in progress, the room will remain in GROW.
- This can re-enable planners and cause “over-planning” unless individual planners are capped.

This may be desired (grow until all building completes) OR it may be too aggressive.
If too aggressive, refine this rule to only consider "non-extension" sites or to consider energy saturation.

Source: room.orient.js


## Invariants (Must Always Hold)

1. Observe is side-effect free.
2. Orient only sets state (no actions).
3. Decide only builds `_plan` (no actions).
4. Act is the only layer that performs actions.
5. Planners must be self-capping (state machine is not a safety net).


## Tick Flow Summary

Per tick, per room:

1) observe()
2) orient()  -> sets memory.state
3) decide()  -> sets this._plan
4) act()     -> executes side effects based on plan


## Future Extensions

- Introduce FORTIFY behavior in decide() and act()
- Replace "constructionSites.length > 0 => GROW" with:
    - type-aware checks (exclude extension sites, or exclude roads)
    - economy-aware checks (only grow when energy is saturated / wasted)
- Expand snapshot to include:
    - dropped energy totals
    - storage/container presence
    - planned layout reservations
