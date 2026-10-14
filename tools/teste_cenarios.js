#!/usr/bin/env node
// Testa o kit de cenários (engine/cenarios.js) contra o validador do render3d, sem navegador.
// Confere: números válidos, no máximo 2 luzes por cenário, nada aleatório (mesmo time = mesmas chamadas),
// cantos invertidos desenham o mesmo cenário e nomes errados dão erro claro.
// Uso: node tools/teste_cenarios.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
global.localStorage = { getItem: () => null, setItem() {} };
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
['engine/util.js', 'engine/render3d.js', 'engine/cenarios.js'].forEach(load);

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };
const trace = (fn, time) => TN.R3.trace(fn, time);
const mesmas = (a, b) => JSON.stringify(a.calls) === JSON.stringify(b.calls);

function cenarioValido(nome, fn) {
  let t;
  try { t = trace(fn, 2.5); } catch (e) { ok(false, `${nome}: exceção ${e.message}`); return; }
  ok(t.errs.length === 0, `${nome}: números válidos${t.errs.length ? ' (' + t.errs[0] + ')' : ''}`);
  ok((t.counts.light || 0) <= 2, `${nome}: no máximo 2 luzes (usou ${t.counts.light || 0})`);
  ok(t.calls.length > 5, `${nome}: desenha alguma coisa`);
  ok(mesmas(t, trace(fn, 2.5)), `${nome}: nada aleatório (mesmo time = mesmas chamadas)`);
}
function deveFalhar(nome, fn, trecho) {
  try { trace(fn); ok(false, `${nome}: deveria dar erro`); }
  catch (e) { ok(e.message.includes(trecho), `${nome}: erro claro ("${e.message}")`); }
}

// --- r.room ---
cenarioValido('room padrão (cela)', (r) => r.room(40, 20, 920, 520));
ok(mesmas(trace((r) => r.room(920, 520, 40, 20)), trace((r) => r.room(40, 20, 920, 520))), 'room com cantos invertidos = cantos na ordem');
cenarioValido('room degenerado (largura 0)', (r) => r.room(300, 100, 300, 100));
ok(trace((r) => r.room(NaN, 20, 920, 520)).errs.length > 0, 'room com NaN: o validador acusa');

// CASOS EXTRAS (as tarefas seguintes acrescentam aqui)

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
