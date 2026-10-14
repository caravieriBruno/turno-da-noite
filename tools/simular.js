#!/usr/bin/env node
// Simulador headless: roda cada minigame com 4 bots (sem navegador) e verifica se
//  - carrega e registra sem erro,  - não lança exceções em update/draw,
//  - termina sozinho num tempo razoável,  - devolve pontuação válida.
// Uso:
//   node tools/simular.js                 → testa todos os minigames do manifesto
//   node tools/simular.js aspiradores     → testa só um (pelo id)
//   node tools/simular.js --vezes 5       → repete cada teste 5 vezes (aleatoriedade)
//   node tools/simular.js --parado        → P1 é um humano parado (o jogo ainda precisa terminar)
//   node tools/simular.js --sem-rede      → pula a checagem de compatibilidade com o modo em rede
// A checagem de rede (padrão) serializa o estado da rodada como o host faz, recria a cópia e chama draw() nela.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = { vezes: 2, max: 300, parado: false, rede: true, ids: [] };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--vezes') opt.vezes = Number(args[++i]);
  else if (args[i] === '--max') opt.max = Number(args[++i]);
  else if (args[i] === '--parado') opt.parado = true;
  else if (args[i] === '--sessao') opt.sessao = true;
  else if (args[i] === '--sem-rede') opt.rede = false;
  else opt.ids.push(args[i]);
}

// ---- ambiente falso de navegador ----
const noop = () => stub;
const stub = new Proxy(function () {}, {
  get: (t, k) => (k === 'width' ? 10 : k === 'data' ? new Uint8ClampedArray(4) : k === Symbol.toPrimitive ? () => 0 : noop),
  set: () => true,
  apply: () => stub,
});
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };

function load(rel) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
['engine/util.js', 'engine/input.js', 'engine/audio.js', 'engine/draw.js', 'engine/render3d.js', 'engine/minigame.js', 'engine/session.js', 'engine/net.js', 'minigames/manifest.js'].forEach(load);

let failures = 0;
for (const f of TN.MINIGAME_FILES) {
  try { load('minigames/' + f); } catch (e) { failures++; console.log(`✗ ERRO ao carregar ${f}:\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`); }
}

// ids pedidos que não estão no manifesto: tenta minigames/<id>.js (convenção: nome do arquivo = id)
for (const id of opt.ids) {
  if (!TN.minigames[id] && fs.existsSync(path.join(ROOT, 'minigames', id + '.js'))) {
    try { load('minigames/' + id + '.js'); console.log(`(aviso: ${id}.js não está em minigames/manifest.js)`); }
    catch (e) { failures++; console.log(`✗ ERRO ao carregar ${id}.js:\n  ${e.stack.split('\n').slice(0, 3).join('\n  ')}`); }
  }
}
const ids = opt.ids.length ? opt.ids : TN.minigameOrder;
const DT = 1 / 60;
for (const id of ids) {
  const def = TN.minigames[id];
  if (!def) { failures++; console.log(`✗ minigame "${id}" não registrado`); continue; }
  const defBefore = defState(def);
  const netIssues = new Set(); let maxBytes = 0;
  for (let v = 0; v < opt.vezes; v++) {
    const roster = [0, 1, 2, 3].map((i) => ({
      id: i, name: TN.PLAYER_NAMES[i], color: TN.PLAYER_COLORS[i],
      isBot: !(opt.parado && i === 0), device: opt.parado && i === 0 ? 'parado' : null,
    }));
    const total = def.rounds;
    for (let r = 1; r <= total; r++) {
      let g, frames = 0;
      try {
        g = new TN.Round(def, roster, r, total);
        while (!g.finished && g.time < opt.max) {
          g.update(DT);
          if (frames % 5 === 0) {
            g.draw(ctx2d);
            if (def.draw3d) { const errs = TN.R3.validate(g); if (errs.length) netIssues.add('draw3d: ' + errs[0]); }
          }
          if (opt.rede && frames % 20 === 0) {
            // igual ao host: serializa → JSON → cliente recria e desenha
            const json = JSON.stringify(TN.serial.encode(g));
            if (TN.serial.dropped.length) netIssues.add('estado com objetos não sincronizáveis: ' + [...new Set(TN.serial.dropped)].join(', '));
            maxBytes = Math.max(maxBytes, json.length);
            try {
              const copy = TN.serial.decode(JSON.parse(json));
              copy.draw(ctx2d);
              if (def.draw3d) TN.R3.validate(copy);
            } catch (e) { netIssues.add('draw()/draw3d() falha na cópia recebida pela rede: ' + e.message); }
          }
          frames++;
        }
        const res = g.results();
        const bad = roster.filter((p) => typeof res[p.id] !== 'number' || !Number.isFinite(res[p.id]));
        if (bad.length) throw new Error('results() inválido: ' + JSON.stringify(res));
        if (!g.finished) { failures++; console.log(`✗ ${id} rodada ${r}: não terminou em ${opt.max}s (jogo travado?)`); }
        else console.log(`✓ ${id.padEnd(22)} rodada ${r}/${total}  ${g.time.toFixed(1).padStart(6)}s  pontos ${JSON.stringify(res)}`);
      } catch (e) {
        failures++;
        console.log(`✗ ${id} rodada ${r}: EXCEÇÃO em t=${g ? g.time.toFixed(2) : '?'}s\n  ${String(e.stack).split('\n').slice(0, 4).join('\n  ')}`);
        break;
      }
    }
  }
  if (opt.rede) {
    if (defState(def) !== defBefore) netIssues.add('o minigame altera `this` (a definição) em tempo de execução — guarde estado em g.data/p.data');
    if (maxBytes > 300000) netIssues.add(`estado muito grande para a rede (${(maxBytes / 1024).toFixed(0)} KB por quadro)`);
    for (const m of netIssues) { failures++; console.log(`✗ ${id} [rede]: ${m}`); }
    if (!netIssues.size) console.log(`  ${id}: compatível com rede (estado ~${(maxBytes / 1024).toFixed(1)} KB/quadro)${def.draw3d ? ' · 3D ok' : ' · só 2D'}`);
  }
}
function defState(def) {
  try { return JSON.stringify(def, (k, v) => (typeof v === 'function' ? undefined : v)); } catch (e) { return 'circular'; }
}
// --sessao: percorre uma partida inteira (roleta → briefing → rodadas → placar → pódio) só com bots
if (opt.sessao) {
  try {
    const { buildRoster, newSession } = TN._internal;
    const roster = buildRoster([null, null, null, null], true);
    const playlist = ids.map((id) => ({ id, rounds: TN.minigames[id].rounds }));
    newSession(roster, playlist);
    TN.go(new TN._internal.Picker());   // entra pela roleta, como depois da tela de configuração
    let t = 0;
    const maxFrames = 60 * 60 * 6 * playlist.length;  // até 6 min simulados por jogo
    while (t < maxFrames && TN.scene.constructor.name !== 'Final') {
      TN.input.update();
      TN.scene.update(DT);
      TN.scene.t += DT;
      if (t % 10 === 0) TN.scene.draw(ctx2d);
      t++;
    }
    if (TN.scene.constructor.name !== 'Final') throw new Error('sessão não chegou ao pódio; última cena: ' + TN.scene.constructor.name);
    console.log(`✓ sessão completa (${playlist.length} jogos) em ${(t / 60 / 60).toFixed(1)} min simulados. Totais: ${JSON.stringify(TN.session.totals)}`);
  } catch (e) {
    failures++;
    console.log('✗ sessão: ' + String(e.stack).split('\n').slice(0, 4).join('\n  '));
  }
}
console.log(failures ? `\n${failures} problema(s) encontrado(s).` : '\nTudo certo.');
process.exit(failures ? 1 : 0);
