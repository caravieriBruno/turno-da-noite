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
  quadro({ 'n1:kb1': 'a' }); quadro({ 'n1:kb1': 'a' });   // confirma o nome (roda) e depois PRONTO
  ok(lobby.slots[1].ready && !lobby.slots[0].ready, 'lobby: o remoto dá PRONTO na própria cela');
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

// textos que uma tela desenha (fillText), para conferir o vocabulário novo
const textos = (cena) => { const c = gravador(); cena.draw(c); return c.log.filter((e) => e[0] === 'fillText').map((e) => e[1]).join(' | '); };
// nenhuma das telas desenha com o visual antigo (robô, painel e CRT do TN.draw)
function semVisualAntigo(cenas) {
  const D = TN.draw, orig = { robot: D.robot, panel: D.panel, crt: D.crt };
  let n = 0;
  D.robot = D.panel = D.crt = () => { n++; };
  try { for (const cena of cenas) cena.draw(gravador()); } finally { Object.assign(D, orig); }
  return n === 0;
}

// --- 4. telas antes da partida e de rede: giz e textos de fuga ---
function secaoTelasSemSessao() {
  const title = TN.cenaDeTeste('Title'), t = textos(title);
  ok(['PLANEJAR A FUGA', 'CHAMAR COMPARSAS (REDE LOCAL)', 'ENTRAR NO PLANO (REDE LOCAL)', 'ENSAIAR UMA ETAPA', 'CONTROLES'].every((x) => t.includes(x)), 'título: itens no tema de fuga');
  ok(t.includes('1 a 4 detentos · uma noite para cavar a saída') && !t.includes('unidades de teste'), 'título: subtítulo novo, sem "unidades de teste"');
  const lobby = TN.cenaDeTeste('Lobby'), l = textos(lobby);
  ok(['ESCOLHA SUA CELA', 'PRONTO PRA FUGIR!', 'AÇÃO ✓', 'Celas vazias com bots'].every((x) => l.includes(x)), 'lobby: celas no tema (uma editando o nome, outra pronta)');
  ok(textos(TN.cenaDeTeste('TestList')).includes('ENSAIAR UMA ETAPA'), 'ensaiar uma etapa: título novo');
  ok(textos(TN.cenaDeTeste('Controls')).includes('quem manda é o P1'), 'controles: avisa que só o P1 mexe no menu');
  const j = textos(TN.cenaDeTeste('JoinList'));
  ok(j.includes('ENTRAR NO PLANO (REDE LOCAL)') && j.includes('SALA ABCD'), 'rede: entrar no plano, com o código da sala');
  ok(textos(TN.cenaDeTeste('NetMessage')).includes('A SALA FECHOU'), 'rede: mensagem desenhada');
  const cenas = ['Title', 'Controls', 'TestList', 'Lobby', 'HostCreate', 'JoinList', 'NetMessage'].map((n) => TN.cenaDeTeste(n));
  ok(semVisualAntigo(cenas), 'telas antes da partida e de rede: só giz (sem robô, painel ou CRT)');
}

// --- 5. telas da partida: giz e vocabulário do plano em etapas ---
function secaoTelasDaPartida() {
  const ts = textos(TN.cenaDeTeste('Setup'));
  ok(['MONTAR O PLANO', 'COMEÇAR A FUGA', 'ETAPAS DO PLANO', 'TENTATIVAS POR ETAPA', 'ETAPAS POSSÍVEIS', 'mexe no menu'].every((x) => ts.includes(x)), 'montar o plano: textos novos');
  ok(textos(TN.cenaDeTeste('Picker')).includes('ETAPA 3 DE 6'), 'roleta: ETAPA 3 DE 6');
  const tb = textos(TN.cenaDeTeste('Brief'));
  ok(tb.includes('TÚNEL CAVADO') && tb.includes('51 m') && tb.includes('3 TENTATIVAS · ETAPA 3/6'), 'briefing: túnel cavado em metros');
  const tp = textos(TN.cenaDeTeste('Pause'));
  ok(['SILÊNCIO, GUARDA NA RONDA', 'CONTINUAR', 'PULAR ESTA ETAPA', 'DESISTIR DA FUGA', 'mexe no menu'].every((x) => tp.includes(x)), 'pausa: textos novos e aviso de que só o P1 mexe');
  const tr = textos(TN.cenaDeTeste('RoundOver'));
  ok(tr.includes('FIM DA TENTATIVA') && /\+\d+ m/.test(tr), 'fim da tentativa: ganho em metros');
  const ri = new S.RoundIntro(2); TN.go(ri);
  ok(textos(ri).includes('TENTATIVA 2 / 3'), 'início da tentativa: TENTATIVA 2 / 3');
  const sc = TN.cenaDeTeste('ScoreScreen'); sc.t = 3;
  const tsc = textos(sc);
  ok(tsc.includes('QUANTO CADA UM CAVOU') && tsc.includes('Próxima: etapa 4/6'), 'placar: quanto cada um cavou');
  const tf = textos(TN.cenaDeTeste('Final'));
  ok(['O APITO TOCOU', 'SOLITÁRIA', 'RECAPTURADO', 'TENTAR DE NOVO', 'VOLTAR PRA CELA', 'mexe no menu'].every((x) => tf.includes(x)) && /[A-Z0-9 -]+ (\(BOT\) )?FUGIU!/.test(tf), 'pódio: fugiu, recapturado e solitária');
  // com 2 detentos: só FUGIU e SOLITÁRIA
  TN.cenaDeTeste('Final');
  TN.session.roster = TN.session.roster.slice(0, 2);
  const f2 = new S.Final(); TN.go(f2); const t2 = textos(f2);
  ok(t2.includes('SOLITÁRIA') && !t2.includes('RECAPTURADO'), 'pódio com 2 detentos: só fugiu e solitária');
  ok(semVisualAntigo(['Setup', 'Picker', 'Brief', 'ScoreScreen', 'Final'].map((n) => TN.cenaDeTeste(n))), 'telas da partida: só giz (sem robô, painel ou CRT)');
}

// --- 6. as instruções fora do jogo citam os itens de menu que existem ---
function secaoInstrucoes() {
  const ler = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const VELHOS = ['CRIAR SALA EM REDE', 'ENTRAR EM SALA', 'TESTAR UM MINIGAME'];
  for (const rel of ['tools/servidor.js', 'README.md', 'CLAUDE.md']) {
    const txt = ler(rel), achou = VELHOS.filter((v) => txt.includes(v));
    ok(!achou.length, `${rel} não cita itens de menu que não existem mais` + (achou.length ? ` (${achou.join(', ')})` : ''));
  }
  ok(ler('tools/servidor.js').includes('CHAMAR COMPARSAS') && ler('README.md').includes('ENTRAR NO PLANO'), 'servidor e README ensinam a rede com os nomes novos do menu');
}

// --- 7. nomes: apelidos, persistência e roster ---
function secaoNomes() {
  const I = TN._internal;
  ok(Array.isArray(I.APELIDOS) && I.APELIDOS.length >= 16 && I.APELIDOS.every((a) => /^[A-Z0-9 -]{1,8}$/.test(a)), 'nomes: lista de apelidos válidos');
  localStorage.setItem('turno-da-noite-nomes', JSON.stringify({ kb2: 'BRUNO' }));
  ok(I.nomePadrao('kb2', []) === 'BRUNO', 'nomes: o padrão do dispositivo vem do localStorage');
  ok(I.nomePadrao('kb2', ['BRUNO']) !== 'BRUNO', 'nomes: salvo mas já em uso → sorteia outro');
  const a = I.nomePadrao('gp0', []), b = I.nomePadrao('gp0', [a]);
  ok(I.APELIDOS.includes(a) && I.APELIDOS.includes(b) && a !== b, 'nomes: sem nome salvo, apelido sorteado sem repetir');
  I.salvarNome('kb3', 'ZECA'); ok(I.nomesSalvos().kb3 === 'ZECA', 'nomes: salvarNome persiste');
  const roster = I.buildRoster([{ device: 'kb2', nome: 'BRUNO' }, null, null, null], true);
  ok(roster[0].name === 'BRUNO' && roster.slice(1).every((r) => I.APELIDOS.includes(r.name)) && new Set(roster.map((r) => r.name)).size === 4, 'nomes: roster leva o nome escolhido e apelidos únicos para os bots');
  const g = new TN.Round(TN.minigames[TN.minigameOrder[0]], roster, 1, 1);
  ok(g.players[0].label === 'BRUNO' && g.players.every((p) => p.label && p.label.length > 0), 'nomes: o label do jogador é o nome');
  // Review Focus 3: roster sem lobby (?game= e --sessao) também tem nome
  const semLobby = I.buildRoster([{ device: 'kb1' }, null, null, null], true);
  ok(semLobby.every((r) => r.name && r.name.length > 0), 'nomes: roster montado sem lobby ganha apelidos');
}

// --- 8. roda de letras no lobby ---
function secaoRoda() {
  const I = TN._internal;
  localStorage.setItem('turno-da-noite-nomes', JSON.stringify({}));
  TN.session = null; TN.net.nomesRemotos = {};
  const lobby = new S.Lobby({}); TN.go(lobby);
  quadro({ kb1: 'a' });
  const s0 = lobby.slots[0];
  ok(s0 && s0.editando && s0.cursor === s0.nome.length && I.APELIDOS.includes(s0.nome), 'roda: entrar abre a roda com um apelido e o cursor no ✓');
  quadro({ kb1: 'a' });
  ok(!s0.editando && !s0.ready, 'roda: AÇÃO no ✓ aceita o padrão → na cela');
  quadro({ kb1: 'b' }); ok(s0.editando, 'roda: EXTRA na cela volta a editar');
  s0.nome = 'ABCDEFGH'; s0.cursor = 8;
  for (let i = 0; i < 8; i++) quadro({ kb1: 'b' });
  ok(s0.nome === '' && s0.editando && lobby.slots[0] === s0, 'roda: EXTRA apaga uma letra por toque; com 8 toques esvazia e continua na cela');
  quadro({ kb1: 'a' }); ok(s0.editando && lobby.slots[0] === s0, 'roda: nome vazio não confirma');
  quadro({ kb1: 'up' }); ok(s0.nome === 'A' && s0.cursor === 0, 'roda: ↑ no ✓ de um nome vazio acrescenta A');
  quadro({ kb1: 'up' }); ok(s0.nome === 'B', 'roda: ↑ troca a letra');
  quadro({ kb1: 'down' }); quadro({ kb1: 'down' }); ok(s0.nome === '-', 'roda: ↓ anda para trás e dá a volta no alfabeto');
  quadro({ kb1: 'right' }); ok(s0.cursor === 1, 'roda: → vai para o ✓ (posição nome.length)');
  for (let i = 0; i < 12; i++) { quadro({ kb1: 'up' }); quadro({ kb1: 'right' }); }
  ok(s0.nome.length === 8 && s0.cursor === 8, 'roda: nunca passa de 8 letras');
  quadro({ kb1: 'a' }); ok(!s0.editando && s0.nome.length === 8, 'roda: confirma com 8 letras');
  ok(I.nomesSalvos().kb1 === s0.nome, 'roda: ao confirmar, o nome fica salvo para o dispositivo');
  // Review Focus 4: espaço no fim some
  quadro({ kb1: 'b' }); s0.nome = 'BRUNO   '; s0.cursor = 8; quadro({ kb1: 'a' });
  ok(s0.nome === 'BRUNO', `roda: espaço no fim é cortado (${JSON.stringify(s0.nome)})`);
  // Review Focus 1: nome repetido
  quadro({ kb2: 'a' }); const s1 = lobby.slots[1]; s1.nome = 'BRUNO'; s1.cursor = 5; quadro({ kb2: 'a' });
  ok(s1.nome === 'BRUNO 2', `roda: nome repetido vira "BRUNO 2" (${s1.nome})`);
  quadro({ kb3: 'a' }); const s2 = lobby.slots[2]; s2.nome = 'FERRUGEM'; s2.cursor = 8; quadro({ kb3: 'a' });
  quadro({ 'n1:kb1': 'a' }); const s3 = lobby.slots[3]; s3.nome = 'FERRUGEM'; s3.cursor = 8; quadro({ 'n1:kb1': 'a' });   // (gp0 não existe no Node)
  ok(s3.nome.length <= 8 && s3.nome !== 'FERRUGEM' && s3.nome.endsWith(' 2'), `roda: repetido com 8 letras cabe em 8 (${s3.nome})`);
  // o remoto edita o próprio nome pela entrada abstrata, e a cela vazia sai com EXTRA
  quadro({ kb1: 'a' }); ok(s0.ready, 'roda: AÇÃO na cela = PRONTO');
  const l2 = new S.Lobby({}); TN.go(l2);
  quadro({ 'n1:kb1': 'a' }); quadro({ 'n1:kb1': 'up' });
  ok(l2.slots[0] && l2.slots[0].device === 'n1:kb1' && l2.slots[0].editando && l2.slots[0].nome.length > 0, 'roda: jogador remoto edita o próprio nome');
  for (let i = 0; i < 10; i++) quadro({ 'n1:kb1': 'b' });
  ok(l2.slots[0] === null, 'roda: EXTRA com o nome vazio sai da cela');
  // desenho
  const t = textos(lobby);
  ok(/BRUNO/.test(t) && /BRUNO 2/.test(t), 'roda: a cela mostra o nome');
  const l3 = new S.Lobby({}); TN.go(l3); quadro({ kb1: 'a' });
  ok(/AÇÃO ✓/.test(textos(l3)), 'roda: a cela editando mostra a dica dos botões');
}

// --- 9. menus mostram o nome, não P1 ---
function secaoMenusComNome() {
  for (const cena of ['Setup', 'Brief', 'RoundOver', 'ScoreScreen', 'Final']) {
    const t = textos(TN.cenaDeTeste(cena));
    ok(/BRUNO/.test(t) && /SOMBRA/.test(t) && !/\bP[1-4]\b/.test(t), `${cena}: mostra os nomes e nenhum P1..P4`);
  }
  TN.cenaDeTeste('Brief'); const ri = new S.RoundIntro(1); TN.go(ri);
  ok(/BRUNO/.test(textos(ri)) && !/\bP1\b/.test(textos(ri)), 'RoundIntro: lembrete usa o nome');
  const tl = textos(TN.cenaDeTeste('Lobby')).replace(/([^|]+)( \| \1)+/g, '$1');   // o giz desenha cada texto em 3 passadas
  ok(/B \| R \| U \| N \| O/.test(tl) && /SOMBRA/.test(tl) && !/undefined/.test(tl), 'Lobby (?cena=): cela editando mostra B R U N O na roda, a pronta mostra SOMBRA, nada de undefined');
  // HUD do motor: nome de 8 letras + BOT não pode invadir o placar da vaga (104 px): BOT vai numa linha própria
  const roster = TN._internal.buildRoster([null, null, null, null], true); roster[0].name = 'CHAVEIRO';
  const g = new TN.Round(TN.minigames[TN.minigameOrder[0]], roster, 1, 1), c = gravador(); g._drawHud(c);
  const ft = c.log.filter((e) => e[0] === 'fillText');
  const nome = ft.find((e) => e[1] === 'CHAVEIRO'), bot = ft.find((e) => e[1] === 'BOT');
  ok(nome && bot && !ft.some((e) => /CHAVEIRO BOT/.test(e[1])) && nome[3] !== bot[3], 'HUD: nome e BOT em linhas separadas, sem "NOME BOT" numa linha só');
}

secaoDono();
secaoGiz();
secaoCenas();
secaoTelasSemSessao();
secaoTelasDaPartida();
secaoInstrucoes();
secaoNomes();
secaoRoda();
secaoMenusComNome();
// CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
