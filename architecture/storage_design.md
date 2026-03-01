# Storage Design — RCL4

## Overview

Storage unlocks at RCL4 and fundamentally changes how energy flows through
the warren. Pre-storage, energy moves directly: source → spawn/extensions/containers.
Post-storage, everything flows through a central buffer: source → storage → consumers.

This document captures the planned design for storage integration.

**Current status: Not yet implemented. Storage construction site not yet placed.**

---

## Why Storage Changes Everything

Without storage, thralls operate with no slack — any spawn cycle that draws
300-1000 energy hits the room immediately, causing drought events. The anomaly
log confirms this: 5 crashes in a 300-tick window, all coinciding with expensive
spawn events (clanrat at 1000e, thrall at 1000e).

Storage provides:
- **Buffering**: absorbs spawn peaks without draining spawn-critical energy
- **Overflow sink**: when energy production exceeds demand, storage fills instead of capping
- **Reliable throughput**: warlock gets continuous feed even during spawn cycles
- **Foundation for RCL5+**: links, labs, and terminal all expect storage to exist

---

## Proposed Energy Routing (Post-Storage)

```
Source → [Source Container] → [Source Thrall] → STORAGE
                                                    │
                                         ┌──────────┼──────────────┐
                                         ▼          ▼              ▼
                                      Spawn    Extensions    Controller
                                                             Container
                                                                  │
                                                               Warlock
```

### Source Thralls (new behavior)
- **One dedicated job**: withdraw from source container → deposit to storage
- Do NOT deliver to spawn, extensions, or controller container directly
- Simple loop: source container → storage → source container

### Demand Thralls (new behavior)
- **One dedicated job**: withdraw from storage → deliver to consumers
- Delivery priority (same as current thralls):
  spawn → emergency tower → extensions → tower → controller container

### Implementation options

**Option A: Role split** (two separate thrall roles)
- Source thralls: `role = 'thrall_source'`
- Demand thralls: `role = 'thrall_demand'`
- Pro: clean separation, easy to tune targets independently
- Con: adds spawn complexity, new role routing in `rat.js`

**Option B: Single role with memory flag** (preferred for now)
- `thrall.memory.thrallType = 'source' | 'demand'`
- Assigned on spawn by director
- Pro: minimal code changes, existing body recipe still works
- Con: slightly more complex logic in `rat.thrall.js`

**Recommendation:** Option B. Avoids adding new role names and fits naturally
into the existing `rat.thrall.js` two-phase structure.

---

## Thrall Target Recalculation

Current target formula needs updating for storage:

**Source thralls:**
- Target: enough CARRY to drain all source containers within 1 round trip
- Round trip ≈ 2× distance from source container to storage
- At full miner output (10e/tick per source, 2 sources = 20e/tick), and
  assuming ~15-tick round trip, need ~300 carry capacity = 6 CARRY pairs per source
- Target: `sources × carryPerTrip`

**Demand thralls:**
- Target: enough CARRY to keep spawn + extensions fed during spawn cycles
- Spawn cycle costs up to 1000e — need to deliver it between spawns
- At RCL4 with 20 extensions: capacity = 1300e
- Demand thrall needs to cycle 1300e before the next spawn starts
- Target: `floor(energyCapacity / avgTripCapacity) × 1` (one big thrall)

This is more complex than current head-count targeting and warrants careful
tuning once storage is online.

---

## Planner Changes

### `plan.storage.js` (new file)
- One-time placement near spawn (similar to tower placement)
- Should be placed after extensions are at RCL cap
- Energy guard: 0.7 (don't build storage if economy is struggling)
- Placement: close to spawn, accessible from multiple directions

### `warren.act.js` changes
- Add `plan.buildStorage = true` in STABLE and GROW states at RCL4+
- Add storage job publishing if storage exists but isn't full

### `warren.decide.js` changes
- Check `storageExists` in snapshot for routing decisions
- Set `plan.storageRouting = true` when storage is operational

---

## Spawn Director Changes

When storage exists and has >2000 energy:
- Source thralls can spawn at lower energy threshold (pipeline is buffered)
- Demand thralls can spawn more aggressively (storage can absorb cost)
- Clanrat target can increase (upgrade and build can draw from storage)

---

## Migration Path

1. **Place storage construction site** — manual for now (or trigger via Claim flag extension)
2. **Build storage** — clanrats handle this automatically (BUILD job, priority 800)
3. **Split thrall behavior** — once `storage.store[RESOURCE_ENERGY] > 0`:
    - Existing thralls shift to source-thrall mode (withdraw from source container → deposit storage)
    - New demand-thralls spawn to handle consumer delivery
4. **Tune thrall targets** — watch blackbox for drought events, adjust carry targets

The migration should be smooth if done incrementally:
- Pre-storage thralls already work fine
- Adding storage just changes WHERE they deposit energy
- Demand thralls pick up the consumer delivery that source thralls drop

---

## Risks

**Thrall starvation loop**: If all thralls become source-thralls before demand-thralls
spawn, the spawn/extensions stop getting fed and we can't spawn demand-thralls.
Mitigation: spawn at least 1 demand-thrall before flipping source-thralls.

**Storage draining the controller container**: If demand-thralls prefer storage
over source containers, they may never fill the controller container.
Mitigation: controller container fill logic in `rat.thrall.js` already handles
conditional filling (based on warlock activity) — extend this to prefer storage
when available.

**Spawn timing**: Storage construction costs 30,000 energy (over time via BUILD jobs).
This is a significant resource sink during the construction phase. Monitor for
energy drought during the build period.

---

## Monitoring

After storage is placed and online, watch these blackbox metrics:
- `energy.droughtPct` — should drop significantly with buffering
- `containers.source.avgPct` — should rise (not being drained as fast)
- `containers.controller.avgPct` — should stabilize (demand-thrall feeds it)
- `spawn.utilizationPct` — should rise (energy available more consistently)
- `controller.ratePerTick` — should increase (warlock fed more reliably)