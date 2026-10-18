#!/usr/bin/env node
// Testa as câmeras novas sem navegador (spec docs/superpowers/specs/2026-10-18-cameras-minigames-design.md).
// Uso: node tools/teste_cameras.js
const { rodada, aperta, solta, passo, segundos, gravador, textos, estilos, ok, fim } = require('./_harness.js');
// finge o 3D para os HUDs que só desenham com WebGL; project aceita o índice da vista e desloca para a faixa dela
function com3d(g, fn) {
  const u = g.uses3d, pr = TN.R3.project;
  g.uses3d = () => true;
  TN.R3.project = (x, y, z, vista = 0) => ({ x: 480 + (x - 480) * 0.8, y: (vista ? 262 : 34) + 100 + (z - 270) * 0.3, visible: true });
  try { return fn(); } finally { g.uses3d = u; TN.R3.project = pr; }
}

// --- motor: validador de viewports ---
function secaoMotor() {
  const base = { def: { draw3d() {} }, time: 0, _particles: [], _shake: 0 };
  ok(TN.R3.validate(base).length === 0, 'motor: sem viewports o validador não reclama');
  const bom = { ...base, def: { draw3d() {}, viewports: () => [{ rect: [0, 34, 960, 228], camera: { pos: [0, 1, 2], target: [3, 4, 5], fov: 40 } }, { rect: [0, 262, 960, 278], camera: { pos: [0, 1, 2], target: [3, 4, 5], fov: 40 } }] } };
  ok(TN.R3.validate(bom).length === 0, 'motor: duas vistas bem formadas passam');
  const ruins = [
    ['não é lista', () => ({ rect: [0, 0, 1, 1] })],
    ['rect curto', () => [{ rect: [0, 0, 1], camera: { pos: [0, 0, 0], target: [0, 0, 0] } }]],
    ['pos NaN', () => [{ rect: [0, 0, 1, 1], camera: { pos: [NaN, 0, 0], target: [0, 0, 0] } }]],
    ['sem camera', () => [{ rect: [0, 0, 1, 1] }]],
  ];
  for (const [nome, vp] of ruins) {
    const errs = TN.R3.validate({ ...base, def: { draw3d() {}, viewports: vp } });
    ok(errs.length === 1 && /^viewports:/.test(errs[0]), `motor: viewports ${nome} → 1 erro "viewports: ..." (${errs[0]})`);
  }
  // o validador aceita o índice da vista em project/unproject
  const tr = TN.R3.trace((r) => { r.project(1, 2, 3, 1); r.unproject(1, 2, 0, 1); });
  ok(tr.errs.length === 0, 'motor: r.project/r.unproject aceitam o índice da vista');
}

fim([secaoMotor]);
