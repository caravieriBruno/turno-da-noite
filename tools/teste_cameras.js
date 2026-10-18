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
  ok(def.REVEAL === 1.4 && def.CAES_DELAY === 5 && def.CAES_V0 === 16 && def.CAES_V1 === 56 && def.CAES_PERTO === 80 && !def.drawHarvester3d, 'pisa leve: REVEAL 1,4 s, cães com a curva da colheitadeira, sem colheitadeira');
  ok(/cães/i.test(def.brief.join(' ')) && !/colheitadeira/i.test(def.brief.join(' ')), 'pisa leve: o briefing fala dos cães');
  const g = rodada('pisa_leve'), d = g.data, P = g.players;
  ok(def.camera.pos[0] < d.startX && def.camera.target[0] > def.camera.pos[0] && def.camera.pos[1] < 300, 'pisa leve: câmera atrás da largada, baixa, olhando para a van');
  ok(d.caes && !d.caes.on && d.harv === undefined, 'pisa leve: a matilha começa presa; não há mais colheitadeira');
  const sons = {}; g.sfx = (n) => { sons[n] = (sons[n] || 0) + 1; };
  for (const m of d.mines) m.dead = true;   // sem minas: os jogadores do teste ficam parados onde são postos
  segundos(g, def.CAES_DELAY + 0.1);
  ok(d.caes.on && g._message && /CÃES/.test(g._message.text), `pisa leve: aos 5 s soltam os cães (${g._message && g._message.text})`);
  // latidos: mais frequentes quando a matilha está perto
  for (const p of P) { p.x = d.caes.x + 400; p.y = 275; }
  sons.latido = 0; segundos(g, 3); const longe = sons.latido;
  for (const p of P) { p.x = d.caes.x + 130; p.y = 275; }   // perto, mas fora do alcance da matilha nos 3 s (anda até 56 px/s)
  sons.latido = 0; segundos(g, 3); const perto = sons.latido;
  ok(longe >= 1 && perto > longe, `pisa leve: latidos aumentam ao se aproximar (longe ${longe}, perto ${perto} em 3 s)`);
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
  // 3D: a matilha não é desenhada; os cães aparecem só sobre quem foi mordido
  const antes = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  P[1].data.mordido = false;
  const depois = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  ok(antes >= 2 && depois === 0, `pisa leve: cães só em cima do mordido (${antes} caixas com mordido, ${depois} sem)`);
  ok(TN.R3.trace((r) => def.draw3d(g, r)).errs.length === 0, 'pisa leve: draw3d passa no validador');
  const t2 = textos((c) => def.draw(g, c));
  ok(!/COLHEITADEIRA/i.test(t2), 'pisa leve: 2D sem colheitadeira');
}

// --- hora do trem: trem vindo do fundo, nichos nas paredes laterais ---
function secaoTrem() {
  const def = TN.minigames.hora_do_trem;
  ok(def.Y0 === -200 && def.Y1 === 540 && def.HALF === 150, 'trem: túnel em y de -200 a 540, 150 de meia largura');
  ok(def.camera.pos[2] > def.Y1 && def.camera.target[2] < def.camera.pos[2] && Math.abs(def.camera.pos[0] - 480) < 1, 'trem: câmera atrás do fim do túnel, olhando para o fundo');
  const g = rodada('hora_do_trem'), d = g.data, P = g.players;
  ok(d.floorL === 330 && d.floorR === 630 && d.nooks.length === 12 && d.nooks.filter((n) => n.side < 0).length === 6, 'trem: paredes em x=330/630, 6 nichos de cada lado');
  const cys = d.nooks.map((n) => n.cy);
  ok(Math.min(...cys) > def.Y0 && Math.max(...cys) < def.Y1 && Math.max(...cys) - Math.min(...cys) > 500, 'trem: nichos distribuídos em profundidade');
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
  const t3 = com3d(h, () => textos((c) => def.drawOverlay(h, c)));
  ok(/NICHOS ABERTOS|PRÓXIMO TREM/.test(t3), `trem: overlay mostra o estado (${t3.slice(0, 40)})`);
}

// --- temporada de caça: guarda em cima, fugitivos embaixo ---
function secaoTemporada() {
  const def = TN.minigames.temporada_de_caca;
  ok(def.LASER === 0.5 && def.RECARGA === 1.5 && def.AIM_LOCK === 2 && def.MAX_TIME === 40 && def.MERGULHO === 0.5 && def.rounds === 4 && def.fixedRounds === true && !def.screenSpace, 'temporada: constantes da spec, 4 rodadas fixas, coordenadas de mundo');
  ok(def.tagline === 'O guarda da torre tem uma bala para cada um.' && /muro/.test(def.brief[0]) && /EXTRA/.test(def.brief[1]) && /AÇÃO/.test(def.brief[2]), 'temporada: textos novos');
  const g = rodada('temporada_de_caca'), d = g.data, G = def.guarda(g), F = def.fugitivos(g);
  ok(G === g.players[0] && F.length === 3 && F.every((p) => p.y === def.START_Y && !p.data.out), 'temporada: rodada 1 → P1 é o guarda; fugitivos na largada');
  const vp = def.viewports(g);
  ok(vp.length === 2 && vp[0].rect[1] === 34 && vp[0].rect[3] === 228 && vp[1].rect[1] === 262 && vp[1].rect[1] + vp[1].rect[3] === 540 && TN.R3.validate(g).length === 0, 'temporada: duas vistas empilhadas (45 % / 55 %) válidas');
  ok(vp[0].camera.fov === 30 && (d.zoom = true, def.viewports(g)[0].camera.fov === 14) && (d.zoom = false, true), 'temporada: zoom fecha a luneta (fov 30 → 14)');
  // mira travada nos 2 s iniciais
  const m0 = { ...d.mira }; aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(d.mira.x === m0.x, 'temporada: mira travada na largada');
  segundos(g, def.AIM_LOCK); aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(d.mira.x > m0.x, 'temporada: depois de 2 s a mira anda');
  // laser 0,5 s antes do tiro; acerta quem está de pé na mira; recarga 1,5 s
  const alvo = F[0]; alvo.x = 480; alvo.y = 500; d.mira = { x: 482, y: 505 };
  aperta(0, { a: true }); passo(g); solta();
  ok(d.tiro && d.tiro.t > 0.45 && alvo.alive, 'temporada: AÇÃO acende o laser e ainda não atira');
  aperta(0, { x: 1 }); const mx = d.mira.x; passo(g); solta();
  ok(d.mira.x - mx > 0 && d.mira.x - mx < def.AIM_SPEED * 0.5 / 60 + 0.01, 'temporada: com o laser aceso a mira anda a 40 %');
  d.mira = { x: 482, y: 505 }; segundos(g, def.LASER);
  ok(!alvo.alive && alvo.data.baleado && G.score === 1 && !d.tiro && d.recarga > 1.3, `temporada: tiro sai depois de 0,5 s (vivo ${alvo.alive}, guarda ${G.score}, recarga ${d.recarga.toFixed(2)})`);
  aperta(0, { a: true }); passo(g); solta();
  ok(!d.tiro, 'temporada: AÇÃO na recarga não acende outro laser');
  segundos(g, def.RECARGA);
  // agachado atrás de cobertura: invisível; de pé atrás: alvo; agachado no aberto: caixa menor
  const cv = d.covers[0], f1 = F[1]; f1.x = cv.x; f1.y = cv.y - 20; d.mira = { x: f1.x, y: f1.y };
  f1.data.agachado = true;
  ok(def.protegido(g, f1) && def.alvoNaMira(g) === null, 'temporada: agachado atrás da cobertura não é alvo');
  f1.data.agachado = false;
  ok(!def.protegido(g, f1) && def.alvoNaMira(g) === f1, 'temporada: de pé atrás da cobertura ainda é alvo');
  f1.x = 300; f1.y = 400; f1.data.agachado = true; d.mira = { x: 300 + 14, y: 400 };
  ok(def.alvoNaMira(g) === null, 'temporada: agachado no aberto tem caixa menor (14 px ao lado escapa)');
  f1.data.agachado = false;
  ok(def.alvoNaMira(g) === f1, 'temporada: de pé, 14 px ao lado ainda acerta');
  // EXTRA: mergulho de 0,5 s sem andar
  aperta(2, { b: true, x: 1 }); passo(g, 1 / 60, 6); solta();   // f1 = F[1] = players[2] → dispositivo 2
  ok(f1.data.mergulho > 0 && f1.data.agachado && f1.x === 300, 'temporada: EXTRA mergulha (0,5 s parado)');
  // chegar ao muro: +1 e +1 para o primeiro; fim quando todos saíram
  const f2 = F[2]; f2.y = def.WALL_Y + 2; f1.data.mergulho = 0; f1.y = def.WALL_Y + 2;
  aperta(2, { y: -1 }); aperta(3, { y: -1 }); passo(g, 1 / 60, 10); solta();
  ok(f1.data.escapou && f2.data.escapou && f1.score + f2.score === 3, `temporada: dois escaparam, um deles com o bônus de primeiro (${f1.score} + ${f2.score})`);
  segundos(g, 2);
  ok(g.finished && G.score === 1, 'temporada: todos fora → acabou; guarda sem o bônus porque alguém escapou');
  // ninguém escapou → +1 para o guarda; e o relógio de 40 s encerra sozinho com humanos parados
  const h = rodada('temporada_de_caca'); segundos(h, def.MAX_TIME + 2);
  ok(h.finished && def.guarda(h).score === 1, 'temporada: 40 s com todos parados → acaba e o guarda ganha o bônus de ninguém ter escapado');
  // bots: em 6 rodadas alguém é baleado e alguém escapa
  let baleados = 0, escapados = 0;
  for (let r = 0; r < 6; r++) { const z = rodada('temporada_de_caca', { humanos: 0, rodadaN: 1 + (r % 4), total: 4 }); segundos(z, def.MAX_TIME + 2); ok(z.finished, `temporada: rodada ${r + 1} com bots termina`); for (const p of def.fugitivos(z)) { if (p.data.baleado) baleados++; if (p.data.escapou) escapados++; } }
  ok(baleados >= 1 && escapados >= 1, `temporada: bots → ${baleados} baleados e ${escapados} escapados em 6 rodadas`);
  // 3D e 2D passam; a mira só aparece na vista do guarda (overlay com vista 0)
  const z = rodada('temporada_de_caca', { humanos: 0 }); segundos(z, 3);
  ok(TN.R3.trace((r) => def.draw3d(z, r)).errs.length === 0, 'temporada: draw3d passa no validador');
  const t3 = com3d(z, () => textos((c) => def.drawOverlay(z, c)));
  ok(/GUARDA/.test(t3) && /MURO|EXTRA/.test(t3), `temporada: overlay tem o painel do guarda e a dica dos fugitivos`);
  ok(/GUARDA/.test(textos((c) => def.draw(z, c))), 'temporada: 2D desenha');
  // 3D: coberturas de 3 tipos, ponto do laser só com tiro, torre atrás das câmeras
  z.data.tiro = null;   // o guarda bot pode estar com o laser aceso aos 3 s
  const tr0 = TN.R3.trace((r) => def.draw3d(z, r));
  z.data.tiro = { t: 0.4 };
  const tr1 = TN.R3.trace((r) => def.draw3d(z, r));
  ok((tr1.counts.sphere || 0) > (tr0.counts.sphere || 0), 'temporada 3D: o ponto do laser só aparece com o tiro travado');
  ok(z.data.covers.every((cv) => ['caixote', 'barril', 'terra'].includes(cv.kind)), 'temporada 3D: coberturas são caixote, barril ou monte de terra');
  const torre = tr1.calls.find(([k, a]) => k === 'character' && a[1] && a[1].key === 'guarda');
  ok(torre && torre[1][0].y > def.viewports(z)[0].camera.pos[2], 'temporada 3D: o guarda fica na torre atrás das duas câmeras (fora de vista)');
}

fim([secaoMotor, secaoPisaLeve, secaoTrem, secaoTemporada]);
