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
