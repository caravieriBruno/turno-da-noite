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

  // ---------------- desenho 3D (câmera fixa) ----------------
  camera: { pos: [480, 560, 930], target: [480, 0, 270], fov: 41 },
  env: { bg: '#07060a', fog: [1200, 2800], ambient: 0.45, sun: 1.1, sunDir: [-0.3, 1, 0.5], sunColor: '#e8dcff' },

  // mistura duas cores hex (k de 0 a 1, quantizado para reaproveitar materiais)
  mix(a, b, k) {
    k = Math.round(TN.util.clamp(k, 0, 1) * 6) / 6;
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    let out = '#';
    for (let i = 0; i < 3; i++) out += Math.round(p(a, i) + (p(b, i) - p(a, i)) * k).toString(16).padStart(2, '0');
    return out;
  },

  draw3d(g, r) {
    const d = g.data, F = this.F, t = g.time;
    const music = d.phase === 'music', scan = d.phase === 'scan', glitch = d.phase === 'glitch';
    const pulse = music ? 1 - Math.min(1, d.beatT / d.beatInt) : 0;
    // a luz da sala muda com a fase: festa (lilás) x alerta (vermelho)
    if (!music) r.env({ bg: '#0b0405', fog: [1200, 2800], ambient: 0.35, sun: 0.85, sunDir: [-0.3, 1, 0.5], sunColor: '#ff8a8a', hemiSky: '#a05a5a' });
    // baile no pátio: muros com arame, guarita e postes; a pista é montada no chão de cimento
    r.yard(F.x - 130, 4, F.x + F.w + 130, F.y + F.h + 60, { quadra: false, holofote: false });   // sem o holofote do pátio: confundiria com o holofote de bônus do jogo
    r.plane(F.x + F.w / 2, -0.5, F.y + F.h / 2, F.w, F.h, '#040405');
    // pista de dança: ladrilhos que acendem no ritmo
    const T = 56;
    for (let j = 0; j < F.h / T; j++) for (let i = 0; i < F.w / T; i++) {
      const x = F.x + i * T + T / 2, z = F.y + j * T + T / 2;
      const base = (i + j) % 2 ? '#15171c' : '#1a1c22';
      if (music && (i * 7 + j * 3 + d.beatIdx) % 5 < 2) {
        r.plane(x, 0, z, T - 3, T - 3, this.mix(base, this.TILE_COLORS[(i + j * 2 + d.beatIdx) % 5], 0.3 + 0.45 * pulse), { glow: true });
      } else if (glitch && (i * 13 + j * 7 + Math.floor(t * 30)) % 6 === 0) {
        r.plane(x, 0, z, T - 3, T - 3, '#9a9aa6', { glow: true });
      } else {
        r.plane(x, 0, z, T - 3, T - 3, music ? base : ((i + j) % 2 ? '#2a1216' : '#301519'), { rough: 0.35, metal: 0.3 });
      }
    }
    // moldura da pista
    const rim = scan ? '#a01020' : '#3a2440', ro = scan ? { glow: true } : { metal: 0.4 };
    r.box(F.x + F.w / 2, 0, F.y - 5, F.w + 20, 6, 10, rim, ro);
    r.box(F.x + F.w / 2, 0, F.y + F.h + 5, F.w + 20, 6, 10, rim, ro);
    r.box(F.x - 5, 0, F.y + F.h / 2, 10, 6, F.h, rim, ro);
    r.box(F.x + F.w + 5, 0, F.y + F.h / 2, 10, 6, F.h, rim, ro);
    // cabine do Supervisor ao fundo, encostada no muro: caixas de som e equalizador
    r.box(480, 0, 62, 330, 38, 46, '#0e0f14', { metal: 0.4, rough: 0.5 });
    for (let i = 0; i < 18; i++) {
      let h;
      if (music) h = (0.3 + 0.7 * Math.abs(Math.sin(i * 1.7 + d.beatIdx * 2.3))) * (0.55 + 0.45 * pulse);
      else if (glitch) h = Math.abs(Math.sin(i * 9.1 + t * 61)) * 0.9;
      else h = 0.06;
      const colr = !music && !glitch ? '#ff3344' : h > 0.75 ? '#ff4fd8' : h > 0.45 ? '#ffd23f' : '#46e27b';
      r.box(342 + i * 16 + 5.5, 38, 70, 11, Math.max(1, 46 * h), 8, colr, { glow: true });
    }
    for (const sx of [250, 710]) {
      r.box(sx, 0, 62, 72, 110, 46, '#16181d', { rough: 0.7 });
      const wr = 19 + (music ? 4 * pulse : 0);
      r.cyl(sx, 40, 85, wr, 3, '#0a0a0c', { rotX: Math.PI / 2, rough: 0.9 });
      r.cyl(sx, 40, 87, wr * 0.4, 3, '#2f3440', { rotX: Math.PI / 2, metal: 0.7 });
      r.cyl(sx, 86, 85, 8, 3, '#0a0a0c', { rotX: Math.PI / 2 });
      r.sphere(sx, 102, 86, 2.5, music ? '#46e27b' : '#ff3344', { glow: true });
    }
    // luzes: festa colorida girando, ou alerta vermelho
    if (music) {
      r.light(480 + Math.cos(t * 0.9) * 300, 170, 300 + Math.sin(t * 1.3) * 140, '#ff4fd8', 1.1 + pulse * 0.6, 520);
      r.light(480 + Math.cos(t * 0.7 + 3) * 300, 170, 300 + Math.sin(t * 1.1 + 2) * 140, '#3fa9ff', 1.1 + pulse * 0.6, 520);
    } else r.light(480, 260, 300, '#ff2a3a', glitch ? 0.6 : 1.4, 800);
    r.light(480, 320, 420, '#ffe2c0', 0.6, 800);
    // marcas de queimado
    for (const s of d.scorch) {
      r.disc(s.x, 0.6, s.y, s.r * 1.2, '#000', { opacity: 0.6 });
      r.disc(s.x, 0.7, s.y, s.r * 0.6, '#28140a', { opacity: 0.7 });
    }
    // holofote: coluna de luz do teto + anel de tempo
    if (d.spot) {
      const s = d.spot, k = s.life / s.max;
      r.cone(s.x, 0, s.y, s.r + 8, 320, '#fff3c0', { glow: true, opacity: 0.1, shadow: false });
      r.disc(s.x, 0.8, s.y, s.r + 4, '#fff3a0', { glow: true, opacity: 0.45 });
      r.ring(s.x, 1, s.y, s.r - 3, s.r + 1, '#fff3a0', { glow: true, arc: k });
      r.label(s.x, 6, s.y, '+1', '#fff3a0', 16);
      r.light(s.x, 120, s.y, '#fff0c0', 1.2, 260);
    }
    // corpos: carbonizados, soltando fumaça
    for (const p of g.players) {
      if (p.alive) continue;
      r.character(p, { color: '#555555', label: false });
      for (let s = 0; s < 2; s++) { const ph = (t * 0.6 + s / 2 + p.id * 0.3) % 1; r.sphere(p.x, 8 + ph * 55, p.y, 4 + ph * 9, '#4a4a4a', { glow: true, opacity: 0.3 * (1 - ph) }); }
    }
    // varredura do scanner: cortina vermelha que percorre a pista
    if (scan) {
      const sy = F.y + ((d.phaseT * 1.4) % 1) * F.h;
      r.box(F.x + F.w / 2, 0, sy, F.w, 80, 2, '#ff2233', { glow: true, opacity: 0.16, shadow: false });
      r.beam(F.x, 1.5, sy, F.x + F.w, 1.5, sy, 3, '#ff3344', { glow: true });
      r.beam(F.x, 80, sy, F.x + F.w, 80, sy, 2, '#ff3344', { glow: true, opacity: 0.7 });
      r.light(480, 60, sy, '#ff2233', 1.4, 360);
    }
    // jogadores: dançam no ritmo; parados viram estátua (braços estendidos)
    for (const p of g.alive()) {
      const q = p.data;
      if (music) r.character(p, { y: pulse * 5, flash: q.spin > 0 });
      else r.character(p, { pose: q.moved ? 'walk' : 'arms', flash: q.spin > 0 });
      if (music && q.ocio > 0.65 && Math.floor(t * 8) % 2 === 0) r.ring(p.x, 1, p.y, p.r + 5, p.r + 9, '#ff4433', { glow: true });
    }
    // torretas nos cantos: poste, cabeça que mira o jogador mais próximo e lente indicando a fase
    for (const tu of this.TURRETS) {
      let ang = Math.atan2(F.y + F.h / 2 - tu[1], F.x + F.w / 2 - tu[0]), bd = 1e9;
      for (const p of g.alive()) { const dd = Math.hypot(p.x - tu[0], p.y - tu[1]); if (dd < bd) { bd = dd; ang = Math.atan2(p.y - tu[1], p.x - tu[0]); } }
      const lens = scan ? '#ff2233' : d.phase === 'grace' ? '#ffaa00' : '#4a1a1a';
      r.cyl(tu[0], 0, tu[1], 20, 8, '#23262c', { metal: 0.6, sides: 8 });
      r.cyl(tu[0], 8, tu[1], 8, 42, '#2e3239', { metal: 0.7 });
      r.box(tu[0], 48, tu[1], 24, 16, 18, '#3a3f47', { rotY: -ang, metal: 0.7, rough: 0.35 });
      const bx = tu[0] + Math.cos(ang) * 26, bz = tu[1] + Math.sin(ang) * 26;
      r.beam(tu[0], 56, tu[1], bx, 56, bz, 5, '#1b1d22', { metal: 0.8 });
      r.sphere(bx, 56, bz, 3.5, lens, { glow: true });
    }
    // raios das torretas
    for (const b of d.beams) {
      const k = b.t / 0.35;
      const t0 = this.nearestTurret(b.x0, b.y0), ang = Math.atan2(b.y1 - t0[1], b.x1 - t0[0]);
      const sx = b.x0 + Math.cos(ang) * 26, sz = b.y0 + Math.sin(ang) * 26;
      r.beam(sx, 56, sz, b.x1, 26, b.y1, 12 * k, '#ff2838', { glow: true, opacity: k });
      r.beam(sx, 56, sz, b.x1, 26, b.y1, 3.5 * k, '#ffffff', { glow: true });
      r.sphere(b.x1, 26, b.y1, 22 * k, '#ff6070', { glow: true, opacity: 0.6 * k });
      r.light(b.x1, 50, b.y1, '#ff3344', 3 * k, 300);
    }
  },

  // estado da música e barras de ócio (fixos na tela; as barras seguem o jogador)
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, d = g.data, t = g.time, music = d.phase === 'music';
    let txt, col;
    if (music) { txt = '♪ DANCEM'; col = '#46e27b'; }
    else if (d.phase === 'scan') { txt = '■ VARRENDO'; col = '#ff3344'; }
    else { txt = '■ ESTÁTUA!'; col = Math.floor(t * 10) % 2 ? '#ff3344' : '#fff'; }
    D.text(c, txt, 24, 60, { size: 20, color: col });
    D.text(c, `${Math.round(60 / d.beatInt)} BPM`, g.W - 24, 56, { size: 14, color: '#888', align: 'right' });
    D.text(c, 'PISTA Nº 7', g.W - 24, 74, { size: 12, color: '#555', align: 'right' });
    for (const p of g.alive()) {
      const q = p.data;
      if (q.ocio <= 0.02) continue;
      const s = TN.R3.project(p.x, 0, p.y);
      const bc = q.ocio > 0.7 ? '#f43' : q.ocio > 0.4 ? '#fc3' : '#7ff';
      D.bar(c, s.x - 18, s.y + 8, 36, 5, q.ocio, bc);
      if (music && q.ocio > 0.65 && Math.floor(t * 8) % 2 === 0) D.text(c, 'MEXA-SE!', s.x, s.y + 24, { size: 12, color: '#f43', align: 'center' });
    }
  },

  // ---------------- desenho 2D (alternativa sem WebGL) ----------------
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
