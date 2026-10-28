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
  const dif = Math.abs(((alto.ang - baixo.ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  ok(baixo && alto && baixo.sign === alto.sign && dif < 0.01, `corda: o alto gira no mesmo sentido, defasado de meia volta (${dif.toFixed(3)} rad)`);
  segundos(k, 1);
  const b2 = def.bracos(k), dif2 = Math.abs(((b2[1].ang - b2[0].ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  ok(dif2 < 0.01, 'corda: a meia volta entre os braços se mantém (passagens sempre ~1 s separadas)');
  // bot: diante do alto chegando, agacha em vez de pular
  const z = rodada('pular_corda', { humanos: 0 }); segundos(z, 0.7);
  const bp = z.players[0]; bp.x = def.CX + 120; bp.y = def.CY; bp.data.air = 0; bp.data.cd = 0; bp.data.crouch = 0; bp.data.crouchCd = 0;
  bp.data.bot = { prefR: 120, skill: 0.08, noise: 0, tw: 0, tt: 9 };
  z.data.arms = []; def.ativarAlto(z); z.data.alto.theta = -0.25; z.data.sign = 1; z.data.omega = 3;   // o alto vem de -0,25 para 0 (sentido do baixo)
  const dec = def.bot(z, bp, 1 / 60);
  ok(dec.b === true && !dec.a, `corda: o bot agacha para o laser alto (${JSON.stringify(dec)})`);
  // inversão: freia até parar, vira, fica parado e desligado um instante, e volta acelerando no sentido novo
  {
    const v = rodada('pular_corda', { humanos: 0 }), vd = v.data; v.finish = () => {}; segundos(v, 5);
    const w0 = Math.abs(vd.omega), s0 = vd.sign;
    vd.nextRev = v.time + 0.01; passo(v, 1 / 60, 2);
    ok(vd.rev && vd.rev.fase === 'freia' && vd.sign === s0, 'corda: a inversão começa freando, ainda no sentido antigo');
    segundos(v, def.REV_FREIA * 0.5);
    ok(Math.abs(vd.omega) < w0 * 0.6 && Math.sign(vd.omega) === s0, `corda: no meio da freada o laser está mais lento (${Math.abs(vd.omega).toFixed(2)} de ${w0.toFixed(2)} rad/s)`);
    segundos(v, def.REV_FREIA * 0.5 + 0.05);
    ok(vd.rev.fase === 'segura' && vd.omega === 0 && vd.sign === -s0, 'corda: parado, com o sentido já virado');
    // parado e desligado: quem está em cima da linha não morre
    const P = v.alive()[0] || v.players[0]; P.alive = true; const ang = vd.theta; P.x = def.CX + Math.cos(ang) * 120; P.y = def.CY + Math.sin(ang) * 120; P.data.air = 0; P.data.crouch = 0;
    passo(v, 1 / 60, 5);
    ok(P.alive && !def.cortando(v), 'corda: laser parado não corta quem está na linha');
    P.x = def.CX - Math.cos(ang) * 120; P.y = def.CY - Math.sin(ang) * 120;   // tira de lá
    segundos(v, def.REV_SEGURA + def.REV_ACELERA);
    ok(!vd.rev && Math.sign(vd.omega) === -s0 && Math.abs(vd.omega) > w0 * 0.95, `corda: retoma a velocidade no sentido novo (${vd.omega.toFixed(2)} rad/s)`);
    ok(vd.nextRev - v.time >= 4.9 && vd.nextRev - v.time <= 9, 'corda: a próxima inversão vem 5 a 9 s depois');
    const pausa = def.REV_FREIA + def.REV_SEGURA + def.REV_ACELERA;
    ok(def.REV_SEGURA >= 0.4 && def.REV_SEGURA <= 0.6 && pausa >= 1.5, `corda: segura ${def.REV_SEGURA} s parado; a virada inteira leva ${pausa.toFixed(1)} s`);
  }
  // Review Focus 1: os bots sobrevivem aos dois braços — com o fim de rodada desligado (senão o motor
  // encerra 1,5 s depois de sobrar um e a curva não aparece), a maioria dos 24 bots ainda está viva aos 20 s
  let vivos20 = 0, vivos30 = 0;
  for (let r = 0; r < 6; r++) { const w = rodada('pular_corda', { humanos: 0 }); w.finish = () => {}; segundos(w, 20); vivos20 += w.alive().length; segundos(w, 10); vivos30 += w.alive().length; }
  // medido em 30 rodadas: média 2,4 vivos/rodada aos 20 s e 1,4 aos 30 s; pior janela de 6 rodadas 10/24 e 3/24
  ok(vivos20 >= 7 && vivos30 >= 1, `corda: dos 24 bots, ${vivos20} vivos aos 20 s e ${vivos30} aos 30 s`);
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

// --- empilhadeira: controle assistido e eliminação do pior ---
function secaoEmpilhadeira() {
  const def = TN.minigames.empilhadeira;
  ok(def.GIRO_MIN === 0.35 && def.PEDAL_RATE === 8 && def.STEER_RATE === 8 && def.GRAB === 34 && def.PEGA_CD === 0.6 && /soltar/i.test(def.controls.a), 'empilhadeira: constantes e AÇÃO = soltar');
  const g = rodada('empilhadeira'), d = g.data, p = g.players[0], pd = p.data, zona = d.zones.find((z) => z.owner === p);
  segundos(g, 0.5);
  // gira parada
  const dir0 = p.dir; pd.pedal = 0; pd.speed = 0; aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(Math.abs(p.dir - dir0) > 0.05, `empilhadeira: gira parada (${(p.dir - dir0).toFixed(2)} rad)`);
  // pegar automático: caixa livre a 20 px da ponta do garfo, fora da própria zona (longe da pilha do meio)
  p.x = 300; p.y = 270; p.dir = 0; pd.crate = null; pd.pegaCd = 0;
  const f = def.forkPoint(p), cr = d.crates.find((c) => !c.carrier); cr.x = f.x + 20; cr.y = f.y; cr.fade = 0;
  passo(g);
  ok(pd.crate === cr && cr.carrier === p, 'empilhadeira: encostar o garfo numa caixa livre pega sozinho');
  // soltar automático no centro da própria zona, e 0,6 s sem pegar de novo
  p.x = zona.x + zona.w / 2 - def.FORK; p.y = zona.y + zona.h / 2; p.dir = 0; passo(g);
  ok(!pd.crate && !cr.carrier && def.zoneOf(g, cr) === zona && pd.pegaCd > 0.5, 'empilhadeira: entrar na própria zona solta a caixa e dá 0,6 s sem pegar');
  passo(g, 1 / 60, 10);
  ok(!pd.crate, 'empilhadeira: a caixa recém-solta não volta para o garfo');
  segundos(g, 0.7); passo(g);
  ok(!pd.crate, 'empilhadeira: caixa já na própria zona não é pega');
  // Review Focus 3: roubar da zona rival continua, e quem largou não pega de volta na hora
  const q = g.players[1], qd = q.data;
  q.x = zona.x + zona.w / 2 - def.FORK; q.y = zona.y + zona.h / 2; q.dir = 0; qd.crate = null; qd.pegaCd = 0; passo(g);
  ok(qd.crate === cr, 'empilhadeira: o rival rouba a caixa da minha zona só encostando');
  // batida forte: a vítima perde a caixa e NÃO a pega de volta no quadro seguinte (0,6 s de recarga)
  const v = g.players[2], vd = v.data, atk = g.players[3], ad = atk.data;
  for (const pl of g.players) { pl.data.crate = null; pl.data.hitCool = 0; pl.data.pegaCd = 0; pl.data.pedal = 0; pl.x = 100 + pl.id * 60; pl.y = 450; pl.dir = 0; }
  for (const c of d.crates) { c.carrier = null; c.x = 700 + (c.x % 60); c.y = 120 + (c.y % 60); }
  const cv = d.crates[0]; v.x = 480; v.y = 300; v.dir = 0; vd.crate = cv; cv.carrier = v; cv.x = 514; cv.y = 300;
  atk.x = 450; atk.y = 300; atk.dir = 0; ad.pedal = 1; ad.speed = def.MAX_SPEED;   // vem de trás a toda, encostado
  passo(g);
  ok(!vd.crate && vd.pegaCd > 0.5, `empilhadeira: batida forte derruba a caixa e dá recarga à vítima (recarga ${vd.pegaCd.toFixed(2)})`);
  segundos(g, 0.5);
  ok(vd.crate !== cv, 'empilhadeira: a vítima não pega a caixa derrubada de volta na hora');
  // eliminação só do pior (o turno seguinte começa 3,7 s depois do apito: 1,2 + 0,9 + 1,6)
  const h = rodada('empilhadeira'), e = h.data; segundos(h, 0.5);
  const porZona = [3, 1, 1, 0], caixas = e.crates.filter((c) => !c.removed);
  let k = 0; e.zones.forEach((z, i) => { for (let n = 0; n < porZona[i]; n++) { const c = caixas[k++]; c.carrier = null; c.x = z.x + 20 + n * 10; c.y = z.y + 20; } });
  for (const c of caixas.slice(k)) { c.x = 480; c.y = 270; }
  for (const pl of h.players) pl.data.crate = null;
  def.endSub(h); segundos(h, 2.3);
  ok(h.players.map((pl) => +pl.alive).join('') === '1110', `empilhadeira: só quem tem menos caixas sai (vivos ${h.players.map((pl) => +pl.alive).join('')})`);
  segundos(h, 1.5);
  ok(e.phase === 'play' && e.sub === 2, `empilhadeira: vem outro turno (${e.phase}, turno ${e.sub})`);
  const m = rodada('empilhadeira'), me = m.data; segundos(m, 0.5);
  for (const c of me.crates) { c.x = 480; c.y = 270; c.carrier = null; }
  for (const pl of m.players) pl.data.crate = null;
  def.endSub(m); segundos(m, 3.8);
  ok(m.alive().length === 4 && me.phase === 'play', 'empilhadeira: empate geral (todos com 0) não elimina ninguém');
  ok(def.piores(m).length === 0, 'empilhadeira: piores() vazio no empate geral');
}

// --- corte exato: todos ao mesmo tempo, morre o pior ---
function secaoCorteExato() {
  const def = TN.minigames.corte_exato;
  ok(def.scoring === 'survival' && def.CUT_TIME === 8 && def.PREVIEW === 2 && def.SHOW === 2.2 && def.K === 0.6, 'corte: survival, 8 s de corte, prévia 2 s, escala 0,6');
  const g = rodada('corte_exato'), d = g.data, P = g.players;
  ok(def.SHAPES.includes(d.shape) && d.round === 1 && d.phase === 'preview' && P.every((p) => p.data.cursor && Array.isArray(p.data.strokes)), 'corte: figura única, rodada 1, prévia, estado por jogador');
  const qs = P.map((p) => def.quadrante(g, p));
  ok(new Set(qs.map((q) => q.x + ',' + q.y)).size === 4 && qs.every((q) => q.w >= 400 && q.h >= 200), 'corte: 4 quadrantes distintos');
  segundos(g, def.PREVIEW + 0.05);
  ok(d.phase === 'cut', 'corte: depois da prévia vem o corte');
  const c0 = { ...P[0].data.cursor }, c1 = { ...P[1].data.cursor }, c2 = { ...P[2].data.cursor };
  aperta(0, { x: 1 }); aperta(1, { y: 1 }); passo(g, 1 / 60, 10); solta();
  ok(P[0].data.cursor.x > c0.x && P[1].data.cursor.y > c1.y && P[2].data.cursor.x === c2.x && P[2].data.cursor.y === c2.y, 'corte: dois jogadores cortam ao mesmo tempo, cada um no seu cursor');
  // notas e eliminação: P0 perfeito (contorno amostrado a cada 2 px: perto do centro, 4 px pulariam setores de 5°), P1 nada, P2 e P3 metade
  const densa = (poly) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2)); for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); } return out; };
  const perfeito = densa(d.poly), metade = perfeito.slice(0, Math.floor(perfeito.length / 2));
  P[0].data.strokes = [perfeito]; P[1].data.strokes = []; P[2].data.strokes = [metade]; P[3].data.strokes = [metade];
  const figura = d.shape;
  for (const p of P) p.data.done = true;
  passo(g);   // todos entregaram: resultado
  const nota0 = P[0].data.result && P[0].data.result.score;
  ok(d.phase === 'show' && nota0 >= 95, `corte: contorno perfeito dá ~100 (${nota0}, ${d.phase})`);
  segundos(g, def.SHOW + 0.2);   // fim do resultado (2,2 s): elimina e começa a rodada seguinte
  ok(P[0].alive && !P[1].alive && P[2].alive && P[3].alive, `corte: morre só o pior (vivos ${P.map((p) => +p.alive).join('')})`);
  ok(d.round === 2 && d.shape !== figura && d.phase === 'preview', `corte: rodada 2 com figura diferente (${figura} → ${d.shape}, ${d.phase})`);
  // empate geral não elimina
  segundos(g, d.phaseT + 0.05);
  for (const p of g.alive()) { p.data.strokes = []; p.data.done = true; }
  segundos(g, def.SHOW + 0.2);
  ok(g.alive().length === 3 && d.round === 3, `corte: empate geral (todos 0) não elimina ninguém (vivos ${g.alive().length}, rodada ${d.round})`);
  // Review Focus 4: com 2 jogadores acaba na 1ª rodada; nunca fica sem figura
  const h = rodada('corte_exato', { humanos: 0 }); h.players[2].alive = false; h.players[3].alive = false;
  segundos(h, 60);
  ok(h.finished && h.data.round <= 2, `corte: com 2 vivos termina em uma rodada (rodada ${h.data.round})`);
  const k = rodada('corte_exato', { humanos: 0 }); for (let r = 0; r < 7; r++) def.novaRodada(k);
  ok(def.SHAPES.includes(k.data.shape), 'corte: depois de usar as 5 figuras continua sorteando');
  // bots jogam e a rodada termina sozinha
  const z = rodada('corte_exato', { humanos: 0 }); segundos(z, 70);
  ok(z.finished && z.players.some((p) => !p.alive), `corte: com bots a rodada termina (vivos ${z.alive().length})`);
  // desenho: 2D e overlay 3D desenham os quadrantes com a figura
  const t2 = textos((c) => def.draw(z, c)); const t3 = com3d(z, () => textos((c) => def.drawOverlay(z, c)));
  ok(/ÚLTIMO LUGAR SAI/.test(t2) && /ÚLTIMO LUGAR SAI/.test(t3), 'corte: HUD 2D e 3D têm o cabeçalho da rodada');
}

// --- escultor: visão individual em painéis ---
function secaoEscultor() {
  const def = TN.minigames.cinzel;
  const g = rodada('cinzel'); segundos(g, def.MEMO + 0.5);   // fase de esculpir
  const ps = g.players.map((p) => def.painel(g, p));
  ok(ps.every((q) => q.w === 420 && q.h === 220) && new Set(ps.map((q) => q.x + ',' + q.y)).size === 4 && ps.every((q) => q.x >= 20 && q.x + q.w <= 940 && q.y >= 34 && q.y + q.h <= 540), 'escultor: 4 painéis de 420×220 com margens');
  const c = gravador(); com3d(g, () => def.drawOverlay(g, c));
  const fundos = c.log.filter((e) => e[0] === 'fillRect' && e[3] === 420 && e[4] === 220);
  ok(fundos.length === 4, `escultor: o overlay 3D desenha os 4 painéis (${fundos.length})`);
  ok(/esculpindo|ESCULPINDO/i.test(textos((x) => com3d(g, () => def.drawOverlay(g, x)))), 'escultor: os painéis mostram o estado de cada um');
  // Review Focus 5: com 3 jogadores, dois em cima e um embaixo
  g.players[3].alive = false;
  const p3 = g.players.slice(0, 3).map((p) => def.painel(g, p));
  ok(p3[0].y === p3[1].y && p3[2].y > p3[0].y && Math.abs(p3[2].x + p3[2].w / 2 - 480) < 1, 'escultor: 3 jogadores → dois em cima, um embaixo centralizado');
  const c3 = gravador(); com3d(g, () => def.drawOverlay(g, c3));
  ok(c3.log.filter((e) => e[0] === 'fillRect' && e[3] === 420 && e[4] === 220).length === 3, 'escultor: eliminado não ganha painel');
  // mouse: hover move o cinzel, clique corta a célula sob o ponteiro, clique fora não faz nada, ENVIAR é clicável
  const h = rodada('cinzel'); segundos(h, def.MEMO + 0.5);
  const P0 = h.players[0], s0 = P0.data;
  com3d(h, () => {
    const { bx, by, S } = def.origem(def.painel(h, P0));
    const em = (n) => ({ x: bx + def.NODES[n].x * S + 3, y: by + def.NODES[n].y * S - 2 });
    const clica = (pt) => { aperta(0, { a: true, ponteiro: { ...pt, clique: true } }); passo(h); aperta(0, { ponteiro: { ...pt, clique: false } }); passo(h); };
    clica(em(3));
    ok(s0.cells[3] && s0.cells.filter(Boolean).length === 1, `escultor: clique com ponteiro corta a célula certa (${s0.cells.map(Number).join('')})`);
    aperta(0, { ponteiro: { ...em(7), clique: false } }); passo(h);
    ok(s0.cursor === 7 && !s0.cells[7], 'escultor: passar o mouse só destaca (o cinzel vai para a célula)');
    clica({ x: 5, y: 5 });
    ok(s0.cells.filter(Boolean).length === 1 && !s0.cells[7], 'escultor: clique fora do bloco não corta nada');
    clica(em(def.SEND));
    ok(s0.sent, 'escultor: ENVIAR é clicável');
    // quem não tem mouse continua no teclado: AÇÃO corta a célula do cursor (centro)
    const s1 = h.players[1].data; aperta(1, { a: true }); passo(h); solta();
    ok(s1.cells.filter(Boolean).length === 1 && !h.players[1].input.ponteiro, 'escultor: sem ponteiro, AÇÃO corta pelo cursor como antes');
    // contra cópias: quem enviou não tem mais o bloco visível (painel nem 3D)
    const boards = []; const dbOrig = def.drawBoard, b3Orig = def.drawBlock3d; let blocos3d = 0;
    def.drawBoard = function (c, x, y, S2, arr, o) { boards.push(arr); return dbOrig.apply(this, arguments); };
    def.drawBlock3d = function () { blocos3d++; return b3Orig.apply(this, arguments); };
    const nada = new Proxy({}, { get: () => () => {} });
    try {
      const tx = textos((c) => def.drawOverlay(h, c));
      ok(/ENVIADO/.test(tx) && !boards.includes(s0.cells), 'escultor: painel de quem enviou mostra só ENVIADO, sem o bloco');
      def.draw3d(h, nada);
      ok(blocos3d === 3, `escultor: no 3D o bloco de quem enviou some (${blocos3d} blocos)`);
      for (const p of h.players) p.data.sent = true;
      segundos(h, 0.2);   // todos enviaram → veredito
      boards.length = 0; blocos3d = 0;
      textos((c) => def.drawOverlay(h, c)); def.draw3d(h, nada);
      ok(h.data.phase === 'reveal' && boards.includes(s0.cells) && blocos3d === 4, 'escultor: no veredito a escultura volta a aparecer');
    } finally { def.drawBoard = dbOrig; def.drawBlock3d = b3Orig; }
  });
  solta();
  // motor: o ponteiro de um cliente de rede (px/py/pc) chega ao host; cliente antigo (sem px) fica sem ponteiro
  TN.input.setRemote('n9:kb1', { x: 0, y: 0, px: 300, py: 120, pc: 1 }); TN.input.setRemote('n9:gp0', { x: 1, y: 0 });
  TN.input.update();
  const pr = TN.input.get('n9:kb1').ponteiro;
  ok(pr && pr.x === 300 && pr.y === 120 && pr.clique && pr.cliquePressed && !TN.input.get('n9:gp0').ponteiro, `rede: ponteiro remoto chega ao host (${JSON.stringify(pr)})`);
  TN.input.setRemote('n9:kb1', { x: 0, y: 0, px: 310, py: 120, pc: 0 }); TN.input.update();
  const pr2 = TN.input.get('n9:kb1').ponteiro;
  ok(pr2 && pr2.x === 310 && !pr2.clique && !pr2.cliquePressed, 'rede: soltar o clique remoto');
  TN.input.removeRemote('n9:');
}

fim([secaoPularCorda, secaoBonsModos, secaoEmpilhadeira, secaoCorteExato, secaoEscultor]);
