// MORTO-VIVO — a brincadeira de obedecer ao chefe, com a gerência no comando.
// O Supervisor grita "VIVO!" (fique de pé) ou "MORTO!" (deite). Quem estiver na postura errada
// quando a janela fechar leva uma prensa na cabeça. Qualquer outra palavra é pegadinha: não se mexa.
TN.registerMinigame({
  id: 'morto_vivo',
  title: 'MORTO-VIVO',
  inspiredBy: 'brincadeira: morto-vivo',
  tagline: 'FINGIR DE MORTO NUNCA FOI TÃO REALISTA.',
  brief: [
    'VIVO! = fique de pé (CIMA). MORTO! = deite (BAIXO).',
    'Obedeça antes de a prensa descer.',
    'Só VIVO! e MORTO! valem. O resto é pegadinha.',
    'Mexer sem ordem também é fatal.',
  ],
  controls: { move: 'CIMA = de pé · BAIXO = deitado' },
  icon: '☠',
  color: '#c7ff3d',
  rounds: 3,
  scoring: 'survival',
  // ---- constantes ----
  SAFETY: 90,        // segurança: depois de 90 s a rodada acaba e quem estiver vivo ganha
  FLOOR_Y: 462, BOT_W: 54, BOT_H: 88, PRESS_TOP: 168,
  WIN_START: 1.2, WIN_SHRINK: 0.95, WIN_MIN: 0.45,
  GRACE: 0.12,       // tolerância depois da janela antes de valer a regra "mexeu sem ordem"
  FAKES: ['VIVÍSSIMO!', 'MORRENDO...', 'MORTO-VIVO!', 'VIVA O SUPERVISOR!', 'MORTADELA!', 'VIVEIRO!',
    'MORTÍFERO!', 'MO... MOMENTO.', 'VI... VISTORIA!', 'MORTALHA!', 'VIVA!', 'MORTOS?'],

  init(g) {
    const d = g.data;
    d.phase = 'wait';      // 'wait' entre ordens, 'cmd' com a janela aberta
    d.required = 'vivo';   // postura correta atual
    d.cmd = null; d.n = 0; d.cmdId = 0;
    d.nextAt = 1.4; d.graceUntil = 0;
    d.lastText = 'ATENÇÃO.';
    d.eye = 0;
    const n = g.players.length, lw = g.W / n;
    g.players.forEach((p, i) => {
      p.data.lane = i; p.data.laneX = lw * i + lw / 2;
      p.data.pose = 'vivo'; p.data.lie = 0;   // 0 = de pé, 1 = deitado (animação)
      p.data.press = null;                    // animação da prensa
      p.x = p.data.laneX; p.y = this.FLOOR_Y - 30;
    });
  },

  window(n) { return Math.max(this.WIN_MIN, this.WIN_START * this.WIN_SHRINK ** n); },

  issueCommand(g) {
    const U = TN.util, d = g.data;
    let text, target, fake = false;
    if (d.n >= 2 && U.chance(0.25)) {
      fake = true; target = d.required; text = U.pick(this.FAKES);
    } else {
      // ordem real: na maioria das vezes muda a postura; às vezes repete a atual (ninguém deve se mexer)
      target = d.n < 2 || U.chance(0.7) ? (d.required === 'vivo' ? 'morto' : 'vivo') : d.required;
      text = target === 'vivo' ? 'VIVO!' : 'MORTO!';
    }
    const win = this.window(d.n);
    d.cmd = { id: ++d.cmdId, text, target, fake, t0: g.time, win };
    d.lastText = text;
    d.phase = 'cmd'; d.n++; d.eye = 1;
    g.sfx('buzz');
  },

  judge(g) {
    const d = g.data, cmd = d.cmd;
    for (const p of g.alive()) {
      if (p.data.pose !== cmd.target) this.crush(g, p, cmd.target === 'vivo' ? 'ERA PARA ESTAR VIVO.' : 'ERA PARA ESTAR MORTO.');
    }
    d.required = cmd.target;
    d.phase = 'wait';
    d.graceUntil = g.time + this.GRACE;
    d.nextAt = g.time + Math.max(0.45, 1.0 - d.n * 0.03) + TN.util.rand(0, 0.55);
    if (g.alive().length > 0) g.sfx('tick');
    else g.after(0.4, () => g.message('NENHUM SOBREVIVENTE. ÓTIMO.', 1.6, '#f55'));
  },

  crush(g, p, why) {
    const U = TN.util;
    p.x = p.data.laneX; p.y = this.FLOOR_Y - 20;
    g.eliminate(p, { sound: null, particles: false });
    p.data.press = { t: 0, hit: false };
    p.data.why = why;
    g.sfx('laser');
    // o impacto acontece quando a prensa chega no chão
    g.after(0.12, () => {
      g.sfx('boom'); g.shake(12);
      g.particles(p.data.laneX, this.FLOOR_Y - 8, '#ddd', 20, 300, 0.5, 3);
      g.particles(p.data.laneX, this.FLOOR_Y - 8, p.color, 18, 240);
      g.particles(p.data.laneX, this.FLOOR_Y - 8, '#222', 14, 160, 0.9, 5);
      g.popup(U.pick(['ESMAGADO.', 'PRENSADO.', 'ACHATADO.', 'DESOBEDIENTE.']), p.data.laneX, this.FLOOR_Y - 120, '#f55');
    });
  },

  update(g, dt) {
    const U = TN.util, d = g.data;
    d.eye = Math.max(0, d.eye - dt * 2);
    // segurança (sem timeLimit para não poluir o HUD): o turno acaba sozinho
    if (g.time >= this.SAFETY && !d.over) { d.over = true; g.message('TURNO ENCERRADO.', 1.5, '#c7ff3d'); g.finish(1.2); }
    // ordens
    if (d.phase === 'wait' && g.time >= d.nextAt && g.alive().length > 1 && !d.over) this.issueCommand(g);
    // posturas
    for (const p of g.alive()) {
      let want = p.data.pose;
      if (p.input.upPressed) want = 'vivo';
      else if (p.input.downPressed) want = 'morto';
      if (want !== p.data.pose) {
        p.data.pose = want;
        g.sfx('step');
        // mexer sem nenhuma ordem no ar é desobediência
        if (d.phase === 'wait' && g.time > d.graceUntil) { this.crush(g, p, 'NINGUÉM MANDOU SE MEXER.'); continue; }
      }
      p.data.lie = U.approach(p.data.lie, p.data.pose === 'morto' ? 1 : 0, dt * 9);
    }
    for (const p of g.players) if (p.data.press) p.data.press.t += dt;
    // fim da janela
    if (d.phase === 'cmd' && g.time >= d.cmd.t0 + d.cmd.win) this.judge(g);
  },

  // Bot: reage com atraso aleatório; de vez em quando cai na pegadinha.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (d.phase !== 'cmd') return {};
    const cmd = d.cmd;
    if (pd.botCmd !== cmd.id) {
      pd.botCmd = cmd.id;
      pd.botDelay = U.rand(0.25, 0.7);
      pd.botWant = cmd.target;
      if (cmd.fake && U.chance(0.08)) pd.botWant = pd.pose === 'vivo' ? 'morto' : 'vivo';
      else if (!cmd.fake && cmd.target === pd.pose && U.chance(0.02)) pd.botWant = pd.pose === 'vivo' ? 'morto' : 'vivo';
    }
    pd.botDelay -= dt;
    if (pd.botDelay > 0 || pd.pose === pd.botWant) return {};
    return { y: pd.botWant === 'vivo' ? -1 : 1 };
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Cabines lado a lado vistas de frente: X = laneX, Z = fundo da cabine, Y = altura.
  camera: { pos: [480, 250, 1240], target: [480, 128, 420], fov: 36 },
  env: { bg: '#07090b', fog: [1000, 2600], ambient: 0.5, sun: 1.0, sunDir: [-0.25, 1, 0.8], sunColor: '#ffe6c8' },
  S3: 1.6, LZ3: 420, PK3: 0.62,

  // posição 3D do boneco (no meio da cabine) — usada pelos rótulos do motor
  worldPos(g, p) { return { x: p.data.laneX, y: 0, z: this.LZ3 }; },

  // altura da base da placa da prensa (mesma animação do 2D)
  pressBottom(p) {
    const pr = p.data.press, ph = 26;
    let y = this.PRESS_TOP;
    if (pr) {
      const fall = Math.min(1, pr.t / 0.12);
      const rise = pr.t > 0.9 ? Math.min(1, (pr.t - 0.9) / 1.2) : 0;
      const low = this.FLOOR_Y - ph - 14;
      y = this.PRESS_TOP + (low - this.PRESS_TOP) * fall * (1 - rise * 0.75);
    }
    return (this.FLOOR_Y - y - ph) * this.PK3;
  },

  draw3d(g, r) {
    const d = g.data, n = g.players.length, lw = g.W / n, LZ = this.LZ3, S = this.S3, t = g.time;
    const BZ = 320, FZ = 520, CH = 250;   // fundo, frente e teto das cabines
    // piso e parede do galpão
    r.plane(480, -1, 500, 2600, 1600, '#0c0e11');
    for (let x = -200; x < 1160; x += 80) for (let z = 520; z < 760; z += 80) r.plane(x + 40, 0, z + 40, 78, 78, ((x + z) / 80) % 2 ? '#24282e' : '#20242a', { rough: 0.95 });
    r.box(480, 0, BZ - 30, 1800, 520, 20, '#14171b');
    for (let x = -420; x < 1400; x += 64) r.box(x, 0, BZ - 19, 4, 520, 2, '#191d22');
    // faixa de perigo na frente das cabines
    for (let i = 0; i < 40; i++) r.box(-10 + i * 25 + 6, 0.3, FZ + 8, 12.5, 1, 12, i % 2 ? '#111' : '#f5c400', { shadow: false });
    // viga superior com o nome do setor
    r.box(480, CH, (BZ + FZ) / 2, 1000, 34, FZ - BZ + 20, '#2a3038', { metal: 0.5, rough: 0.5 });
    r.box(480, CH + 2, FZ + 11, 1000, 4, 2, '#f5c400', { glow: true });
    for (let i = 0; i < n; i++) {
      const p = g.players[i], x = p.data.laneX, alive = p.alive;
      // cabine: fundo, piso e divisórias
      r.box(x, 0, BZ - 8, lw - 10, CH, 8, '#262c33', { rough: 0.85 });
      r.box(x, 0, BZ - 3, lw - 40, 6, 2, '#3a4048');
      r.plane(x, 0.2, (BZ + FZ) / 2, lw - 12, FZ - BZ, alive ? '#30363e' : '#2a2023', { rough: 0.9 });
      for (let k = 0; k < 4; k++) r.plane(x, 0.4, BZ + 30 + k * 50, lw - 30, 2, '#20252b', { shadow: false });
      // número da cabine
      r.label(x - lw / 2 + 26, CH - 26, BZ, String(i + 1), '#56606c', 22);
      // prensa: pistão, placa e listras
      const pb = this.pressBottom(p);
      r.cyl(x, pb + 22, LZ, 12, Math.max(1, CH - pb - 22), '#8a929c', { metal: 0.85, rough: 0.25 });
      r.cyl(x, CH - 40, LZ, 20, 40, '#3a4048', { metal: 0.6 });
      r.box(x, pb, LZ, 150, 22, 100, '#4b525b', { metal: 0.55, rough: 0.45 });
      for (let k = 0; k < 10; k++) r.box(x - 67.5 + k * 15, pb + 2, LZ + 50.5, 7.5, 8, 1, k % 2 ? '#111' : '#f5c400', { shadow: false });
      // luz de alerta da cabine
      const danger = d.phase === 'cmd' && alive;
      const lc = danger ? (Math.floor(t * 10) % 2 ? '#ff3333' : '#550000') : (alive ? '#2f6a3a' : '#311');
      r.sphere(x + 60, pb + 30, LZ + 40, 5, lc, { glow: true });
      // lâmpada da cabine
      r.sphere(x, CH - 4, FZ - 6, 6, alive ? '#ffe2b0' : '#5a3020', { glow: true });
      if (i < 4) r.light(x, CH - 30, FZ - 10, alive ? '#ffd7a0' : '#ff5a3a', alive ? 2.6 : 0.9, 460);
      // divisória à direita
      if (i < n - 1) r.box(x + lw / 2, 0, (BZ + FZ) / 2, 10, CH, FZ - BZ, '#2f363e', { metal: 0.3 });
      // boneco
      if (alive) {
        const k = p.data.lie;
        if (k >= 0.85) r.character({ ...p, x, y: LZ }, { pose: 'lie', dir: 0, scale: S });
        else if (k > 0.15) r.character({ ...p, x, y: LZ }, { pose: 'crouch', dir: Math.PI / 2 - k, scale: S });
        else r.character({ ...p, x, y: LZ }, { pose: 'idle', dir: Math.PI / 2, scale: S });
      } else {
        // achatado debaixo da prensa: panqueca na cor do macacão
        r.disc(x, 0.6, LZ, 62, '#120607', { opacity: 0.9 });
        r.box(x, 0, LZ, 92, 5, 56, p.color, { rough: 0.7, rotY: 0.15 });
        r.box(x - 52, 0, LZ + 6, 22, 4, 26, '#d8d2c8', { rotY: 0.3 });
        r.box(x - 58, 4, LZ + 6, 8, 1.5, 18, '#0b0f14', { rotY: 0.3 });
        r.box(x + 30, 0, LZ - 34, 40, 3, 12, p.color, { rotY: -0.5 });
        r.box(x + 24, 0, LZ + 36, 40, 3, 12, p.color, { rotY: 0.6 });
        r.label(x, 112, LZ, p.label, '#888', 12);
      }
    }
    // alarme geral quando há ordem no ar
    if (d.phase === 'cmd') r.light(480, CH - 20, FZ + 60, '#ff2a2a', 0.8 + d.eye * 2.5, 900);
    else r.light(480, CH + 120, FZ + 200, '#cfd8ff', 0.4, 900);
  },

  // HUD 2D: painel do Supervisor no topo e a placa de cada cabine
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, n = g.players.length, lw = g.W / n;
    this.drawSupervisor(g, c);
    for (const p of g.players) {
      const s = TN.R3.project(p.data.laneX, 0, 540);
      const lbl = p.alive ? (p.data.pose === 'vivo' ? 'DE PÉ' : 'DEITADO') : 'ELIMINADO';
      D.text(c, p.label + (p.isBot ? ' BOT' : ''), s.x, s.y + 16, { size: 15, color: p.alive ? p.color : '#777', align: 'center' });
      D.text(c, lbl, s.x, s.y + 36, { size: 13, color: p.alive ? '#cdd' : '#f55', align: 'center' });
      if (!p.alive && p.data.why) D.text(c, p.data.why, s.x, s.y + 54, { size: 11, color: '#a77', align: 'center', maxWidth: lw - 16 });
    }
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, n = g.players.length, lw = g.W / n;
    // parede e chão
    c.fillStyle = '#121519'; c.fillRect(0, 0, g.W, g.H);
    c.fillStyle = '#171b20';
    for (let x = 0; x < g.W; x += 64) c.fillRect(x, 150, 2, this.FLOOR_Y - 150);
    c.fillStyle = '#1f242a'; c.fillRect(0, this.FLOOR_Y, g.W, g.H - this.FLOOR_Y);
    D.hazardStripes(c, 0, this.FLOOR_Y, g.W, 8, 12);
    // cabines e prensas
    for (let i = 0; i < n; i++) {
      const p = g.players[i], x = p.data.laneX;
      if (i > 0) { c.fillStyle = '#2a3038'; c.fillRect(i * lw - 4, 150, 8, this.FLOOR_Y - 150); }
      this.drawPress(g, c, p, x, lw);
    }
    for (const p of g.players) this.drawRobot(g, c, p, lw);
    this.drawSupervisor(g, c);
  },

  drawPress(g, c, p, x, lw) {
    const pr = p.data.press, pw = Math.min(150, lw - 50), ph = 26;
    let y = this.PRESS_TOP;   // topo da placa
    if (pr) {
      const fall = Math.min(1, pr.t / 0.12);
      const rise = pr.t > 0.9 ? Math.min(1, (pr.t - 0.9) / 1.2) : 0;
      const low = this.FLOOR_Y - ph - 14;
      y = this.PRESS_TOP + (low - this.PRESS_TOP) * fall * (1 - rise * 0.75);
    }
    // pistão
    c.fillStyle = '#8a929c'; c.fillRect(x - 9, 150, 18, y - 150);
    c.fillStyle = '#5c636c'; c.fillRect(x - 9, 150, 4, y - 150);
    c.fillStyle = '#3a4048'; c.fillRect(x - 30, 146, 60, 12);
    // placa
    c.fillStyle = '#4b525b'; c.strokeStyle = '#111'; c.lineWidth = 2;
    c.fillRect(x - pw / 2, y, pw, ph); c.strokeRect(x - pw / 2, y, pw, ph);
    TN.draw.hazardStripes(c, x - pw / 2 + 2, y + ph - 8, pw - 4, 6, 8);
    // luz de alerta da cabine
    const danger = g.data.phase === 'cmd' && p.alive;
    c.fillStyle = danger ? (Math.floor(g.time * 10) % 2 ? '#f33' : '#600') : (p.alive ? '#253' : '#311');
    c.beginPath(); c.arc(x + pw / 2 - 10, y + 9, 4, 0, Math.PI * 2); c.fill();
  },

  drawRobot(g, c, p, lw) {
    const D = TN.draw, x = p.data.laneX, fy = this.FLOOR_Y, w = this.BOT_W, h = this.BOT_H;
    if (!p.alive) {
      // achatado debaixo da prensa
      c.fillStyle = '#444'; c.strokeStyle = '#111'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(x - w * 0.9, fy - 12, w * 1.8, 12, 4); c.fill(); c.stroke();
      c.fillStyle = p.color; c.fillRect(x - w * 0.6, fy - 9, w * 1.2, 4);
    } else {
      const k = p.data.lie;
      c.save();
      c.translate(x + (h / 2) * k, fy - (w / 2) * k);
      c.rotate((-Math.PI / 2) * k);
      D.robotSide(c, 0, 0, w, h, p.color, { facing: 1 });
      c.restore();
    }
    // placa com nome e postura
    const lbl = p.alive ? (p.data.pose === 'vivo' ? 'DE PÉ' : 'DEITADO') : 'ELIMINADO';
    D.text(c, p.label + (p.isBot ? ' BOT' : ''), x, fy + 28, { size: 15, color: p.alive ? p.color : '#777', align: 'center' });
    D.text(c, lbl, x, fy + 50, { size: 13, color: p.alive ? '#cdd' : '#f55', align: 'center' });
    if (!p.alive && p.data.why) D.text(c, p.data.why, x, fy + 68, { size: 11, color: '#a77', align: 'center', maxWidth: lw - 16 });
  },

  drawSupervisor(g, c) {
    const D = TN.draw, d = g.data, x = 210, y = 44, w = 540, h = 96;
    D.panel(c, x, y, w, h, { fill: '#0d1013', stroke: '#3a4450', lw: 3 });
    // grades de alto-falante
    for (const sx of [x + 14, x + w - 58]) {
      c.fillStyle = '#1b2026'; c.fillRect(sx, y + 14, 44, h - 28);
      c.fillStyle = '#05070a';
      for (let k = 0; k < 6; k++) c.fillRect(sx + 4, y + 20 + k * 11, 36, 4);
    }
    // olho do Supervisor
    c.fillStyle = '#300'; c.beginPath(); c.arc(x + w / 2, y + h - 2, 12, Math.PI, 0); c.fill();
    c.fillStyle = `rgba(255,${60 + d.eye * 120},40,${0.5 + d.eye * 0.5})`;
    c.beginPath(); c.arc(x + w / 2, y + h - 2, 6, Math.PI, 0); c.fill();
    if (d.phase === 'cmd') {
      const cmd = d.cmd, left = 1 - (g.time - cmd.t0) / cmd.win;
      const shake = d.eye > 0.6 ? TN.util.rand(-2, 2) : 0;
      D.text(c, cmd.text, x + w / 2 + shake, y + 40, { size: cmd.text.length > 12 ? 34 : 46, color: '#fff6c8', align: 'center', maxWidth: w - 140 });
      D.bar(c, x + 80, y + 70, w - 160, 8, left, left > 0.35 ? '#c7ff3d' : '#f44', '#222');
    } else {
      D.text(c, d.lastText, x + w / 2, y + 40, { size: d.lastText.length > 12 ? 30 : 40, color: '#4a5058', align: 'center', maxWidth: w - 140 });
      D.text(c, 'NÃO SE MEXA.', x + w / 2, y + 74, { size: 13, color: '#6a7480', align: 'center' });
    }
    D.text(c, 'SUPERVISOR', x + 36, y + h - 8, { size: 9, color: '#56606c', align: 'center', shadow: false });
  },
});
