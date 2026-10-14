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

// --- r.prop ---
for (const nome of ['beliche', 'vaso', 'banco', 'mesa', 'tambor', 'pneu', 'colchao', 'grade', 'poste', 'arquivo']) {
  const t = trace((r) => r.prop(nome, 300, 200, { rotY: 0.7, scale: 1.2 }));
  ok(t.errs.length === 0 && t.calls.length >= 1 && (t.counts.light || 0) === 0, `prop ${nome}: válido, sem luz`);
}
{ const t = trace((r) => r.prop('poste', 300, 200, { luz: true })); ok(t.counts.light === 1, 'prop poste com luz: acende 1 luz'); }
deveFalhar('prop com nome errado', (r) => r.prop('belixe', 0, 0), 'beliche');
{
  // girar 180° em torno de (300,200) espelha os pontos: a 1ª gaveta (x local 15.5) vai de x=315.5 para x=284.5
  const a = trace((r) => r.prop('arquivo', 300, 200)).calls[1][1], b = trace((r) => r.prop('arquivo', 300, 200, { rotY: Math.PI })).calls[1][1];
  ok(Math.abs((a[0] - 300) + (b[0] - 300)) < 1e-6 && Math.abs((a[2] - 200) + (b[2] - 200)) < 1e-6, 'prop girado 180° espelha em torno do ponto');
}

// --- r.room: estilos ---
for (const estilo of ['cela', 'oficina', 'refeitorio', 'subsolo', 'escritorio']) {
  cenarioValido(`room estilo ${estilo}`, (r) => r.room(40, 20, 920, 520, { estilo }));
  ok(mesmas(trace((r) => r.room(920, 520, 40, 20, { estilo })), trace((r) => r.room(40, 20, 920, 520, { estilo }))), `room ${estilo}: cantos invertidos = cantos na ordem`);
}
deveFalhar('room com estilo errado', (r) => r.room(0, 0, 100, 100, { estilo: 'cozinha' }), 'refeitorio');
ok(!mesmas(trace((r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' }), 0), trace((r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' }), 0.4)), 'room subsolo: giroflex muda com o tempo');

// --- r.yard ---
cenarioValido('yard padrão', (r) => r.yard(40, 20, 920, 520));
cenarioValido('yard sem guarita, 4 postes', (r) => r.yard(40, 20, 920, 520, { guarita: false, postes: 4 }));
cenarioValido('yard guarita à esquerda', (r) => r.yard(40, 20, 920, 520, { guarita: 'esquerda' }));
ok(mesmas(trace((r) => r.yard(920, 520, 40, 20)), trace((r) => r.yard(40, 20, 920, 520))), 'yard com cantos invertidos = cantos na ordem');
cenarioValido('yard degenerado (largura 0)', (r) => r.yard(300, 100, 300, 100));
ok(!mesmas(trace((r) => r.yard(40, 20, 920, 520), 1), trace((r) => r.yard(40, 20, 920, 520), 3)), 'yard: holofote varre com o tempo');

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
