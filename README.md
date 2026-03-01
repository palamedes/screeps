# Screeps - Skaven

Skitter-skitter, hear-hear! The Skaven have entered the Screeps universe, and we will rule-rule with a mighty claw-paw! The Screeps shall learn-know the power of the Skaven, for we are the mighty-strongest and most smart-cunning race in all the realms.

With the guidance of the Great Grey Seer Thanquol and the blessing of the Great Horned Rat, we have secured our future with powerful brain-codes that make us unbeatable-unbeatable! We will take-seize everything we set our eyes on, and our enemies shall cringe-cringe in terror at the might of the Skaven Empire.

No one will stand-stand against us, for we are the Skaven! Our armies will swarm-swarm over the Screeps like a horde of rats, leaving nothing behind but the destruction of our foes. Tremble-tremble, for the Skaven Empire has come to claim-take its rightful place as the leader-rulers of this universe!

### In all seriousness

This is a place for me to learn how to play Screeps, themed around my favorite Warhammer Fantasy race: The Skaven. Know-fear us!

The repo is fully open. If you spot something dumb or have improvements, please let me know — I'm here to learn.

---

## Current State

**RCL4** — Layer 2 infrastructure is online.

- ✅ Specialist economy: miners, thralls, clanrats, warlock engineer
- ✅ Source containers + controller container
- ✅ Parts-based spawn director (scales with energy capacity automatically)
- ✅ Roads (spawn→source and spawn→controller)
- ✅ Tower (active, auto-attacks hostiles, tiered rampart repair)
- ✅ Ramparts (spawn + tower + extensions covered)
- ✅ OODA room loop (Observe → Orient → Decide → Act)
- ✅ FORTIFY and WAR states with safe mode trigger
- ✅ Traffic manager (pins, push logic, stuck recovery)
- ✅ Gutter Runner scouts (BFS multi-room scouting, intel written to Memory)
- ✅ Stormvermin defenders (spawns during WAR/FORTIFY)
- ✅ BlackBox instrumentation (rolling recorder, profiler, per-creep diagnostics)
- ✅ Empire layer (Claim flag → auto spawn placement)

**Next:** Storage (RCL4 unlock) → thrall routing redesign → RCL5

---

## Architecture

For technical architecture and developer documentation:

- [`architecture/architecture.md`](architecture/architecture.md) — full system reference
- [`architecture/warren.md`](architecture/warren.md) — OODA loop and state machine
- [`architecture/storage-design.md`](architecture/storage-design.md) — planned storage routing (next milestone)

### Diagnosing problems

Always start the blackbox recorder after a deploy and leave it running:
```javascript
blackbox()            // start once
blackbox('report')    // dump last ~5 min for diagnosis
blackbox('snapshot')  // current point-in-time state
```

---

## Roles

| Role | Status | Purpose |
|------|--------|---------|
| Slave | ✅ | RCL1 bootstrap generalist |
| Miner | ✅ | Sits on source container, harvests forever |
| Thrall | ✅ | Energy transport (source → consumers) |
| Clanrat | ✅ | Builds and upgrades |
| Warlock Engineer | ✅ | Dedicated upgrader, anchored to controller container |
| Stormvermin | ✅ | Room defender, spawns during WAR/FORTIFY |
| Gutter Runner | ✅ | BFS scout, maps adjacent rooms |
| Jezzail | 🔲 | Long-range ranged attacker (stub) |
| Rat Ogre | 🔲 | Heavy melee brute (stub) |

---

## TODO

### Near-term
- [ ] Storage placement and thrall routing redesign (see `storage-design.md`)
- [ ] Investigate 27% drought rate at RCL4 — thrall carry targets may need tuning
- [ ] Jezzail implementation (ranged room defender)
- [ ] Rat Ogre implementation (heavy assault)
- [ ] Plan second spawn placement for RCL5

### Medium-term
- [ ] Remote mining (requires multi-room traffic coordination)
- [ ] Expansion automation (Grey Seer role — auto-claim + seed new rooms)
- [ ] Storage-aware spawn director (higher clanrat count when storage is buffered)

### Long-term
- [ ] Lab reactions and mineral processing
- [ ] Market automation
- [ ] Military at scale (coordinated raid squads)