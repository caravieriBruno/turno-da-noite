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
