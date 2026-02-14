/**
 * rat.visual.js
 *
 * Draws a small colored role indicator above each creep every tick.
 * Pure cosmetic overlay — no game state, no Memory, no side effects.
 *
 * Each role gets a distinct color and symbol so you can identify the horde
 * at a glance without hovering over individual creeps.
 *
 * Called by: Creep.prototype.tick in rat.js
 */

const ROLE_VISUALS = {
  slave:   { color: '#AAAAAA', symbol: '⚙' },  // grey   — expendable generalist
  miner:   { color: '#FFD700', symbol: '⛏' },  // gold   — source sitter
  hauler:  { color: '#44AAFF', symbol: '⬆' },  // blue   — energy transporter
  worker:  { color: '#44DD88', symbol: '🔨' }, // green  — builder/upgrader
  warlock: { color: '#CC44FF', symbol: '⚡' },  // purple — dedicated upgrader
};

Creep.prototype.drawRole = function () {
  const visual = this.room.visual;
  const role   = this.memory.role;
  const spec   = ROLE_VISUALS[role];

  if (!spec) return;

  // Colored circle centered on the creep
  visual.circle(this.pos, {
    fill:    spec.color,
    radius:  0.25,
    opacity: 0.85,
    stroke:  'rgba(0,0,0,0.4)',
    strokeWidth: 0.05
  });

  // Symbol floated just above the circle
  visual.text(spec.symbol, this.pos.x, this.pos.y - 0.55, {
    font:    '0.45 monospace',
    align:   'center',
    opacity: 0.95
  });
};