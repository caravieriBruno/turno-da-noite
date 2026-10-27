// TRIAGEM — inspirado em "THE FILTER" (burn_recycle) de Machine Party.
// Cada um tem a sua esteira, com a MESMA sequência de itens para todos. Arte vai para o fogo,
// tecnologia vai para a reciclagem. No fim de cada turno, o pior da linha é esmagado pela prensa.
// Vários turnos (cada um 1 s mais curto) dentro da mesma rodada, até sobrar um.
// Cenário como o original: almoxarifado em cruz com as quatro esteiras em cata-vento em volta do incinerador,
// e tela dividida (uma câmera por operador, por cima do ombro).
TN.registerMinigame({
  id: 'triagem',
  title: 'TRIAGEM',
  inspiredBy: 'The Filter (burn_recycle)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Trabalhe na linha: queime a ARTE (vermelho).', 'Recicle a TECNOLOGIA (verde).', 'No fim do turno, o pior da linha é prensado.'],
  controls: { a: 'QUEIMAR (arte)', b: 'RECICLAR (tecnologia)' },
  icon: '♻',
  color: '#ff5a3c',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes (originais: turno 15 s, −1 s por turno, mín. 10; erro trava 0,2 s; 500 itens) ----
  FIRST_TIME: 15, MIN_TIME: 10, LOCK: 0.2, SEQ_LEN: 500, MAX_SUBS: 8,
  PAUSA: 1.5,              // pausa com contagem 3-2-1 entre os turnos
  SLOT_X: 178, SLOT_GAP: 68, VISIBLE: 10,
  // 8 tipos: 0–3 arte (queimar), 4–7 tecnologia (reciclar)
  ITEMS: [
    { name: 'QUADRO', art: true }, { name: 'BUSTO', art: true }, { name: 'VASO', art: true }, { name: 'PARTITURA', art: true },
    { name: 'CHIP', art: false }, { name: 'BATERIA', art: false }, { name: 'ENGRENAGEM', art: false }, { name: 'MONITOR', art: false },
  ],

  init(g) {
    const d = g.data, a = g.arena, U = TN.util;
    d.seq = [];
    for (let i = 0; i < this.SEQ_LEN; i++) d.seq.push(U.randInt(0, 7));
    d.sub = 1; d.subTime = this.FIRST_TIME; d.timer = d.subTime;
    d.phase = 'play';     // play → judge → pause → play ...
    d.banner = null;
    d.flying = [];        // itens saindo da esteira (animação)
    const n = g.players.length, laneH = Math.min(102, a.h / n);
    const top = a.y + (a.h - laneH * n) / 2;
    const seats = this.SEATS3[Math.min(4, Math.max(1, n))];
    g.players.forEach((p, i) => {
      // p.x/p.y = lugar do operador no chão do 3D (baia em cata-vento); lane = faixa do desenho 2D de reserva
      const seat = seats[i % seats.length], w = this.W(seat, this.UP3, 0), e = this.eixo(seat);
      p.x = w.x; p.y = w.z; p.dir = Math.atan2(-e.uz, -e.ux);
      Object.assign(p.data, { seat, lane: { y: top + laneH * i, h: laneH }, idx: 0, sub: 0, total: 0, lock: 0, wrong: 0, shift: 0, crush: 0, lastBurn: null });
    });
  },

  // Age no item ativo: certo +1, errado trava; em ambos a esteira avança.
  act(g, p, burn) {
    const d = g.data, pd = p.data;
    const item = this.ITEMS[d.seq[pd.idx % d.seq.length]];
    const ok = item.art === burn;
    // x/y: posição no desenho 2D; pid: dono (o 3D acha a baia por ele)
    d.flying.push({ type: d.seq[pd.idx % d.seq.length], x: this.SLOT_X, y: pd.lane.y + pd.lane.h / 2, vy: burn ? -260 : 260, t: 0.35, burn, pid: p.id });
    pd.idx++; pd.shift = 1; pd.lastBurn = burn;
    if (ok) {
      pd.sub++; pd.total++;
      g.sfx(burn ? 'shoot' : 'coin');
      const w = this.W(pd.seat, 0, burn ? 60 : -60);
      g.particles(w.x, w.z, burn ? '#ff7a2a' : '#46e27b', 6, 120, 0.35);
    } else {
      pd.lock = this.LOCK; pd.wrong = 0.3;
      g.sfx('buzz');
    }
  },

  update(g, dt) {
    const d = g.data;
    if (d.phase === 'play') {
      d.timer -= dt;
      if (d.timer <= 3 && d.timer > 0 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt)) g.sfx('tick');
      if (d.timer <= 0) this.endSub(g);
    } else if (d.phase === 'pause') {
      d.pauseT -= dt;
      const n = Math.ceil(d.pauseT / (this.PAUSA / 3));   // 3 → 2 → 1 → 0
      if (n !== d.contagem && n > 0) g.sfx('tick');
      d.contagem = Math.max(0, n);
      if (d.pauseT <= 0) {
        d.phase = 'play'; d.timer = d.subTime;
        g.sfx('go'); g.flash('#fff', 0.1); g.message('JÁ!', 0.6, '#ff5a3c');
      }
    }
    for (const p of g.players) {
      const pd = p.data;
      pd.lock -= dt; pd.wrong -= dt; pd.shift = Math.max(0, pd.shift - dt * 9); pd.subFlash = Math.max(0, (pd.subFlash || 0) - dt);
      if (pd.crush > 0) pd.crush = Math.min(1, pd.crush + dt * 4);
      if (!p.alive) pd.deadT = (pd.deadT || 0) + dt;   // só para a animação 3D da prensa subindo
      if (!p.alive || d.phase !== 'play' || pd.lock > 0) continue;
      if (p.input.aPressed) this.act(g, p, true);
      else if (p.input.bPressed) this.act(g, p, false);
    }
    for (const f of d.flying) { f.y += f.vy * dt; f.t -= dt; }
    d.flying = d.flying.filter((f) => f.t > 0);
  },

  // Fim do turno: decide quem a prensa esmaga.
  endSub(g) {
    const d = g.data, U = TN.util;
    d.phase = 'judge'; d.timer = 0;
    g.sfx('buzz');
    const al = g.alive();
    const min = Math.min(...al.map((p) => p.data.sub));
    const lows = al.filter((p) => p.data.sub === min);
    let victim = null;
    if (min === 0) victim = U.pick(lows);          // ninguém pontuou? sorteia um dos zerados
    else if (lows.length === 1) victim = lows[0];  // menor pontuação única
    d.banner = victim ? { text: `PIOR DA LINHA: ${victim.label} (${min})`, color: '#f55' } : { text: `EMPATE NO ÚLTIMO LUGAR (${min}): NINGUÉM SAI`, color: '#9f9' };
    g.after(1.3, () => {
      if (victim) {
        victim.data.crush = 0.01;
        g.after(0.3, () => { g.eliminate(victim, { sound: 'boom', msg: 'PRENSADO!' }); g.shake(10); g.particles(victim.x, victim.y, '#999', 20, 200); });
      }
      g.after(1.4, () => {
        if (g.alive().length <= 1) return; // o motor encerra a rodada
        if (d.sub >= this.MAX_SUBS) {
          // limite de segurança: fecha o expediente; quem fez menos no total sai primeiro (empatados no topo ficam)
          const rest = g.alive().sort((p, q) => p.data.total - q.data.total);
          const best = rest[rest.length - 1].data.total;
          for (const p of rest) if (p.data.total < best) g.eliminate(p, { sound: 'hurt', msg: 'DEMITIDO' });
          d.banner = { text: 'EXPEDIENTE ENCERRADO', color: '#9f9' };
          g.finish(1.5);
          return;
        }
        d.banner = null;
        d.sub++;
        d.subTime = Math.max(this.MIN_TIME, this.FIRST_TIME - (d.sub - 1));
        // pausa com contagem 3-2-1 antes do turno: sem ela o turno novo começava seco e ninguém percebia
        d.phase = 'pause'; d.pauseT = this.PAUSA; d.contagem = 3;
        for (const p of g.players) { p.data.sub = 0; p.data.subFlash = 0.5; }
        g.sfx('tick');
      });
    });
  },

  // Bot: reação de 0,25–0,45 s e acerta ~88% das vezes.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (b.wait === undefined) b.wait = U.rand(0.25, 0.45);
    if (d.phase !== 'play' || b.lock > 0) return {};
    b.wait -= dt;
    if (b.wait > 0) return {};
    b.wait = U.rand(0.25, 0.45);
    const art = this.ITEMS[d.seq[b.idx % d.seq.length]].art;
    const burn = U.chance(0.88) ? art : !art;
    return burn ? { a: true } : { b: true };
  },

  // ---------- 3D: almoxarifado em cruz com o incinerador no meio (como The Filter) ----------
  // Quatro esteiras em cata-vento em volta da fornalha central; cada uma vem do fundo de um corredor de
  // estantes. Cada operador fica na ponta da sua esteira, de frente para os itens que chegam: QUEIMAR joga o
  // item de lado para dentro da fornalha, RECICLAR derruba na calha verde do outro lado. Como no original, cada
  // jogador tem a própria câmera (tela dividida), por cima do ombro do seu operador.
  // Coordenadas locais de cada baia: u = ao longo da esteira (os itens andam para +u, até o operador),
  // v = de lado, para o centro (+v = fornalha, −v = calha de reciclagem).
  C3: { x: 480, z: 300 }, D3: 130, UP3: 74, GAP3: 58, U0: -640, BH3: 22,
  // seats: 0 = em cima, 1 = direita, 2 = embaixo, 3 = esquerda (o corredor de cada um sai em cata-vento)
  SEATS3: { 1: [0], 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] },

  // base local → mundo
  eixo(seat) { const a = seat * Math.PI / 2, ux = Math.cos(a), uz = Math.sin(a); return { ux, uz, vx: -uz, vz: ux }; },
  W(seat, u, v) {
    const e = this.eixo(seat), C = this.C3, D = this.D3;
    return { x: C.x - D * e.vx + u * e.ux + v * e.vx, z: C.z - D * e.vz + u * e.uz + v * e.vz };
  },
  // caixa em coordenadas locais (lu ao longo de u, lv ao longo de v)
  boxL(r, seat, u, y, v, lu, h, lv, cor, o) {
    const w = this.W(seat, u, v);
    if (seat % 2) r.box(w.x, y, w.z, lv, h, lu, cor, o); else r.box(w.x, y, w.z, lu, h, lv, cor, o);
  },
  beamL(r, seat, u1, y1, v1, u2, y2, v2, t, cor, o) {
    const a = this.W(seat, u1, v1), b = this.W(seat, u2, v2);
    r.beam(a.x, y1, a.z, b.x, y2, b.z, t, cor, o);
  },
  seatOf(p) { return p.data.seat || 0; },

  // câmera de cada operador: atrás e acima do ombro, olhando a esteira de onde os itens vêm
  camSeat(seat) {
    const p = this.W(seat, this.UP3 + 150, -30), t = this.W(seat, -105, 10);
    return { pos: [p.x, 215, p.z], target: [t.x, 0, t.z], fov: 50 };
  },
  viewports(g) {
    const ps = g.players, n = ps.length, Y = 34, H = TN.H - Y, W = TN.W, hw = W / 2, hh = H / 2;
    if (n <= 1) return [{ rect: [0, Y, W, H], camera: this.camSeat(this.seatOf(ps[0])) }];
    if (n === 2) return ps.map((p, i) => ({ rect: [0, Y + i * hh, W, hh], camera: this.camSeat(this.seatOf(p)) }));
    const q = [[0, Y], [hw, Y], [0, Y + hh], [hw, Y + hh]];
    const vs = ps.slice(0, 4).map((p, i) => ({ rect: [q[i][0], q[i][1], hw, hh], camera: this.camSeat(this.seatOf(p)) }));
    // com 3, o quarto quadro mostra o almoxarifado inteiro de cima
    if (n === 3) vs.push({ rect: [hw, Y + hh, hw, hh], camera: { pos: [this.C3.x, 1250, this.C3.z + 520], target: [this.C3.x, 0, this.C3.z + 20], fov: 52 } });
    return vs;
  },
  camera: { pos: [480, 1250, 820], target: [480, 0, 320], fov: 52 },
  env: { bg: '#0b0a0a', fog: [700, 1700], ambient: 0.5, sun: 1.2, sunDir: [-0.4, 1, 0.5], sunColor: '#ffe2c0' },

  // estante alta de madeira com caixas, ao longo de u (de u1 a u2) na linha v; base de tijolo como no original
  estante3d(r, seat, u1, u2, v) {
    const H = 210, D = 34, n = Math.max(1, Math.round((u2 - u1) / 110)), step = (u2 - u1) / n;
    this.boxL(r, seat, (u1 + u2) / 2, 0, v, u2 - u1, 46, D + 6, '#6a3a2c', { tex: 'tijolo', texWorld: true });
    for (let i = 0; i <= n; i++) this.boxL(r, seat, u1 + i * step, 46, v, 7, H - 46, D, '#4a3a2c', { tex: 'madeira' });
    for (const y of [46, 100, 154, H - 4]) this.boxL(r, seat, (u1 + u2) / 2, y, v, u2 - u1, 4, D, '#5a4634', { tex: 'madeira' });
    for (let i = 0; i < n; i++) for (const [k, y] of [[0, 50], [1, 104], [2, 158]]) {
      const s = (seat * 31 + i * 17 + k * 7) % 11;
      if (s % 4 === 0) continue;
      this.boxL(r, seat, u1 + (i + 0.5) * step + (s % 5) * 6 - 12, y, v, step * (0.45 + (s % 3) * 0.12), 26 + (s % 3) * 8, D - 8, s % 2 ? '#8a6a3e' : '#7a5c36', { tex: 'tecido' });
    }
  },

  // item 3D low-poly sobre uma bandeja vermelha (arte) ou verde (tecnologia); base em y
  item3d(r, type, x, y, z, k = 1, op = 1) {
    const it = this.ITEMS[type], o = op < 1 ? { opacity: op } : {};
    r.box(x, y, z, 40 * k, 2, 40 * k, it.art ? '#6a1d1d' : '#174a27', { emissive: it.art ? '#3a0606' : '#06280f', ...o });
    y += 2;
    switch (type) {
      case 0: // quadro: moldura dourada em pé com a pintura
        r.box(x, y, z, 30 * k, 24 * k, 4 * k, '#c9a24a', { metal: 0.6, rough: 0.4, ...o });
        r.box(x, y + 4 * k, z + 2.2 * k, 22 * k, 16 * k, 1, '#5fa8e8', { emissive: '#12324f', ...o });
        break;
      case 1: // busto em pedestal
        r.box(x, y, z, 16 * k, 8 * k, 16 * k, '#9b958a', o);
        r.box(x, y + 8 * k, z, 20 * k, 7 * k, 10 * k, '#e8e2d6', o);
        r.sphere(x, y + 21 * k, z, 7 * k, '#e8e2d6', { rough: 0.5, ...o });
        break;
      case 2: // vaso de cerâmica
        r.sphere(x, y + 10 * k, z, 10 * k, '#d0703a', { rough: 0.6, ...o });
        r.cyl(x, y + 16 * k, z, 4.5 * k, 10 * k, '#c0602c', o);
        break;
      case 3: // partitura num suporte
        r.box(x, y, z, 26 * k, 20 * k, 2, '#f2ecd9', { rotX: -0.35, ...o });
        r.sphere(x - 4 * k, y + 8 * k, z + 3, 3.2 * k, '#111', o);
        r.box(x + 1 * k, y + 8 * k, z + 2.5, 1.6, 12 * k, 1.6, '#111', o);
        break;
      case 4: // chip
        r.box(x, y, z, 24 * k, 5 * k, 24 * k, '#1d1f22', { metal: 0.4, ...o });
        r.box(x, y + 5 * k, z, 10 * k, 1.5, 10 * k, '#46e27b', { glow: true, ...o });
        r.box(x, y + 1, z, 30 * k, 2, 6 * k, '#c8c8c8', { metal: 0.9, rough: 0.3, ...o });
        break;
      case 5: // bateria
        r.cyl(x, y, z, 8 * k, 24 * k, '#d8d8d8', { metal: 0.5, rough: 0.4, ...o });
        r.cyl(x, y + 6 * k, z, 8.4 * k, 11 * k, '#2fbf62', o);
        r.cyl(x, y + 24 * k, z, 3 * k, 3 * k, '#999', { metal: 0.8, ...o });
        break;
      case 6: // engrenagem
        r.cyl(x, y, z, 11 * k, 6 * k, '#b8c0c8', { metal: 0.85, rough: 0.3, ...o });
        r.box(x, y, z, 28 * k, 6 * k, 5 * k, '#a9b1b9', { metal: 0.85, rough: 0.3, ...o });
        r.box(x, y, z, 5 * k, 6 * k, 28 * k, '#a9b1b9', { metal: 0.85, rough: 0.3, ...o });
        break;
      default: // monitor
        r.box(x, y, z, 8 * k, 6 * k, 8 * k, '#888', o);
        r.box(x, y + 6 * k, z, 30 * k, 20 * k, 5 * k, '#c4c4c4', { metal: 0.3, ...o });
        r.box(x, y + 9 * k, z + 2.8 * k, 24 * k, 14 * k, 1, '#1d6b3f', { glow: true, ...o });
    }
  },

  draw3d(g, r) {
    const d = g.data, C = this.C3, BH = this.BH3, U0 = this.U0, UP = this.UP3, GAP = this.GAP3, t = g.time;
    // ---- chão de ladrilho do almoxarifado e o incinerador no meio ----
    r.plane(C.x, -1, C.z, 2400, 2400, '#5a5856', { tex: 'piso' });
    r.box(C.x, 0, C.z, 170, 110, 170, '#3a3633', { metal: 0.4, rough: 0.6 });
    r.box(C.x, 110, C.z, 150, 14, 150, '#2a2725', { metal: 0.5 });
    r.cyl(C.x, 124, C.z, 26, 260, '#3b3735', { metal: 0.5 });   // chaminé
    const fl = Math.round((0.6 + 0.4 * Math.sin(t * 9)) * 5) / 5;
    r.light(C.x, 60, C.z, '#ff7a2a', 1.4 + 0.6 * fl, 520);
    r.light(C.x - 300, 260, C.z - 300, '#ffd9a8', 0.8, 900);
    r.light(C.x + 300, 260, C.z + 300, '#ffd9a8', 0.8, 900);
    // ---- as quatro baias (as vazias ficam paradas, com a esteira desligada) ----
    const ocup = {};
    for (const p of g.players) ocup[this.seatOf(p)] = p;
    for (let seat = 0; seat < 4; seat++) {
      const p = ocup[seat], pd = p && p.data, dead = !p || !p.alive;
      // corredor de estantes: externa (v −120) de U0 até a quina; interna (v +120) até a borda do miolo; parede do fundo com a boca
      this.estante3d(r, seat, U0, 10, -128);
      this.estante3d(r, seat, U0, -250, 128);
      this.boxL(r, seat, U0 - 14, 0, 0, 20, 210, 236, '#5a4c40', { tex: 'tijolo', texWorld: true });
      this.boxL(r, seat, U0 - 2, 0, 0, 6, 46, 70, '#0c0a08', { tex: false });   // boca de onde saem os itens
      // boca da fornalha virada para esta baia (brasa acesa se a baia está ativa)
      this.boxL(r, seat, 0, 18, this.D3 - 86, 90, 60, 3, '#1a0a04', { tex: false });
      this.boxL(r, seat, 0, 24, this.D3 - 87.5, 76, 48, 1, dead ? '#3a1408' : '#ff5a1a', dead ? {} : { glow: true, opacity: 0.6 + 0.4 * fl });
      // esteira: corpo, lona, roletes nas pontas, ripas que andam junto com os itens
      const ua = U0 + 10, ub = 26;
      this.boxL(r, seat, (ua + ub) / 2, 0, 0, ub - ua, BH, 60, '#2a2e34', { metal: 0.5, rough: 0.5 });
      this.boxL(r, seat, (ua + ub) / 2, BH + 0.3, 0, ub - ua - 4, 0.6, 56, '#16181b', { rough: 0.9, tex: false });
      for (const u of [ua, ub]) { const a = this.W(seat, u, -31), b = this.W(seat, u, 31); r.tube(a.x, BH / 2 + 1, a.z, b.x, BH / 2 + 1, b.z, BH / 2 + 1, '#4a5058', { metal: 0.8, rough: 0.3 }); }
      const sh = pd ? pd.shift : 0;
      for (let k = 0; k < 12; k++) { const u = -(k + sh) * GAP - GAP / 2; if (u > ua + 4) this.boxL(r, seat, u, BH, 0, 3, 1.2, 56, '#2f343b', { shadow: false }); }
      // calha de reciclagem (lado de fora, em frente ao item ativo)
      this.boxL(r, seat, 0, 0, -78, 70, 14, 44, '#1d3a27', { metal: 0.4 });
      this.boxL(r, seat, 0, 14, -78, 60, 1, 34, dead ? '#13241a' : '#2fbf62', dead ? {} : { glow: true });
      // painel com as duas alavancas (vermelha = fogo, do lado da fornalha; verde = reciclagem, do lado de fora)
      this.boxL(r, seat, UP - 34, 0, 0, 14, 44, 64, '#3a3f45', { metal: 0.5 });
      this.boxL(r, seat, UP - 34, 44, 0, 18, 3, 68, '#22262b', { metal: 0.5 });
      const puxa = pd && pd.wrong <= 0 && sh > 0.4 ? pd.lastBurn : null;
      this.beamL(r, seat, UP - 34, 46, 18, UP - 34 + (puxa === true ? 14 : -4), 70, 18, 3, '#9a9da0', { metal: 0.8 });
      this.beamL(r, seat, UP - 34, 46, -18, UP - 34 + (puxa === false ? 14 : -4), 70, -18, 3, '#9a9da0', { metal: 0.8 });
      const kv = this.W(seat, UP - 34 + (puxa === true ? 14 : -4), 18), kr = this.W(seat, UP - 34 + (puxa === false ? 14 : -4), -18);
      r.sphere(kv.x, 72, kv.z, 5, '#e0402a', { glow: !dead });
      r.sphere(kr.x, 72, kr.z, 5, '#2fbf62', { glow: !dead });
      if (!p) continue;
      // itens da fila (o primeiro é o ativo)
      if (!dead) {
        for (let k = this.VISIBLE - 1; k >= 0; k--) {
          const u = -(k + pd.shift) * GAP;
          if (u < ua + 22) continue;
          const w = this.W(seat, u, 0);
          this.item3d(r, d.seq[(pd.idx + k) % d.seq.length], w.x, BH + 0.5, w.z, k === 0 ? 1.25 : 0.9);
        }
        // moldura do item ativo
        const wrong = pd.wrong > 0, fc = wrong ? '#ff3030' : '#ffd23f';
        for (const [a1, b1, a2, b2] of [[-31, -31, 31, -31], [-31, 31, 31, 31], [-31, -31, -31, 31], [31, -31, 31, 31]]) this.beamL(r, seat, a1, BH + 2, b1, a2, BH + 2, b2, 2.5, fc, { glow: true });
        if (wrong) this.boxL(r, seat, 0, BH + 1, 0, 60, 0.5, 60, '#ff2020', { glow: true, opacity: 0.35 });
      }
      // operador (de frente para a esteira, olhando os itens chegarem)
      const dirOp = Math.atan2(-this.eixo(seat).uz, -this.eixo(seat).ux);
      r.character(p, { pose: dead ? 'dead' : 'work', dir: dirOp, flash: !dead && pd.wrong > 0.15, label: false });   // o nome fica no placar da vista
      // prensa hidráulica num pórtico em cima do operador: desce e volta para o alto depois de esmagar
      const pw = this.W(seat, UP, 0);
      // (em repouso a prensa fica recolhida no teto, fora do quadro; só aparece quando desce)
      if (dead) r.disc(pw.x, 0.6, pw.z, 34, '#4a0c0c', { rough: 0.4 });
      const up = dead ? TN.util.clamp(((pd.deadT || 0) - 0.6) / 0.5, 0, 1) : 0;
      if ((pd.crush > 0 || dead) && up < 1) {
        const k = dead ? 1 : pd.crush, hy = 300 - 292 * k + 300 * up;
        r.beam(pw.x, hy + 18, pw.z, pw.x, 420, pw.z, 10, '#9aa3ad', { metal: 0.9, rough: 0.25 });
        this.boxL(r, seat, UP, hy, 0, 64, 18, 64, '#f5c400', { metal: 0.3 });
        for (let i = 0; i < 4; i++) this.boxL(r, seat, UP + 32.5, hy - 0.5, -26 + i * 17, 1.5, 19, 8, '#111', { shadow: false });
      }
    }
    // itens saindo da esteira: para dentro da fornalha (+v) ou para a calha (−v), com arco e queda
    for (const f of d.flying) {
      const p = g.players.find((q) => q.id === f.pid);
      if (!p) continue;
      const u = 1 - Math.max(0, f.t) / 0.35, dir = f.burn ? 1 : -1;
      const v = dir * Math.min(u * 110, f.burn ? 70 : 72);
      const y = BH + 30 * Math.sin(Math.min(1, u * 1.4) * Math.PI) - (u > 0.65 ? (u - 0.65) * 90 : 0);
      const w = this.W(this.seatOf(p), 0, v);
      this.item3d(r, f.type, w.x, Math.max(0, y), w.z, 0.75, Math.max(0.1, Math.round((1 - u) * 10) / 10));
    }
  },

  // HUD por cima do 3D: moldura das vistas, placar de cada operador na sua vista e o painel do turno no meio
  drawOverlay(g, c) {
    if (!g.uses3d || !g.uses3d()) return;
    const D = TN.draw, d = g.data, U = TN.util, vs = this.viewports(g);
    c.fillStyle = '#000';
    for (const v of vs) { const [x, y, w, h] = v.rect; c.fillRect(x + w - 1, y, 2, h); c.fillRect(x, y + h - 1, w, 2); }
    g.players.forEach((p, i) => {
      const v = vs[i]; if (!v) return;
      const [rx, y, rw] = v.rect, pd = p.data, dead = !p.alive, x = rx + rw / 2 >= g.W / 2 + 1 && rw < g.W ? rx + rw - 148 : rx;   // coluna da direita: placar no canto direito
      D.panel(c, x + 8, y + 8, 132, 46, { stroke: dead ? '#444' : p.color, fill: 'rgba(0,0,0,0.72)' });
      D.text(c, p.label, x + 16, y + 21, { size: 12, color: dead ? '#888' : p.color });
      D.text(c, dead ? 'PRENSADO' : 'NO TURNO', x + 16, y + 40, { size: 10, color: dead ? '#f55' : '#aaa' });
      D.text(c, dead ? '✖' : String(pd.sub), x + 118, y + 31, { size: 26, color: dead ? '#f55' : pd.subFlash > 0 && Math.floor(g.time * 10) % 2 ? '#ff5a3c' : '#fff', align: 'center' });
    });
    if (vs.length > g.players.length) { const [x, y] = vs[vs.length - 1].rect; D.text(c, 'ALMOXARIFADO · VISTA GERAL', x + 12, y + 18, { size: 11, color: '#bbb' }); }
    // painel do turno no centro da divisão
    const t = d.phase === 'play' ? d.timer : 0, cx = g.W / 2, cy = vs.length > 1 ? 34 + (g.H - 34) / 2 : 70;
    D.panel(c, cx - 118, cy - 32, 236, 64, { stroke: '#ff5a3c', fill: 'rgba(8,10,13,0.88)' });
    D.text(c, `TURNO ${d.sub}`, cx - 106, cy - 17, { size: 13, color: '#ff5a3c' });
    D.text(c, U.formatTime(t), cx + 60, cy - 14, { size: 22, color: t < 4 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, 'AÇÃO: QUEIMAR ARTE', cx, cy + 6, { size: 11, color: '#ff7a5a', align: 'center' });
    D.text(c, 'EXTRA: RECICLAR TECNOLOGIA', cx, cy + 21, { size: 11, color: '#46e27b', align: 'center' });
    if (d.phase === 'pause') {
      D.panel(c, cx - 110, cy - 70, 220, 140, { stroke: '#ff5a3c', fill: 'rgba(8,10,13,0.9)' });
      D.text(c, `TURNO ${d.sub}`, cx, cy - 36, { size: 34, color: '#ff5a3c', align: 'center' });
      D.text(c, String(d.contagem || 'JÁ!'), cx, cy + 26, { size: 56, color: '#fff', align: 'center' });
    }
    if (d.banner) {
      D.panel(c, cx - 250, cy - 26, 500, 52, { stroke: d.banner.color, fill: 'rgba(8,10,13,0.92)' });
      D.text(c, d.banner.text, cx, cy, { size: 20, color: d.banner.color, align: 'center' });
    }
  },

  // ---------- desenho 2D (alternativa sem WebGL): ícones (centro x,y; s = meia largura) ----------
  drawItem(c, type, x, y, s = 22) {
    const it = this.ITEMS[type];
    c.save(); c.translate(x, y);
    // base colorida (vermelho = arte, verde = tecnologia)
    c.fillStyle = it.art ? '#5a1a1a' : '#163f22'; c.strokeStyle = it.art ? '#ff5a4a' : '#46e27b'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-s, -s, s * 2, s * 2, 6); c.fill(); c.stroke();
    c.lineWidth = 2;
    switch (type) {
      case 0: // quadro: moldura com montanha e sol
        c.fillStyle = '#c9a24a'; c.fillRect(-15, -12, 30, 24);
        c.fillStyle = '#7fc4ff'; c.fillRect(-11, -8, 22, 16);
        c.fillStyle = '#3d7a3a'; c.beginPath(); c.moveTo(-11, 8); c.lineTo(-3, -3); c.lineTo(3, 3); c.lineTo(7, -1); c.lineTo(11, 8); c.fill();
        c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(6, -4, 2.5, 0, Math.PI * 2); c.fill();
        break;
      case 1: // busto: cabeça em pedestal
        c.fillStyle = '#e8e2d6'; c.beginPath(); c.arc(0, -7, 7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(-10, 6); c.quadraticCurveTo(0, -4, 10, 6); c.fill();
        c.fillStyle = '#9b958a'; c.fillRect(-8, 6, 16, 4); c.fillRect(-11, 10, 22, 5);
        break;
      case 2: // vaso
        c.fillStyle = '#d0703a';
        c.beginPath(); c.moveTo(-5, -14); c.lineTo(5, -14); c.lineTo(4, -9); c.quadraticCurveTo(14, -2, 7, 14); c.lineTo(-7, 14); c.quadraticCurveTo(-14, -2, -4, -9); c.closePath(); c.fill();
        c.strokeStyle = '#7a3a18'; c.beginPath(); c.moveTo(-9, 1); c.lineTo(9, 1); c.stroke();
        break;
      case 3: // partitura: nota musical
        c.fillStyle = '#f2ecd9'; c.fillRect(-14, -14, 28, 28);
        c.strokeStyle = '#999'; c.lineWidth = 1;
        for (let k = -8; k <= 8; k += 4) { c.beginPath(); c.moveTo(-12, k); c.lineTo(12, k); c.stroke(); }
        c.fillStyle = '#111'; c.beginPath(); c.ellipse(-3, 7, 4, 3, -0.4, 0, Math.PI * 2); c.fill();
        c.fillRect(0, -10, 2, 17); c.fillRect(0, -10, 7, 3);
        break;
      case 4: // chip
        c.fillStyle = '#222'; c.fillRect(-10, -10, 20, 20);
        c.fillStyle = '#c8c8c8';
        for (let k = -7; k <= 7; k += 5) { c.fillRect(-15, k - 1, 5, 2); c.fillRect(10, k - 1, 5, 2); c.fillRect(k - 1, -15, 2, 5); c.fillRect(k - 1, 10, 2, 5); }
        c.fillStyle = '#46e27b'; c.fillRect(-4, -4, 8, 8);
        break;
      case 5: // bateria
        c.fillStyle = '#ddd'; c.fillRect(-7, -14, 14, 28); c.fillRect(-3, -17, 6, 3);
        c.fillStyle = '#46e27b'; c.fillRect(-5, -2, 10, 14);
        c.fillStyle = '#111'; c.fillRect(-3, -10, 6, 2); c.fillRect(-1, -12, 2, 6);
        break;
      case 6: { // engrenagem
        c.fillStyle = '#b8c0c8';
        for (let k = 0; k < 8; k++) { c.save(); c.rotate((k * Math.PI) / 4); c.fillRect(-3, -15, 6, 6); c.restore(); }
        c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#163f22'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
        break;
      }
      case 7: // monitor
        c.fillStyle = '#ccc'; c.fillRect(-15, -12, 30, 20);
        c.fillStyle = '#123'; c.fillRect(-12, -9, 24, 14);
        c.fillStyle = '#46e27b'; c.fillRect(-9, -6, 8, 2); c.fillRect(-9, -2, 14, 2);
        c.fillStyle = '#999'; c.fillRect(-3, 8, 6, 4); c.fillRect(-9, 12, 18, 3);
        break;
    }
    c.restore();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    for (const p of g.players) {
      const pd = p.data, L = pd.lane, cy = L.y + L.h / 2, dead = !p.alive;
      // fundo da baia
      c.fillStyle = dead ? '#151515' : '#1b1f24'; c.fillRect(a.x, L.y + 3, a.w, L.h - 6);
      c.fillStyle = dead ? '#333' : p.color; c.fillRect(a.x, L.y + 3, 6, L.h - 6);
      // esteira com roletes andando
      const bx = this.SLOT_X - 34, bw = a.x + a.w - 96 - bx;
      c.fillStyle = '#2b2f35'; c.fillRect(bx, cy - 30, bw, 60);
      c.save(); c.beginPath(); c.rect(bx, cy - 30, bw, 60); c.clip();
      c.strokeStyle = '#353a41'; c.lineWidth = 3;
      const off = (pd.idx + (1 - pd.shift)) * this.SLOT_GAP / 3 % 22;
      for (let x = bx - 22 - off + 22; x < bx + bw + 22; x += 22) { c.beginPath(); c.moveTo(x, cy - 30); c.lineTo(x - 10, cy + 30); c.stroke(); }
      c.restore();
      c.strokeStyle = '#111'; c.lineWidth = 2; c.strokeRect(bx, cy - 30, bw, 60);
      // itens da fila (o primeiro é o ativo)
      if (!dead) {
        for (let k = this.VISIBLE - 1; k >= 0; k--) {
          const x = this.SLOT_X + (k + pd.shift) * this.SLOT_GAP;
          if (x > bx + bw - 26) continue;
          this.drawItem(c, d.seq[(pd.idx + k) % d.seq.length], x, cy, k === 0 ? 24 : 20);
        }
        // moldura do item ativo
        const wrong = pd.wrong > 0;
        c.strokeStyle = wrong ? '#f33' : '#ffd23f'; c.lineWidth = 3;
        c.strokeRect(this.SLOT_X - 31, cy - 31, 62, 62);
        if (wrong) { c.globalAlpha = 0.35; c.fillStyle = '#f00'; c.fillRect(this.SLOT_X - 31, cy - 31, 62, 62); c.globalAlpha = 1; }
      }
      // placar do turno
      D.panel(c, a.x + a.w - 86, cy - 28, 80, 56, { stroke: dead ? '#444' : p.color, fill: 'rgba(0,0,0,0.6)' });
      D.text(c, dead ? '✖' : String(pd.sub), a.x + a.w - 46, cy + 2, { size: 30, color: dead ? '#f55' : '#fff', align: 'center' });
      // operador
      g.drawPlayer(c, { ...p, x: 92, y: cy, dir: 0 }, { flash: pd.wrong > 0.15 });
      // prensa hidráulica
      if (pd.crush > 0 || dead) {
        const k = dead ? 1 : pd.crush;
        const h = (cy - L.y - 4) + 22 * k;
        c.fillStyle = '#555'; c.fillRect(92 - 4, L.y + 3, 8, Math.max(0, h - 30));
        D.hazardStripes(c, 92 - 34, L.y + 3 + Math.max(0, h - 30), 68, 26, 8);
      }
    }
    // itens voando para o fogo (sobe) / reciclagem (desce), presos à própria baia
    for (const f of d.flying) {
      const dono = g.players.find((q) => q.id === f.pid); if (!dono) continue;
      const L = dono.data.lane;
      c.save(); c.beginPath(); c.rect(a.x, L.y + 3, a.w, L.h - 6); c.clip();
      c.globalAlpha = Math.max(0, f.t / 0.35);
      this.drawItem(c, f.type, f.x, f.y, 18);
      c.restore();
    }
    // boca do incinerador (em cima) e calha de reciclagem (embaixo) do item ativo
    for (const p of g.alive()) {
      const cy = p.data.lane.y + p.data.lane.h / 2, f = 0.6 + 0.4 * Math.sin(g.time * 14 + p.id);
      c.fillStyle = `rgba(255,${90 + 60 * f | 0},30,0.9)`; c.fillRect(this.SLOT_X - 31, cy - 40, 62, 5);
      c.fillStyle = '#2fa85a'; c.fillRect(this.SLOT_X - 31, cy + 35, 62, 5);
    }
    // faixa de status: turno, tempo, legenda
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#ff5a3c' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 4 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, 'AÇÃO: QUEIMAR ARTE', a.x + a.w - 250, 46, { size: 12, color: '#ff7a5a', align: 'left' });
    D.text(c, 'EXTRA: RECICLAR TECNOLOGIA', a.x + a.w - 250, 60, { size: 12, color: '#46e27b', align: 'left' });
    if (d.phase === 'pause') {
      D.text(c, `TURNO ${d.sub}`, g.W / 2, g.H / 2 - 40, { size: 40, color: '#ff5a3c', align: 'center' });
      D.text(c, String(d.contagem || 'JÁ!'), g.W / 2, g.H / 2 + 30, { size: 64, color: '#fff', align: 'center' });
    }
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, g.H / 2 - 26, 500, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, g.H / 2, { size: 20, color: d.banner.color, align: 'center' });
    }
  },
});
