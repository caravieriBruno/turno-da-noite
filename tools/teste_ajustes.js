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

// --- contramão: só a chegada pontua (4/3/2/1), cair é 0, último na escada ganha 1 ---
function secaoContramao() {
  const g = rodada('contramao'), d = g.data, P = g.players, def = g.def;
  for (const p of P) p.data.speed = 0;
  P[0].data.s = 1.01; passo(g);
  ok(P[0].score === 4, `contramão: 1º a chegar ganha 4 (deu ${P[0].score})`);
  P[1].data.s = -0.01; passo(g);
  ok(!P[1].alive && P[1].score === 0 && P[0].score === 4 && P[2].score === 0, 'contramão: cair vale 0 e não dá ponto a ninguém');
  P[2].data.s = 1.01; passo(g);
  ok(P[2].score === 3, `contramão: 2º a chegar ganha 3 (deu ${P[2].score})`);
  passo(g);
  ok(P[3].score === def.CONSOLACAO && d.over, 'contramão: último na escada ganha 1 de consolação e a rodada termina');
  // Review Focus 1: o tempo acaba com todos na escada
  const h = rodada('contramao');
  for (const p of h.players) p.data.speed = 0.5;
  segundos(h, 61);
  ok(h.finished && h.players.every((p) => p.score === 0), 'contramão: tempo esgotado com todos na escada → todos 0 e a rodada termina');
  ok(def.brief.some((b) => /cair/i.test(b) && /0/.test(b)), 'contramão: brief avisa que cair é 0');
}

// --- serviço interno: portador mais rápido, planta aberta, arena maior ---
function secaoServicoInterno() {
  const def = TN.minigames.servico_interno, g = rodada('servico_interno');
  ok(def.HOLDER_MULT === 1.3 && def.HUNTER_MULT === 1.15, 'serviço interno: portador 1,3× e infectado 1,15×');
  ok(def.INFECT_RANGE === 56 && def.LIGHT_R === 95 && def.FREEZE === 3, 'serviço interno: alcance 56, lanterna 95, congelamento 3 s');
  ok(def.LAYOUT.length >= 16 && def.LAYOUT.length <= 18, `serviço interno: ${def.LAYOUT.length} móveis (16 a 18)`);
  ok(g.arena.w >= 920 && g.arena.h >= 480, `serviço interno: arena ${g.arena.w}×${g.arena.h}`);
  const dentro = (x, y) => x >= g.arena.x && x <= g.arena.x + g.arena.w && y >= g.arena.y && y <= g.arena.y + g.arena.h;
  ok(def.SPAWNS.every(([x, y]) => dentro(x, y)) && g.players.every((p) => dentro(p.x, p.y)), 'serviço interno: nascimentos dentro da arena nova');
}

// --- triagem: pausa com contagem 3-2-1 entre os turnos ---
function secaoTriagem() {
  const g = rodada('triagem'), d = g.data;
  d.timer = 0.01; passo(g);
  ok(d.phase === 'judge', 'triagem: fim do turno entra em judge');
  segundos(g, 3.05);
  ok(d.phase === 'pause' && d.contagem >= 1, `triagem: depois do julgamento vem a pausa com contagem (fase ${d.phase}, contagem ${d.contagem})`);
  const antes = g.players[1].data.sub;
  aperta(1, { a: true }); passo(g); solta();
  ok(g.players[1].data.sub === antes, 'triagem: durante a pausa a entrada é ignorada');
  segundos(g, 1.6);
  ok(d.phase === 'play' && d.sub === 2, 'triagem: ~1,5 s depois começa o turno 2');
}

// SEÇÕES (uma por jogo; cada tarefa define a sua função acima deste bloco e acrescenta o nome no array)
const secoes = [secaoContramao, secaoServicoInterno, secaoTriagem];
for (const s of secoes) { try { s(); } catch (e) { ok(false, `${s.name}: exceção ${e.message}`); } }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
