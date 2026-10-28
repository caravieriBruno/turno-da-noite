// PISA LEVE — inspirado em "MINEFIELD" (exploding_collar_race) de Machine Party.
// Atravesse o campo minado até a van, visto pelas costas dos detentos. As minas são invisíveis:
// a coleira de cada um vai do verde ao vermelho conforme a mina mais próxima. Segurar AÇÃO
// liga o sonar (parado), que revela as minas por um instante. Encostar numa mina (andando ou
// correndo: a checagem é pelo trecho percorrido no quadro) arma o pavio de 0,5 s; armou, explode,
// mesmo que o jogador saia de cima (dá para fugir do raio se reagir rápido). A explosão derruba.
// Depois de 5 s soltam os cães de guarda por trás da largada: a matilha atravessa o campo quase na
// velocidade do jogador, estourando as minas por onde passa, e morde quem fica para trás.
// Controles relativos à câmera (pelas costas): CIMA leva para a van, ESQUERDA/DIREITA andam de lado.
TN.registerMinigame({
  id: 'pisa_leve',
  title: 'PISA LEVE',
  inspiredBy: 'Minefield (exploding_collar_race)',
  tagline: 'SONDE ANTES. PISE DEPOIS.',
  brief: ['Atravesse o campo minado até a van.', 'Segure AÇÃO para o sonar revelar as minas.', 'A coleira fica vermelha perto de uma mina.', 'Em 5 s soltam os cães. Não olhe para trás.'],
  controls: { move: 'andar', a: 'sonar (segure, fica parado)' },
  icon: '✱',
  color: '#9be04a',
  rounds: 3,
  scoring: 'points',          // +1 metade, +1 chegar, +1 primeiro, +1 sem dano
  endWhenOneLeft: false,

  // ---- constantes (original: campo 16×80, espaçamento 3,5, gatilho 1,0, detecção/explosão 5,
  //      sonar raio 4 em 2 s, pavio 1 s, 2 vidas, −25% vel. ferido, colheitadeira após 5 s: aqui são cães) ----
  SPEED: 100, HURT_MULT: 0.75, LIVES: 2,
  SPACING: 112,      // distância mínima entre minas (Poisson-disc): 5 m da cena original (16 m = 360 px → 22,5 px/m)
  TRIG: 26,          // raio do gatilho (centro do jogador até a mina), testado contra o trecho andado no quadro
  DETECT: 110,       // a coleira começa a reagir a partir daqui
  BLAST: 90,         // raio da explosão (correndo reto por cima, o pavio de 0,5 s ainda pega quem armou)
  FUSE: 0.5,         // pavio: armou, explode depois disso (sair de cima não desarma)
  SONAR_R: 120, SONAR_TIME: 2.0, REVEAL: 1.4,
  // explosão derruba (g.derrubar, como o empurrão dos aspiradores): impulso, decaimento linear e tempo no chão
  SHOVE: 300, SHOVE_DECAY: 444, TOMBO: 1.1,
  // cães de guarda: soltos aos 5 s, correm a CAES_VMAX × curva da colheitadeira original (0,5 → 1 → 0,1 no
  // fim; 0,9× a velocidade do jogador no pico) e estouram as minas a menos de CAES_ALCANCE à frente da matilha.
  // Latem a cada LATIDO_LONGE..PERTO s.
  CAES_DELAY: 5, CAES_VMAX: 90, CAES_ALCANCE: 14, CAES_PERTO: 80, LATIDO_LONGE: 1.6, LATIDO_PERTO: 0.35,
  CAES_CURVA: [[0, 0.5], [0.2, 1], [0.314, 0.779], [0.396, 0.909], [0.524, 0.627], [0.624, 0.97], [0.707, 0.726], [0.8, 1], [1, 0.1]],
  // campo no formato do original (16 × 80 m: estreito e comprido). Na escala das minas (3,5 m = 78 px) a
  // largura dá 360 px; o comprimento ficou em 1180 px (o original daria ~1800, que a câmera fixa não lê).
  CAMPO: { y0: 95, y1: 455, goalX: 1250 },
  VAN_W: 64,

  init(g) {
    const U = TN.util, a = g.arena, d = g.data, C = this.CAMPO;
    d.startX = a.x + 30;                       // coluna de largada
    d.goalX = C.goalX;                         // linha da van (passou = chegou)
    d.endX = C.goalX + this.VAN_W;             // fim do campo (a van fica entre goalX e endX)
    d.fy0 = C.y0; d.fy1 = C.y1;                // laterais do campo (cercas)
    d.midX = (d.startX + d.goalX) / 2;
    d.mines = this.makeMines(g);
    d.scorch = []; d.trail = []; d.rings = [];
    d.caes = { x: a.x - 30, x0: a.x - 30, on: false, latidoT: 1, tickT: 0 };
    d.firstDone = false; d.vanSeats = 0;
    d.seed = U.randInt(1, 1e6);                // semente dos tufos de mato (decoração gerada no draw)
    g.players.forEach((p, i) => {
      p.x = d.startX; p.y = d.fy0 + (d.fy1 - d.fy0) * (i + 0.5) / g.players.length; p.dir = 0;
      Object.assign(p.data, { active: true, done: false, lives: this.LIVES, hurt: false, half: false, fuse: 0, inv: 0, mordido: false,
        sonarT: 0, prox: 1, lastMx: 1, lastMy: 0, trailAcc: 0, distSinceSonar: 999, caution: U.rand(0.7, 1.3), noise: 0, noiseT: 0 });
    });
  },

  // Amostragem tipo Poisson-disc (dardos com distância mínima) na faixa entre a largada e a van.
  makeMines(g) {
    const U = TN.util, a = g.arena, d = g.data, mines = [];
    const x0 = a.x + 95, x1 = d.goalX - 40, y0 = d.fy0 + 16, y1 = d.fy1 - 16;
    for (let tries = 0; tries < 4000; tries++) {
      const m = { x: U.rand(x0, x1), y: U.rand(y0, y1) };
      if (mines.every((o) => (o.x - m.x) ** 2 + (o.y - m.y) ** 2 >= this.SPACING ** 2)) mines.push(m);
    }
    for (const m of mines) Object.assign(m, { reveal: 0, known: false, dead: false, arm: -1 });   // arm: s desde que armou (−1 = intacta)
    return mines;
  },

  // ---- controles relativos à câmera (pelas costas): o input da tela vira direção no chão ----
  // frente = da câmera para o alvo (no chão); direita da tela = frente girada 90° (+z quando a câmera olha +x)
  eixos() {
    const c = this.camera, fx = c.target[0] - c.pos[0], fz = c.target[2] - c.pos[2], l = Math.hypot(fx, fz) || 1;
    return { fx: fx / l, fy: fz / l, rx: -fz / l, ry: fx / l };
  },
  // input (x: direita, y: baixo da tela) → direção no plano da lógica
  paraMundo(inp) {
    const e = this.eixos(), fr = -(inp.y || 0), di = inp.x || 0;
    return { x: e.fx * fr + e.rx * di, y: e.fy * fr + e.ry * di };
  },
  // inverso (usado pelo bot, que pensa no plano da lógica)
  paraInput(wx, wy) {
    const e = this.eixos();
    return { x: wx * e.rx + wy * e.ry, y: -(wx * e.fx + wy * e.fy) };
  },
  // curva de velocidade da matilha (pontos da colheitadeira original, interpolação linear)
  curvaCaes(t) {
    const C = this.CAES_CURVA;
    for (let i = 1; i < C.length; i++) if (t <= C[i][0]) { const [x0, y0] = C[i - 1], [x1, y1] = C[i]; return y0 + (y1 - y0) * ((t - x0) / (x1 - x0)); }
    return C[C.length - 1][1];
  },

  active(g) { return g.players.filter((p) => p.data.active); },
  // área andável: da largada (a.x) até o fim da van, entre as cercas
  limites(g) { const d = g.data; return { x: g.arena.x, y: d.fy0, w: d.endX - g.arena.x, h: d.fy1 - d.fy0 }; },
  // distância (em x) entre o jogador e a matilha; 999 enquanto os cães estão presos
  gapCaes(g, p) { return g.data.caes.on ? p.x - g.data.caes.x : 999; },

  // dano de explosão: perde 1 vida; sem vidas, morre
  damage(g, p, mx, my) {
    if (!p.data.active || p.data.inv > 0) return;
    p.data.lives--; p.data.hurt = true; p.data.inv = 0.6;
    const n = TN.util.norm(p.x - mx, p.y - my);
    if (p.data.lives > 0) g.derrubar(p, n.x * this.SHOVE, n.y * this.SHOVE, this.TOMBO);   // jogado longe: cai deitado e levanta
    if (p.data.lives <= 0) {
      p.data.active = false;
      g.eliminate(p, { sound: 'boom', msg: 'BUM!' });
      g.particles(p.x, p.y, '#a00', 26, 240);
    } else g.popup('FERIDO!', p.x, p.y - 40, '#f80');
  },

  // `pelosCaes`: estourada pela matilha (sem pavio; efeito menor, como o explode(false) da colheitadeira)
  explode(g, m, pelosCaes = false) {
    if (m.dead) return;
    m.dead = true; m.arm = -1;
    g.data.scorch.push({ x: m.x, y: m.y, r: TN.util.rand(18, 26) });
    g.data.rings.push({ x: m.x, y: m.y, t: 0 });
    g.sfx('boom', pelosCaes ? 0.5 : undefined); g.shake(pelosCaes ? 4 : 10);
    g.particles(m.x, m.y, '#ffb020', pelosCaes ? 14 : 30, 300); g.particles(m.x, m.y, '#555', pelosCaes ? 8 : 16, 160, 1.0, 5);
    // estourada pelos cães não fere ninguém: a matilha corre quase na velocidade do jogador e o raio da
    // explosão viraria uma zona de morte 90 px à frente dela (no original a colheitadeira é bem mais lenta)
    if (pelosCaes) return;
    for (const p of this.active(g)) if (TN.util.dist(p.x, p.y, m.x, m.y) < this.BLAST) this.damage(g, p, m.x, m.y);
  },

  // pisou: a mina arma (aparece piscando, apita) e explode FUSE s depois, saia o jogador de cima ou não
  armar(g, m) {
    if (m.dead || m.arm >= 0) return;
    m.arm = 0; m.reveal = this.REVEAL; m.known = true;
    g.sfx('tick'); g.sfx('buzz', 0.5);
    g.popup('!', m.x, m.y - 30, '#ff3c28');
  },

  reachGoal(g, p) {
    const d = g.data;
    p.data.active = false; p.data.done = true; p.data.seat = d.vanSeats++;
    g.sfx('coin');
    g.addScore(p, 1);
    if (!d.firstDone) { d.firstDone = true; g.after(0.35, () => g.addScore(p, 1)); g.message(`${p.label} CHEGOU PRIMEIRO!`, 1.4, p.color); }
    if (!p.data.hurt) g.after(0.7, () => g.addScore(p, 1));
  },

  update(g, dt) {
    const U = TN.util, d = g.data;
    // ---- cães de guarda: saem de trás da largada e atravessam o campo ----
    const h = d.caes;
    if (!h.on && g.time >= this.CAES_DELAY) { h.on = true; g.sfx('buzz'); g.sfx('latido'); g.message('SOLTARAM OS CÃES!', 1.5, '#f55'); }
    if (h.on && h.x < d.goalX) {
      const prog = U.clamp((h.x - h.x0) / (d.goalX - h.x0), 0, 1);
      h.x = Math.min(d.goalX, h.x + this.CAES_VMAX * this.curvaCaes(prog) * dt);
      // a matilha estoura as minas por onde passa
      for (const m of d.mines) if (!m.dead && m.x < h.x + this.CAES_ALCANCE) this.explode(g, m, true);
      // latidos: mais altos e mais frequentes conforme a matilha se aproxima de quem está mais atrás
      h.latidoT -= dt;
      if (h.latidoT <= 0) {
        const ativos = this.active(g), menor = ativos.length ? Math.min(...ativos.map((p) => this.gapCaes(g, p))) : 400;
        const k = U.clamp(menor / 400, 0, 1);
        g.sfx('latido', U.lerp(1, 0.35, k));
        h.latidoT = U.lerp(this.LATIDO_PERTO, this.LATIDO_LONGE, k);
      }
    }
    // ---- jogadores ----
    for (const p of this.active(g)) {
      const b = p.data;
      b.inv -= dt;
      const sonar = p.input.a && !(p.tombo > 0);   // derrubado não usa o rádio
      if (sonar) {
        b.sonarT += dt;
        const r = ((b.sonarT % this.SONAR_TIME) / this.SONAR_TIME) * this.SONAR_R;
        for (const m of d.mines) if (!m.dead && U.dist(p.x, p.y, m.x, m.y) <= r) { if (m.reveal <= 0) g.sfx('blip'); m.reveal = Math.max(m.reveal, this.REVEAL); m.known = true; }
        b.distSinceSonar = 0;
      } else b.sonarT = 0;
      const ox = p.x, oy = p.y;
      const spd = this.SPEED * (b.lives < this.LIVES ? this.HURT_MULT : 1);
      // input relativo à câmera; com o sonar fica parado (o empurrão da explosão ainda desliza)
      const mv = sonar ? { x: 0, y: 0 } : this.paraMundo(p.input), save = p.input;
      p.input = { ...save, x: mv.x, y: mv.y };
      g.movePlayer(p, spd, dt, this.limites(g));
      p.input = save;
      g.decayPushLinear(p, dt, this.SHOVE_DECAY);
      const mx = p.x - ox, my = p.y - oy, moved = Math.hypot(mx, my);
      if (moved > 0.5) { b.lastMx = mx / moved; b.lastMy = my / moved; }
      b.distSinceSonar += moved;
      // rastro de óleo quando ferido
      if (b.lives < this.LIVES) { b.trailAcc += moved; if (b.trailAcc > 9) { b.trailAcc = 0; d.trail.push({ x: Math.round(p.x + U.rand(-4, 4)), y: Math.round(p.y + U.rand(-4, 4)), t: 4 }); } }
      // gatilho: o trecho andado neste quadro (não só a posição final) encostou numa mina? arma
      for (const m of d.mines) if (!m.dead && m.arm < 0 && U.segCircle(ox, oy, p.x, p.y, m.x, m.y, this.TRIG)) this.armar(g, m);
      // coleira: proximidade da mina mais próxima (0 = em cima, 1 = longe); pavio = mina armada mais
      // adiantada dentro do raio de explosão (a coleira pisca)
      let nd = 1e9; b.fuse = 0;
      for (const m of d.mines) {
        if (m.dead) continue;
        const dd = U.dist(p.x, p.y, m.x, m.y);
        if (dd < nd) nd = dd;
        if (m.arm >= 0 && dd < this.BLAST) b.fuse = Math.max(b.fuse, Math.max(1e-3, m.arm));
      }
      b.prox = U.clamp((nd - this.TRIG) / (this.DETECT - this.TRIG), 0, 1);
      // metade e chegada
      if (!b.half && p.x >= d.midX) { b.half = true; g.addScore(p, 1); g.sfx('pickup'); }
      if (p.x >= d.goalX) { this.reachGoal(g, p); continue; }
      // os cães pegam quem fica para trás
      if (h.on && p.x - p.r * 0.6 < h.x) {
        b.active = false; b.mordido = true;
        g.eliminate(p, { sound: 'hurt', msg: 'MORDIDO!' });
        g.particles(p.x, p.y, '#a00', 30, 260); g.sfx('latido', 1);
      }
    }
    U.separate(this.active(g));
    // minas armadas: apitam cada vez mais rápido e explodem ao fim do pavio
    let armadas = false;
    for (const m of d.mines) {
      if (m.dead || m.arm < 0) continue;
      armadas = true; m.arm += dt; m.reveal = Math.max(m.reveal, 0.6);
      if (m.arm >= this.FUSE) this.explode(g, m);
    }
    if (armadas) { h.tickT -= dt; if (h.tickT <= 0) { g.sfx('tick', 0.6); h.tickT = 0.2; } } else h.tickT = 0.2;
    for (const m of d.mines) m.reveal -= dt;
    for (const t of d.trail) t.t -= dt;
    d.trail = d.trail.filter((t) => t.t > 0);
    for (const r of d.rings) r.t += dt;
    d.rings = d.rings.filter((r) => r.t < 0.5);
    // fim: ninguém mais em campo (todos chegaram ou morreram)
    if (this.active(g).length === 0) g.finish(1.5);
  },

  // Bot: anda rumo à van, sonda quando a coleira esquenta, desvia das minas reveladas, foge do
  // raio se armar uma mina e corre sem sondar quando os cães encostam. Pensa no plano da lógica e
  // devolve o input já convertido para os controles relativos à câmera (paraInput).
  bot(g, p, dt) {
    const b = p.data;
    if (!b.active) return {};
    const o = this.botMundo(g, p, dt);
    return o.x === undefined ? o : { ...this.paraInput(o.x, o.y), a: o.a };
  },
  botMundo(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    const caesGap = this.gapCaes(g, p);
    // pavio armado perto: foge da mina (de lado/para trás, nunca para dentro dos cães) e sonda depois
    if (b.fuse > 0) {
      let ax = 0, ay = 0;
      for (const m of d.mines) if (!m.dead && m.arm >= 0) { const n = U.norm(p.x - m.x, p.y - m.y); ax += n.x; ay += n.y; }
      if (caesGap < 120) ax = Math.max(ax, 0.3);
      b.wantSonar = true;
      const n = U.norm(ax || -b.lastMx, ay || -b.lastMy);
      return { x: n.x, y: n.y };
    }
    // sonar em andamento: segura até o anel quase completar
    if (b.sonarT > 0) {
      if (b.sonarT < 1.45 && caesGap > 90) return { a: true };
      return { a: false };
    }
    // decide sondar: coleira quente e há mina desconhecida no caminho à frente
    let unknownAhead = false;
    for (const m of d.mines) {
      if (m.dead || m.known) continue;
      if (m.x > p.x - 5 && Math.abs(m.y - p.y) < 50 && U.dist(p.x, p.y, m.x, m.y) < 80) unknownAhead = true;
    }
    const hot = b.prox < 0.4 * b.caution;
    if (caesGap > 150 && unknownAhead && (b.wantSonar || (hot && b.distSinceSonar > 20))) {
      b.wantSonar = false;
      return { a: true };
    }
    // direção: rumo à van (+x), desviando das minas conhecidas e das bordas
    let fx = 1, fy = 0;
    for (const m of d.mines) {
      if (m.dead || !m.known) continue;
      const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy) || 1;
      if (dist > 95 || dx > 30) continue;
      const w = (95 - dist) / 95;
      fx += (dx / dist) * w * 1.2;
      fy += (Math.abs(dy) < 4 ? (p.y < (d.fy0 + d.fy1) / 2 ? 1 : -1) : Math.sign(dy)) * w * 2.6;
    }
    if (b.laneY === undefined) b.laneY = p.y;
    fy += U.clamp((b.laneY - p.y) / 150, -0.4, 0.4);   // cada bot prefere a própria faixa (evita bolo)
    if (p.y < d.fy0 + 30) fy += 0.8;
    if (p.y > d.fy1 - 30) fy -= 0.8;
    b.noiseT -= dt;
    if (b.noiseT <= 0) { b.noiseT = U.rand(0.6, 1.6); b.noise = U.rand(-0.35, 0.35); }
    fy += b.noise;
    if (caesGap < 150) fx += 1;  // pressa!
    const n = U.norm(fx, fy);
    return { x: n.x, y: n.y };
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Terreno baldio entre o muro da cadeia e a cerca de fora, visto pelas costas como no original: a
  // câmera fica atrás do rombo no muro (a largada), alta, olhando ao longo do corredor estreito até a van
  // no portão da cerca; cercas de arame nas laterais, entulho, árvores secas e a placa de aviso. A matilha
  // entra por baixo da tela (de trás da largada) e cruza o campo; dois cães ficam em cima de quem foi mordido.
  camera: { pos: [-330, 295, 275], target: [560, 0, 275], fov: 44 },
  env: { bg: '#05070a', fog: [1500, 2900], ambient: 0.42, sun: 0.9, sunDir: [0.35, 1, -0.5], sunColor: '#a9c1ff', hemiSky: '#6f86b0', hemiGround: '#1a140c' },

  // muro da cadeia com o rombo da largada, cercas, entulho, árvores secas, placa e morros ao fundo
  drawTerreno3d(g, r) {
    const a = g.arena, d = g.data, y0 = d.fy0, y1 = d.fy1, cy = (y0 + y1) / 2, fx0 = a.x + 70, fieldW = d.goalX - fx0;
    let s = d.seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // chão de terra batida em volta e faixas do campo
    r.plane(700, -1.5, cy, 3600, 2400, '#3a3122', { tex: 'concreto' });
    for (let i = 0; i < 6; i++) r.plane(fx0 + fieldW / 2, 0, y0 + ((y1 - y0) / 6) * (i + 0.5), fieldW, (y1 - y0) / 6 + 0.5, i % 2 ? '#3d3424' : '#352d1f', { rough: 1 });
    // tufos de mato e pedras soltas (só enfeite; mesma semente do 2D)
    for (let i = 0; i < 80; i++) {
      const x = fx0 + rnd() * (fieldW - 6), z = y0 + 4 + rnd() * (y1 - y0 - 8), sz = 3 + rnd() * 4, k = rnd();
      if (k < 0.82) r.cone(x, 0, z, sz, sz * 2.2, ['#4f5a2a', '#5a6630', '#46502a'][Math.floor(rnd() * 3)], { shadow: false, rough: 1 });
      else r.box(x, 0, z, sz * 1.6, sz * 0.6, sz * 1.3, '#57554f', { rotY: rnd() * 3, tex: 'concreto' });
    }
    // muro da cadeia com o rombo: dois trechos de concreto claro, pontas quebradas em degrau e arame no topo
    const MX = 104, MH = 170, MURO = '#8a8880';
    for (const sd of [-1, 1]) {
      const zi = sd < 0 ? y0 - 6 : y1 + 6, ze = zi + sd * 520, zc = (zi + ze) / 2;
      r.box(MX, 0, zc + sd * 40, 22, MH, 440, MURO, { tex: 'concreto' });
      r.box(MX, 0, zi + sd * 20, 22, MH * 0.55, 40, MURO, { tex: 'concreto' });   // ponta quebrada
      r.box(MX, MH * 0.55, zi + sd * 36, 22, MH * 0.25, 8, MURO, { tex: 'concreto' });
      for (let k = 0; k < 4; k++) r.box(MX + 30 + k * 9, 0, zi + sd * (14 + k * 11), 14, 6, 12, '#77756d', { rotY: k, tex: 'concreto' });   // cacos
      for (let k = 0; k < 9; k++) r.box(MX, MH, zi + sd * (60 + k * 50), 24, 4, 3, '#55534e', { metal: 0.5 });
      r.beam(MX, MH + 14, zi + sd * 60, MX, MH + 14, ze, 1.4, '#6a6c6e', { metal: 0.7, shadow: false });
      for (let k = 0; k < 9; k++) r.ring(MX, MH + 4, zi + sd * (70 + k * 48), 7, 9, "#6a6c6e", { rotX: Math.PI / 2, tex: false });
    }
    // cercas de arame (postes enferrujados, tela e fios) nas duas laterais, do muro à van
    for (const z of [y0 - 14, y1 + 14]) {
      const x0 = MX + 12, x1 = d.endX + 30;
      for (let x = x0; x <= x1; x += 110) { r.box(x, 0, z, 5, 92, 5, '#5a4030', { metal: 0.4 }); r.beam(x, 92, z, x, 104, z + (z < cy ? -10 : 10), 2, '#5a4030'); }
      r.box((x0 + x1) / 2, 0, z, x1 - x0, 88, 1, '#8a8f96', { opacity: 0.15, tex: false, shadow: false });
      for (const hy of [30, 60, 88]) r.beam(x0, hy, z, x1, hy, z, 1.1, '#8a8f96', { metal: 0.7, shadow: false });
      r.beam(x0, 102, z + (z < cy ? -9 : 9), x1, 102, z + (z < cy ? -9 : 9), 1.1, '#6a6c6e', { metal: 0.7, shadow: false });
      // holofotes nos postes, virados para dentro
      const zp = z < cy ? z - 26 : z + 26;
      for (let x = MX + 260; x < x1; x += 320) {
        r.cyl(x, 0, zp, 3, 140, '#3a3d40', { metal: 0.6 });
        r.box(x, 138, zp - Math.sign(zp - cy) * 10, 10, 6, 22, '#2a2d30', { metal: 0.5 });
        r.box(x, 136, zp - Math.sign(zp - cy) * 12, 7, 2, 18, '#ffe2b0', { glow: true });
      }
    }
    // muro desabado (laje caída) e árvores secas do lado de fora das cercas
    r.box(560, 0, y1 + 80, 220, 18, 70, '#7d7b74', { rotY: 0.25, rotX: 0.12, tex: 'concreto' });
    r.box(470, 0, y1 + 120, 26, 110, 70, '#85837b', { rotY: 0.25, tex: 'concreto' });
    for (const [tx, tz, th] of [[430, y0 - 120, 210], [880, y1 + 110, 260], [1050, y0 - 90, 170], [300, y1 + 190, 190]]) {
      r.tube(tx, 0, tz, tx + 6, th, tz + 4, 7, '#2e2620', { rough: 1 });
      for (let k = 0; k < 4; k++) { const by = th * (0.45 + k * 0.13), ang = k * 1.9; r.tube(tx + 3, by, tz, tx + 3 + Math.cos(ang) * 60, by + 40, tz + Math.sin(ang) * 60, 3, '#2e2620', { rough: 1 }); }
    }
    // placa de aviso (amarela, caveira e ossos) no rombo do muro, como a "DANGER MINEFIELD"
    const PX = MX + 26, PZ = y1 + 26;
    r.box(PX, 0, PZ, 4, 66, 4, '#5a4030');
    r.box(PX - 3, 50, PZ, 2, 34, 50, '#e8c200', { rotX: 0.15 });
    r.box(PX - 4.5, 70, PZ, 1, 8, 8, '#141414', { tex: false });
    for (const k of [-1, 1]) r.box(PX - 4.5, 58, PZ, 1, 3, 26, '#141414', { tex: false, rotX: k * 0.6 });
    // cerca de fora atrás da van (o portão aberto) e morros escuros ao fundo
    for (let z = y0 - 400; z <= y1 + 400; z += 110) if (Math.abs(z - cy) > 140) r.box(d.endX + 60, 0, z, 5, 92, 5, '#5a4030', { metal: 0.4 });
    for (const hy of [30, 60, 88]) for (const sd of [-1, 1]) r.beam(d.endX + 60, hy, cy + sd * 140, d.endX + 60, hy, cy + sd * 520, 1.1, '#8a8f96', { metal: 0.7, shadow: false });
    for (let i = 0; i < 7; i++) r.cone(d.endX + 380 + (i % 2) * 160, 0, cy - 900 + i * 300, 260, 160 + (i % 3) * 50, '#17150f', { tex: false, shadow: false });
  },

  draw3d(g, r) {
    const U = TN.util, a = this.limites(g), d = g.data;
    const q = (v) => Math.round(U.clamp(v, 0, 1) * 10) / 10;           // opacidade em degraus (poucos materiais)
    const y0 = d.fy0, y1 = d.fy1, H = y1 - y0;
    this.drawTerreno3d(g, r);
    // largada de concreto + faixa de perigo
    r.box(a.x + 35, -2, (y0 + y1) / 2, 70, 4, H, '#4a4f55', { rough: 0.9 });
    for (let z = y0; z < y1; z += 35) r.plane(a.x + 35, 2.2, z, 70, 1.5, '#3a3e43');
    const stripes = (x, y) => { for (let k = 0; k < 12; k++) r.box(x, y, y0 + (k + 0.5) * (H / 12), 6, 1.2, H / 12, k % 2 ? '#141414' : '#f5c400', { shadow: false }); };
    stripes(a.x + 67, 2);
    // linha da metade (tracejada, brilhante)
    for (let z = y0 + 10; z < y1; z += 24) r.plane(d.midX, 0.6, z + 6, 3, 12, '#cfd6c0', { glow: true, opacity: 0.45 });
    r.label(d.midX, 4, y0 - 6, 'METADE +1', 'rgba(255,255,255,0.7)', 12);
    // chegada: faixa e área verde
    stripes(d.goalX - 1, 0.4);
    r.plane((d.goalX + d.endX) / 2, 0.3, (y0 + y1) / 2, d.endX - d.goalX, H, '#9be04a', { glow: true, opacity: 0.12 });
    // marcas de explosão, rastro de óleo
    for (const sc of d.scorch) { r.disc(sc.x, 0.5, sc.y, sc.r * 1.5, '#0a0806', { opacity: 0.6 }); r.disc(sc.x, 0.6, sc.y, sc.r * 0.8, '#050403', { opacity: 0.9 }); }
    for (const t of d.trail) r.disc(t.x, 0.7, t.y, 3, '#2a0a06', { opacity: q(Math.min(1, t.t / 2) * 0.8) });
    // minas reveladas
    const blink = Math.sin(g.time * 14) > 0, lightsArm = [];
    for (const m of d.mines) {
      if (m.dead || m.reveal <= 0) continue;
      const k = q(Math.min(1, m.reveal / 0.6));
      r.ring(m.x, 0.8, m.y, this.TRIG - 2, this.TRIG, '#ff3c28', { glow: true, opacity: q(k * 0.5) });
      r.cyl(m.x, 0, m.y, 9, 4, '#2a2a2a', { metal: 0.6, rough: 0.4, opacity: k });
      r.cyl(m.x, 4, m.y, 4, 2, '#555', { metal: 0.7, opacity: k });
      // armada: luz piscando bem rápido, raio da explosão no chão e o arco do pavio
      if (m.arm >= 0) {
        const fast = Math.sin(g.time * 40) > 0, f = Math.min(1, m.arm / this.FUSE);
        r.sphere(m.x, 7, m.y, 4, fast ? '#ffffff' : '#ff2020', { glow: true });
        r.ring(m.x, 1, m.y, this.BLAST - 4, this.BLAST, '#ff3c28', { glow: true, opacity: fast ? 0.7 : 0.3 });
        r.ring(m.x, 1.1, m.y, this.TRIG + 4, this.TRIG + 9, '#ffffff', { glow: true, arc: Math.max(0.02, f) });
        lightsArm.push([m.x, 30, m.y, '#ff3020', fast ? 1.6 : 0.6, 200]);
      } else r.sphere(m.x, 7, m.y, 2.6, blink ? '#ff3030' : '#600', { glow: true, opacity: k });
    }
    // anéis de explosão (+ clarão)
    const lights = [];
    for (const rg of d.rings) {
      const k = rg.t / 0.5, rad = this.BLAST * (0.3 + k * 0.7);
      r.ring(rg.x, 2, rg.y, rad - 5, rad, '#ffbe3c', { glow: true, opacity: q(1 - k) });
      r.sphere(rg.x, 10, rg.y, 26 * (1 - k) + 4, '#ffd27a', { glow: true, opacity: q(0.8 - k * 0.8) });
      lights.push([rg.x, 50, rg.y, '#ffa040', 2.2 * (1 - k), 320]);
    }
    // ---- van (caçamba aberta) ----
    this.drawVan3d(g, r);
    // ---- matilha cruzando o campo e cães em cima de quem foi mordido ----
    this.drawMatilha3d(g, r);
    this.drawCaes3d(g, r);
    // poste de luz quente na largada e na chegada
    for (const [x, z] of [[a.x + 20, a.y - 30], [d.goalX + 40, a.y + a.h + 34]]) {
      r.cyl(x, 0, z, 3, 120, '#3a3d40', { metal: 0.6 });
      r.box(x + 8, 118, z, 22, 6, 10, '#2a2d30', { metal: 0.5 });
      r.box(x + 8, 116, z, 18, 2, 7, '#ffe2b0', { glow: true });
    }
    lights.push([a.x + 40, 150, a.y + 30, '#ffd9a8', 1.0, 600], [d.goalX + 20, 150, a.y + a.h - 10, '#ffd9a8', 1.1, 650]);
    // ---- jogadores ----
    for (const p of g.players) {
      const b = p.data;
      if (b.done) continue;                       // quem chegou está sentado na van
      if (!b.active) { r.character(p); continue; } // morto (deitado)
      if (p.input.a && b.sonarT > 0) {
        const k = (b.sonarT % this.SONAR_TIME) / this.SONAR_TIME, rad = Math.max(2, k * this.SONAR_R);
        r.ring(p.x, 1.2, p.y, Math.max(0.5, rad - 3), rad, '#78fff0', { glow: true, opacity: q(0.9 - k * 0.7) });
        r.ring(p.x, 1.1, p.y, Math.max(0.5, rad * 0.55 - 1.5), rad * 0.55, '#78fff0', { glow: true, opacity: q(0.5 - k * 0.4) });
        r.disc(p.x, 0.9, p.y, rad, '#78fff0', { glow: true, opacity: q(0.12 * (1 - k)) });
        lights.push([p.x, 40, p.y, '#78fff0', 0.8, 220]);
      }
      // coleira: anel no chão verde (longe) → vermelho (perto); pisca com o pavio armado
      let col;
      if (b.fuse > 0) col = Math.sin(g.time * 32) > 0 ? '#ff2020' : '#ffffff';
      else { const t = Math.round(b.prox * 10) / 10; col = `rgb(${Math.round(255 * Math.min(1, 2 - 2 * t))},${Math.round(255 * Math.min(1, 2 * t))},40)`; }
      r.ring(p.x, 1.5, p.y, p.r + 1, p.r + 5, col, { glow: true });
      r.sphere(p.x, 44, p.y, 2.2, col, { glow: true });   // luz da coleira em volta do pescoço
      if (b.fuse > 0) r.ring(p.x, 1.6, p.y, p.r + 7, p.r + 11, '#ffffff', { glow: true, arc: Math.min(1, b.fuse / this.FUSE) });
      r.character(p, { pose: p.input.a && b.sonarT > 0 ? 'crouch' : 'auto', flash: b.inv > 0 && Math.sin(g.time * 40) > 0 });
    }
    // luzes: as mais importantes primeiro (máx. 6): minas armadas, explosões, sonar, postes
    for (const l of lightsArm.slice(0, 2).concat(lights).slice(0, 6)) r.light(...l);
  },

  drawVan3d(g, r) {
    const a = this.limites(g), d = g.data;
    const x0 = d.goalX + 6, w = a.x + a.w - x0, cx = x0 + w / 2, z0 = a.y + a.h / 2 - 110, z1 = z0 + 220;
    const body = '#d8dde2', o = { metal: 0.35, rough: 0.45 };
    // rodas
    for (const z of [z0 + 34, z1 - 36]) for (const x of [x0 + 6, x0 + w + 2]) r.cyl(x, 14, z, 14, 8, '#151515', { rotZ: Math.PI / 2, rough: 0.9 });
    // chassi e piso da caçamba
    r.box(cx, 12, (z0 + z1) / 2, w, 8, 220, '#2b2f33', { metal: 0.5 });
    // cabine na frente (lado de longe), com para-brisa azulado
    r.box(cx, 20, z0 + 30, w, 58, 60, body, o);
    r.box(cx, 50, z0 - 0.5, w - 10, 22, 2, '#8fd3ff', { glow: true, opacity: 0.85 });
    r.box(cx, 50, z0 + 60.5, w - 12, 16, 2, '#1c2228');
    for (const x of [x0 + 10, x0 + w - 10]) { r.sphere(x, 30, z0 - 1, 4, '#fff6d0', { glow: true }); }
    // caçamba: paredes baixas, aberta em cima
    const bz = (z0 + 60 + z1) / 2, bl = z1 - z0 - 60;
    r.box(cx, 20, bz, w, 2, bl, '#1c2228');
    r.box(x0 + w - 3, 20, bz, 6, 26, bl, body, o);
    r.box(x0 + 3, 20, bz - bl / 2 + 15, 6, 26, 30, body, o);       // lateral do lado do campo: porta aberta
    r.box(x0 + 3, 20, bz + bl / 2 - 15, 6, 26, 30, body, o);
    r.box(cx, 20, z1 - 3, w, 26, 6, body, o);
    r.box(cx, 30, z1 - 0.5, w - 20, 5, 2, '#ff2a2a', { glow: true });  // lanternas
    r.label(cx, 98, z0 + 30, 'VAN', '#9be04a', 14);
    // quem chegou fica sentado na caçamba
    for (const p of g.players) {
      if (!p.data.done) continue;
      const st = p.data.seat;
      r.character({ ...p, x: x0 + 18 + (st % 2) * 22, y: z0 + 82 + st * 30, alive: true }, { key: 'van' + p.id, pose: 'sit', y: 20, dir: Math.PI / 2, scale: 0.9 });
    }
  },

  // um cão (caixas pretas baixas com olhos vermelhos) virado para `ang` (0 = +x); `passo` anima as patas
  cao3d(r, x, z, ang, passo = null, alt = 0) {
    const c = Math.cos(ang), s = Math.sin(ang);
    r.box(x, 8 + alt, z, 28, 12, 12, '#2a221c', { rotY: ang, rough: 0.9 });
    r.box(x + c * 16, 12 + alt, z - s * 16, 10, 9, 9, '#1c1712', { rotY: ang, rough: 0.9 });   // cabeça
    for (const k of [-1, 1]) r.box(x + c * 14 + s * k * 3, 21 + alt, z - s * 14 + c * k * 3, 3, 6, 2, '#1c1712', { rotY: ang, shadow: false });   // orelhas em pé
    r.box(x + c * 11, 10 + alt, z - s * 11, 3, 10, 13, '#b02020', { rotY: ang, shadow: false });   // coleira vermelha da guarda
    r.box(x + c * 22, 13 + alt, z - s * 22, 6, 4, 6, '#0c0d0f', { rotY: ang, shadow: false });   // focinho
    r.box(x - c * 16, 16 + alt, z + s * 16, 9, 2, 2, '#111214', { rotY: ang, shadow: false });   // cauda
    for (const k of [-1, 1]) r.sphere(x + c * 20 + s * k * 2.6, 15 + alt, z - s * 20 + c * k * 2.6, 1.3, '#ff3030', { glow: true });
    if (passo !== null) for (const [fx, fz, fase] of [[9, 4, 0], [9, -4, Math.PI], [-9, 4, Math.PI], [-9, -4, 0]]) {
      const sw = Math.sin(passo + fase) * 4;   // patas indo e voltando
      r.box(x + c * (fx + sw) + s * fz, 0, z - s * (fx + sw) + c * fz, 3, 8 + alt, 3, '#0c0d0f', { rotY: ang, shadow: false });
    }
  },

  // a matilha: uma fileira de cães de cerca a cerca na frente de h.x, galopando (só depois de soltos)
  drawMatilha3d(g, r) {
    const d = g.data, h = d.caes;
    if (!h.on) return;
    const n = 6, H = d.fy1 - d.fy0;
    for (let i = 0; i < n; i++) {
      const passo = g.time * 18 + i * 1.7, pulo = Math.abs(Math.sin(passo / 2)) * 4;
      const x = h.x - 14 - (i % 2) * 20 + Math.sin(g.time * 3 + i * 2) * 4;
      const z = d.fy0 + (i + 0.5) * (H / n) + Math.sin(g.time * 5 + i) * 6;
      this.cao3d(r, x, z, 0.12 * Math.sin(g.time * 7 + i), passo, pulo);
    }
  },

  // dois cães em cima de cada jogador mordido
  drawCaes3d(g, r) {
    for (const p of g.players) {
      if (!p.data.mordido) continue;
      for (const [ox, oz, ang] of [[-14, -12, 0.5], [16, 10, -0.9]]) this.cao3d(r, p.x + ox, p.y + oz, ang);
    }
  },

  drawOverlay(g, c) {
    if (!g.uses3d()) return;   // (uses3d já confere TN.R3.available)
    // cão a menos de CAES_PERTO de alguém: as bordas pulsam em vermelho e o aviso aparece
    const ameacado = this.active(g).some((p) => this.gapCaes(g, p) < this.CAES_PERTO);
    if (ameacado) {
      const k = 0.22 + 0.18 * Math.sin(g.time * 14);
      c.fillStyle = `rgba(255,30,30,${k.toFixed(2)})`;
      c.fillRect(0, 34, g.W, 60); c.fillRect(0, g.H - 60, g.W, 60); c.fillRect(0, 34, 60, g.H - 34); c.fillRect(g.W - 60, 34, 60, g.H - 34);
      if (Math.floor(g.time * 6) % 2 === 0) TN.draw.text(c, 'CÃES!', g.W / 2, g.H - 30, { size: 26, color: '#ff4040', align: 'center' });
    }
    // vidas embaixo de cada jogador em campo
    for (const p of g.players) {
      const b = p.data;
      if (!b.active) continue;
      const s = TN.R3.project(p.x, 0, p.y);   // logo abaixo dos pés, na tela (a câmera é pelas costas)
      for (let i = 0; i < this.LIVES; i++) {
        c.fillStyle = i < b.lives ? '#ff4d5e' : '#333';
        c.fillRect(s.x - 9 + i * 12, s.y + 10, 8, 5);
      }
    }
  },

  draw(g, c) {
    const U = TN.util, a = this.limites(g), d = g.data, D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    // o campo é mais comprido que a tela: escala uniforme para caber na largura da arena
    const k = g.arena.w / a.w;
    c.save(); c.translate(a.x, g.arena.y + g.arena.h / 2); c.scale(k, k); c.translate(-a.x, -(a.y + a.h / 2));
    // chão de terra + mato
    c.fillStyle = '#3a3122'; c.fillRect(a.x, a.y, a.w, a.h);
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#3d3424' : '#372f20'; c.fillRect(a.x + 70, a.y + (a.h / 9) * i, d.goalX - a.x - 70, a.h / 9); }
    // tufos de mato: pseudoaleatório fixo a partir da semente da rodada
    let s = d.seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 140; i++) {
      const x = a.x + 70 + rnd() * (d.goalX - a.x - 76), y = a.y + 4 + rnd() * (a.h - 8), sz = 2 + rnd() * 3;
      c.fillStyle = ['#4f5a2a', '#5a6630', '#46502a'][Math.floor(rnd() * 3)]; c.fillRect(x, y, sz, sz * 0.6);
    }
    // largada (concreto)
    D.floor(c, a.x, a.y, 70, a.h, { tile: 35, a: '#4a4f55', b: '#52575d' });
    D.hazardStripes(c, a.x + 64, a.y, 6, a.h, 6);
    // linha da metade
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.setLineDash([10, 10]);
    c.beginPath(); c.moveTo(d.midX, a.y); c.lineTo(d.midX, a.y + a.h); c.stroke(); c.setLineDash([]);
    D.text(c, 'METADE +1', d.midX, a.y + 12, { size: 11, color: 'rgba(255,255,255,0.55)', align: 'center' });
    // marcas de explosão e rastro
    for (const s of d.scorch) {
      const gr = c.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 1.6);
      gr.addColorStop(0, 'rgba(10,8,6,0.95)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(s.x, s.y, s.r * 1.6, 0, Math.PI * 2); c.fill();
    }
    for (const t of d.trail) { c.globalAlpha = Math.min(1, t.t / 2) * 0.8; c.fillStyle = '#2a0a06'; c.beginPath(); c.arc(t.x, t.y, 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    // minas reveladas
    for (const m of d.mines) {
      if (m.dead || m.reveal <= 0) continue;
      c.globalAlpha = Math.min(1, m.reveal / 0.6);
      c.strokeStyle = 'rgba(255,60,40,0.35)'; c.lineWidth = 1; c.setLineDash([3, 4]);
      c.beginPath(); c.arc(m.x, m.y, this.TRIG, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#222'; c.strokeStyle = '#777'; c.lineWidth = 2;
      c.beginPath(); c.arc(m.x, m.y, 9, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = Math.sin(g.time * 14) > 0 ? '#f33' : '#600'; c.beginPath(); c.arc(m.x, m.y, 3.5, 0, Math.PI * 2); c.fill();
      if (m.arm >= 0) {   // armada: raio da explosão piscando
        c.globalAlpha = 1; c.strokeStyle = Math.sin(g.time * 40) > 0 ? '#ff3c28' : '#ffffff'; c.lineWidth = 2;
        c.beginPath(); c.arc(m.x, m.y, this.BLAST, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    }
    // anéis de explosão
    for (const r of d.rings) {
      c.strokeStyle = `rgba(255,190,60,${1 - r.t / 0.5})`; c.lineWidth = 4;
      c.beginPath(); c.arc(r.x, r.y, this.BLAST * (0.3 + r.t / 0.5 * 0.7), 0, Math.PI * 2); c.stroke();
    }
    // van (vista de cima, porta traseira aberta para a esquerda)
    this.drawVan(g, c);
    // jogadores mortos, depois vivos com coleira, sonar e vidas
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.players) {
      const b = p.data;
      if (!b.active) continue;
      if (p.input.a && b.sonarT > 0) {
        const k = (b.sonarT % this.SONAR_TIME) / this.SONAR_TIME;
        c.strokeStyle = `rgba(120,255,240,${0.9 - k * 0.7})`; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, Math.max(1, k * this.SONAR_R), 0, Math.PI * 2); c.stroke();
        c.fillStyle = `rgba(120,255,240,${0.08 * (1 - k)})`; c.fill();
      }
      g.drawPlayer(c, p, { flash: b.inv > 0 && Math.sin(g.time * 40) > 0 });
      // coleira: verde (longe) -> vermelho (perto); pisca rápido com o pavio armado
      let col;
      if (b.fuse > 0) col = Math.sin(g.time * 32) > 0 ? '#ff2020' : '#ffffff';
      else { const t = b.prox; col = `rgb(${Math.round(255 * Math.min(1, 2 - 2 * t))},${Math.round(255 * Math.min(1, 2 * t))},40)`; }
      c.strokeStyle = col; c.lineWidth = 4;
      c.beginPath(); c.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); c.stroke();
      if (b.fuse > 0) {
        c.strokeStyle = '#fff'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.fuse / this.FUSE)); c.stroke();
      }
      for (let i = 0; i < this.LIVES; i++) {
        c.fillStyle = i < b.lives ? '#ff4d5e' : '#333';
        c.fillRect(p.x - 9 + i * 12, p.y + p.r + 8, 7, 5);
      }
    }
    this.drawCaes2d(g, c);
    c.restore();
  },

  drawVan(g, c) {
    const a = this.limites(g), d = g.data, D = TN.draw;
    const x = d.goalX + 6, y = a.y + a.h / 2 - 110, w = a.x + a.w - x, h = 220;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 6, y + 8, w, h);
    c.fillStyle = '#d8dde2'; c.strokeStyle = '#222'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.stroke();
    c.fillStyle = '#1c2228'; c.fillRect(x + 6, y + 14, w - 18, h - 28);   // caçamba aberta
    c.fillStyle = '#8fd3ff'; c.fillRect(x + w - 10, y + 20, 6, h - 40);   // para-brisa
    D.text(c, 'VAN', x + w / 2 - 4, y - 12, { size: 14, color: '#9be04a', align: 'center' });
    // quem chegou fica sentado na van
    for (const p of g.players) {
      if (!p.data.done) continue;
      const s = p.data.seat;
      TN.draw.robot(c, x + 20 + (s % 2) * 18, y + 40 + Math.floor(s / 2) * 46 + (s % 2) * 20, 11, p.color, { dir: 0 });
    }
    // faixa de chegada
    D.hazardStripes(c, d.goalX - 4, a.y, 6, a.h, 6);
    c.fillStyle = 'rgba(155,224,74,0.12)'; c.fillRect(d.goalX - 4, a.y, a.x + a.w - d.goalX + 4, a.h);
  },

  // 2D (de cima): a matilha como manchas pretas com olhos, e dois cães sobre cada mordido
  drawCaes2d(g, c) {
    const a = this.limites(g), h = g.data.caes;
    const cao = (x, y, ang) => {
      c.save(); c.translate(x, y); c.rotate(ang);
      c.fillStyle = '#111214'; c.beginPath(); c.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(13, 0, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff3030'; c.fillRect(15, -3, 2, 2); c.fillRect(15, 1, 2, 2);
      c.restore();
    };
    if (h.on && h.x > a.x - 28) {
      c.save(); c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
      for (let i = 0; i < 5; i++) cao(h.x - 10 - (i % 2) * 22, a.y + (i + 0.5) * (a.h / 5) + Math.sin(g.time * 6 + i) * 6, 0.15 * Math.sin(g.time * 8 + i));
      c.restore();
    }
    for (const p of g.players) if (p.data.mordido) { cao(p.x - 12, p.y - 10, 0.5); cao(p.x + 14, p.y + 8, -0.9); }
  },
});
