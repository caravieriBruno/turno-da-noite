#!/usr/bin/env node
// Testa regras de minigames sem navegador: monta uma rodada de verdade (TN.Round) com jogadores humanos cujos
// botões são injetados, avança o relógio e confere a regra. Uma seção por jogo ajustado
// (spec docs/superpowers/specs/2026-10-18-ajustes-minigames-design.md). Uso: node tools/teste_ajustes.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };

global.window = global;
global.performance = global.performance || { now: () => Date.now() };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
const MOTOR = ['engine/util.js', 'engine/input.js', 'engine/audio.js', 'engine/draw.js', 'engine/giz.js', 'engine/render3d.js', 'engine/cenarios.js', 'engine/minigame.js', 'engine/session.js', 'engine/net.js', 'minigames/manifest.js'];
MOTOR.forEach(load);
for (const f of TN.MINIGAME_FILES) load('minigames/' + f);

// ---- rodada com 4 jogadores: os `humanos` primeiros têm dispositivo 'h<i>' (botões injetados), o resto é bot ----
const DEV = (i) => 'h' + i;
const solto = () => ({ x: 0, y: 0, a: false, b: false });
function rodada(id, { humanos = 4, rodadaN = 1, total = 1 } = {}) {
  const roster = [0, 1, 2, 3].map((i) => ({ id: i, name: TN.PLAYER_NAMES[i], color: TN.PLAYER_COLORS[i], device: i < humanos ? DEV(i) : null, isBot: i >= humanos }));
  solta();
  return new TN.Round(TN.minigames[id], roster, rodadaN, total);
}
function aperta(i, s) { TN.input._inject(DEV(i), { ...solto(), ...s }); }
function solta() { for (let i = 0; i < 4; i++) TN.input._inject(DEV(i), solto()); }
function passo(g, seg = 1 / 60, n = 1) { for (let k = 0; k < n; k++) g.update(seg); }
function segundos(g, s) { passo(g, 1 / 60, Math.round(s * 60)); }

// contexto 2D de mentira: registra cada chamada (números arredondados) em c.log
function gravador() {
  const log = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'log') return log;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => ({});
      if (k in t) return t[k];
      return (...a) => { log.push([k, ...a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' ? v : '?'))]); };
    },
    set(t, k, v) { t[k] = v; log.push(['=' + String(k), typeof v === 'object' ? '?' : v]); return true; },
  });
}
const textos = (fn) => { const c = gravador(); fn(c); return c.log.filter((e) => e[0] === 'fillText').map((e) => String(e[1])).join(' | '); };
const estilos = (fn) => { const c = gravador(); fn(c); return c.log.filter((e) => e[0] === '=fillStyle').map((e) => String(e[1])); };

// SEÇÕES (uma por jogo; cada tarefa define a sua função acima deste bloco e acrescenta o nome no array)
const secoes = [];
for (const s of secoes) { try { s(); } catch (e) { ok(false, `${s.name}: exceção ${e.message}`); } }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
