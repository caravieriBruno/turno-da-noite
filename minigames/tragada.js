// TRAGADA CERTA — inspirado em "SMOKE BREAK" (smoke_break) de Machine Party.
// Quatro robôs sentados na área de fumantes precisam terminar o cigarro antes de 30 s.
// Segurar AÇÃO traga (o pulmão enche cada vez mais rápido); soltar exala. Encheu demais = tosse.
// Apertar de novo antes de esvaziar o pulmão também dá tosse: "trague, solte, nunca os dois".
// Quem não terminar a tempo é eletrocutado pelo fiscal (eliminação só visual, sem pontos).
TN.registerMinigame({
  id: 'tragada',
  title: 'TRAGADA CERTA',
  inspiredBy: 'Smoke Break (smoke_break)',
  tagline: 'TRAGUE. SOLTE. NUNCA OS DOIS.',
  brief: [
    'Termine o cigarro antes do tempo acabar.',
    'Segure AÇÃO para tragar e solte para exalar.',
    'Passou da linha vermelha ou tragou de pulmão cheio: tosse.',
    'Os 3 primeiros a terminar pontuam (1º ganha 2).',
  ],
  controls: { a: 'segurar = tragar / soltar = exalar' },
  icon: '♨',
  color: '#ff9f43',
  rounds: 2,
  timeLimit: 30,
  scoring: 'points',          // cada jogador ganha exatamente p.score
  endWhenOneLeft: false,      // ninguém "morre" durante o jogo; só no fim do tempo

  // ---- constantes (originais: inhale 0,01, exhale 1,0, cigarro 0,15, tosse 3 s) ----
  INHALE_MULT: 0.01, MAX_DRAG: 0.1, EXHALE_RATE: 1.0, CIG_MULT: 0.15, CHOKE_TIME: 3,
  LUNG_MAX_VIEW: 1.2,         // escala do medidor (a linha vermelha fica em 1,0)
  SEATS: [120, 310, 500, 690], FLOOR_Y: 440, INSPECTOR_X: 862,
  FINISH_POINTS: [2, 1, 1],   // 1º, 2º e 3º a terminar

  init(g) {
    g.data.finishedCount = 0;
    g.data.smoke = [];         // fumaça desenhada pelo próprio minigame (sobe devagar)
    g.data.zap = 0;            // tempo restante da animação dos raios do fiscal
    g.data.zapped = [];
    g.players.forEach((p, i) => {
      p.x = this.SEATS[i]; p.y = this.FLOOR_Y - 70;
      p.data = {
        cig: 1, lung: 0, str: 0,              // cigarro restante, pulmão, força da tragada
        inhaling: false, exhaling: false, choke: 0,
        done: false, place: -1, drags: 0, coughs: 0,
        bot: { target: this.botTarget(), wait: TN.util.rand(0.1, 0.5), holding: false },
      };
    });
  },

  // Alvo de enchimento do bot: quase sempre abaixo da linha, às vezes passa (e tosse).
  botTarget() {
    const U = TN.util;
    return U.chance(0.08) ? 1.08 : U.rand(0.76, 0.96);
  },

  mouth(p) { return { x: p.x + 16, y: this.FLOOR_Y - 46 - 64 * 0.68 }; },

  puff(g, x, y, n, spread, vy) {
    const U = TN.util;
    for (let i = 0; i < n; i++) {
      g.data.smoke.push({ x: x + U.rand(-4, 4), y: y + U.rand(-4, 4), vx: U.rand(10, 10 + spread), vy: vy + U.rand(-10, 10),
        r: U.rand(4, 8), t: U.rand(1.2, 2.2), life: 2.2 });
    }
  },

  choke(g, p) {
    const d = p.data;
    d.inhaling = false; d.exhaling = false;
    d.choke = this.CHOKE_TIME; d.lung = 0; d.str = 0; d.coughs++;
    g.sfx('cough');
    const m = this.mouth(p);
    this.puff(g, m.x, m.y, 14, 90, -20);
    g.popup('COF! COF!', p.x, p.y - 70, '#ccc');
  },

  update(g, dt) {
    const d = g.data;
    for (const p of g.players) {
      const s = p.data;
      if (s.done || !p.alive) continue;
      // tosse: travado, sem input
      if (s.choke > 0) {
        s.choke = Math.max(0, s.choke - dt);
        if (TN.util.chance(0.08)) { const m = this.mouth(p); this.puff(g, m.x, m.y, 1, 60, -30); }
        continue;
      }
      // entrada (igual ao original: apertar = começa a tragar, soltar = começa a exalar)
      if (p.input.aPressed) { s.inhaling = true; s.drags++; g.sfx('blip'); }
      else if (p.input.aReleased && s.inhaling) { s.inhaling = false; s.exhaling = true; }
      // tragar (fórmula por quadro de 60 Hz do original)
      if (s.inhaling) {
        s.exhaling = s.exhaling && s.lung > 0;   // apertou durante a exalação → cai na tosse abaixo
        if (!s.exhaling) {
          s.str = Math.min(s.str + dt * this.INHALE_MULT, this.MAX_DRAG);
          s.lung += s.str;
          s.cig = Math.max(s.cig - s.str * this.CIG_MULT, 0);
          if (s.cig <= 0) { s.inhaling = false; s.exhaling = true; }
          else if (s.lung > 1.0) { this.choke(g, p); continue; }
        }
      }
      // exalar
      if (s.exhaling) {
        if (s.lung > 0) {
          if (s.inhaling) { this.choke(g, p); continue; }   // tragou com o pulmão cheio
          s.str = 0;
          s.lung = Math.max(0, s.lung - dt * this.EXHALE_RATE);
          if (TN.util.chance(0.2)) { const m = this.mouth(p); this.puff(g, m.x + 4, m.y, 1, 70, -25); }
        } else s.exhaling = false;
      }
      // terminou: cigarro acabou e pulmão vazio
      if (s.cig <= 0 && s.lung <= 0 && !s.inhaling) {
        s.done = true; s.place = d.finishedCount++;
        const pts = this.FINISH_POINTS[s.place] || 0;
        g.sfx(s.place === 0 ? 'win' : 'confirm');
        g.particles(p.x, p.y - 40, p.color, 18, 160);
        if (pts) g.addScore(p, pts); else g.popup('PRONTO', p.x, p.y - 34, '#aaa');
      }
    }
    // fumaça
    for (const sm of d.smoke) { sm.x += sm.vx * dt; sm.y += sm.vy * dt; sm.vx *= 0.98; sm.r += dt * 9; sm.t -= dt; }
    d.smoke = d.smoke.filter((sm) => sm.t > 0);
    if (d.zap > 0) d.zap -= dt;
    // todo mundo terminou → fim antecipado
    if (g.players.every((p) => p.data.done || !p.alive)) g.finish(1.5);
  },

  // Tempo acabou: o fiscal eletrocuta quem não terminou (sem pontos extras).
  onTimeUp(g) {
    const late = g.players.filter((p) => p.alive && !p.data.done);
    g.data.zapped = late;
    if (late.length) {
      g.data.zap = 1.2;
      g.sfx('laser'); g.flash('#9cf', 0.25);
      for (const p of late) g.eliminate(p, { sound: 'boom', msg: 'ATRASADO!' });
    }
    g.finish(2.2);   // o primeiro finish vale: dá tempo de ver os raios
  },

  // Bot: segura até um alvo de enchimento, solta, espera esvaziar e um tempo de reação.
  bot(g, p, dt) {
    const U = TN.util, s = p.data, b = s.bot;
    if (s.done || !p.alive || s.choke > 0) {
      if (b.holding) { b.holding = false; b.target = this.botTarget(); b.wait = U.rand(0.2, 0.6); }
      return { a: false };
    }
    if (b.holding) {
      if (s.lung >= b.target || s.cig <= 0 || !s.inhaling) {
        b.holding = false; b.target = this.botTarget(); b.wait = U.rand(0.12, 0.45);
      }
      return { a: b.holding };
    }
    if (s.lung > 0) {
      // impaciência: às vezes aperta antes de esvaziar (e tosse)
      if (s.lung < 0.15 && U.chance(0.002)) { b.holding = true; return { a: true }; }
      return { a: false };
    }
    b.wait -= dt;
    if (b.wait <= 0 && s.cig > 0) b.holding = true;
    return { a: b.holding };
  },

  // ------------------------------------------------------------------ desenho
  draw(g, c) {
    const D = TN.draw, F = this.FLOOR_Y;
    // parede
    c.fillStyle = '#14181d'; c.fillRect(0, 0, g.W, g.H);
    for (let x = 0; x < g.W; x += 120) { c.fillStyle = x % 240 ? '#171c22' : '#161a20'; c.fillRect(x, 34, 120, F - 34); }
    c.fillStyle = '#0f1216'; c.fillRect(0, F - 120, g.W, 6);
    // janela com a noite lá fora
    c.fillStyle = '#05080f'; c.fillRect(800, 70, 130, 110);
    c.fillStyle = '#cfd8ff'; c.beginPath(); c.arc(900, 100, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#05080f'; c.beginPath(); c.arc(906, 96, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9aa'; for (const [sx, sy] of [[820, 90], [850, 140], [880, 160], [915, 150], [835, 120]]) c.fillRect(sx, sy, 2, 2);
    c.strokeStyle = '#2b323a'; c.lineWidth = 6; c.strokeRect(800, 70, 130, 110);
    c.beginPath(); c.moveTo(865, 70); c.lineTo(865, 180); c.stroke();
    // placa
    D.panel(c, 790, 200, 150, 56, { fill: '#2a1d0f', stroke: '#ff9f43', radius: 4 });
    D.text(c, 'ÁREA DE', 865, 218, { size: 13, color: '#ff9f43', align: 'center' });
    D.text(c, 'FUMANTES', 865, 238, { size: 16, color: '#ffcf8a', align: 'center' });
    // chão
    D.floor(c, 0, F, g.W, g.H - F, { tile: 50, a: '#22272d', b: '#262c33' });
    c.fillStyle = '#0006'; c.fillRect(0, F, g.W, 6);

    for (const p of g.players) this.drawSeat(g, c, p);
    this.drawInspector(g, c);
    // fumaça por cima de tudo
    for (const sm of g.data.smoke) {
      c.globalAlpha = Math.max(0, Math.min(0.55, sm.t / sm.life));
      c.fillStyle = '#c9ced4'; c.beginPath(); c.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
    for (const p of g.players) this.drawPanel(g, c, p);
    // raios do fiscal
    if (g.data.zap > 0) {
      const ix = this.INSPECTOR_X - 26, iy = F - 92;
      c.strokeStyle = '#bfe8ff'; c.lineWidth = 3; c.shadowColor = '#6cf'; c.shadowBlur = 12;
      for (const p of g.data.zapped) {
        c.beginPath(); c.moveTo(ix, iy);
        const tx = p.x, ty = F - 40, n = 9;
        for (let k = 1; k <= n; k++) {
          const t = k / n; c.lineTo(TN.util.lerp(ix, tx, t) + (k < n ? TN.util.rand(-12, 12) : 0), TN.util.lerp(iy, ty, t) + (k < n ? TN.util.rand(-18, 18) : 0));
        }
        c.stroke();
      }
      c.shadowBlur = 0;
    }
    D.text(c, 'SEGURE AÇÃO = TRAGAR  ·  SOLTE = EXALAR', g.W / 2, 522, { size: 14, color: '#8a939c', align: 'center' });
  },

  drawSeat(g, c, p) {
    const D = TN.draw, F = this.FLOOR_Y, s = p.data, x = p.x;
    // banquinho
    c.fillStyle = '#3a3f46'; c.fillRect(x - 26, F - 46, 52, 8);
    c.fillStyle = '#2a2e33'; c.fillRect(x - 22, F - 38, 5, 38); c.fillRect(x + 17, F - 38, 5, 38);
    // cinzeiro no chão
    c.fillStyle = '#555'; c.fillRect(x + 40, F - 10, 20, 10); c.fillStyle = '#777'; c.fillRect(x + 37, F - 12, 26, 3);
    if (!p.alive) {
      // eletrocutado: caído no chão
      c.save(); c.translate(x + 4, F - 2); c.rotate(Math.PI / 2);
      D.robotSide(c, 0, 0, 46, 64, p.color, { dead: true });
      c.restore();
      D.text(c, p.label, x, F - 70, { size: 12, color: '#888', align: 'center' });
      return;
    }
    // tremendo enquanto tosse
    const shake = s.choke > 0 ? TN.util.rand(-2, 2) : 0;
    const by = F - 46;
    D.robotSide(c, x + shake, by, 46, 64, p.color, { facing: 1, label: p.label });
    // braço + cigarro
    const m = this.mouth(p);
    const atMouth = s.inhaling && s.choke <= 0;
    const hx = atMouth ? m.x + 2 : x + 26, hy = atMouth ? m.y + 4 : by - 20;
    c.strokeStyle = '#111'; c.lineWidth = 5; c.beginPath(); c.moveTo(x + 6 + shake, by - 30); c.lineTo(hx + shake, hy); c.stroke();
    c.strokeStyle = p.color; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 6 + shake, by - 30); c.lineTo(hx + shake, hy); c.stroke();
    if (!s.done && s.cig > 0) {
      const len = 6 + 22 * s.cig;
      c.fillStyle = '#d88b3a'; c.fillRect(hx + shake, hy - 2, 7, 4);           // filtro
      c.fillStyle = '#eee'; c.fillRect(hx + shake + 7, hy - 2, len, 4);        // papel
      const glow = s.inhaling ? 1 : 0.45;
      c.fillStyle = `rgba(255,${Math.floor(80 + 60 * (1 - glow))},40,${0.6 + 0.4 * glow})`;
      c.fillRect(hx + shake + 7 + len, hy - 2, 3, 4);                          // brasa
      if (s.inhaling) { c.fillStyle = 'rgba(255,120,40,0.35)'; c.beginPath(); c.arc(hx + 7 + len + 1, hy, 6, 0, Math.PI * 2); c.fill(); }
    }
    if (s.done) {
      D.text(c, '✔', x, by - 100, { size: 26, color: '#46e27b', align: 'center' });
    }
    if (s.choke > 0) D.text(c, 'COF!', x - 24 + TN.util.rand(-2, 2), by - 76, { size: 14, color: '#ddd', align: 'center' });
  },

  drawPanel(g, c, p) {
    const D = TN.draw, s = p.data, cx = p.x, x0 = cx - 82, y0 = 46, w = 164, h = 210;
    D.panel(c, x0, y0, w, h, { fill: 'rgba(8,11,14,0.88)', stroke: p.alive ? p.color : '#444', lw: 2 });
    D.text(c, p.label + (p.isBot ? ' BOT' : ''), x0 + 10, y0 + 15, { size: 13, color: p.alive ? p.color : '#777' });
    // medidor do pulmão (vertical)
    const mx = x0 + 12, my = y0 + 32, mw = 34, mh = 112;
    c.fillStyle = '#1b2026'; c.fillRect(mx, my, mw, mh);
    const t = TN.util.clamp(s.lung / this.LUNG_MAX_VIEW, 0, 1);
    const col = s.lung > 0.92 ? '#ff4d4d' : s.lung > 0.75 ? '#ffb347' : '#c9d3dc';
    c.fillStyle = col; c.fillRect(mx, my + mh * (1 - t), mw, mh * t);
    const redY = my + mh * (1 - 1 / this.LUNG_MAX_VIEW);
    c.fillStyle = 'rgba(255,0,0,0.12)'; c.fillRect(mx, my, mw, redY - my);
    c.strokeStyle = '#ff2e2e'; c.lineWidth = 2; c.beginPath(); c.moveTo(mx - 4, redY); c.lineTo(mx + mw + 4, redY); c.stroke();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    D.text(c, 'PULMÃO', mx + mw / 2, my + mh + 11, { size: 10, color: '#8a939c', align: 'center' });
    // estado
    const sx = x0 + 58;
    let st = 'PRONTO P/ TRAGAR', sc = '#8a939c';
    if (!p.alive) { st = 'ELETROCUTADO'; sc = '#f55'; }
    else if (s.done) { st = `TERMINOU ${s.place + 1}º`; sc = '#46e27b'; }
    else if (s.choke > 0) { st = `TOSSINDO ${s.choke.toFixed(1)}`; sc = '#ff6b6b'; }
    else if (s.inhaling) { st = 'TRAGANDO...'; sc = '#ffb347'; }
    else if (s.exhaling) { st = 'EXALANDO...'; sc = '#c9d3dc'; }
    D.lines(c, st.replace(' ', '\n'), sx, y0 + 50, { size: 13, color: sc, lineHeight: 17 });
    D.text(c, `tragadas ${s.drags}`, sx, y0 + 100, { size: 11, color: '#6c757d' });
    D.text(c, `tosses ${s.coughs}`, sx, y0 + 116, { size: 11, color: '#6c757d' });
    if (s.done && this.FINISH_POINTS[s.place]) D.text(c, `+${this.FINISH_POINTS[s.place]}`, sx + 70, y0 + 140, { size: 22, color: '#ff0', align: 'right' });
    // cigarro restante (horizontal)
    const cy = y0 + h - 22, cxs = x0 + 14, full = w - 28 - 14;
    c.fillStyle = '#d88b3a'; c.fillRect(cxs, cy - 6, 14, 12);
    c.fillStyle = '#2a2e33'; c.fillRect(cxs + 14, cy - 6, full, 12);
    const len = full * s.cig;
    c.fillStyle = '#f1f1f1'; c.fillRect(cxs + 14, cy - 6, len, 12);
    if (s.cig > 0) { c.fillStyle = s.inhaling ? '#ff6a1a' : '#b84a1a'; c.fillRect(cxs + 14 + len - 3, cy - 6, 4, 12); }
    c.strokeStyle = '#000'; c.strokeRect(cxs + 0.5, cy - 5.5, full + 13, 11);
    D.text(c, 'CIGARRO', cxs, cy - 15, { size: 10, color: '#8a939c' });
  },

  drawInspector(g, c) {
    const D = TN.draw, x = this.INSPECTOR_X, F = this.FLOOR_Y;
    D.robotSide(c, x, F, 50, 92, '#8d99a6', { facing: -1 });
    // quepe
    c.fillStyle = '#1d2a44'; c.fillRect(x - 27, F - 100, 54, 10); c.fillRect(x - 36, F - 92, 30, 4);
    c.fillStyle = '#ffd23f'; c.fillRect(x - 4, F - 98, 8, 6);
    // bastão de choque
    c.strokeStyle = '#333'; c.lineWidth = 5; c.beginPath(); c.moveTo(x - 10, F - 55); c.lineTo(x - 30, F - 88); c.stroke();
    c.fillStyle = g.data.zap > 0 ? '#bfe8ff' : '#4aa3ff'; c.beginPath(); c.arc(x - 30, F - 90, 5, 0, Math.PI * 2); c.fill();
    D.text(c, 'FISCAL', x, F + 14, { size: 11, color: '#8a939c', align: 'center' });
  },
});
