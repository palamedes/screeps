# Skaven Screeps — Resolved Issues Archive
*Historical record of bugs found and fixed. Not needed in new chat context — include ARCHITECTURE.md instead.*

---

## Session 2

**[RESOLVED] rat.miner.js — harvest return code used for movement decision**
`else { Traffic.pin(this) }` caught every non-ERR_NOT_IN_RANGE result including source
cooldown and ERR_TIRED. Miner would self-pin on any transient error and freeze indefinitely.
Fix: explicit `pos.inRangeTo(source, 1)` check — adjacent means harvest+pin, not adjacent
means move. No dependency on harvest's return code.

**[RESOLVED] traffic.js — construction sites missing from CostMatrix**
PathFinder routed through extension construction sites because `FIND_STRUCTURES` misses
sites that aren't built yet. `creep.move()` silently failed every tick on the blocked tile,
freezing the creep. Fix: `FIND_MY_CONSTRUCTION_SITES` now added to CostMatrix at cost 0xff
for all blocking structure types. Roads, containers, ramparts remain walkable.

**[RESOLVED] traffic.js — stale cached path through newly-built structure**
A structure built after path calculation caused `creep.move()` to silently fail every tick.
Fix: path invalidation now checks next cached step against both `LOOK_STRUCTURES` and
`LOOK_CONSTRUCTION_SITES` — if blocked, cache is cleared and PathFinder recalculates.

**[RESOLVED] traffic.js — stale cached path through newly-pinned tile (convoy freeze)**
Two creeps following the same path to the same target: leading creep arrives and pins.
Trailing creep's cached path next step is now the pinned tile. `resolve()` blocks the
move every tick and the trailing creep freezes. Fix: path invalidation now also checks
`_pins[nextKey] !== creep.name` — if the next step is pinned by a different creep, cache
is cleared and PathFinder recalculates with the current pin state baked into the CostMatrix.

**[RESOLVED] traffic.js — pinned tile cost too low to break up clusters**
Cost 5 was insufficient when 5+ creeps clustered near spawn — every escape route had cost 5
and the pathfinder picked the shortest among equally-bad options, converging on the same tile.
Fix: pinned tile cost raised to 20. Pathfinder will take up to a 10-tile detour to avoid
a single pinned creep, providing strong incentive to spread out.

**[RESOLVED] job.board.js — controller container build priority equal to extensions**
All BUILD jobs had priority 800. Workers had no preference for the controller container
over extension sites. Fix: controller container site gets priority 900 — workers finish
it first since it unlocks the warlock's continuous upgrade throughput.

**[RESOLVED] job.board.js — upgrade slots too wide when warlock active**
With slots = sources * 4, workers grabbed upgrade jobs even when build sites existed,
competing with the warlock instead of building. Fix: when warlock active AND build sites
exist, upgrade slots = 1 (fallback only). When no build sites remain, slots open fully
so all workers pile onto the controller rather than idling.

**[RESOLVED] rat.worker.js — container check used job type which is null during gathering**
Controller container check was gated on `memory.job.type === 'UPGRADE'` but `memory.job`
is cleared to null when the worker runs out of energy (start of gathering phase). Check
never fired. Fix: proximity check — if worker is within range 5 of controller, try the
container first. Workers near the controller use it regardless of what job they had.

**[RESOLVED] rat.hauler.js — controller container filled before extensions**
Hauler delivery had container above extensions. Extensions stayed empty. Every replacement
creep spawned at minimum body (200-300 energy) — including the warlock, which ended up
with 1 WORK part and contributed almost nothing. The entire horde was underpowered.
Fix: extensions above container in delivery priority. Extensions determine spawn body
quality — fill them first so the next spawn always gets the best body possible.

---

## Session 1

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