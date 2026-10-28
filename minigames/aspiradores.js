// ASPIRADORES ASSASSINOS — inspirado em "LETHAL REBOUND" (dvd_roomba) de Machine Party.
// Robôs aspiradores com lâminas entram pela escotilha e quicam em diagonal como o logo do DVD.
// Encostou = morreu. Último de pé vence. AÇÃO empurra quem estiver na frente.
TN.registerMinigame({
  id: 'aspiradores',
  title: 'ASPIRADORES ASSASSINOS',
  inspiredBy: 'Lethal Rebound (dvd_roomba)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Desvie dos discos afiados.', 'Empurre os outros no caminho deles.', 'O último de pé vence.'],
  controls: { move: 'andar', a: 'empurrar' },
  icon: '◎',
  color: '#ff6a3d',
  rounds: 3,
  scoring: 'survival',       // ordem de eliminação vira pontos (padrão do motor)

  // ---- constantes (originais, na proporção da velocidade do jogador: spawn 0,5 s, +1 a cada 5 s, máx. 5;
  //      quem empurra fica 0,5 s parado. Aspirador: no original 2,5× o jogador (437) e entrada 1,5× (262); aqui
  //      2× (350) e 1,25× (220), a pedido de quem jogou ("muito rápidos"). O empurrão decai linear como no original,
  //      mas menor: lá ele cruza 2/3 da arena; aqui ~180 px e ~0,8 s sem controle, para não arremessar longe) ----
  SPEED: 175, ROOMBA_SPEED: 350, WARMUP_SPEED: 220, ROOMBA_R: 16,   // raio 22 → 16: grande demais parecia impossível de desviar
  SPAWN_FIRST: 0.5, SPAWN_EVERY: 5, MAX_ROOMBAS: 5, SHOVE: 400, SHOVE_DECAY: 444, SHOVE_LOCK: 0.5, TOMBO: 1.1,   // empurrado cai e levanta (1,1 s sem controle)

  // ---- mapa (o do original: sala de 27,8 × 23 m, proporção 1,21; aqui 1 m = 23 px, com a mesma área do antigo
  //      retângulo de 880 × 410). Escotilhas só no fundo e nas laterais (a frente é o lado da câmera); jogadores
  //      nascem em cruz a 5 m do centro. As 4 grelhas dos quadrantes são só piso (no original não têm colisão). ----
  ARENA: { x: 160, y: 12, w: 640, h: 528 }, M: 23, SPAWN_R: 115,

  init(g) {
    const U = TN.util;
    g.arena = { ...this.ARENA };
    g.data.roombas = [];
    g.data.nextSpawn = this.SPAWN_FIRST;
    const a = g.arena, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    g.data.hatches = [
      { x: a.x + a.w / 2, y: a.y, lado: 'fundo' },
      { x: a.x, y: a.y + a.h / 2, lado: 'esq' }, { x: a.x + a.w, y: a.y + a.h / 2, lado: 'dir' },
    ];
    // em cruz (como os 4 marcadores do original), em ordem sorteada
    const cruz = U.shuffle([[-1, 0], [1, 0], [0, 1], [0, -1]]);
    g.players.forEach((p, i) => {
      const [sx, sy] = cruz[i % 4];
      p.x = cx + sx * this.SPAWN_R; p.y = cy + sy * this.SPAWN_R; p.dir = Math.atan2(-sy, -sx);
    });
    for (const p of g.players) p.data.lock = 0;
  },

  spawnRoomba(g) {
    const h = TN.util.pick(g.data.hatches);
    g.data.roombas.push({ x: h.x, y: h.y, r: this.ROOMBA_R, vx: 0, vy: 0, warm: true, spin: 0, cool: 0 });
    g.sfx('buzz');
  },

  update(g, dt) {
    const U = TN.util, a = g.arena, d = g.data;
    // spawns
    if (g.time >= d.nextSpawn && d.roombas.length < this.MAX_ROOMBAS) {
      this.spawnRoomba(g);
      d.nextSpawn = g.time + this.SPAWN_EVERY;
    }
    // jogadores
    for (const p of g.alive()) {
      p.data.lock -= dt;
      const stunned = p.tombo > 0;   // derrubado (g.derrubar): sem controle até levantar
      const shoving = p.data.lock > 0;   // quem empurra fica parado enquanto o braço volta
      if (stunned || shoving) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt);
      g.decayPushLinear(p, dt, this.SHOVE_DECAY);
      if (p.input.aPressed && !shoving && !stunned) {
        p.data.lock = this.SHOVE_LOCK;
        g.sfx('whoosh');
        const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
        for (const o of g.alive()) {
          if (o === p) continue;
          const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
          if (dist < 56 && (dx * fx + dy * fy) / (dist || 1) > 0.2) {
            if (g.derrubar(o, (dx / dist) * this.SHOVE, (dy / dist) * this.SHOVE, this.TOMBO)) g.sfx('hit');
          }
        }
      }
    }
    U.separate(g.alive());
    // aspiradores
    const center = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    for (const r of d.roombas) {
      r.spin += dt * 20; r.cool -= dt;
      if (r.warm) {
        const n = U.norm(center.x - r.x, center.y - r.y);
        r.x += n.x * this.WARMUP_SPEED * dt; r.y += n.y * this.WARMUP_SPEED * dt;
        if (U.dist(r.x, r.y, center.x, center.y) < 10) {
          r.warm = false;
          const ang = Math.PI / 4 + U.randInt(0, 3) * Math.PI / 2;
          r.vx = Math.cos(ang) * this.ROOMBA_SPEED; r.vy = Math.sin(ang) * this.ROOMBA_SPEED;
        }
      } else {
        r.x += r.vx * dt; r.y += r.vy * dt;
        if (r.x < a.x + r.r) { r.x = a.x + r.r; r.vx = Math.abs(r.vx); g.sfx('step'); }
        if (r.x > a.x + a.w - r.r) { r.x = a.x + a.w - r.r; r.vx = -Math.abs(r.vx); g.sfx('step'); }
        if (r.y < a.y + r.r) { r.y = a.y + r.r; r.vy = Math.abs(r.vy); g.sfx('step'); }
        if (r.y > a.y + a.h - r.r) { r.y = a.y + a.h - r.r; r.vy = -Math.abs(r.vy); g.sfx('step'); }
      }
      for (const p of g.alive()) {
        if (U.circles(p, r, p.r - 3, r.r)) {
          g.eliminate(p, { sound: 'boom', msg: 'FATIADO!' });
          g.particles(p.x, p.y, '#a00', 30, 260);
        }
      }
    }
    // aspirador x aspirador: escolhe nova diagonal que os afaste
    for (let i = 0; i < d.roombas.length; i++) for (let j = i + 1; j < d.roombas.length; j++) {
      const r1 = d.roombas[i], r2 = d.roombas[j];
      if (r1.warm || r2.warm || !U.circles(r1, r2)) continue;
      if (r1.cool > 0 && r2.cool > 0) continue;
      for (const [r, o] of [[r1, r2], [r2, r1]]) {
        r.vx = Math.sign(r.x - o.x || 1) * Math.abs(r.vx);
        r.vy = Math.sign(r.y - o.y || 1) * Math.abs(r.vy);
        r.cool = 0.3;
      }
      g.sfx('hit'); g.particles((r1.x + r2.x) / 2, (r1.y + r2.y) / 2, '#ff0', 10, 200);
    }
  },

  // Bot: foge da posição futura dos aspiradores, evita paredes, empurra quem estiver perto.
  bot(g, p) {
    const U = TN.util, a = g.arena;
    let fx = 0, fy = 0;
    for (const r of g.data.roombas) {
      const px = r.x + r.vx * 0.35, py = r.y + r.vy * 0.35;
      const dx = p.x - px, dy = p.y - py, dist = Math.hypot(dx, dy) || 1;
      if (dist < 190) { const w = (190 - dist) / 190; fx += (dx / dist) * w * 2; fy += (dy / dist) * w * 2; }
    }
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    fx += (cx - p.x) / a.w * 0.8; fy += (cy - p.y) / a.h * 0.8;
    if (p.data.botNoise === undefined || U.chance(0.02)) p.data.botNoise = { x: U.rand(-0.4, 0.4), y: U.rand(-0.4, 0.4) };
    fx += p.data.botNoise.x; fy += p.data.botNoise.y;
    const near = g.alive().some((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 50);
    return { x: Math.abs(fx) > 0.15 ? Math.sign(fx) : 0, y: Math.abs(fy) > 0.15 ? Math.sign(fy) : 0, a: near && U.chance(0.05) };
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Câmera do original: 17 m de altura, 13,3 m à frente do centro, 53° para baixo, fov 60.
  camera: { pos: [480, 391, 581], target: [480, 0, 285], fov: 60 },
  // luz fria das fluorescentes (no original a sala é bem clara); o visual retrô ganha mais ambiente e holofote
  env: (TN.R3 && TN.R3.RETRO === false)
    ? { sunDir: [-0.3, 1, 0.4], sunColor: '#e6eef2' }
    : { sunDir: [-0.3, 1, 0.4], ambient: 0.34, sun: 0.85, sunColor: '#dfe6ea', spot: 4.5, spotColor: '#e8f0ff' },

  // faixa zebrada (amarelo/preto) em volta de um retângulo do piso
  zebra(r, x0, z0, x1, z1, w = 6) {
    const passo = 14;
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / passo)), hor = az === bz;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        r.plane(x, 0.6, z, hor ? len / n : w, hor ? w : len / n, i % 2 ? '#141414' : '#c9a400', { tex: false });
      }
    }
  },
  // grelha de escoamento: fosso escuro com barras ao longo de z (como as do original)
  grelha(r, x0, z0, x1, z1, cor = '#2c3137', passo = 11) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    r.plane(cx, 0.3, cz, w, d, '#07080a', { tex: false });
    for (let x = x0 + passo / 2; x < x1; x += passo) r.box(x, -1, cz, 3.5, 2, d - 2, cor, { metal: 0.6, rough: 0.5, shadow: false });
    r.box(cx, -1, z0 + 1, w, 2.4, 3, '#3a3f45', { metal: 0.5 });
    r.box(cx, -1, z1 - 1, w, 2.4, 3, '#3a3f45', { metal: 0.5 });
  },
  // chapa de aço com borda (as placas do corredor central)
  chapa(r, x, z, w, d) {
    r.box(x, 0, z, w, 1.2, d, '#2e3236', { metal: 0.4 });
    r.box(x, 1.2, z, w - 7, 0.8, d - 7, '#6c7176', { metal: 0.5, rough: 0.6 });
  },

  draw3d(g, r) {
    const a = g.arena, M = this.M, cx = a.x + a.w / 2, cz = a.y + a.h / 2;
    const X = (m) => cx + m * M, Z = (m) => cz + m * M;   // metros do original → px
    // casa de máquinas em volta (paredes altas, luz fria), sem objetos de canto
    r.room(a.x - 120, a.y - 70, a.x + a.w + 120, a.y + a.h + 40, { estilo: 'subsolo', h: 300, props: false, lamps: 2 });
    // ---- piso: concreto claro + 4 grelhas nos quadrantes + corredor central de chapas ----
    r.plane(cx, 0, cz, a.w, a.h, '#6a6c6b', { rough: 0.9 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = X(sx < 0 ? -13 : 2.45), x1 = X(sx < 0 ? -2.45 : 13), z0 = Z(sz < 0 ? -10.6 : 3.35), z1 = Z(sz < 0 ? -3.35 : 10.6);
      this.zebra(r, x0 - 5, z0 - 5, x1 + 5, z1 + 5);
      this.grelha(r, x0, z0, x1, z1);
    }
    // corredor central: placas e grelhinhas enferrujadas, com a placa de aviso perto da escotilha do fundo
    const seq = ['aviso', 'chapa', 'ferrugem', 'chapa', 'chapa', 'chapa', 'chapa', 'ferrugem', 'chapa'];
    seq.forEach((k, i) => {
      const z = Z(-10.2 + i * 2.55), w = 3.3 * M, d = 2.3 * M;
      if (k === 'chapa') this.chapa(r, cx, z, w, d);
      else if (k === 'ferrugem') this.grelha(r, cx - w / 2, z - d / 2, cx + w / 2, z + d / 2, '#6b3b24', 8);
      else for (let s = 0; s < 6; s++) r.plane(cx - w / 2 + (s + 0.5) * w / 6, 0.6, z, w / 6, d * 0.7, s % 2 ? '#141414' : '#c9a400', { tex: false });
    });
    // faixa do meio: valeta, conjunto de grelhinhas + chapa e a placa "ÁREA DE RISCO" perto de cada escotilha lateral
    for (const s of [-1, 1]) {
      r.plane(X(s * 3.7), 0.4, Z(-0.4), 0.8 * M, 3.6 * M, '#0b0c0d', { tex: false });
      this.grelha(r, X(s * 8) - 2.9 * M, Z(-1.3), X(s * 8) - 1.4 * M, Z(1.3), '#6b3b24', 7);
      this.grelha(r, X(s * 8) + 1.4 * M, Z(-1.3), X(s * 8) + 2.9 * M, Z(1.3), '#6b3b24', 7);
      this.chapa(r, X(s * 8), Z(0), 2.6 * M, 2.6 * M);
      for (let k = 0; k < 4; k++) r.plane(X(s * 12.2), 0.6, Z(-1.2 + k * 0.8), 1.4 * M, 0.4 * M, k % 2 ? '#141414' : '#c9a400', { tex: false });
    }
    r.plane(X(8), 0.5, Z(2.5), 3.4 * M, 0.9 * M, '#0b0c0d', { tex: false });   // respiro à direita, como no original
    // ---- paredes de chapa enferrujada (fundo e laterais), com rebites e canos por cima ----
    const H = 122, T = 14, ferr = '#7a5f48', chapaP = '#6d7275';
    r.box(cx, 0, a.y - T / 2, a.w + T * 2, H, T, chapaP, { metal: 0.4 });
    r.box(a.x - T / 2, 0, cz, T, H, a.h, chapaP, { metal: 0.4 });
    r.box(a.x + a.w + T / 2, 0, cz, T, H, a.h, chapaP, { metal: 0.4 });
    for (let i = 0; i < 16; i++) r.box(a.x + (i + 0.5) * a.w / 16, 30, a.y + 0.5, 6, H - 40, 2, ferr, { metal: 0.4 });   // nervuras do fundo
    r.box(cx, H, a.y - T / 2, a.w + T * 2 + 8, 8, T + 8, '#3a3532', { metal: 0.5 });
    for (const s of [-1, 1]) {
      const wx = s < 0 ? a.x - T / 2 : a.x + a.w + T / 2;
      r.box(wx, H, cz, T + 8, 8, a.h + 8, '#3a3532', { metal: 0.5 });
      r.tube(wx + s * 26, H + 22, a.y, wx + s * 26, H + 22, a.y + a.h, 9, '#6b5846', { metal: 0.5 });   // canos sobre as laterais
      for (const mz of [-8.4, -6.6, -4.8]) r.box(wx + s * 22, H, Z(mz), 40, 26, 18, '#4d4038', { metal: 0.5 });  // braçadeiras
    }
    // ---- escotilhas (fundo e laterais): a porta sobe quando um aspirador está entrando ----
    for (const h of g.data.hatches) {
      const abre = g.data.roombas.some((rb) => rb.warm && TN.util.dist(rb.x, rb.y, h.x, h.y) < 110);
      const lat = h.lado !== 'fundo', W = 74, HH = 56;
      const bx = (w, hh, d, y, cor, o) => lat ? r.box(h.x, y, h.y, d, hh, w, cor, o) : r.box(h.x, y, h.y, w, hh, d, cor, o);
      bx(W, HH, T + 2, 0, '#060708', { tex: false });                          // vão escuro
      bx(W + 18, 10, T + 6, HH, '#2a2d30', { metal: 0.6 });                    // verga
      for (let i = 0; i < 6; i++) {                                            // faixa zebrada na verga
        const o = -W / 2 - 4 + (i + 0.5) * (W + 8) / 6;
        if (lat) r.box(h.x, HH + 2, h.y + o, T + 8, 6, (W + 8) / 6, i % 2 ? '#141414' : '#c9a400', { tex: false });
        else r.box(h.x + o, HH + 2, h.y, (W + 8) / 6, 6, T + 8, i % 2 ? '#141414' : '#c9a400', { tex: false });
      }
      bx(W - 4, HH - 4, 4, abre ? HH + 10 : 2, '#5c6166', { metal: 0.6 });     // porta (sobe para abrir)
      for (const s of [-1, 1]) {                                               // pistões
        if (lat) r.box(h.x, 0, h.y + s * (W / 2 + 6), T + 4, HH + 30, 6, '#3b3f44', { metal: 0.7 });
        else r.box(h.x + s * (W / 2 + 6), 0, h.y, 6, HH + 30, T + 4, '#3b3f44', { metal: 0.7 });
      }
      r.sphere(lat ? h.x : h.x + W / 2 + 14, HH + 18, lat ? h.y + W / 2 + 14 : h.y, 4, abre ? '#ff2020' : '#3a0808', { glow: true });
    }
    // lâmpadas do teto: 4 fluorescentes frias, uma sobre cada quadrante (as do original)
    for (const [mx, mz] of [[-5.3, -3.9], [6.1, -3.9], [-5.3, 6.4], [6.1, 6.4]]) r.light(X(mx), 240, Z(mz), '#cfe2ea', 0.75, 520, { fundo: true });
    // aspiradores
    for (const rb of g.data.roombas) {
      r.cyl(rb.x, 2, rb.y, rb.r, 10, '#b9bec4', { metal: 0.6, rough: 0.35 });
      r.cyl(rb.x, 12, rb.y, rb.r * 0.55, 3, '#2a2d31', { metal: 0.5 });
      for (let k = 0; k < 6; k++) {
        const ang = rb.spin + (k * Math.PI) / 3;
        r.box(rb.x + Math.cos(ang) * (rb.r + 2), 3, rb.y + Math.sin(ang) * (rb.r + 2), 10, 3, 4, '#e8e8e8', { rotY: -ang, metal: 0.9, rough: 0.2 });
      }
      const col = rb.warm ? '#ffcc00' : '#ff2020';
      r.sphere(rb.x, 15, rb.y, 3, col, { glow: true });
      r.light(rb.x, 30, rb.y, col, 0.6, 140);
    }
    // jogadores
    for (const p of g.players) r.character(p, { flash: p.alive && p.tombo > 0 });
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 44, a: '#262b31', b: '#2b3138' });
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    // as 4 grelhas dos quadrantes (só piso)
    const M = this.M, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = cx + M * (sx < 0 ? -13 : 2.45), y0 = cy + M * (sz < 0 ? -10.6 : 3.35), w = 10.55 * M, h = 7.25 * M;
      c.fillStyle = '#0c0d0f'; c.fillRect(x0, y0, w, h);
      c.fillStyle = '#2c3137'; for (let x = x0 + 4; x < x0 + w; x += 11) c.fillRect(x, y0, 3, h);
      c.strokeStyle = '#c9a400'; c.lineWidth = 3; c.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
    }
    for (const h of g.data.hatches) { c.fillStyle = '#111'; c.fillRect(h.x - 26, h.y - 26, 52, 52); D.hazardStripes(c, h.x - 26, h.y - 4, 52, 8, 6); }
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const r of g.data.roombas) {
      c.save(); c.translate(r.x, r.y);
      c.fillStyle = '#ccc'; c.beginPath(); c.arc(0, 0, r.r, 0, Math.PI * 2); c.fill();
      c.rotate(r.spin);
      c.fillStyle = '#eee'; c.strokeStyle = '#900'; c.lineWidth = 2;
      for (let k = 0; k < 6; k++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(r.r - 4, -5); c.lineTo(r.r + 9, 0); c.lineTo(r.r - 4, 5); c.fill(); c.stroke(); }
      c.restore();
      c.fillStyle = r.warm ? '#ff0' : '#f22'; c.beginPath(); c.arc(r.x, r.y, 6, 0, Math.PI * 2); c.fill();
    }
    for (const p of g.alive()) g.drawPlayer(c, p, { flash: Math.hypot(p.vx, p.vy) > 40 });
  },
});
