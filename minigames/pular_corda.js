// PULAR CORDA — a corda virou um laser industrial preso num eixo no meio da sala.
// O laser gira como um ponteiro de relógio; pule (AÇÃO) quando ele passar por você.
// Acelera com o tempo, ganha um segundo braço e às vezes inverte o sentido (com aviso).
TN.registerMinigame({
  id: 'pular_corda',
  title: 'PULAR CORDA',
  inspiredBy: 'brincadeira: pular corda',
  tagline: 'UM, DOIS, TRÊS... QUANTOS AINDA PULAM?',
  brief: [
    'Um laser gira em volta do eixo central.',
    'Pule (AÇÃO) quando ele passar por você.',
    'Ele acelera, ganha outro braço e muda de sentido.',
    'Laser em cima de você no chão = fim.',
  ],
  controls: { move: 'andar', a: 'pular' },
  icon: '⟳',
  color: '#ff3b6b',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes ----
  CX: 480, CY: 276, R: 196, HUB: 40, BEAM_W: 4,
  SPEED: 150, AIR_SPEED: 95,
  AIR: 0.5, JUMP_CD: 0.22, JUMP_H: 22,
  OMEGA0: 1.5, OMEGA_ACC: 0.05, OMEGA_MAX1: 3.6, OMEGA_MAX2: 3.0, WARMUP: 1.6,
  ARM2_AT: 20, REV_FIRST: 27, REV_WARN: 0.8,
  SAFETY: 75,        // segurança: depois disso a rodada acaba e quem estiver vivo ganha

  init(g) {
    const d = g.data;
    d.theta = Math.PI / 4;     // ângulo do braço principal (começa entre os jogadores)
    d.sign = 1;                // 1 = horário na tela, -1 = anti-horário
    d.omega = 0;               // velocidade angular atual (com sinal)
    d.arms = [0];              // deslocamentos dos braços
    d.arm2Warn = false;
    d.nextRev = this.REV_FIRST + TN.util.rand(0, 4);
    d.revWarn = 0;             // > 0 durante o aviso de inversão
    d.over = false;
    g.placeInCircle(this.CX, this.CY, 130);
    for (const p of g.players) { p.data.air = 0; p.data.cd = 0; p.data.jumps = 0; }
  },

  speedAt(g) {
    const d = g.data, max = d.arms.length > 1 ? this.OMEGA_MAX2 : this.OMEGA_MAX1;
    const warm = TN.util.clamp(g.time / this.WARMUP, 0, 1);
    return Math.min(max, this.OMEGA0 + this.OMEGA_ACC * g.time) * warm;
  },

  armAngles(g) { return g.data.arms.map((o) => g.data.theta + o); },

  update(g, dt) {
    const U = TN.util, d = g.data;
    if (g.time >= this.SAFETY && !d.over) { d.over = true; g.message('FIM DO RECREIO.', 1.5, '#ff3b6b'); g.finish(1.2); }

    // segundo braço (com aviso de 1,2 s)
    if (d.arms.length === 1 && !d.arm2Warn && g.time >= this.ARM2_AT - 1.2) {
      d.arm2Warn = true; g.sfx('buzz'); g.message('CORDA DUPLA.', 1.2, '#ff3b6b');
    }
    if (d.arms.length === 1 && g.time >= this.ARM2_AT) { d.arms.push(Math.PI); g.sfx('laser'); g.flash('#ff3b6b', 0.15); }
    // inversões de sentido, sempre com aviso
    if (g.time >= d.nextRev - this.REV_WARN && d.revWarn <= 0 && g.time < d.nextRev) { d.revWarn = this.REV_WARN; g.sfx('buzz'); }
    if (d.revWarn > 0) d.revWarn -= dt;
    if (g.time >= d.nextRev) {
      d.sign *= -1; d.revWarn = 0;
      d.nextRev = g.time + U.rand(5, 9);
      g.sfx('whoosh'); g.flash('#ffd23f', 0.12);
      g.message('INVERTENDO.', 0.8, '#ffd23f');
    }
    d.omega = this.speedAt(g) * d.sign;
    d.theta += d.omega * dt;

    // jogadores
    for (const p of g.alive()) {
      const pd = p.data;
      g.movePlayer(p, pd.air > 0 ? this.AIR_SPEED : this.SPEED, dt, null);
      if (pd.air > 0) {
        pd.air -= dt;
        if (pd.air <= 0) { pd.air = 0; pd.cd = this.JUMP_CD; g.sfx('step'); }
      } else {
        pd.cd -= dt;
        if (p.input.aPressed && pd.cd <= 0) { pd.air = this.AIR; pd.jumps++; g.sfx('jump'); }
      }
    }
    U.separate(g.alive());
    // presos ao anel entre o eixo e a borda da plataforma
    for (const p of g.alive()) {
      const dx = p.x - this.CX, dy = p.y - this.CY, r = Math.hypot(dx, dy) || 1;
      const rr = U.clamp(r, this.HUB + p.r + 6, this.R - p.r);
      p.x = this.CX + (dx / r) * rr; p.y = this.CY + (dy / r) * rr;
    }

    // laser x jogadores no chão
    if (g.time < this.WARMUP * 0.5) return;
    for (const ang of this.armAngles(g)) {
      const x1 = this.CX + Math.cos(ang) * this.HUB, y1 = this.CY + Math.sin(ang) * this.HUB;
      const x2 = this.CX + Math.cos(ang) * (this.R + 8), y2 = this.CY + Math.sin(ang) * (this.R + 8);
      for (const p of g.alive()) {
        if (p.data.air > 0) continue;
        if (U.segCircle(x1, y1, x2, y2, p.x, p.y, p.r - 4 + this.BEAM_W / 2)) {
          p.data.cutAt = g.time;   // só para a animação 3D do corte
          g.eliminate(p, { sound: 'laser', particles: false, msg: U.pick(['TROPEÇOU.', 'CORTADO.', 'FORA DO RITMO.', 'NÃO PULOU.']) });
          g.sfx('boom'); g.shake(12); g.flash('#ff3b6b', 0.18);
          g.particles(p.x, p.y, '#ff3b6b', 26, 320);
          g.particles(p.x, p.y, p.color, 20, 220);
          g.particles(p.x, p.y, '#fff', 10, 380, 0.3, 2);
        }
      }
    }
  },

  // Bot: estima quando o laser vai entrar no robô e pula mirando o meio da janela segura, com erro.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (!pd.bot) pd.bot = { prefR: U.rand(90, 160), skill: U.rand(0.07, 0.12), noise: 0, tw: 0, tt: 0 };
    const b = pd.bot;
    const dx = p.x - this.CX, dy = p.y - this.CY, r = Math.hypot(dx, dy) || 1, phi = Math.atan2(dy, dx);
    // movimento: volta para o raio preferido e passeia de leve pela roda
    b.tt -= dt;
    if (b.tt <= 0) { b.tt = U.rand(0.8, 2.2); b.tw = U.pick([-1, 0, 0, 1]) * 0.6; if (U.chance(0.3)) b.prefR = U.rand(90, 160); }
    let mx = (dx / r) * (b.prefR - r) / 30 - (dy / r) * b.tw;
    let my = (dy / r) * (b.prefR - r) / 30 + (dx / r) * b.tw;
    for (const o of g.alive()) {
      if (o === p) continue;
      const ox = p.x - o.x, oy = p.y - o.y, od = Math.hypot(ox, oy) || 1;
      if (od < 70) { mx += (ox / od) * 0.8; my += (oy / od) * 0.8; }
    }
    // pulo
    let jump = false;
    const w = Math.abs(d.omega);
    if (w > 0.05 && pd.air <= 0 && pd.cd <= 0) {
      const hw = Math.asin(Math.min(1, (p.r - 4 + this.BEAM_W) / r));   // meia largura angular do robô
      let tEnter = Infinity;
      for (const ang of this.armAngles(g)) {
        let delta = d.sign > 0 ? phi - ang : ang - phi;
        delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        tEnter = Math.min(tEnter, (delta - hw) / w);
      }
      const overlap = (2 * hw) / w;
      const ideal = Math.max(0.03, (this.AIR - overlap) / 2);
      if (tEnter <= ideal + b.noise) {
        jump = true;
        // erro de tempo do próximo pulo: cresce com a velocidade do laser
        const k = b.skill * (0.6 + w / 3);
        b.noise = (Math.random() + Math.random() + Math.random() - 1.5) * k * 1.6;
      }
    }
    return { x: U.clamp(mx, -1, 1), y: U.clamp(my, -1, 1), a: jump };
  },

  // ---------- desenho 3D (câmera fixa) ----------
  camera: { pos: [480, 600, 760], target: [480, 0, 290], fov: 38 },
  env: { bg: '#040507', fog: [900, 1900], ambient: 0.5, sun: 1.3, sunDir: [-0.3, 1, 0.45], sunColor: '#ffe6cc' },
  LASER_Y: 8,

  // um braço de laser: núcleo branco, halo colorido, rastro e o carrinho emissor na borda
  drawLaser3d(r, d, ang, color, ghost) {
    const cx = this.CX, cy = this.CY, y = this.LASER_Y, c = Math.cos(ang), s = Math.sin(ang);
    const x1 = cx + c * this.HUB, z1 = cy + s * this.HUB, x2 = cx + c * (this.R + 8), z2 = cy + s * (this.R + 8);
    if (ghost) { r.beam(x1, y, z1, x2, y, z2, 5, color, { glow: true, opacity: 0.35 }); return; }
    r.beam(x1, y, z1, x2, y, z2, 2.4, '#ffffff', { glow: true });
    r.beam(x1, y, z1, x2, y, z2, 8, color, { glow: true, opacity: 0.5 });
    r.beam(x1, y, z1, x2, y, z2, 18, color, { glow: true, opacity: 0.14 });
    for (let k = 1; k <= 5; k++) {
      const a = ang - d.sign * k * 0.06, ca = Math.cos(a), sa = Math.sin(a);
      r.beam(cx + ca * this.HUB, 1, cy + sa * this.HUB, cx + ca * this.R, 1, cy + sa * this.R, 10, color, { glow: true, opacity: 0.13 * (1 - k / 6), shadow: false });
    }
    // carrinho emissor que corre no trilho da borda
    r.box(x2 + c * 6, 0, z2 + s * 6, 18, 16, 18, '#2a2e35', { rotY: -ang, metal: 0.7, rough: 0.35 });
    r.sphere(x2, y, z2, 4, color, { glow: true });
    r.light(cx + c * this.R * 0.55, 26, cy + s * this.R * 0.55, color, 1.3, 280);
  },

  draw3d(g, r) {
    const d = g.data, cx = this.CX, cy = this.CY, R = this.R, t = g.time;
    const warn = d.revWarn > 0 && Math.floor(t * 12) % 2 === 0;
    const col = warn ? '#ffd23f' : '#ff3b6b';
    // poço escuro com grade lá embaixo
    r.plane(480, -220, 290, 2200, 1500, '#07080a');
    for (let k = -8; k <= 8; k++) r.plane(cx + k * 70, -219, 290, 2, 1400, '#1a2a30', { glow: true, opacity: 0.5 });
    // plataforma circular suspensa
    r.cyl(cx, -60, cy, R + 10, 60, '#2a2e34', { metal: 0.5, rough: 0.5, sides: 32 });
    r.cyl(cx, -220, cy, 60, 160, '#1c1f24', { metal: 0.5 });
    const T = 36;
    for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
      const x = cx + i * T, z = cy + j * T;
      if (Math.hypot(i, j) * T > R - 22) continue;
      r.plane(x, 0, z, T - 1.5, T - 1.5, (i + j) % 2 ? '#262b32' : '#21252b', { rough: 0.85 });
    }
    r.disc(cx, -0.4, cy, R, '#15181c', {});
    for (const rr of [90, 140]) r.ring(cx, 0.5, cy, rr - 1, rr + 1, '#ffffff', { glow: true, opacity: 0.07 });
    // borda com faixa de perigo que gira junto com o laser
    r.ring(cx, 0.3, cy, R, R + 10, '#f5c400', {});
    for (let k = 0; k < 16; k++) {
      const an = (k / 16) * Math.PI * 2 + d.theta * 0.1, mx = cx + Math.cos(an) * (R + 5), mz = cy + Math.sin(an) * (R + 5);
      r.box(mx, 0, mz, 30, 0.8, 10.5, '#111', { rotY: -(an + Math.PI / 2), shadow: false });
    }
    r.ring(cx, 0.2, cy, R + 10, R + 13, '#3a3f47', { metal: 0.6 });
    // luzes do teto
    r.light(cx, 380, cy + 60, '#ffd9a8', 1.4, 820);
    r.light(cx - 360, 220, cy - 100, '#6d86b0', 0.5, 600);
    // corpos: mancha de queimado + fumaça
    for (const p of g.players) {
      if (p.alive) continue;
      r.disc(p.x, 0.8, p.y, 24, '#000', { opacity: 0.5 });
      const ct = p.data.cutAt !== undefined ? (t - p.data.cutAt) / 0.5 : 1;
      if (ct >= 0 && ct < 1) {
        // corte do laser: clarão, anel de choque e o corpo arremessado para cima
        r.sphere(p.x, 20, p.y, 12 + 40 * ct, '#ff3b6b', { glow: true, opacity: 0.7 * (1 - ct) });
        r.sphere(p.x, 20, p.y, 6 + 16 * ct, '#ffffff', { glow: true, opacity: 0.9 * (1 - ct) });
        r.ring(p.x, 1.5, p.y, 14 + 70 * ct, 20 + 80 * ct, '#ff3b6b', { glow: true, opacity: 0.6 * (1 - ct) });
        r.light(p.x, 40, p.y, '#ff3b6b', 4 * (1 - ct), 360);
        r.character(p, { pose: 'fall', y: Math.sin(Math.PI * ct) * 40, flash: ct < 0.4, label: false });
        continue;
      }
      r.character(p, { label: false });
      for (let s = 0; s < 2; s++) { const ph = (t * 0.7 + s / 2) % 1; r.sphere(p.x, 8 + ph * 50, p.y, 4 + ph * 8, '#555', { glow: true, opacity: 0.3 * (1 - ph) }); }
    }
    // jogadores: no ar sobem (o.y), no chão mostram a recarga do pulo
    for (const p of g.alive()) {
      const pd = p.data;
      if (pd.air > 0) {
        const k = Math.sin(Math.PI * (1 - pd.air / this.AIR));
        r.disc(p.x, 0.9, p.y, p.r * (1 - k * 0.4), '#000', { opacity: 0.45 });
        r.character(p, { pose: 'fall', y: k * 34 });
      } else {
        r.character(p, { pose: pd.cd > 0.12 ? 'crouch' : 'auto' });
        if (pd.cd > 0) r.ring(p.x, 1, p.y, p.r + 4, p.r + 7, '#ffffff', { glow: true, opacity: 0.4, arc: pd.cd / this.JUMP_CD });
      }
    }
    // lasers e aviso do segundo braço
    if (d.arm2Warn && d.arms.length === 1 && Math.floor(t * 8) % 2 === 0) this.drawLaser3d(r, d, d.theta + Math.PI, '#ff3b6b', true);
    for (const ang of this.armAngles(g)) this.drawLaser3d(r, d, ang, col, false);
    // eixo central com engrenagem girando e setas do sentido
    const H = this.HUB;
    r.cyl(cx, 0, cy, H, 24, '#3a4048', { metal: 0.6, rough: 0.4, sides: 16 });
    for (let k = 0; k < 8; k++) {
      const an = d.theta + (k / 8) * Math.PI * 2;
      r.box(cx + Math.cos(an) * (H + 1), 6, cy + Math.sin(an) * (H + 1), 10, 12, 8, '#5a626c', { rotY: -an, metal: 0.7, rough: 0.3 });
    }
    r.cyl(cx, 24, cy, H - 10, 4, '#20252b', { metal: 0.5 });
    r.ring(cx, 28.3, cy, H - 22, H - 17, col, { glow: true, opacity: 0.85 });
    for (const off of [0, Math.PI]) {
      const an = d.theta + off + Math.PI / 2;
      r.cone(cx + Math.cos(an) * (H - 19.5), 29, cy + Math.sin(an) * (H - 19.5), 4.5, 10, col, { glow: true, rotZ: -Math.PI / 2, rotY: -(an + d.sign * Math.PI / 2) });
    }
    r.sphere(cx, 32, cy, 6, col, { glow: true });
  },

  // painel de rotação (fixo na tela)
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, d = g.data;
    const rpm = Math.round(Math.abs(d.omega) * 60 / (Math.PI * 2));
    D.text(c, `ROTAÇÃO ${String(rpm).padStart(2, '0')} RPM`, 24, 510, { size: 14, color: '#ff3b6b' });
    D.text(c, d.sign > 0 ? 'SENTIDO: HORÁRIO' : 'SENTIDO: ANTI-HORÁRIO', 24, 490, { size: 12, color: d.revWarn > 0 ? '#ffd23f' : '#889' });
    const left = Math.max(0, this.SAFETY - g.time);
    D.text(c, `RECREIO TERMINA EM ${Math.ceil(left)} s`, g.W - 24, 510, { size: 12, color: '#667', align: 'right' });
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, cx = this.CX, cy = this.CY, R = this.R;
    c.fillStyle = '#060709'; c.fillRect(0, 0, g.W, g.H);
    // poço escuro com grade
    c.strokeStyle = '#11151a'; c.lineWidth = 1;
    for (let x = 0; x < g.W; x += 24) { c.beginPath(); c.moveTo(x, 34); c.lineTo(x, g.H); c.stroke(); }
    // plataforma
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    D.floor(c, cx - R, cy - R, R * 2, R * 2, { tile: 36, a: '#20242a', b: '#252a31' });
    // anéis de referência
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 2;
    for (const rr of [90, 140]) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); }
    // rastro do laser (afterglow)
    for (const ang of this.armAngles(g)) {
      for (let k = 1; k <= 10; k++) {
        const a0 = ang - d.sign * k * 0.045, a1 = ang - d.sign * (k - 1) * 0.045;
        c.fillStyle = `rgba(255,40,90,${0.16 * (1 - k / 10)})`;
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, Math.min(a0, a1), Math.max(a0, a1)); c.closePath(); c.fill();
      }
    }
    c.restore();
    // borda com faixa de perigo
    c.lineWidth = 10; c.strokeStyle = '#111'; c.beginPath(); c.arc(cx, cy, R + 5, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#f5c400'; c.setLineDash([12, 12]); c.lineDashOffset = -d.theta * 20;
    c.beginPath(); c.arc(cx, cy, R + 5, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
    // aviso do segundo braço: fantasma piscando
    if (d.arm2Warn && d.arms.length === 1 && Math.floor(g.time * 8) % 2 === 0) this.drawBeam(c, d.theta + Math.PI, 'rgba(255,59,107,0.35)', true);

    // corpos, sombras, robôs no chão e depois os que estão no ar
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    const warn = d.revWarn > 0 && Math.floor(g.time * 12) % 2 === 0;
    const ground = g.alive().filter((p) => p.data.air <= 0), airborne = g.alive().filter((p) => p.data.air > 0);
    for (const p of ground) {
      g.drawPlayer(c, p);
      if (p.data.cd > 0) { c.strokeStyle = '#fff6'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.r + 5, 0, (p.data.cd / this.JUMP_CD) * Math.PI * 2); c.stroke(); }
    }
    for (const ang of this.armAngles(g)) this.drawBeam(c, ang, warn ? '#ffd23f' : '#ff3b6b');
    this.drawHub(g, c, warn);
    for (const p of airborne) {
      const k = Math.sin(Math.PI * (1 - p.data.air / this.AIR));   // 0 → 1 → 0
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(p.x, p.y + p.r * 0.75, p.r * (1 - k * 0.35), p.r * 0.4 * (1 - k * 0.35), 0, 0, Math.PI * 2); c.fill();
      D.robot(c, p.x, p.y - k * this.JUMP_H, p.r * (1 + k * 0.28), p.color, { dir: p.dir, label: p.label });
    }
    // painel de rotação
    const rpm = Math.round(Math.abs(d.omega) * 60 / (Math.PI * 2));
    D.text(c, `ROTAÇÃO ${String(rpm).padStart(2, '0')} RPM`, 24, 510, { size: 14, color: '#ff3b6b' });
    D.text(c, d.sign > 0 ? 'SENTIDO: HORÁRIO' : 'SENTIDO: ANTI-HORÁRIO', 24, 490, { size: 12, color: d.revWarn > 0 ? '#ffd23f' : '#889' });
    const left = Math.max(0, this.SAFETY - g.time);
    D.text(c, `RECREIO TERMINA EM ${Math.ceil(left)} s`, g.W - 24, 510, { size: 12, color: '#667', align: 'right' });
  },

  drawBeam(c, ang, color, ghost) {
    const cx = this.CX, cy = this.CY;
    const x1 = cx + Math.cos(ang) * this.HUB, y1 = cy + Math.sin(ang) * this.HUB;
    const x2 = cx + Math.cos(ang) * (this.R + 8), y2 = cy + Math.sin(ang) * (this.R + 8);
    c.lineCap = 'round';
    if (!ghost) { c.strokeStyle = color; c.globalAlpha = 0.25; c.lineWidth = 14; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.globalAlpha = 1; }
    c.strokeStyle = color; c.lineWidth = this.BEAM_W + 1; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    if (!ghost) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
    c.lineCap = 'butt';
    // emissor na ponta
    c.fillStyle = '#333'; c.beginPath(); c.arc(x2, y2, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = color; c.beginPath(); c.arc(x2, y2, 3, 0, Math.PI * 2); c.fill();
  },

  drawHub(g, c, warn) {
    const d = g.data, cx = this.CX, cy = this.CY, H = this.HUB;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(cx + 3, cy + 5, H, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a4048'; c.strokeStyle = '#111'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, H, 0, Math.PI * 2); c.fill(); c.stroke();
    // engrenagem girando
    c.save(); c.translate(cx, cy); c.rotate(d.theta);
    c.fillStyle = '#5a626c';
    for (let k = 0; k < 8; k++) { c.rotate(Math.PI / 4); c.fillRect(H - 12, -4, 10, 8); }
    c.restore();
    c.fillStyle = '#20252b'; c.beginPath(); c.arc(cx, cy, H - 14, 0, Math.PI * 2); c.fill();
    // seta mostrando o sentido de rotação
    const col = warn ? '#ffd23f' : '#ff3b6b';
    c.strokeStyle = col; c.lineWidth = 3;
    const a0 = -Math.PI * 0.85, a1 = Math.PI * 0.35;
    c.beginPath(); c.arc(cx, cy, H - 22, a0, a1, d.sign < 0); c.stroke();
    const ae = a1, tx = cx + Math.cos(ae) * (H - 22), ty = cy + Math.sin(ae) * (H - 22);
    c.save(); c.translate(tx, ty); c.rotate(ae + (d.sign > 0 ? Math.PI / 2 : -Math.PI / 2));
    c.fillStyle = col; c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -5); c.lineTo(-4, 5); c.fill(); c.restore();
  },
});
