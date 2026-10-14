// ESTÁTUA — a brincadeira de festa infantil, agora com supervisão armada.
// Visão de cima: uma pista de dança. Enquanto a música toca, todo mundo precisa se mexer
// (o medidor de ÓCIO enche quando você fica parado e, cheio, dá choque). Quando a música para,
// há uma fração de segundo para congelar; depois o scanner varre a pista e as torretas
// vaporizam quem se mexer. Às vezes a música só engasga ("BRINCADEIRA"): quem hesitar ganha ócio.
// Holofotes que surgem durante a música valem +1 ponto para quem passar dançando por eles.
TN.registerMinigame({
  id: 'estatua',
  title: 'ESTÁTUA',
  inspiredBy: 'brincadeira: estátua',
  tagline: 'QUEM PARAR DE DANÇAR, PARA DE VEZ.',
  brief: [
    'Com música: dance! Ficar parado dá choque.',
    'A música parou? Congele na hora.',
    'Quem se mexer na varredura é vaporizado.',
    'Holofote: passe dançando por ele e ganhe +1.',
  ],
  controls: { move: 'dançar (andar)', a: 'rodopiar no lugar (também conta como mexer!)' },
  icon: '♫',
  color: '#ff4fd8',
  rounds: 3,
  timeLimit: 75,
  scoring: 'survival',        // ordem de morte vira pontos; holofotes somam por cima

  // ---- constantes ----
  F: { x: 60, y: 104, w: 840, h: 392 },              // pista de dança
  TURRETS: [[60, 104], [900, 104], [60, 496], [900, 496]],
  SPEED: 185, SPIN: 0.3,
  OCIO_RATE: 0.45, OCIO_DRAIN: 0.9,                   // por segundo
  GRACE: 0.35, BEAT0: 0.46,
  MELODY: [220, 261.6, 329.6, 261.6, 293.7, 349.2, 293.7, 246.9, 220, 329.6, 440, 329.6, 207.7, 246.9, 329.6, 246.9],
  TILE_COLORS: ['#ff4fd8', '#3fa9ff', '#46e27b', '#ffd23f', '#9b5cff'],

  init(g) {
    const U = TN.util, d = g.data, F = this.F;
    d.phase = 'music'; d.phaseT = 0; d.phaseDur = U.rand(3.5, 5); d.phaseId = 1; d.stopStart = 0;
    d.beatT = 0; d.beatIdx = 0; d.beatInt = this.BEAT0;
    d.spot = null; d.spotNext = 1.2;
    d.scorch = []; d.beams = []; d.stops = 0; d.hesitateAt = -1; d.k = 0;
    g.placeInCircle(F.x + F.w / 2, F.y + F.h / 2, 120);
    for (const p of g.players) p.data = { ocio: 0, spin: 0, spinCd: 0, moved: false, movedSince: true };
  },

  playBeat(i) {
    const f = this.MELODY[i % this.MELODY.length];
    TN.audio.beep(f, 0.08, 'square', 0.06);
    if (i % 2 === 0) TN.audio.beep(f / 2, 0.14, 'triangle', 0.1);
  },

  update(g, dt) {
    const U = TN.util, d = g.data, F = this.F;
    d.k = U.clamp(g.time / 55, 0, 1);                  // dificuldade: sobe ao longo da rodada
    d.phaseT += dt;
    for (const b of d.beams) b.t -= dt;
    d.beams = d.beams.filter((b) => b.t > 0);
    const music = d.phase === 'music';
    if (music) {
      d.beatInt = this.BEAT0 - 0.16 * d.k;
      d.beatT += dt;
      if (d.beatT >= d.beatInt) { d.beatT -= d.beatInt; d.beatIdx++; this.playBeat(d.beatIdx); }
      // holofote
      if (d.spot) {
        d.spot.life -= dt;
        if (d.spot.life <= 0) { d.spot = null; d.spotNext = 1e9; }      // um holofote por música, no máximo
      } else if (g.time >= d.spotNext) {
        d.spot = { x: U.rand(F.x + 60, F.x + F.w - 60), y: U.rand(F.y + 50, F.y + F.h - 50), r: 36, life: 3.6, max: 3.6 };
      }
    }
    // jogadores
    for (const p of g.alive()) {
      const q = p.data;
      q.spinCd -= dt;
      if (p.input.aPressed && q.spinCd <= 0) { q.spin = this.SPIN; q.spinCd = this.SPIN + 0.25; g.sfx('whoosh'); }
      const spinning = q.spin > 0;
      if (spinning) { q.spin -= dt; p.dir += 22 * dt; }
      const ox = p.x, oy = p.y;
      g.movePlayer(p, this.SPEED, dt, F);
      const disp = Math.hypot(p.x - ox, p.y - oy);
      q.moved = disp > 0.5 || spinning;
      if (music) {
        if (q.moved) { q.ocio = Math.max(0, q.ocio - this.OCIO_DRAIN * dt); q.movedSince = true; }
        else q.ocio += (this.OCIO_RATE + 0.35 * d.k) * dt;
        if (q.ocio >= 1) { q.ocio = 1; this.shock(g, p); continue; }
        if (d.spot && q.moved && U.dist(p.x, p.y, d.spot.x, d.spot.y) < d.spot.r + p.r * 0.4) {
          g.addScore(p, 1); g.sfx('coin');
          g.particles(d.spot.x, d.spot.y, '#fff3a0', 18, 200);
          d.spot = null; d.spotNext = 1e9;
        }
      } else if (d.phase === 'scan') {
        // a varredura não perdoa: qualquer intenção de movimento conta
        if (Math.hypot(p.input.x, p.input.y) > 0.2 || spinning || disp > 0.5) this.vaporize(g, p);
      }
    }
    if (music) U.separate(g.alive());
    // quem hesitou depois de um alarme falso ganha ócio
    if (d.hesitateAt > 0 && g.time >= d.hesitateAt) {
      d.hesitateAt = -1;
      for (const p of g.alive()) if (!p.data.movedSince) {
        p.data.ocio = Math.min(0.95, p.data.ocio + 0.3);
        g.popup('HESITOU', p.x, p.y - 34, '#ffd23f');
      }
    }
    if (d.phaseT >= d.phaseDur) this.nextPhase(g);
  },

  nextPhase(g) {
    const U = TN.util, d = g.data, k = d.k, from = d.phase;
    d.phaseT = 0; d.phaseId++;
    if (from === 'music') {
      d.stopStart = g.time; d.spot = null; d.spotNext = 1e9;
      g.sfx('buzz'); g.message('ESTÁTUA!', 0.9, '#ff3344');
      if (d.stops >= 2 && U.chance(0.2 + 0.1 * k)) { d.phase = 'glitch'; d.phaseDur = U.rand(0.15, 0.28); }
      else { d.phase = 'grace'; d.phaseDur = this.GRACE - 0.06 * k; d.stops++; }
    } else if (from === 'glitch') {
      d.phase = 'music'; d.phaseDur = U.rand(1.2, 3);
      g.message('BRINCADEIRA. DANCEM.', 1.1, '#ffd23f'); g.sfx('go');
      for (const p of g.alive()) p.data.movedSince = false;
      d.hesitateAt = g.time + 0.45; d.spotNext = this.rollSpot(g);
    } else if (from === 'grace') {
      d.phase = 'scan'; d.phaseDur = U.rand(1.5, 3);
      g.sfx('tick');
    } else {
      d.phase = 'music'; d.phaseDur = U.rand(2, 6) * (1 - 0.3 * k); d.beatT = 0;
      d.spotNext = this.rollSpot(g);
      for (const p of g.alive()) p.data.ocio = Math.max(0, p.data.ocio - 0.2);   // descanso "generoso"
      g.sfx('go');
    }
  },

  // nem toda música tem holofote (60%)
  rollSpot(g) { return TN.util.chance(0.6) ? g.time + TN.util.rand(0.4, 1.2) : 1e9; },

  nearestTurret(x, y) {
    let best = this.TURRETS[0], bd = 1e9;
    for (const t of this.TURRETS) { const dd = Math.hypot(t[0] - x, t[1] - y); if (dd < bd) { bd = dd; best = t; } }
    return best;
  },

  vaporize(g, p) {
    const d = g.data, t = this.nearestTurret(p.x, p.y);
    d.beams.push({ x0: t[0], y0: t[1], x1: p.x, y1: p.y, t: 0.35 });
    d.scorch.push({ x: p.x, y: p.y, r: 22 });
    g.eliminate(p, { sound: 'laser', msg: 'MEXEU' });
    g.particles(p.x, p.y, '#ff3344', 26, 280);
    g.particles(p.x, p.y, '#ffffff', 10, 180);
    g.sfx('boom'); g.shake(10);
  },

  shock(g, p) {
    g.data.scorch.push({ x: p.x, y: p.y, r: 18 });
    g.eliminate(p, { sound: 'buzz', msg: 'OCIOSO' });
    g.particles(p.x, p.y, '#7ff', 24, 260);
    g.particles(p.x, p.y, '#ffff66', 8, 200);
    g.sfx('hurt'); g.shake(7);
  },

  // Bot: dança em direção ao holofote (ou passeia), evita os outros, rodopia de vez em quando.
  // Quando a música para, congela com um tempo de reação humano (às vezes tarde demais) e,
  // raramente, se coça no meio da varredura.
  bot(g, p) {
    const U = TN.util, d = g.data, q = p.data, F = this.F;
    const b = q.bot || (q.bot = { tx: p.x, ty: p.y, retarget: 0, phaseId: 0, freezeAt: 0, resumeAt: 0, flinchAt: -1, mx: 0, my: 0, skill: U.rand(0, 1) });
    if (b.phaseId !== d.phaseId) {
      b.phaseId = d.phaseId;
      if (d.phase === 'grace' || d.phase === 'glitch') {
        const late = U.chance(0.06 + 0.07 * d.k - 0.03 * b.skill);
        b.freezeAt = g.time + (late ? U.rand(0.38, 0.6) : U.rand(0.07, 0.28));
      } else if (d.phase === 'scan') {
        b.flinchAt = U.chance(0.035 + 0.05 * d.k) ? g.time + U.rand(0.1, Math.max(0.2, d.phaseDur - 0.1)) : -1;
      } else {
        b.resumeAt = g.time + U.rand(0.08, 0.3);
      }
    }
    if (d.phase !== 'music') {
      if (g.time < b.freezeAt) return { x: b.mx, y: b.my };              // ainda não percebeu
      if (d.phase === 'scan' && b.flinchAt > 0 && g.time >= b.flinchAt && g.time < b.flinchAt + 0.05) return { x: 0.6 };
      return {};
    }
    if (g.time < b.resumeAt) return {};
    b.retarget -= 1 / 60;
    let tx = b.tx, ty = b.ty;
    const s = d.spot;
    if (s && U.dist(p.x, p.y, s.x, s.y) < 260 + 220 * b.skill) { tx = s.x; ty = s.y; }
    else if (b.retarget <= 0 || U.dist(p.x, p.y, b.tx, b.ty) < 24) {
      b.tx = U.rand(F.x + 50, F.x + F.w - 50); b.ty = U.rand(F.y + 40, F.y + F.h - 40);
      b.retarget = U.rand(0.8, 2.2); tx = b.tx; ty = b.ty;
    }
    const n = U.norm(tx - p.x, ty - p.y);
    let fx = n.x, fy = n.y;
    for (const o of g.alive()) {
      if (o === p) continue;
      const dx = p.x - o.x, dy = p.y - o.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < 60) { fx += (dx / dd) * ((60 - dd) / 60) * 1.5; fy += (dy / dd) * ((60 - dd) / 60) * 1.5; }
    }
    const m = U.norm(fx, fy);
    b.mx = m.x; b.my = m.y;
    return { x: m.x, y: m.y, a: U.chance(0.006) };
  },

  // ---------------- desenho ----------------
  draw(g, c) {
    const D = TN.draw, d = g.data, F = this.F, t = g.time;
    const music = d.phase === 'music', scan = d.phase === 'scan';
    const pulse = music ? 1 - Math.min(1, d.beatT / d.beatInt) : 0;
    c.fillStyle = '#08090c'; c.fillRect(0, 0, g.W, g.H);
    this.drawBooth(g, c, pulse);
    // pista
    const T = 56;
    for (let j = 0; j < F.h / T; j++) for (let i = 0; i < F.w / T; i++) {
      const x = F.x + i * T, y = F.y + j * T;
      c.fillStyle = (i + j) % 2 ? '#15171c' : '#191b21'; c.fillRect(x, y, T, T);
      if (music) {
        const on = (i * 7 + j * 3 + d.beatIdx) % 5;
        if (on < 2) {
          c.globalAlpha = 0.1 + 0.2 * pulse;
          c.fillStyle = this.TILE_COLORS[(i + j * 2 + d.beatIdx) % 5];
          c.fillRect(x + 3, y + 3, T - 6, T - 6);
          c.globalAlpha = 1;
        }
      } else {
        c.fillStyle = 'rgba(120,0,10,0.18)'; c.fillRect(x, y, T, T);
      }
      if (d.phase === 'glitch' && (i * 13 + j * 7 + Math.floor(t * 30)) % 6 === 0) {
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, T, T);
      }
    }
    c.strokeStyle = scan ? '#a01020' : '#3a2440'; c.lineWidth = 6; c.strokeRect(F.x - 3, F.y - 3, F.w + 6, F.h + 6);
    // marcas de queimado
    for (const s of d.scorch) {
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.ellipse(s.x, s.y + 4, s.r * 1.3, s.r * 0.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(40,20,10,0.6)'; c.beginPath(); c.ellipse(s.x, s.y + 4, s.r * 0.7, s.r * 0.45, 0, 0, Math.PI * 2); c.fill();
    }
    // holofote
    if (d.spot) {
      const s = d.spot, k = s.life / s.max;
      const gr = c.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r + 10);
      gr.addColorStop(0, 'rgba(255,250,200,0.75)'); gr.addColorStop(1, 'rgba(255,240,150,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(s.x, s.y, s.r + 10, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff3a0'; c.lineWidth = 3;
      c.beginPath(); c.arc(s.x, s.y, s.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
      D.text(c, '+1', s.x, s.y, { size: 14, color: '#5a4a00', align: 'center', shadow: false });
    }
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    // varredura do scanner
    if (scan) {
      const sy = F.y + ((d.phaseT * 1.4) % 1) * F.h;
      const gr = c.createLinearGradient(0, sy - 26, 0, sy);
      gr.addColorStop(0, 'rgba(255,30,50,0)'); gr.addColorStop(1, 'rgba(255,30,50,0.35)');
      c.fillStyle = gr; c.fillRect(F.x, sy - 26, F.w, 26);
      c.fillStyle = '#ff3344'; c.fillRect(F.x, sy - 1, F.w, 2);
    }
    // jogadores vivos
    for (const p of g.alive()) {
      const q = p.data;
      g.drawPlayer(c, p, { flash: q.spin > 0 });
      if (q.ocio > 0.02) {
        const col = q.ocio > 0.7 ? '#f43' : q.ocio > 0.4 ? '#fc3' : '#7ff';
        D.bar(c, p.x - 18, p.y + 22, 36, 5, q.ocio, col);
      }
      if (music && q.ocio > 0.65 && Math.floor(t * 8) % 2 === 0) D.text(c, 'MEXA-SE!', p.x, p.y + 38, { size: 12, color: '#f43', align: 'center' });
    }
    // torretas
    for (const tu of this.TURRETS) {
      let ang = Math.atan2(F.y + F.h / 2 - tu[1], F.x + F.w / 2 - tu[0]), bd = 1e9;
      for (const p of g.alive()) { const dd = Math.hypot(p.x - tu[0], p.y - tu[1]); if (dd < bd) { bd = dd; ang = Math.atan2(p.y - tu[1], p.x - tu[0]); } }
      c.save(); c.translate(tu[0], tu[1]);
      c.fillStyle = '#23262c'; c.strokeStyle = '#000'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.fill(); c.stroke();
      c.rotate(ang); c.fillStyle = '#3a3f47'; c.fillRect(0, -4, 24, 8);
      c.fillStyle = scan ? '#ff2233' : d.phase === 'grace' ? '#ffaa00' : '#4a1a1a';
      c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // raios
    for (const b of d.beams) {
      const a = b.t / 0.35;
      c.strokeStyle = `rgba(255,40,60,${a})`; c.lineWidth = 10 * a;
      c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = 3 * a;
      c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke();
    }
    if (!music) { c.fillStyle = 'rgba(80,0,10,0.12)'; c.fillRect(0, 34, g.W, g.H - 34); }
  },

  // cabine do Supervisor: equalizador, caixas de som e o estado da música
  drawBooth(g, c, pulse) {
    const D = TN.draw, d = g.data, t = g.time;
    const music = d.phase === 'music';
    D.panel(c, 330, 40, 300, 54, { fill: '#0e0f14', stroke: music ? '#ff4fd8' : '#ff3344', radius: 4 });
    for (let i = 0; i < 18; i++) {
      let h;
      if (music) h = (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7 + d.beatIdx * 2.3))) * (0.55 + 0.45 * pulse);
      else if (d.phase === 'glitch') h = Math.abs(Math.sin(i * 9.1 + t * 61)) * 0.9;
      else h = 0.04;
      const bh = 40 * h;
      c.fillStyle = h > 0.75 ? '#ff4fd8' : h > 0.45 ? '#ffd23f' : '#46e27b';
      if (!music && d.phase !== 'glitch') c.fillStyle = '#ff3344';
      c.fillRect(342 + i * 16, 88 - bh, 11, bh);
    }
    // caixas de som
    for (const sx of [280, 680]) {
      c.fillStyle = '#16181d'; c.fillRect(sx - 30, 40, 60, 54);
      c.strokeStyle = '#2b2f37'; c.lineWidth = 2; c.strokeRect(sx - 30, 40, 60, 54);
      const r = 16 + (music ? 3 * pulse : 0);
      c.fillStyle = '#0a0a0c'; c.beginPath(); c.arc(sx, 70, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2f3440'; c.beginPath(); c.arc(sx, 70, r * 0.4, 0, Math.PI * 2); c.fill();
      if (music) for (let k = 0; k < 2; k++) {        // notinhas subindo
        const ph = (t * 0.9 + k * 0.5 + sx * 0.001) % 1;
        c.globalAlpha = 1 - ph;
        D.text(c, '♪', sx + (sx < 480 ? -46 : 46) + Math.sin(t * 3 + k) * 6, 88 - ph * 46, { size: 16, color: '#ff4fd8', align: 'center' });
        c.globalAlpha = 1;
      }
    }
    // estado
    let txt, col;
    if (music) { txt = '♪ DANCEM'; col = '#46e27b'; }
    else if (d.phase === 'scan') { txt = '■ VARRENDO'; col = '#ff3344'; }
    else { txt = '■ ESTÁTUA!'; col = Math.floor(t * 10) % 2 ? '#ff3344' : '#fff'; }
    D.text(c, txt, 60, 67, { size: 20, color: col });
    D.text(c, `${Math.round(60 / d.beatInt)} BPM`, 900, 60, { size: 14, color: '#888', align: 'right' });
    D.text(c, 'PISTA Nº 7', 900, 80, { size: 12, color: '#555', align: 'right' });
  },
});
