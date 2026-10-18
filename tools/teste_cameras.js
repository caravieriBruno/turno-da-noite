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
  const m = d.mines.find((k) => !k.dead); m.x = d.caes.x - 10; m.y = 275;
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

fim([secaoMotor, secaoPisaLeve, secaoTrem]);
