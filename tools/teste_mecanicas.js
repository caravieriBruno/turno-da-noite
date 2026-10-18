#!/usr/bin/env node
// Testa as mecânicas novas sem navegador (spec docs/superpowers/specs/2026-10-18-mecanicas-minigames-design.md).
// Uso: node tools/teste_mecanicas.js
const { rodada, aperta, solta, passo, segundos, gravador, textos, ok, fim } = require('./_harness.js');
// finge o 3D para os HUDs que só desenham com WebGL
function com3d(g, fn) { const u = g.uses3d, pr = TN.R3.project; g.uses3d = () => true; TN.R3.project = (x, y, z) => ({ x: 480 + (x - 480) * 0.8, y: 300 + (z - 270) * 0.6, visible: true }); try { return fn(); } finally { g.uses3d = u; TN.R3.project = pr; } }

// --- pular corda: laser alto e agachar ---
function secaoPularCorda() {
  const def = TN.minigames.pular_corda;
  ok(def.ALTO_AT === 12 && def.ALTO_Y === 34 && def.CROUCH === 0.45 && def.CROUCH_SPEED === 70 && def.CROUCH_CD === 0.25 && def.controls.b === 'agachar', 'corda: constantes do laser alto e do agachar');
  const g = rodada('pular_corda'), d = g.data, P = g.players;
  segundos(g, 0.7);   // antes de o laser começar a cortar (0,8 s)
  ok(!d.alto, 'corda: o laser alto ainda não existe no começo');
  // EXTRA agacha, e agachado não pula
  aperta(1, { b: true }); passo(g); solta();
  ok(P[1].data.crouch > 0 && P[1].data.crouch <= def.CROUCH, 'corda: EXTRA agacha por 0,45 s');
  aperta(1, { a: true }); passo(g); solta();
  ok(P[1].data.air <= 0, 'corda: agachado não pula');
  segundos(g, 0.5);
  ok(P[1].data.crouch <= 0 && P[1].data.crouchCd > 0, 'corda: depois de agachar há 0,25 s de recarga');
  // colisões: 4 jogadores no mesmo ângulo (0 rad), raio 120; um braço alto parado sobre eles
  for (const p of P) { p.x = def.CX + 120; p.y = def.CY; p.data.air = 0; p.data.crouch = 0; p.data.cd = 0; }
  P[1].data.crouch = 0.4;    // agachado
  P[2].data.air = 0.3;       // no ar
  d.arms = [];               // sem braço baixo agora
  def.ativarAlto(g); d.alto.theta = 0; d.sign = 1; d.omega = 0;
  passo(g);
  ok(!P[0].alive && P[1].alive && !P[2].alive, `corda: o laser alto mata quem está em pé e no ar, poupa o agachado (vivos: ${P.map((p) => +p.alive).join('')})`);
  // braço baixo: agachado morre, no ar escapa
  const h = rodada('pular_corda'), e = h.data, Q = h.players; segundos(h, 0.7);
  for (const p of Q) { p.x = def.CX + 120; p.y = def.CY; p.data.air = 0; p.data.crouch = 0; }
  Q[1].data.crouch = 0.4; Q[2].data.air = 0.3; e.alto = null;
  for (let i = 0; i < 8; i++) { e.theta = 0; passo(h); }   // o braço baixo parado sobre eles até passar dos 0,8 s de aquecimento
  ok(!Q[0].alive && !Q[1].alive && Q[2].alive, `corda: o laser baixo mata em pé e agachado, poupa quem pulou (vivos: ${Q.map((p) => +p.alive).join('')})`);
  // aos 12 s o alto entra no lugar da 2ª corda baixa e gira ao contrário
  const k = rodada('pular_corda', { humanos: 0 }); segundos(k, 12.2);
  ok(k.data.alto && k.data.alto.on && k.data.arms.length === 1, 'corda: aos 12 s entra o laser alto e não há 2ª corda baixa');
  const b = def.bracos(k), baixo = b.find((x) => !x.alto), alto = b.find((x) => x.alto);
  ok(baixo && alto && baixo.sign === -alto.sign, 'corda: o alto gira no sentido oposto ao baixo');
  // bot: diante do alto chegando, agacha em vez de pular
  const z = rodada('pular_corda', { humanos: 0 }); segundos(z, 0.7);
  const bp = z.players[0]; bp.x = def.CX + 120; bp.y = def.CY; bp.data.air = 0; bp.data.cd = 0; bp.data.crouch = 0; bp.data.crouchCd = 0;
  bp.data.bot = { prefR: 120, skill: 0.08, noise: 0, tw: 0, tt: 9 };
  z.data.arms = []; def.ativarAlto(z); z.data.alto.theta = 0.25; z.data.sign = 1; z.data.omega = 3;   // o alto gira no sentido oposto: vem de +0,25 para 0
  const dec = def.bot(z, bp, 1 / 60);
  ok(dec.b === true && !dec.a, `corda: o bot agacha para o laser alto (${JSON.stringify(dec)})`);
  // Review Focus 1: os bots sobrevivem aos dois braços na maioria das rodadas
  let vivas = 0;
  for (let r = 0; r < 6; r++) { const w = rodada('pular_corda', { humanos: 0 }); segundos(w, 20); if (w.alive().length >= 1) vivas++; }
  ok(vivas >= 4, `corda: em ${vivas}/6 rodadas ainda há bot vivo aos 20 s`);
}

// SEÇÕES (uma por jogo)
// --- bons modos: o guarda que anda ---
function secaoBonsModos() {
  const def = TN.minigames.bons_modos;
  ok(def.TURN === 0.3 && def.LOOK_MIN === 0.7 && def.LOOK_MAX === 2.5 && def.HAZARD === 0.4 && def.MIN_WALK === 0.6 && def.MAX_WALK === 8 && def.WALK_MIN === 60 && def.WALK_MAX === 140, 'bons modos: constantes do guarda');
  const g = rodada('bons_modos'), d = g.data, h = d.host;
  ok(h.state === 'walk' && typeof h.x === 'number' && typeof h.vx === 'number', 'bons modos: o guarda começa andando');
  const x0 = h.x; segundos(g, 0.5);
  ok(h.x !== x0 && h.x >= def.X_MIN && h.x <= def.X_MAX, 'bons modos: o guarda anda dentro dos limites');
  // enquanto vira (0,3 s) ainda não pune; olhando, pune
  def.setHost(g, 'turn', def.TURN); aperta(0, { a: true }); passo(g); solta(); passo(g);   // um quadro solto para o próximo aperto contar
  ok(!d.shot && !d.queue.length, 'bons modos: agir durante o giro de 0,3 s não é tiro');
  def.setHost(g, 'look', 1); aperta(0, { a: true }); passo(g); solta();
  ok(d.shot || d.queue.length, 'bons modos: agir com o guarda olhando é tiro');
  // depois do congelamento do tiro, o guarda volta a andar e respeita MIN_WALK (Review Focus 2)
  segundos(g, def.SHOT_FREEZE + 0.05);
  ok(h.state === 'walk' && h.t < 0.2, `bons modos: depois do tiro o guarda volta a andar (${h.state})`);
  let virouCedo = false;
  for (let i = 0; i < 30; i++) { passo(g); if (h.state !== 'walk' && h.state !== 'fake') virouCedo = true; }   // 0,5 s < MIN_WALK
  ok(!virouCedo, 'bons modos: não vira antes de MIN_WALK');
  // sem padrão: em 90 s com bots, várias olhadas, nenhuma caminhada acima de MAX_WALK
  const k = rodada('bons_modos', { humanos: 0 }), kh = k.data.host; let olhadas = 0, maiorWalk = 0, prev = kh.state;
  k.finish = () => {};   // os bots limpam o prato em ~40 s; aqui queremos observar o guarda os 90 s inteiros
  for (let i = 0; i < 90 * 60; i++) {
    passo(k);
    if (kh.state === 'walk') maiorWalk = Math.max(maiorWalk, kh.t);
    if (prev !== 'look' && kh.state === 'look') olhadas++;
    prev = kh.state;
  }
  ok(olhadas >= 6 && maiorWalk <= def.MAX_WALK + 0.1, `bons modos: ${olhadas} olhadas em 90 s, caminhada máxima ${maiorWalk.toFixed(1)} s`);
  const q = rodada('bons_modos'); def.setHost(q, 'look', 1);
  const t = com3d(q, () => textos((c) => def.drawOverlay(q, c))) + textos((c) => def.draw(q, c)) + def.brief.join(' ');
  ok(!/ELE ESTÁ OLHANDO/.test(t) && /O GUARDA VIROU/.test(t) && /guarda/i.test(def.brief.join(' ')), 'bons modos: textos falam do guarda');
}

fim([secaoPularCorda, secaoBonsModos]);
