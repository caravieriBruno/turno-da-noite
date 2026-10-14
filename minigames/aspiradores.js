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

  // ---- constantes (originais: spawn 0,5 s, +1 a cada 5 s, máx. 5, vel. 2,5× a do jogador) ----
  SPEED: 175, ROOMBA_SPEED: 330, WARMUP_SPEED: 160, ROOMBA_R: 22,
  SPAWN_FIRST: 0.5, SPAWN_EVERY: 5, MAX_ROOMBAS: 5, SHOVE: 520, SHOVE_LOCK: 0.5,

  init(g) {
    g.data.roombas = [];
    g.data.nextSpawn = this.SPAWN_FIRST;
    const a = g.arena;
    g.data.hatches = [
      { x: a.x + a.w / 2, y: a.y }, { x: a.x + a.w / 2, y: a.y + a.h },
      { x: a.x, y: a.y + a.h / 2 }, { x: a.x + a.w, y: a.y + a.h / 2 },
    ];
    g.placeInCircle(a.x + a.w / 2, a.y + a.h / 2, 150);
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
      const stunned = Math.hypot(p.vx, p.vy) > 40;
      if (stunned) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt);
      g.decayPush(p, dt, 6);
      if (p.input.aPressed && p.data.lock <= 0 && !stunned) {
        p.data.lock = this.SHOVE_LOCK;
        g.sfx('whoosh');
        const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
        for (const o of g.alive()) {
          if (o === p) continue;
          const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
          if (dist < 56 && (dx * fx + dy * fy) / (dist || 1) > 0.2) {
            g.push(o, (dx / dist) * this.SHOVE, (dy / dist) * this.SHOVE);
            g.sfx('hit');
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
  camera: { pos: [480, 560, 750], target: [480, 0, 300], fov: 40 },
  env: { sunDir: [-0.3, 1, 0.4] },

  draw3d(g, r) {
    const a = g.arena;
    // chão: piso industrial quadriculado + entorno escuro
    r.plane(480, -1, 290, 1600, 1100, '#111417');
    const T = 44;
    for (let x = a.x; x < a.x + a.w; x += T) for (let z = a.y; z < a.y + a.h; z += T) {
      const k = (Math.floor((x - a.x) / T) + Math.floor((z - a.y) / T)) % 2;
      r.plane(x + T / 2, 0, z + T / 2, T - 1.5, T - 1.5, k ? '#3a4048' : '#343a41', { rough: 0.9 });
    }
    // paredes baixas
    const H = 34, Wd = 14;
    r.box(a.x + a.w / 2, 0, a.y - Wd / 2, a.w + Wd * 2, H, Wd, '#4b525a', { metal: 0.3 });
    r.box(a.x + a.w / 2, 0, a.y + a.h + Wd / 2, a.w + Wd * 2, H * 0.6, Wd, '#4b525a', { metal: 0.3 });
    r.box(a.x - Wd / 2, 0, a.y + a.h / 2, Wd, H, a.h, '#4b525a', { metal: 0.3 });
    r.box(a.x + a.w + Wd / 2, 0, a.y + a.h / 2, Wd, H, a.h, '#4b525a', { metal: 0.3 });
    // escotilhas com faixa de perigo
    for (const h of g.data.hatches) {
      r.box(h.x, 0.5, h.y, 56, 2, 56, '#0d0d0d');
      for (let i = 0; i < 6; i++) r.box(h.x - 25 + i * 10 + 5, 2.5, h.y, 5, 1, 56, i % 2 ? '#111' : '#f5c400', { shadow: false });
    }
    // lâmpadas do teto (luz quente)
    r.light(300, 260, 200, '#ffd9a8', 0.9, 700);
    r.light(660, 260, 380, '#ffd9a8', 0.9, 700);
    // aspiradores
    for (const rb of g.data.roombas) {
      r.cyl(rb.x, 2, rb.y, rb.r, 10, '#b9bec4', { metal: 0.6, rough: 0.35 });
      r.cyl(rb.x, 12, rb.y, rb.r * 0.55, 3, '#2a2d31', { metal: 0.5 });
      for (let k = 0; k < 6; k++) {
        const ang = rb.spin + (k * Math.PI) / 3;
        r.box(rb.x + Math.cos(ang) * (rb.r + 3), 3, rb.y + Math.sin(ang) * (rb.r + 3), 16, 3, 5, '#e8e8e8', { rotY: -ang, metal: 0.9, rough: 0.2 });
      }
      const col = rb.warm ? '#ffcc00' : '#ff2020';
      r.sphere(rb.x, 17, rb.y, 4, col, { glow: true });
      r.light(rb.x, 30, rb.y, col, 0.6, 140);
    }
    // jogadores
    for (const p of g.players) r.character(p, { flash: p.alive && Math.hypot(p.vx, p.vy) > 40 });
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 44, a: '#262b31', b: '#2b3138' });
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
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
