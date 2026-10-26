#!/usr/bin/env node
// Testa regras de minigames sem navegador: monta uma rodada de verdade (TN.Round) com jogadores humanos cujos
// botões são injetados, avança o relógio e confere a regra. Uma seção por jogo ajustado
// (spec docs/superpowers/specs/2026-10-18-ajustes-minigames-design.md). Uso: node tools/teste_ajustes.js
const { rodada, aperta, solta, passo, segundos, gravador, textos, estilos, ok, fim } = require('./_harness.js');

// --- contramão: só a chegada pontua (4/3/2/1), cair é 0, último na escada ganha 1 ---
function secaoContramao() {
  const g = rodada('contramao'), d = g.data, P = g.players, def = g.def;
  for (const p of P) p.data.speed = 0;
  P[0].data.s = 1.01; passo(g);
  ok(P[0].score === 4, `contramão: 1º a chegar ganha 4 (deu ${P[0].score})`);
  P[1].data.s = -0.01; passo(g);
  ok(!P[1].alive && P[1].score === 0 && P[0].score === 4 && P[2].score === 0, 'contramão: cair vale 0 e não dá ponto a ninguém');
  P[2].data.s = 1.01; passo(g);
  ok(P[2].score === 3, `contramão: 2º a chegar ganha 3 (deu ${P[2].score})`);
  passo(g);
  ok(P[3].score === def.CONSOLACAO && d.over, 'contramão: último na escada ganha 1 de consolação e a rodada termina');
  // Review Focus 1: o tempo acaba com todos na escada
  const h = rodada('contramao');
  for (const p of h.players) p.data.speed = 0.5;
  segundos(h, 61);
  ok(h.finished && h.players.every((p) => p.score === 0), 'contramão: tempo esgotado com todos na escada → todos 0 e a rodada termina');
  ok(def.brief.some((b) => /cair/i.test(b) && /0/.test(b)), 'contramão: brief avisa que cair é 0');
}

// --- serviço interno: portador mais rápido, planta aberta, arena maior ---
function secaoServicoInterno() {
  const def = TN.minigames.servico_interno, g = rodada('servico_interno');
  ok(def.HOLDER_MULT === 1.3 && def.HUNTER_MULT === 1.15, 'serviço interno: portador 1,3× e infectado 1,15×');
  ok(def.INFECT_RANGE === 56 && def.LIGHT_R === 95 && def.FREEZE === 3, 'serviço interno: alcance 56, lanterna 95, congelamento 3 s');
  ok(def.LAYOUT.length >= 16 && def.LAYOUT.length <= 18, `serviço interno: ${def.LAYOUT.length} móveis (16 a 18)`);
  ok(g.arena.w >= 920 && g.arena.h >= 480, `serviço interno: arena ${g.arena.w}×${g.arena.h}`);
  const dentro = (x, y) => x >= g.arena.x && x <= g.arena.x + g.arena.w && y >= g.arena.y && y <= g.arena.y + g.arena.h;
  ok(def.SPAWNS.every(([x, y]) => dentro(x, y)) && g.players.every((p) => dentro(p.x, p.y)), 'serviço interno: nascimentos dentro da arena nova');
}

// --- triagem: pausa com contagem 3-2-1 entre os turnos ---
function secaoTriagem() {
  const g = rodada('triagem'), d = g.data;
  d.timer = 0.01; passo(g);
  ok(d.phase === 'judge', 'triagem: fim do turno entra em judge');
  segundos(g, 3.05);
  ok(d.phase === 'pause' && d.contagem >= 1, `triagem: depois do julgamento vem a pausa com contagem (fase ${d.phase}, contagem ${d.contagem})`);
  const antes = g.players[1].data.sub;
  aperta(1, { a: true }); passo(g); solta();
  ok(g.players[1].data.sub === antes, 'triagem: durante a pausa a entrada é ignorada');
  segundos(g, 1.6);
  ok(d.phase === 'play' && d.sub === 2, 'triagem: ~1,5 s depois começa o turno 2');
}

// --- linha de montagem: reposição pela necessidade e por tempo ---
function secaoFabrica() {
  const def = TN.minigames.fabrica_de_armas, g = rodada('fabrica_de_armas'), d = g.data;
  ok(def.START_PARTS === 14 && def.MAX_FLOOR === 14 && def.RESPAWN === 2, 'fábrica: 14 peças iniciais, chão 14, reposição 2 s');
  ok(d.parts.length === 14 && g.players.every((p) => d.parts.some((pt) => pt.type === p.data.recipe[0])), 'fábrica: no início há 14 peças e a 1ª peça da receita de cada um');
  const precisa = g.players[0].data.recipe[0];
  d.parts = d.parts.filter((pt) => pt.type !== precisa);
  for (const p of g.players) { p.data.prog = 0; p.data.recipe[0] = precisa; p.data.carry = null; }
  ok(def.tipoParaRepor(g) === precisa, 'fábrica: repõe o tipo que todos precisam e não há no chão');
  d.parts = []; segundos(g, 2.1);
  ok(d.parts.length >= 1, `fábrica: com o chão vazio entra peça por tempo (${d.parts.length})`);
  // Review Focus 2: todos já montaram
  for (const p of g.players) p.data.prog = 5;
  let erro = ''; try { def.tipoParaRepor(g); } catch (e) { erro = e.message; }
  ok(!erro && def.TYPES.includes(def.tipoParaRepor(g)), 'fábrica: sem demanda, a reposição sorteia e não quebra');
}

// --- carrapato: sem contagem na tela, ativação sorteada, mais pilares ---
function secaoCarrapato() {
  const def = TN.minigames.carrapato, g = rodada('carrapato'), d = g.data, dev = d.dev;
  ok(d.pillars.length >= 8 && d.pillars.length <= 10 && d.pillars.every((p) => p.r >= 22 && p.r <= 34), `carrapato: ${d.pillars.length} pilares de raio 22–34`);
  ok(d.pillars.every((a, i) => d.pillars.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 40)), 'carrapato: há passagem (≥ 40 px) entre os pilares');
  const durs = new Set();
  let dentro = true;
  for (let k = 0; k < 12; k++) { def.armarTimer(g); durs.add(dev.dur); if (!(dev.dur >= 11 && dev.dur <= 17 && dev.timer === dev.dur)) dentro = false; }
  ok(dentro && durs.size > 1, `carrapato: ativação sorteada entre 11 e 17 s e variável (${[...durs].slice(0, 3).map((v) => v.toFixed(1)).join(', ')}…)`);
  dev.timer = 7.3;
  const t = textos((c) => def.draw(g, c)), tO = textos((c) => def.drawOverlay(g, c));
  ok(!/\d\.\d s/.test(t + tO) && !/\|\s*8\s*\|/.test(' | ' + t + ' | '), 'carrapato: nenhuma contagem numérica na tela');
  ok(/VAI DISPARAR/.test(t), 'carrapato: painel diz "O CARRAPATO VAI DISPARAR…"');
}

// --- caminho da memória: ✓ azul e ✗ laranja nas portas ---
function secaoMemoria() {
  const def = TN.minigames.caminho_da_memoria, g = rodada('caminho_da_memoria');
  ok(def.COR_SEGURA === '#46e27b' && def.COR_ERRADA === '#ff3b3b', 'memória: verde (segura) e vermelho (errada) continuam; o destaque vem dos painéis e símbolos');
  const prev = estilos((c) => def.draw(g, c));
  ok(prev.includes('#46e27b') && prev.includes('#ff3b3b') && !prev.includes('#a02020'), 'memória: a prévia 2D pinta as portas de verde/vermelho (porta explodida não usa mais o vermelho escuro)');
  const t = textos((c) => def.draw(g, c));
  ok(/✓/.test(t) && /✗/.test(t), 'memória: a prévia desenha ✓ e ✗');
}

// --- piso falso: queda por área com tolerância, padrões variados e piso seguro garantido ---
function secaoPisoFalso() {
  const def = TN.minigames.piso_falso, g = rodada('piso_falso'), d = g.data, p = g.players[0];
  def.setPhase(g, 'drop', 2.5);
  const t0 = def.tileAt(g, p.x, p.y);
  for (const t of d.tiles) t.state = 'up';
  t0.state = 'down'; p.x = d.gx + (t0.c + 1) * def.TILE - 4;   // quina: centro no buraco, 10 px à direita já é piso
  ok(!def.semChao(g, p), 'piso falso: na quina de um piso o jogador não cai');
  for (const t of d.tiles) t.state = 'down';
  passo(g, 1 / 60, 6);
  ok(p.alive, 'piso falso: 0,1 s sem chão ainda não elimina');
  passo(g, 1 / 60, 6);
  ok(!p.alive, 'piso falso: 0,2 s sem chão elimina');
  const h = rodada('piso_falso'), e = h.data;
  const padroes = new Set();
  let props = true, alcance = true;
  for (let k = 0; k < 8; k++) {
    e.cycle = k % 4; def.setPhase(h, 'final', 2); def.gerarLayout(h); padroes.add(e.padrao);
    const up = e.tiles.filter((t) => t.state === 'up'), seg = up.filter((t) => t.sym === e.safe).length / up.length;
    if (seg < 0.25 || seg > 0.6) { props = false; console.log(`   (padrão ${e.padrao}: ${(seg * 100).toFixed(0)}% seguros)`); }
    def.garantir(h);
    const alc = def.SPEED * e.phaseDur * 0.8;
    if (!h.alive().every((q) => e.tiles.some((t) => t.state === 'up' && t.sym === e.safe && Math.hypot(def.center(h, t).x - q.x, def.center(h, t).y - q.y) <= alc))) alcance = false;
  }
  ok(props, 'piso falso: a proporção de pisos seguros fica entre 25% e 60%');
  ok(alcance, 'piso falso: todo mundo tem um piso seguro ao alcance');
  ok(padroes.size >= 2, `piso falso: os padrões variam (${[...padroes].join(', ')})`);
  // Review Focus 3: gone fica gone
  const gone = e.tiles[0], longe = e.tiles[e.tiles.length - 1]; gone.state = 'gone';
  for (const t of e.tiles) if (t !== gone && t !== longe) t.state = 'down';
  longe.state = 'up'; longe.sym = (e.safe + 1) % 3;
  gone.sym = -1;   // um ladrilho removido não tem símbolo; a garantia não pode mexer nele
  const cg = def.center(h, gone); for (const q of h.players) { q.x = cg.x + 50; q.y = cg.y; }   // o gone é o candidato mais perto
  def.garantir(h);
  ok(gone.state === 'gone' && gone.sym === -1 && longe.sym === e.safe, 'piso falso: a garantia não ressuscita ladrilho removido (converte o piso de pé mais perto)');
  // quem fica parado precisa se mexer: o piso garantido nunca é o que está sob o jogador
  for (const t of e.tiles) t.state = 'up';
  const q0 = h.players[0]; const meu = e.tiles[40]; const cm = def.center(h, meu); q0.x = cm.x; q0.y = cm.y;
  e.safe = 0; for (const t of e.tiles) t.sym = 1;
  for (const q of h.players.slice(1)) { q.x = cm.x; q.y = cm.y; }
  def.garantir(h);
  ok(meu.sym !== e.safe && e.tiles.some((t) => t.sym === e.safe), 'piso falso: a garantia não torna seguro o piso sob o jogador (parado tem que andar)');
}

// --- tragada: valores do original (tosse de 3 s ao passar do limite ou tragar de boca cheia) ---
function secaoTragada() {
  const def = TN.minigames.tragada, g = rodada('tragada'), s = g.players[0].data;
  ok(def.CHOKE_TIME === 3 && def.CIG_MULT === 0.15, 'tragada: tosse 3 s e cigarro gasta 0,15 por unidade de tragada (original)');
  aperta(0, { a: true }); segundos(g, 2);   // o pulmão passa de 1,0 em ~1,83 s de tragada contínua
  ok(s.coughs === 1 && s.choke > 2.5, `tragada: passar do limite dá tosse (tosses ${s.coughs}, tosse ${s.choke.toFixed(2)} s)`);
  solta(); segundos(g, 3.2);
  ok(s.choke === 0, 'tragada: a tosse acaba depois de 3 s');
  aperta(0, { a: true }); segundos(g, 1.5); solta(); passo(g);
  ok(s.coughs === 1 && s.exhaling, `tragada: soltar abaixo do limite exala sem tosse (pulmão ${s.lung.toFixed(2)})`);
  segundos(g, 2);
  aperta(0, { a: true }); segundos(g, 0.4); solta(); passo(g); aperta(0, { a: true }); passo(g);
  ok(s.choke > 0 && s.choke <= 3, `tragada: apertar antes de esvaziar ainda tosse (${s.choke.toFixed(2)} s)`);
  // Review Focus 4: o cigarro acaba no meio da tragada
  const h = rodada('tragada'), q = h.players[0].data; q.cig = 0.001; q.lung = 0;
  aperta(0, { a: true }); segundos(h, 3); solta(); segundos(h, 2);
  ok(q.done, 'tragada: cigarro acabando no meio da tragada termina normalmente');
  const t = textos((c) => def.drawOverlay(h, c)) + textos((c) => def.draw(h, c));
  ok(!/F[ÔO]LEGO|PULM/i.test(t), 'tragada: nenhum rótulo de fôlego/pulmão na tela');
}

// --- batata quente: segurar esquenta o pavio ---
function secaoBatata() {
  const def = TN.minigames.batata_quente, g = rodada('batata_quente');
  segundos(g, 1.5);   // a batata sai do pedestal em 0,6 s e voa 0,75 s até o primeiro
  const pot = g.data.pot, dono = pot && pot.holder;
  ok(pot && pot.state === 'held' && dono, 'batata: alguém segura a batata');
  pot.fuse = 10; pot.heldT = 0; solta();
  segundos(g, 2);
  ok(pot.holder === dono && pot.fuse < 7.3, `batata: 2 s na mão queimam mais que 2 s de pavio (restou ${pot.fuse.toFixed(2)})`);
  ok(g._popups.some((pp) => pp.text === 'QUEIMANDO!'), 'batata: aviso QUEIMANDO! depois de 1,5 s');
  const i = dono.id; aperta(i, { a: true }); passo(g); solta();
  ok(pot.state === 'flight' && pot.heldT === 0, 'batata: passar zera o tempo na mão');
  ok(def.BOT_ESPERA_MAX <= 0.7 && def.CATCH_LOCK + def.BOT_ESPERA_MAX < def.QUEIMA_AVISO, 'batata: o bot solta mais cedo, sempre antes do QUEIMANDO!');
}

// --- cabo de guerra: janela de ritmo 3–5 toques/s, medidor de cadência ---
function secaoCabo() {
  const def = TN.minigames.cabo_de_guerra, g = rodada('cabo_de_guerra'), q = g.players[0].data;
  ok(def.FAST === 0.2 && def.SLOW === 0.32 && def.IMP_FAST === 0.3 && def.GRIP_COST === 0.18, 'cabo: janela 0,20–0,32 s, afobado 0,3 e custo de pegada 0,18');
  segundos(g, 1.5);
  const toque = (btn, espera) => { solta(); segundos(g, espera); aperta(0, btn === 'a' ? { a: true } : { b: true }); passo(g); solta(); };
  toque('a', 0.5); toque('b', 0.25);
  ok(q.qualidade === 'bom', `cabo: 0,25 s entre toques = bom (${q.qualidade})`);
  toque('a', 0.1);
  ok(q.qualidade === 'afobado', `cabo: 0,1 s = afobado (${q.qualidade})`);
  toque('b', 0.6);
  ok(q.qualidade === 'devagar', `cabo: 0,6 s = devagar (${q.qualidade})`);
  // o toque do TRANCO é um evento à parte: não conta como afobado mesmo vindo logo depois de um puxão
  g.data.tranco.state = 'go'; g.data.tranco.t = 0; q.trancoDone = false;
  toque('a', 0.05);
  ok(q.trancoDone && q.qualidade !== 'afobado', `cabo: o toque do TRANCO não é avaliado como afobado (${q.qualidade})`);
  ok(def.brief.some((b) => /4 toques/.test(b)), 'cabo: brief fala em 4 toques por segundo');
  // o HUD 3D só desenha com WebGL: finge o 3D para ler os rótulos
  g.uses3d = () => true; const proj = TN.R3.project; TN.R3.project = () => ({ x: 480, y: 300, visible: true });
  const t = textos((c) => def.drawOverlay(g, c));
  TN.R3.project = proj;
  ok(/PEGADA/.test(t), 'cabo: HUD tem o rótulo PEGADA');
  // os bots seguem a regra nova: o ritmo deles fica dentro da janela (nunca afobado)
  const b = rodada('cabo_de_guerra', { humanos: 0 }); let afobados = 0;
  const popup = b.popup.bind(b); b.popup = (txt, ...r) => { if (txt === 'AFOBADO') afobados++; return popup(txt, ...r); };
  segundos(b, 2.5);
  ok(b.players.every((p) => p.data.lastT >= 0 && p.data.lastT < 2.5), `cabo: todos os bots já puxaram no começo (último toque em ${b.players.map((p) => p.data.lastT.toFixed(2)).join(', ')})`);
  segundos(b, 17.5);
  ok(afobados === 0, `cabo: bots nunca são afobados (${afobados} avisos em 20 s)`);
}

// --- hora do trem: empurrão tira do nicho de verdade ---
function secaoTrem() {
  const def = TN.minigames.hora_do_trem;
  ok(def.SHOVE_RANGE === 72 && def.SHOVE_LOCK === 0.5 && def.FORA_DO_NICHO === 0.3, 'trem: alcance 72, empurrador parado 0,5 s, 0,3 s sem reentrar');
  for (const lado of [-1, 1]) {   // Review Focus 5: parede da esquerda e da direita (eixos transpostos: o túnel corre em y)
    const g = rodada('hora_do_trem'), d = g.data, n = d.nooks.find((k) => k.side === lado);
    n.state = 'open';
    const a = g.players[0], v = g.players[1];
    v.y = n.cy; v.x = lado < 0 ? d.floorL - 20 : d.floorR + 20;   // fundo do nicho
    a.y = n.cy + 30; a.x = lado < 0 ? d.floorL + 10 : d.floorR - 10; a.dir = Math.atan2(v.y - a.y, v.x - a.x);
    ok(def.nookOf(g, v) === n, `trem (lado ${lado}): vítima está no nicho`);
    def.shove(g, a);
    ok(Math.abs(v.vy) < 1 && Math.sign(v.vx) === -lado && Math.abs(v.vx) > 300, `trem (lado ${lado}): empurrão sai reto do nicho (vx ${v.vx.toFixed(0)}, vy ${v.vy.toFixed(0)})`);
    ok(v.data.foraT === 0.3, `trem (lado ${lado}): vítima fica 0,3 s sem reentrar (${v.data.foraT})`);
    let quadros = 0;   // quadros reais: enquanto está atordoada (vel > 40), a janela de reentrada nem começa a contar
    while (Math.hypot(v.vx, v.vy) > 40 && quadros < 120) { passo(g); quadros++; }
    ok(quadros > 0 && v.data.foraT >= 0.29, `trem (lado ${lado}): ao fim do atordoamento (${(quadros / 60).toFixed(2)} s) ainda faltam ${v.data.foraT.toFixed(2)} s sem poder reentrar`);
    v.y = n.cy; v.x = lado < 0 ? d.floorL - 20 : d.floorR + 20; passo(g);   // teleporta de volta ao fundo do nicho
    ok(!def.seguro(g, v), `trem (lado ${lado}): dentro do nicho mas com foraT > 0 não conta como segura`);
    segundos(g, 0.35); v.y = n.cy; v.x = lado < 0 ? d.floorL - 20 : d.floorR + 20;
    ok(v.data.foraT === 0 && def.seguro(g, v), `trem (lado ${lado}): passada a janela, volta a valer o esconderijo`);
  }
  // nicho aberto cabe um só: dois nos cantos opostos (diagonal) → o mais fundo fica, o outro bate na parede
  for (const lado of [-1, 1]) {
    const g = rodada('hora_do_trem'), d = g.data, n = d.nooks.find((k) => k.side === lado);
    n.state = 'open';
    const [a, b] = g.players, half = def.NOOK_W / 2 - a.r;
    a.y = n.cy - half; a.x = lado < 0 ? d.floorL - 34 : d.floorR + 34;   // fundo
    b.y = n.cy + half; b.x = lado < 0 ? d.floorL - 10 : d.floorR + 10;   // perto da boca
    ok(def.seguro(g, a) && def.seguro(g, b), `trem (lado ${lado}): pela diagonal os dois cabiam (montagem do teste)`);
    def.umPorNicho(g);
    ok(def.seguro(g, a) && !def.seguro(g, b) && def.nookOf(g, b) !== n, `trem (lado ${lado}): só o mais fundo fica no nicho`);
  }
}

// --- empurrões: decaimento linear (~0,8 s sem controle, ~180 px); empurrador parado 0,5 s ---
function secaoEmpurroes() {
  {
    const g = rodada('aspiradores'), d = g.data, [a, v] = g.players;
    d.nextSpawn = Infinity;
    for (const p of g.players.slice(2)) { p.x = g.arena.x + 40; p.y = g.arena.y + 40; }
    a.x = g.arena.x + 150; a.y = g.arena.y + g.arena.h / 2; v.x = a.x + 40; v.y = a.y; a.dir = 0;
    aperta(0, { a: true, x: 1 }); passo(g);
    const ax = a.x;
    let q = 0; while (Math.hypot(v.vx, v.vy) > 40 && q < 300) { passo(g); q++; }
    ok(q / 60 > 0.6 && q / 60 < 1.0, `aspiradores: empurrado fica sem controle ~0,8 s (${(q / 60).toFixed(2)} s)`);
    const longe = v.x - ax - 40;
    ok(longe > 120 && longe < 260, `aspiradores: empurrão anda ~180 px, sem arremessar pela arena (${longe.toFixed(0)} px)`);
    const g2 = rodada('aspiradores'), [b] = g2.players; g2.data.nextSpawn = Infinity;
    b.x = g2.arena.x + 150; b.y = g2.arena.y + g2.arena.h / 2; b.dir = 0;
    aperta(0, { a: true, x: 1 }); passo(g2); const bx = b.x; segundos(g2, 0.4);
    ok(Math.abs(b.x - bx) < 1, `aspiradores: quem empurra fica parado (andou ${(b.x - bx).toFixed(1)} px em 0,4 s)`);
    segundos(g2, 0.3);
    ok(b.x - bx > 10, 'aspiradores: depois de 0,5 s volta a andar');
    ok(TN.minigames.aspiradores.ROOMBA_SPEED / TN.minigames.aspiradores.SPEED === 437 / 175, 'aspiradores: aspirador a 2,5× o jogador');
  }
  {
    const g = rodada('hora_do_trem'), [a, v, w] = g.players;
    a.x = 480; a.y = 200; a.dir = Math.PI / 2;
    v.x = 480; v.y = 240; w.x = 490; w.y = 262; g.players[3].x = 480; g.players[3].y = 500;
    aperta(0, { a: true }); segundos(g, 0.15);
    ok(Math.hypot(v.vx, v.vy) > 300 && Math.hypot(w.vx, w.vy) < 40, `trem: empurrão pega só o mais próximo (v ${Math.hypot(v.vx, v.vy).toFixed(0)}, w ${Math.hypot(w.vx, w.vy).toFixed(0)})`);
  }
}

fim([secaoContramao, secaoServicoInterno, secaoTriagem, secaoFabrica, secaoCarrapato, secaoMemoria, secaoPisoFalso, secaoTragada, secaoBatata, secaoCabo, secaoTrem, secaoEmpurroes]);
