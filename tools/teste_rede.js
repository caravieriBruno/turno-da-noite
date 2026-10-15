#!/usr/bin/env node
// Teste de ponta a ponta do modo em rede (precisa do servidor rodando: node tools/servidor.js 8765).
// O HOST roda o motor de verdade aqui no Node; um CLIENTE conecta pelo WebSocket, entra na sala,
// aperta AÇÃO no lobby para pegar uma vaga, joga e depois sai (deve virar BOT no host).
// Nos menus só o host navega: o cliente não começa a partida; quem aperta COMEÇAR é o teclado do host.
// Uso: node tools/teste_rede.js [porta]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8765;

const noop = () => stub;
const stub = new Proxy(function () {}, { get: (t, k) => (k === 'width' ? 10 : noop), set: () => true, apply: () => stub });
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
global.window = global;
global.location = { protocol: 'http:', host: `127.0.0.1:${PORT}`, search: '' };
global.localStorage = { getItem: () => null, setItem: () => {} };
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
['engine/util.js', 'engine/input.js', 'engine/audio.js', 'engine/draw.js', 'engine/render3d.js', 'engine/cenarios.js', 'engine/minigame.js', 'engine/session.js', 'engine/net.js', 'minigames/manifest.js'].forEach(load);
for (const f of TN.MINIGAME_FILES) load('minigames/' + f);
TN.settings.gameCount = 1; TN.settings.roundsMode = 1;
// só Aspiradores (jogo com movimento livre) para testar o input remoto
TN.settings.disabled = Object.fromEntries(TN.minigameOrder.filter((id) => id !== 'aspiradores').map((id) => [id, true]));

const fail = (m) => { console.log('✗ ' + m); process.exit(1); };
const ok = (m) => console.log('✓ ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---------- HOST ----------
  try { await TN.net.host(); } catch (e) { fail('host não conectou ao servidor em ' + PORT + ' (o servidor está rodando?)'); }
  ok(`host criou a sala ${TN.net.room}`);
  TN.go(new TN.LobbyScene({}));
  let hostAperta = 0;   // quadros em que o teclado do host (kb1) aperta AÇÃO
  const hostLoop = setInterval(() => {
    for (let i = 0; i < 2; i++) {
      TN.input.update();
      if (hostAperta > 0) { hostAperta--; TN.input._inject('kb1', { ...TN.input.get('kb1'), a: true, aPressed: true }); }
      TN.scene.update(1 / 60); TN.scene.t += 1 / 60; TN.net.tick();
    }
  }, 1000 / 30);

  // ---------- CLIENTE ----------
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  let myId = null, states = 0, view = null, session = null, bytes = 0;
  const seenScenes = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'rooms') { const r = m.rooms.find((x) => x.room === TN.net.room); if (r) ws.send(JSON.stringify({ t: 'join', room: r.room })); }
    if (m.t === 'joined') { myId = m.id; }
    if (m.t === 'state') {
      states++; bytes = ev.data.length;
      const st = TN.serial.decode(m.d);
      view = st.scene; session = st.session;
      seenScenes.add(view.constructor.name);
      const saved = TN.session; TN.session = session;   // as cenas desenham lendo TN.session
      try { view.draw(ctx2d); } catch (e) { fail('cliente não conseguiu desenhar ' + view.constructor.name + ': ' + e.message); }
      TN.session = saved;
    }
  };
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ t: 'list' }));
  await sleep(500);
  if (!myId) fail('cliente não entrou na sala');
  ok(`cliente entrou como #${myId}`);
  const send = (a) => ws.send(JSON.stringify({ t: 'input', devices: { kb1: { x: 0, y: 0, a, b: 0 } } }));
  const tap = async () => { send(1); await sleep(40); send(0); await sleep(300); };

  await tap(); // entra no lobby
  await sleep(300);
  const slot = TN.scene.slots && TN.scene.slots.find((s) => s && s.device === `n${myId}:kb1`);
  if (!slot) fail('o host não colocou o jogador remoto numa vaga do lobby');
  ok('jogador remoto pegou a vaga P1 no lobby do host');
  await tap(); // pronto (AÇÃO de novo alterna, então espera o lobby começar)
  await sleep(1500);
  if (TN.scene.constructor.name !== 'Setup') fail('lobby não avançou para a configuração (cena: ' + TN.scene.constructor.name + ')');
  ok('lobby → configuração da partida');
  // na configuração, o cliente não manda: só o host começa a fuga
  for (let i = 0; i < 3; i++) await tap();
  if (TN.scene.constructor.name !== 'Setup') fail('o cliente remoto mexeu no menu do host (cena: ' + TN.scene.constructor.name + ')');
  ok('cliente remoto não mexe no menu do host');
  hostAperta = 1; await sleep(300);
  if (TN.scene.constructor.name === 'Setup') fail('o host apertou COMEÇAR e a configuração não avançou');
  ok('host começou a fuga');
  // PRONTO (briefing): cada jogador, inclusive o remoto, dá o seu
  for (let i = 0; i < 40 && TN.scene.constructor.name !== 'Play'; i++) { await tap(); await sleep(400); }
  if (TN.scene.constructor.name !== 'Play') fail('partida não começou (cena atual: ' + TN.scene.constructor.name + ')');
  const me = TN.scene.round.players.find((p) => p.device === `n${myId}:kb1`);
  if (!me || me.isBot) fail('jogador remoto não está na rodada como humano');
  ok(`partida começou (${TN.scene.round.def.title}); jogador remoto controla ${me.label}`);
  // move para a direita por 1 s e confere se andou no host
  const x0 = me.x;
  for (let i = 0; i < 10; i++) { ws.send(JSON.stringify({ t: 'input', devices: { kb1: { x: 1, y: 0, a: 0, b: 0 } } })); await sleep(100); }
  ws.send(JSON.stringify({ t: 'input', devices: { kb1: { x: 0, y: 0, a: 0, b: 0 } } }));
  if (me.alive && !(me.x > x0 + 20)) fail(`movimento remoto não chegou ao host (x ${x0.toFixed(0)} → ${me.x.toFixed(0)})`);
  ok(`movimento remoto aplicado no host (x ${x0.toFixed(0)} → ${me.x.toFixed(0)})`);
  if (states < 20) fail('cliente recebeu poucos estados: ' + states);
  ok(`cliente recebeu ${states} estados (último ${(bytes / 1024).toFixed(1)} KB) e desenhou: ${[...seenScenes].join(' → ')}`);

  ws.close();
  await sleep(500);
  if (!me.isBot) fail('após sair, o jogador remoto deveria virar BOT');
  ok('cliente saiu → o jogador virou BOT no host');
  clearInterval(hostLoop);
  TN.net.close();
  console.log('\nRede OK.');
  process.exit(0);
})().catch((e) => fail(e.stack));
