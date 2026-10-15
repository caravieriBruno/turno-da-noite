#!/usr/bin/env node
// Testa os menus sem navegador (spec docs/superpowers/specs/2026-10-15-menus-fuga-design.md):
// quem pode navegar (só o host/P1), o giz determinístico, o atalho ?cena= e os textos no tema de fuga.
// Uso: node tools/teste_menus.js
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
const S = TN.sceneClasses, I = TN._internal;

// ---- entrada simulada: um quadro com alguns dispositivos apertando algo ----
const DISPOSITIVOS = ['kb1', 'kb2', 'kb3', 'gp0', 'n1:kb1'];
const solto = () => ({ x: 0, y: 0, a: false, b: false, aPressed: false, bPressed: false, startPressed: false, upPressed: false, downPressed: false, leftPressed: false, rightPressed: false });
// aperta = { dispositivo: 'up' | 'down' | 'left' | 'right' | 'a' | 'b' }; os outros ficam soltos
function quadro(aperta = {}, dt = 1 / 60) {
  for (const id of DISPOSITIVOS) {
    const s = solto(), b = aperta[id];
    if (b === 'a') { s.a = true; s.aPressed = true; } else if (b === 'b') { s.b = true; s.bPressed = true; } else if (b) s[b + 'Pressed'] = true;
    TN.input._inject(id, s);
  }
  TN.scene.update(dt);
  TN.scene.t = (TN.scene.t || 0) + dt;
}
const espera = (seg) => { for (let i = 0; i < Math.round(seg * 60); i++) quadro(); };

// --- 1. quem navega nos menus ---
function secaoDono() {
  TN.input.setRemote('n1:kb1', {});   // o host passa a ver o cliente 1 como dispositivo "n1:kb1"
  TN.go(TN.TitleScene); TN.TitleScene.sel = 0;
  quadro({ 'n1:kb1': 'down' }); ok(TN.TitleScene.sel === 0, 'título: jogador remoto não navega');
  quadro({ kb2: 'down' }); ok(TN.TitleScene.sel === 1, 'título: teclado 2 deste computador navega');
  quadro({ gp0: 'down' }); ok(TN.TitleScene.sel === 2, 'título: controle deste computador navega');

  // P1 = teclado 2, P2 = teclado 1
  const roster = I.buildRoster([{ device: 'kb2' }, { device: 'kb1' }, null, null], true);
  ok(typeof TN.donoDoMenu === 'function' && TN.donoDoMenu(roster)('kb2') && !TN.donoDoMenu(roster)('kb1'), 'donoDoMenu: com jogadores, só o P1');
  const setup = new S.Setup(roster); TN.go(setup);
  quadro({ kb1: 'down' }); ok(setup.sel === 0, 'montar o plano: P2 não move a seleção');
  quadro({ kb2: 'down' }); ok(setup.sel === 1, 'montar o plano: P1 move a seleção');
  quadro({ kb2: 'up' }); quadro({ kb1: 'a' }); ok(TN.scene === setup, 'montar o plano: AÇÃO do P2 não começa a fuga');
  quadro({ kb2: 'a' }); ok(TN.scene instanceof S.Picker, 'montar o plano: AÇÃO do P1 começa a fuga');

  const brief = new S.Brief(); TN.go(brief);
  const pausa = new S.Pause(brief); TN.go(pausa);
  quadro({ kb1: 'down' }); ok(pausa.sel === 0, 'pausa: P2 não escolhe');
  quadro({ kb2: 'down' }); ok(pausa.sel === 1, 'pausa: P1 escolhe');

  const rodada = new TN.Round(TN.minigames[TN.session.playlist[0].id], TN.session.roster, 1, 1);
  const fim = new S.RoundOver(rodada); TN.go(fim);
  espera(1.1);
  quadro({ kb1: 'a' }); ok(TN.scene === fim, 'fim da tentativa: AÇÃO do P2 não pula');
  quadro({ kb2: 'a' }); ok(TN.scene instanceof S.ScoreScreen, 'fim da tentativa: AÇÃO do P1 pula');
  const placar = TN.scene; espera(1.6);
  quadro({ kb1: 'a' }); ok(TN.scene === placar, 'placar: AÇÃO do P2 não pula');
  quadro({ kb2: 'a' }); ok(TN.scene !== placar, 'placar: AÇÃO do P1 pula');

  // voltar ao título com a sessão ainda preenchida: o título é de todos os dispositivos locais
  TN.go(TN.TitleScene); TN.TitleScene.sel = 0;
  quadro({ kb3: 'down' }); ok(TN.TitleScene.sel === 1, 'título depois de uma partida: qualquer dispositivo local navega');

  // lobby e briefing continuam de cada um
  TN.session = null;
  const lobby = new S.Lobby({}); TN.go(lobby);
  quadro({ kb2: 'a' }); quadro({ 'n1:kb1': 'a' });
  ok(lobby.slots[0] && lobby.slots[0].device === 'kb2' && lobby.slots[1] && lobby.slots[1].device === 'n1:kb1', 'lobby: cada um (local ou remoto) entra na sua cela');
  quadro({ 'n1:kb1': 'a' }); ok(lobby.slots[1].ready && !lobby.slots[0].ready, 'lobby: o remoto dá PRONTO na própria cela');
  I.newSession(roster, [{ id: TN.minigameOrder[0], rounds: 1 }]);
  const b2 = new S.Brief(); TN.go(b2); espera(0.5);
  quadro({ kb1: 'a' }); ok(b2.ready[1] && !b2.ready[0], 'briefing: o P2 dá o próprio PRONTO');

  // sem humano local (o host só assiste): qualquer dispositivo local navega, remoto não
  const remotos = I.buildRoster([{ device: 'n1:kb1' }, { device: 'n2:kb1' }, null, null], true);
  const s2 = new S.Setup(remotos); TN.go(s2);
  quadro({ 'n1:kb1': 'down' }); ok(s2.sel === 0, 'sem humano local: remoto continua sem navegar');
  quadro({ kb3: 'down' }); ok(s2.sel === 1, 'sem humano local: teclado deste computador navega');

  // o controle do P1 foi desconectado: ninguém fica preso no menu
  const semControle = I.buildRoster([{ device: 'gp3' }, { device: 'kb1' }, null, null], true);
  const s3 = new S.Setup(semControle); TN.go(s3);
  quadro({ kb2: 'down' }); ok(s3.sel === 1, 'controle do P1 desconectado: dispositivo local navega');
}

// SEÇÕES EXTRAS (as tarefas seguintes acrescentam funções aqui)

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
const desenho = (fn) => { const c = gravador(); fn(c); return JSON.stringify(c.log); };

// --- 2. giz: determinístico (sem Math.random), não "ferve", seleção animada ---
function secaoGiz() {
  const G = TN.giz;
  if (!G) { ok(false, 'TN.giz existe (engine/giz.js)'); return; }
  const rnd = Math.random; let erro = '', a, b, d1, d2;
  Math.random = () => { throw new Error('Math.random no giz'); };
  try {
    a = desenho((c) => G.texto(c, 'PLANEJAR A FUGA', 100, 100, { size: 24 }));
    b = desenho((c) => G.texto(c, 'PLANEJAR A FUGA', 100, 100, { size: 24 }));
    d1 = desenho((c) => G.detento(c, 50, 50, 20, '#ff4d5e', { comemorando: true }));
    d2 = desenho((c) => G.detento(c, 50, 50, 20, '#ff4d5e', { comemorando: true }));
    desenho((c) => { G.parede(c); G.linha(c, 0, 0, 10, 10); G.retangulo(c, 0, 0, 20, 20); G.circulo(c, 5, 5, 10, 6); G.selecao(c, 'X', 10, 10, 20, 0.1); G.bilhete(c, 0, 0, 50, 30); G.titulo(c, 'T', 10, 10, 30); G.linhas(c, 'a\nb', 0, 0); G.detento(c, 0, 0, 10, '#3fa9ff', { caido: true }); });
  } catch (e) { erro = e.message; } finally { Math.random = rnd; }
  ok(!erro, 'giz desenha sem Math.random (igual no host e nos clientes)' + (erro ? ` (${erro})` : ''));
  ok(!!a && a === b, 'giz: o mesmo texto desenhado duas vezes sai igual (não ferve)');
  ok(!!d1 && d1 === d2, 'giz: o mesmo detento desenhado duas vezes sai igual');
  ok(a !== desenho((c) => G.texto(c, 'PLANEJAR A FUGB', 100, 100, { size: 24 })), 'giz: textos diferentes têm tremor diferente');
  ok(desenho((c) => G.selecao(c, 'CONTINUAR', 100, 100, 24, 0.05)) !== desenho((c) => G.selecao(c, 'CONTINUAR', 100, 100, 24, 1)), 'giz: a seleção se desenha com o tempo');
  const fino = gravador(); G.texto(fino, 'rodapé', 10, 10, { size: 12 });
  ok(fino.log.filter((e) => e[0] === 'fillText').length === 1 && !fino.log.some((e) => e[0] === 'fillRect'), 'giz: texto pequeno sai com uma passada e sem grão (legível)');
}

// --- 3. atalho ?cena=: abre cada tela de menu com uma sessão de mentira ---
function secaoCenas() {
  if (!TN.cenaDeTeste) { ok(false, 'TN.cenaDeTeste existe'); return; }
  for (const nome of TN.CENAS_DE_TESTE) {
    let erro = '';
    try { const cena = TN.cenaDeTeste(nome); if (!cena || TN.scene !== cena) throw new Error('não abriu'); cena.draw(gravador()); } catch (e) { erro = e.message; }
    ok(!erro, `?cena=${nome} abre e desenha` + (erro ? ` (${erro})` : ''));
  }
  ok(TN.CENAS_DE_TESTE.length === 14, 'as 14 telas de menu da spec têm atalho');
}

secaoDono();
secaoGiz();
secaoCenas();
// CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
