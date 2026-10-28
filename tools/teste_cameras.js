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

// --- pisa leve: câmera pelas costas e cães de guarda ---
function secaoPisaLeve() {
  const def = TN.minigames.pisa_leve;
  ok(def.REVEAL === 1.4 && def.CAES_DELAY === 9 && def.CAES_VMAX >= 0.85 * def.SPEED && def.CAES_VMAX <= def.SPEED && def.curvaCaes(0) === 0.5 && def.curvaCaes(0.2) === 1 && def.CAES_PERTO === 80 && !def.drawHarvester3d, 'pisa leve: REVEAL 1,4 s, cães soltos aos 9 s, até ~1× o jogador com a curva da colheitadeira, sem colheitadeira');
  ok(/cães/i.test(def.brief.join(' ')) && !/colheitadeira/i.test(def.brief.join(' ')), 'pisa leve: o briefing fala dos cães');
  const g = rodada('pisa_leve'), d = g.data, P = g.players;
  ok(def.camera.pos[0] < d.startX && def.camera.target[0] > def.camera.pos[0] && def.camera.pos[1] >= 380 && def.camera.pos[1] < 450, 'pisa leve: câmera atrás da largada, alta o bastante para ver o fundo, olhando para a van');
  ok(d.caes && !d.caes.on && d.harv === undefined, 'pisa leve: a matilha começa presa; não há mais colheitadeira');
  const sons = {}, ganhos = []; g.sfx = (n, v) => { sons[n] = (sons[n] || 0) + 1; if (n === 'latido') ganhos.push(v === undefined ? 1 : v); };
  for (const m of d.mines) m.dead = true;   // sem minas: os jogadores do teste ficam parados onde são postos
  segundos(g, def.CAES_DELAY + 0.1);
  ok(d.caes.on && g._message && /CÃES/.test(g._message.text), `pisa leve: aos 5 s soltam os cães (${g._message && g._message.text})`);
  // latidos: mais frequentes quando a matilha está perto
  for (const p of P) { p.x = d.caes.x + 700; p.y = 275; }
  sons.latido = 0; ganhos.length = 0; segundos(g, 3); const longe = sons.latido, gLonge = Math.max(...ganhos);
  for (const p of P) { p.x = d.caes.x + 2.5 * def.CAES_VMAX + 40; p.y = 275; }   // perto, mas fora do alcance da matilha em 2,5 s
  sons.latido = 0; ganhos.length = 0; segundos(g, 2.5); const perto = sons.latido * 3 / 2.5, gPerto = Math.max(...ganhos);
  ok(longe >= 1 && perto > longe, `pisa leve: latidos aumentam ao se aproximar (longe ${longe}, perto ${perto} em 3 s)`);
  ok(gLonge < 1 && gPerto > gLonge, `pisa leve: latidos ficam mais altos ao se aproximar (ganho ${gLonge.toFixed(2)} → ${gPerto.toFixed(2)})`);
  ok(typeof TN.audio.play === 'function' && TN.audio.play.length >= 2, 'motor: TN.audio.play aceita o ganho (volume) como 2º argumento');
  // a vinheta vermelha pulsa só com um cão a menos de 80 px de alguém
  for (const p of P) p.x = d.caes.x + 200;
  const semVinheta = com3d(g, () => estilos((c) => def.drawOverlay(g, c))).some((s) => /rgba\(255,\s*(0|2\d|3\d|4\d),/.test(String(s)));
  P[0].x = d.caes.x + 60;
  const comVinheta = com3d(g, () => estilos((c) => def.drawOverlay(g, c))).some((s) => /rgba\(255,\s*(0|2\d|3\d|4\d),/.test(String(s)));
  ok(!semVinheta && comVinheta, 'pisa leve: vinheta vermelha só com cão a menos de 80 px');
  // mordida: mata no contato e marca `mordido`; a matilha estoura as minas por onde passa
  const m = d.mines[0]; m.dead = false; m.x = d.caes.x - 10; m.y = 275;
  P[1].x = d.caes.x - 2; P[1].y = 275;
  passo(g);
  ok(!P[1].alive && P[1].data.mordido === true && m.dead, `pisa leve: cão pega quem fica para trás e estoura as minas atrás (vivo ${P[1].alive}, mina ${m.dead})`);
  // 3D: dois cães sobre quem foi mordido; a matilha aparece em campo depois de solta
  const antes = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  P[1].data.mordido = false;
  const depois = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  ok(antes >= 2 && depois === 0, `pisa leve: dois cães em cima do mordido (${antes} caixas com mordido, ${depois} sem)`);
  const matilha = TN.R3.trace((r) => def.drawMatilha3d(g, r)).counts.box || 0;
  d.caes.on = false; const presa = TN.R3.trace((r) => def.drawMatilha3d(g, r)).counts.box || 0; d.caes.on = true;
  ok(matilha >= 6 * 4 && presa === 0, `pisa leve: a matilha é desenhada em campo depois de solta (${matilha} caixas; presa ${presa})`);
  ok(TN.R3.trace((r) => def.draw3d(g, r)).errs.length === 0, 'pisa leve: draw3d passa no validador');
  const t2 = textos((c) => def.draw(g, c));
  ok(!/COLHEITADEIRA/i.test(t2), 'pisa leve: 2D sem colheitadeira');
}

// --- pisa leve: controles pela câmera, gatilho das minas, pavio e matilha andando ---
function secaoPisaLeveMecanica() {
  const def = TN.minigames.pisa_leve;
  // um campo só com a mina pedida; P0 em (x, 275), os outros parados na largada
  const campo = (mx) => {
    const g = rodada('pisa_leve'), d = g.data;
    for (const m of d.mines) m.dead = true;
    let m = null;
    if (mx !== undefined) { m = d.mines[0]; Object.assign(m, { dead: false, arm: -1, x: mx, y: 275 }); }
    g.players.forEach((p, i) => { p.y = 120 + i * 20; });
    return { g, d, m, P: g.players };
  };
  // controles: CIMA leva para a van (+x), DIREITA anda de lado na tela (+z = +y); o bot converte de volta
  {
    const { g, P } = campo();
    P[0].x = 300; P[0].y = 275;
    aperta(0, { y: -1 }); segundos(g, 0.5); solta();
    const dx = P[0].x - 300, dy = P[0].y - 275;
    ok(dx > 40 && Math.abs(dy) < 1, `pisa leve: CIMA avança rumo à van (dx ${dx.toFixed(1)}, dy ${dy.toFixed(1)})`);
    const x1 = P[0].x;
    aperta(0, { x: 1 }); segundos(g, 0.3); solta();
    ok(P[0].y - 275 > 20 && Math.abs(P[0].x - x1) < 1, `pisa leve: DIREITA anda de lado (dy ${(P[0].y - 275).toFixed(1)}, dx ${(P[0].x - x1).toFixed(1)})`);
    aperta(0, { x: 1 }); segundos(g, 0.3); solta();
    const inv = def.paraInput(1, 0), w = def.paraMundo(inv);
    ok(Math.abs(inv.x) < 1e-9 && inv.y === -1 && Math.abs(w.x - 1) < 1e-9 && Math.abs(w.y) < 1e-9, `pisa leve: bot quer +x → input CIMA (${inv.x.toFixed(2)}, ${inv.y})`);
  }
  // correndo por cima: o trecho do quadro conta, mesmo num quadro longo que salta a mina inteira
  {
    const { g, m, P } = campo(400);
    P[0].x = 384; P[0].y = 275;
    const sons = {}; g.sfx = (n) => { sons[n] = (sons[n] || 0) + 1; };
    aperta(0, { y: -1 }); passo(g, 0.45); solta();
    ok(P[0].x > 400 + def.TRIG && m.arm >= 0 && !m.dead && sons.tick >= 1, `pisa leve: correndo por cima (384 → ${P[0].x.toFixed(0)} num quadro) a mina arma e apita (arm ${m.arm})`);
  }
  {
    const { g, m, P } = campo(400);
    P[0].x = 300; P[0].y = 275;
    aperta(0, { y: -1 });
    let armouEm = null, explodiuEm = null;
    for (let t = 0; t < 3 && explodiuEm === null; t += 1 / 60) {
      passo(g);
      if (armouEm === null && m.arm >= 0) armouEm = g.time;
      if (m.dead) explodiuEm = g.time;
    }
    solta();
    ok(armouEm !== null && explodiuEm !== null, `pisa leve: passando correndo a mina detona (armou ${armouEm && armouEm.toFixed(2)}, explodiu ${explodiuEm && explodiuEm.toFixed(2)})`);
    ok(P[0].data.lives === def.LIVES - 1, `pisa leve: quem passou correndo reto por cima é pego pela explosão (vidas ${P[0].data.lives})`);
  }
  // parado em cima: arma na hora, mas só explode depois do pavio; a explosão derruba
  {
    const { g, m, P } = campo(400);
    P[0].x = 385; P[0].y = 275;
    passo(g);
    const armou = m.arm >= 0 && !m.dead;
    segundos(g, def.FUSE * 0.5);
    const meio = !m.dead && P[0].data.lives === def.LIVES;
    segundos(g, def.FUSE * 0.5 + 0.05);
    ok(armou && meio && m.dead, `pisa leve: pisou arma; explode só depois do pavio de ${def.FUSE} s (armou ${armou}, inteira na metade ${meio}, explodiu ${m.dead})`);
    ok(P[0].data.lives === def.LIVES - 1 && P[0].tombo > 0 && P[0].x < 385, `pisa leve: a explosão fere e derruba para longe (vidas ${P[0].data.lives}, tombo ${P[0].tombo.toFixed(2)}, x ${P[0].x.toFixed(0)})`);
  }
  // armada continua armada (sair de cima não desarma); quem está fora do raio não se fere
  {
    const { g, m, P } = campo(400);
    P[0].x = 385; P[0].y = 275; P[1].x = 400 + def.BLAST + 30; P[1].y = 275;
    passo(g);
    aperta(0, { y: 1 }); segundos(g, def.FUSE + 0.1); solta();
    ok(m.dead && P[1].data.lives === def.LIVES, `pisa leve: saiu de cima e a mina explodiu mesmo assim; quem está fora do raio sai ileso (mina ${m.dead ? 'explodiu' : 'inteira'}, vidas ${P[1].data.lives})`);
  }
  // cães: soltos andam de verdade (até ~1× o jogador), estouram minas no caminho sem ferir quem está longe
  {
    const { g, d, P } = campo();
    for (const p of P) p.x = 900;
    segundos(g, def.CAES_DELAY + 0.1);
    const x0 = d.caes.x; segundos(g, 2); const v = (d.caes.x - x0) / 2;
    ok(d.caes.on && v > 0.4 * def.SPEED && v <= def.SPEED, `pisa leve: os cães existem e correm (${v.toFixed(0)} px/s)`);
    const m = d.mines[0]; Object.assign(m, { dead: false, arm: -1, x: d.caes.x + 8, y: 275 });
    passo(g);
    ok(m.dead && P.every((p) => p.data.lives === def.LIVES), 'pisa leve: a matilha estoura as minas por onde passa');
  }
}

// --- hora do trem: trem vindo do fundo, nichos nas paredes laterais ---
function secaoTrem() {
  const def = TN.minigames.hora_do_trem;
  ok(def.Y0 === -50 && def.Y1 === 420 && def.HALF === 150, 'trem: túnel em y de -50 a 420, 150 de meia largura');
  ok(def.camera.pos[2] > def.Y1 && def.camera.target[2] < def.camera.pos[2] && Math.abs(def.camera.pos[0] - 480) < 1, 'trem: câmera atrás do fim do túnel, olhando para o fundo');
  const g = rodada('hora_do_trem'), d = g.data, P = g.players;
  ok(d.floorL === 330 && d.floorR === 630 && d.nooks.length === 8 && d.nooks.filter((n) => n.side < 0).length === 4, 'trem: paredes em x=330/630, 4 nichos de cada lado');
  const cys = d.nooks.map((n) => n.cy);
  ok(Math.min(...cys) > def.Y0 && Math.max(...cys) < def.Y1 && Math.max(...cys) - Math.min(...cys) >= 300, 'trem: nichos distribuídos em profundidade');
  ok(P.every((p) => p.x > d.floorL && p.x < d.floorR && p.y > def.Y0 && p.y < def.Y1), 'trem: todos começam no chão do túnel');
  // nookOf / isSafeIn nas paredes laterais
  const n = d.nooks.find((k) => k.side < 0), p = P[0];
  p.x = d.floorL - 20; p.y = n.cy;
  ok(def.nookOf(g, p) === n && def.isSafeIn(g, p, n), 'trem: dentro do nicho da esquerda, fundo o bastante');
  p.x = d.floorL + 30;
  ok(def.nookOf(g, p) === null, 'trem: no chão não está em nicho');
  // parede: empurrando para a esquerda fora de um nicho, fica no chão
  p.x = d.floorL + p.r + 1; p.y = (d.nooks[0].cy + d.nooks[2].cy) / 2;   // entre dois nichos da esquerda (56 px de cada centro, fora das colunas de 54)
  aperta(0, { x: -1 }); passo(g, 1 / 60, 30); solta();
  ok(p.x >= d.floorL + p.r - 0.5, `trem: a parede segura quem empurra fora do nicho (x ${p.x.toFixed(1)})`);
  // trem: pega quem está no chão dentro do comboio e poupa quem está num nicho aberto
  const h = rodada('hora_do_trem'), e = h.data, Q = h.players;
  const aberto = e.nooks.find((k) => k.side > 0); aberto.state = 'open';
  Q[0].x = 480; Q[0].y = 300; Q[1].x = e.floorR + 20; Q[1].y = aberto.cy; Q[2].x = 480; Q[2].y = 500; Q[3].x = 400; Q[3].y = 500;   // Q2/Q3 à frente do trem (front 320)
  e.phase = 'warn'; e.phaseT = 1.5; e.opened = true; e.train = { front: 320 };
  passo(h);
  ok(!Q[0].alive && Q[1].alive && Q[2].alive && Q[3].alive, `trem: atropela no chão (Q0 ${Q[0].alive}), poupa o nicho aberto (Q1 ${Q[1].alive}) e quem está à frente do comboio (Q2 ${Q[2].alive})`);
  // o trem some da lógica ao passar do fim e continua visível (d.saida) até sair de trás da câmera
  e.train.front = def.Y1 + def.TRAIN_LEN + 30; passo(h);
  ok(!e.train && e.saida && e.phase === 'closing', 'trem: passou → fase closing e sobra só o comboio visual');
  segundos(h, 1.6);
  ok(!e.saida, 'trem: o comboio visual some depois de passar da câmera');
  ok(TN.R3.trace((r) => def.draw3d(h, r)).errs.length === 0, 'trem: draw3d passa no validador');
  const nicho = TN.R3.trace((r) => def.drawNook3d(h, r, aberto)).calls;
  ok(nicho.some(([k, a]) => k === 'box' && a[4] >= 80 && a[7] && a[7].glow), 'trem: o estado do nicho aparece num marcador alto e brilhante na boca (visível de frente)');
  ok(def.camera.pos[2] <= 820, `trem: câmera perto o bastante para ler os nichos (z ${def.camera.pos[2]})`);
  const t3 = com3d(h, () => textos((c) => def.drawOverlay(h, c)));
  ok(/NICHOS ABERTOS|PRÓXIMO TREM/.test(t3), `trem: overlay mostra o estado (${t3.slice(0, 40)})`);
}

// --- temporada de caça: todos fogem; o atirador da torre é um NPC com mira a laser contínua ---
function secaoTemporada() {
  const def = TN.minigames.temporada_de_caca;
  ok(def.VIDA === 2 && def.FERIDO === 0.75 && def.rounds === 2 && def.fixedRounds === true && !def.roundsPerPlayer && def.scoring === 'points' && !def.viewports && !def.screenSpace, 'temporada: 2 de vida, ferido a 75 %, 2 rodadas fixas (sem roundsPerPlayer), pontos, uma vista só');
  ok(def.START_Y - def.WALL_Y >= 1500 && def.MAX_TIME >= 60, `temporada: vala comprida (${def.START_Y - def.WALL_Y}) e relógio que acompanha (${def.MAX_TIME} s)`);
  ok(/laser/i.test(def.brief.join(' ')) && /EXTRA/.test(def.brief.join(' ')) && !/AÇÃO|guarda/i.test(def.brief.join(' ')) && !def.controls.a, 'temporada: textos sem guarda jogador; EXTRA mergulha/abaixa e AÇÃO não é usada');
  const g = rodada('temporada_de_caca'), d = g.data, at = d.at, P = g.players;
  ok(P.every((p) => p.y === def.START_Y && p.data.vida === 2 && !p.data.out) && def.fugitivos(g).length === 4 && !def.guarda, 'temporada: os 4 são fugitivos, na largada, com 2 de vida');
  // nos primeiros 2 s o laser varre a largada sem travar; anda suave (no máximo MIRA_V px/s)
  let passoMax = 0, andou = 0, x0 = at.x, y0 = at.y;
  for (let i = 0; i < Math.round(def.INICIO * 60) - 2; i++) { passo(g); const s = Math.hypot(at.x - x0, at.y - y0); passoMax = Math.max(passoMax, s); andou += s; x0 = at.x; y0 = at.y; }
  ok(at.tiros === 0 && at.trava === 0 && andou > 50 && passoMax <= def.MIRA_V / 60 + 0.01, `temporada: laser contínuo, anda suave (passo máx. ${passoMax.toFixed(2)} px/quadro) e não atira antes de ${def.INICIO} s`);
  // tiro instantâneo depois de travar: só P1 na vala, parado no aberto
  const ESP = def.ESPALHA; def.ESPALHA = 0;
  try {
    d.covers = []; for (const p of P.slice(1)) p.data.out = true;
    P[0].x = 480; P[0].y = 1500;
    let inicioTrava = null, tiro1 = null, tiro2 = null, vidaNoTiro = null;
    for (let i = 0; i < 60 * 10 && tiro2 === null; i++) {
      passo(g);
      if (at.tiros === 1 && tiro1 === null) { tiro1 = g.time; vidaNoTiro = P[0].data.vida; continue; }
      if (at.tiros === 2) { tiro2 = g.time; continue; }
      if (tiro1 === null && at.trava > 0 && inicioTrava === null) inicioTrava = g.time - 1 / 60;
      if (tiro1 === null && at.trava === 0) inicioTrava = null;
    }
    ok(tiro1 !== null && vidaNoTiro === 1 && tiro1 - inicioTrava >= def.TRAVA[0] - 0.02, `temporada: o laser fica ${tiro1 && (tiro1 - inicioTrava).toFixed(2)} s em cima antes do tiro, e o tiro acerta no mesmo quadro (hitscan)`);
    ok(tiro2 !== null && tiro2 - tiro1 >= def.RECARGA - 0.02 && !P[0].alive && P[0].data.baleado && P[0].score === 0, `temporada: recarga de ${(tiro2 - tiro1).toFixed(2)} s entre tiros; o 2º tiro mata e morrer não dá ponto`);
  } finally { def.ESPALHA = ESP; }
  // ferido corre a 75 %
  const h = rodada('temporada_de_caca');
  h.data.covers = []; h.players[0].data.vida = 1; h.players[0].x = 300; h.players[0].y = 1600; h.players[1].x = 300; h.players[1].y = 1700;   // longe dos outros (o separate não atrapalha)
  const xa = h.players[0].x, xb = h.players[1].x; aperta(0, { x: 1 }); aperta(1, { x: 1 }); passo(h, 1 / 60, 30); solta();
  const va = (h.players[0].x - xa) * 2, vb = (h.players[1].x - xb) * 2;
  ok(Math.abs(va - def.RUN_SPEED * def.FERIDO) < 3 && Math.abs(vb - def.RUN_SPEED) < 3, `temporada: ferido corre a ${va.toFixed(0)} px/s, inteiro a ${vb.toFixed(0)}`);
  // EXTRA: mergulho rápido, tira o alvo da mira e tem recarga
  const m = rodada('temporada_de_caca'), mp = m.players[2]; m.data.covers = [];
  m.data.at.alvo = mp.id; m.data.at.trava = 0.3; const mx0 = mp.x;
  aperta(2, { b: true, x: 1 }); passo(m, 1 / 60, 6);
  ok(mp.data.mergulho > 0 && mp.data.agachado && mp.x - mx0 > def.RUN_SPEED * 6 / 60 * 1.5 && m.data.at.trava < 0.1, `temporada: EXTRA mergulha de lado (${(mp.x - mx0).toFixed(0)} px em 0,1 s) e zera a trava do atirador`);
  solta(); passo(m); aperta(2, { b: true }); passo(m); solta();
  ok(mp.data.mergCd > 0 && mp.data.mergulho < def.MERGULHO - 0.05, 'temporada: o mergulho tem recarga');
  // cobertura: abaixado do lado da largada some; de pé ainda leva; abaixado no aberto tem caixa menor
  const c = rodada('temporada_de_caca'), cp = c.players[0];
  c.data.covers = [{ kind: 'caixote', x: 480, y: 1400, w: 70, d: 40, h: 60 }];
  cp.x = 480; cp.y = 1434; cp.data.agachado = true;
  ok(def.protegido(c, cp) && def.alvoNoPonto(c, 480, 1434) === null, 'temporada: abaixado atrás da cobertura (entre ele e a torre) não é alvo');
  cp.data.agachado = false;
  ok(!def.protegido(c, cp) && def.alvoNoPonto(c, 480, 1434) === cp, 'temporada: de pé atrás da cobertura ainda é alvo');
  cp.y = 1366; cp.data.agachado = true;
  ok(!def.protegido(c, cp), 'temporada: do lado da torre a cobertura não protege');
  cp.x = 300; cp.y = 1700;
  ok(def.alvoNoPonto(c, 314, 1700) === null && (cp.data.agachado = false, def.alvoNoPonto(c, 314, 1700) === cp), 'temporada: abaixado no aberto, 14 px ao lado escapa; de pé, acerta');
  // saída: +2, e o primeiro ganha +1; acaba quando todos saíram
  const e = rodada('temporada_de_caca'), E = e.players; e.data.covers = [];
  E[0].data.out = true; E[1].data.out = true; E[2].y = def.WALL_Y + 2; E[3].y = def.WALL_Y + 2;
  aperta(2, { y: -1 }); aperta(3, { y: -1 }); passo(e, 1 / 60, 10); solta();
  ok(E[2].data.escapou && E[3].data.escapou && E[2].score + E[3].score === 2 * def.ESCAPOU + def.PRIMEIRO && Math.max(E[2].score, E[3].score) === def.ESCAPOU + def.PRIMEIRO, `temporada: escapar dá ${def.ESCAPOU}, o primeiro ganha +${def.PRIMEIRO} (${E[2].score} + ${E[3].score})`);
  segundos(e, 2);
  ok(e.finished, 'temporada: todos fora → acabou');
  // humanos parados: o atirador acaba com eles (ou o relógio encerra)
  const q = rodada('temporada_de_caca'); segundos(q, def.MAX_TIME + 2);
  ok(q.finished && q.players.every((p) => p.score === 0 && !p.data.escapou), 'temporada: com todos parados a rodada termina sozinha e ninguém pontua');
  // bots: em média 40 a 60 % escapam (margem larga para 30 rodadas)
  let esc = 0, tot = 0, fins = 0;
  for (let r = 0; r < 30; r++) { const z = rodada('temporada_de_caca', { humanos: 0 }); segundos(z, def.MAX_TIME + 2); if (z.finished) fins++; for (const p of z.players) { tot++; if (p.data.escapou) esc++; } }
  ok(fins === 30 && esc / tot > 0.3 && esc / tot < 0.72, `temporada: 30 rodadas de bots terminam; ${(100 * esc / tot).toFixed(0)} % escaparam`);
  // câmera acompanha o grupo
  const z = rodada('temporada_de_caca', { humanos: 0 }); const cam0 = def.cameraDe(z); segundos(z, 10);
  const cam1 = def.cameraDe(z);
  ok(cam1.pos[2] < cam0.pos[2] - 200 && cam1.target[2] < cam1.pos[2], `temporada: a câmera acompanha a fuga (z ${cam0.pos[2].toFixed(0)} → ${cam1.pos[2].toFixed(0)})`);
  // 3D: laser sempre visível (feixe da torre até o chão), anel de trava só travando, atirador atrás da saída
  ok(TN.R3.trace((r) => def.draw3d(z, r)).errs.length === 0, 'temporada: draw3d passa no validador');
  z.data.at.trava = 0;
  const tr0 = TN.R3.trace((r) => def.draw3d(z, r));
  z.data.at.trava = z.data.at.travaMax * 0.6;
  const tr1 = TN.R3.trace((r) => def.draw3d(z, r));
  const feixe = tr0.calls.find(([k, a]) => k === 'beam' && a[7] === '#ff2020');
  ok(feixe && feixe[1][1] > 200 && Math.abs(feixe[1][3] - z.data.at.x) < 0.01 && Math.abs(feixe[1][5] - z.data.at.y) < 0.01, 'temporada 3D: feixe vermelho contínuo da torre até o ponto mirado, mesmo sem travar');
  ok((tr1.counts.ring || 0) > (tr0.counts.ring || 0), 'temporada 3D: o anel da trava só aparece quando o laser está travando');
  ok(z.data.covers.length >= 18 && z.data.covers.every((cv) => ['caixote', 'barril', 'terra'].includes(cv.kind)) && Math.min(...z.data.covers.map((cv) => cv.y)) < 400 && Math.max(...z.data.covers.map((cv) => cv.y)) > def.START_Y - 300, `temporada 3D: ${z.data.covers.length} coberturas (caixote, barril, terra) pela vala inteira`);
  const torre = tr0.calls.find(([k, a]) => k === 'character' && a[1] && a[1].key === 'atirador');
  ok(torre && torre[1][0].y < def.WALL_Y, 'temporada 3D: o atirador fica na torre, atrás da saída');
  const t3 = com3d(z, () => textos((cc) => def.drawOverlay(z, cc)));
  ok(/SAÍDA/.test(t3) && /EXTRA/.test(t3), 'temporada: overlay tem a régua da fuga e a dica');
  ok(/ATIRADOR/.test(textos((cc) => def.draw(z, cc))), 'temporada: 2D desenha');
}

// --- serviço interno: tela dividida (uma câmera seguindo cada jogador) e o breu por vista ---
function secaoServicoInterno() {
  const def = TN.minigames.servico_interno, g = rodada('servico_interno'), d = g.data, P = g.players;
  const vp = def.viewports(g);
  ok(vp.length === 4 && vp.every((v) => v.rect[2] === 480 && v.rect[1] >= 34), 'serviço interno: 4 jogadores → 4 quadros abaixo do HUD');
  ok(vp.every((v, i) => Math.abs(v.camera.target[0] - P[i].x) < 1 && Math.abs(v.camera.target[2] - P[i].y) < 20 && v.camera.pos[2] > v.camera.target[2]), 'serviço interno: cada quadro segue o seu jogador, de cima e um pouco atrás');
  P[0].x = 1400; P[0].y = 900; passo(g);
  ok(Math.abs(def.viewports(g)[0].camera.target[0] - P[0].x) < 1, 'serviço interno: a câmera acompanha quando o jogador anda');
  const g3 = { ...g, players: P.slice(0, 3), data: d }, v3 = def.viewports(g3);
  ok(v3.length === 4 && v3[3].camera === def.camGeral, 'serviço interno: com 3, o quarto quadro mostra o pavilhão inteiro');
  const v2 = def.viewports({ ...g, players: P.slice(0, 2), data: d });
  ok(v2.length === 2 && v2.every((v) => v.rect[2] === 960), 'serviço interno: com 2, tela dividida em faixas');
  ok(TN.R3.validate(g).length === 0, `serviço interno: 3D e vistas válidos com luz (${TN.R3.validate(g)})`);
  def.foundSyringe(g, P[0]); segundos(g, 3.1);
  ok(d.phase === 'hunt' && TN.R3.validate(g).length === 0, 'serviço interno: 3D e vistas válidos no escuro');
  // breu por vista: o nome de quem está escondido não aparece em vista nenhuma; o de quem acendeu aparece
  P[0].x = 300; P[0].y = 260; P[1].x = 1500; P[1].y = 900; P[2].x = 1500; P[2].y = 260; P[3].x = 300; P[3].y = 900;
  for (const p of P) p.data.lant = false;
  P[2].data.lant = true;
  const av = TN.R3.available; TN.R3.available = true;
  let t;
  try { t = com3d(g, () => textos((c) => def.drawOverlay(g, c))); } finally { TN.R3.available = av; }
  const vezes = textos((c) => TN.draw.text(c, 'X', 0, 0, {})).split(' | ').length;   // fillText por D.text (sombra)
  const conta = (s) => t.split(' | ').filter((x) => x === s).length / vezes;
  ok(conta(P[2].label) === 4 && conta(P[1].label) === 1, `serviço interno: lanterna acesa aparece nas 4 vistas; apagada, só na própria (${conta(P[2].label)}/${conta(P[1].label)})`);
  ok(/VOCÊ TEM A SERINGA/.test(t) && /NO ESCURO/.test(t) && /LANTERNA ACESA/.test(t), 'serviço interno: cada vista diz o estado da lanterna e só o portador sabe que tem a seringa');
  ok(/ESCURO/.test(textos((c) => def.draw(g, c))), 'serviço interno: 2D de reserva desenha o pavilhão no escuro');
}

fim([secaoMotor, secaoPisaLeve, secaoPisaLeveMecanica, secaoTrem, secaoTemporada, secaoServicoInterno]);
