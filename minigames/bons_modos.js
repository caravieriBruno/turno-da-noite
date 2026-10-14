// BONS MODOS — inspirado em "TABLE MANNERS" (green_pea) de Machine Party.
// Jantar visto de lado. O Anfitrião lê o jornal no meio da mesa. AÇÃO espeta uma ervilha no
// garfo, EXTRA come o que estiver no garfo. Se o Anfitrião baixar o jornal e pegar alguém
// mexendo (mesmo sem efeito), atira. Coma todas as ervilhas sem ser visto.
TN.registerMinigame({
  id: 'bons_modos',
  title: 'BONS MODOS',
  inspiredBy: 'Table Manners (green_pea)',
  tagline: 'O JANTAR ESTÁ SERVIDO.',
  brief: ['Seja um bom convidado.', 'Não coma na frente do Anfitrião.', 'Termine o seu prato.'],
  controls: { a: 'espetar ervilha', b: 'comer o garfo' },
  icon: '●',
  color: '#7bd84a',
  rounds: 2,
  scoring: 'points',          // +1 metade, +1 terminar, +1 primeiro a terminar
  endWhenOneLeft: false,
  timeLimit: 90,              // segurança: quem não terminou fica com o que já ganhou

  // ---- constantes (original: 100 ervilhas, máx. 15 no garfo, comer 0,23 s + 0,67 s travado,
  //      lê 3–6 s, 20% de finta, 0,4 s de reação, olha 1–4 s). Aqui 60 ervilhas e 9 no garfo. ----
  GOAL: 60, FORK_MAX: 9, EAT_ANIM: 0.23, EAT_LOCK: 0.67, STAB_ANIM: 0.1,
  READ_MIN: 3, READ_MAX: 6, FAKE_CHANCE: 0.2, LOWER: 0.35, GRACE: 0.4, WATCH_MIN: 1, WATCH_MAX: 4, RAISE: 0.35,
  AIM: 0.4, SHOT_FREEZE: 1.4,
  SEATS: [130, 290, 670, 830], TABLE_Y: 384,

  init(g) {
    const U = TN.util, d = g.data;
    d.host = { state: 'read', t: 0, dur: U.rand(this.READ_MIN, this.READ_MAX), k: 0, shake: 0 };
    d.shot = null; d.queue = []; d.firstDone = false; d.flashT = 0;
    g.players.forEach((p, i) => {
      p.x = this.SEATS[i]; p.y = this.TABLE_Y; p.dir = p.x < g.W / 2 ? 0 : Math.PI;
      Object.assign(p.data, { eaten: 0, fork: 0, stabT: 0, eatT: 0, lock: 0, done: false, half: false,
        botT: U.rand(0.3, 0.8), botPress: null, forkTarget: U.randInt(4, 9), stopAt: -1, resumeAt: 0, lastHost: 'read' });
    });
  },

  // muda o estado do Anfitrião
  setHost(g, state, dur) { const h = g.data.host; h.state = state; h.t = 0; h.dur = dur; },

  shoot(g, p) {
    const d = g.data;
    if (d.queue.includes(p.id) || (d.shot && d.shot.id === p.id)) return;
    d.queue.push(p.id);
  },

  update(g, dt) {
    const U = TN.util, d = g.data, h = d.host;
    d.flashT -= dt;
    // ---------- sequência de tiro: congela todo mundo ----------
    if (!d.shot && d.queue.length) { d.shot = { id: d.queue.shift(), t: 0, fired: false }; g.sfx('cough'); }
    if (d.shot) {
      const s = d.shot, p = g.players[s.id];
      s.t += dt;
      if (!s.fired && s.t >= this.AIM) {
        s.fired = true; d.flashT = 0.12;
        g.eliminate(p, { sound: 'shoot', particles: false, msg: 'MAL-EDUCADO!' });
        g.particles(p.x, p.y - 50, '#a00', 26, 220); g.flash('#fff', 0.1);
      }
      if (s.t >= this.SHOT_FREEZE) d.shot = null;
      this.checkEnd(g);
      return;
    }
    // ---------- Anfitrião ----------
    h.t += dt;
    if (h.state === 'read' && h.t >= h.dur) {
      if (U.chance(this.FAKE_CHANCE)) { this.setHost(g, 'fake', 0.6); g.sfx('step'); }
      else { this.setHost(g, 'lower', this.LOWER); g.sfx('whoosh'); }
    } else if (h.state === 'fake' && h.t >= h.dur) this.setHost(g, 'read', U.rand(1.5, 3.5));
    else if (h.state === 'lower' && h.t >= h.dur) this.setHost(g, 'grace', this.GRACE);
    else if (h.state === 'grace' && h.t >= h.dur) { this.setHost(g, 'watch', U.rand(this.WATCH_MIN, this.WATCH_MAX)); g.sfx('tick'); }
    else if (h.state === 'watch' && h.t >= h.dur) this.setHost(g, 'raise', this.RAISE);
    else if (h.state === 'raise' && h.t >= h.dur) this.setHost(g, 'read', U.rand(this.READ_MIN, this.READ_MAX));
    // posição do jornal (0 = cobrindo o rosto, 1 = abaixado)
    const tk = h.state === 'lower' ? h.t / this.LOWER : h.state === 'raise' ? 1 - h.t / this.RAISE
      : (h.state === 'grace' || h.state === 'watch') ? 1 : h.state === 'fake' ? Math.sin((h.t / 0.6) * Math.PI) * 0.22 : 0;
    h.k = U.clamp(tk, 0, 1);

    // ---------- convidados ----------
    for (const p of g.alive()) {
      const b = p.data;
      b.stabT -= dt; b.lock -= dt;
      if (b.eatT > 0) {
        b.eatT -= dt;
        if (b.eatT <= 0) this.swallow(g, p);
      }
      if (b.done) continue;
      const acted = p.input.aPressed || p.input.bPressed;
      if (!acted) continue;
      // qualquer gesto com o Anfitrião olhando = tiro (mesmo sem efeito)
      if (h.state === 'watch') { this.shoot(g, p); continue; }
      if (b.lock > 0 || b.eatT > 0) continue;
      if (p.input.aPressed && b.fork < this.FORK_MAX && b.eaten + b.fork < this.GOAL) { b.fork++; b.stabT = this.STAB_ANIM; g.sfx('blip'); }
      else if (p.input.bPressed && b.fork > 0) { b.eatT = this.EAT_ANIM; b.lock = this.EAT_ANIM + this.EAT_LOCK; g.sfx('pickup'); }
    }
    this.checkEnd(g);
  },

  // engole o que está no garfo e confere metade / fim do prato
  swallow(g, p) {
    const b = p.data, d = g.data;
    b.eaten = Math.min(this.GOAL, b.eaten + b.fork); b.fork = 0;
    if (!b.half && b.eaten >= this.GOAL / 2) { b.half = true; g.addScore(p, 1); }
    if (!b.done && b.eaten >= this.GOAL) {
      b.done = true; g.sfx('win');
      g.after(0.3, () => g.addScore(p, 1));
      if (!d.firstDone) { d.firstDone = true; g.after(0.6, () => g.addScore(p, 1)); g.message(`${p.label} LIMPOU O PRATO!`, 1.5, p.color); }
    }
  },

  checkEnd(g) {
    if (g.players.every((p) => !p.alive || p.data.done)) g.finish(1.8);
  },

  // Bot: espeta/come num ritmo aleatório enquanto o jornal está levantado; para quando o
  // jornal se mexe (com tempo de reação — às vezes tarde demais) e volta depois que ele sobe.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, h = d.host, b = p.data;
    if (b.done || d.shot) return {};
    // reage às mudanças do Anfitrião
    if (h.state !== b.lastHost) {
      if (b.lastHost === 'read' && h.state !== 'read') b.stopAt = g.time + (U.chance(0.07) ? U.rand(0.8, 1.3) : U.rand(0.05, 0.3));
      if (h.state === 'read') { b.stopAt = -1; b.resumeAt = g.time + U.rand(0.2, 0.6); }
      b.lastHost = h.state;
    }
    const calm = h.state === 'read' ? g.time >= b.resumeAt : (b.stopAt > 0 && g.time < b.stopAt);
    if (!calm) return {};
    // um aperto dura um quadro; depois solta e espera o próximo
    if (b.botPress) { b.botPress = null; return {}; }
    b.botT -= dt;
    if (b.botT > 0 || b.lock > 0) return {};
    b.botT = U.rand(0.1, 0.26);
    const full = b.fork >= b.forkTarget || b.eaten + b.fork >= this.GOAL;
    if (full) { b.forkTarget = U.randInt(4, this.FORK_MAX); b.botPress = 'b'; return { b: true }; }
    b.botPress = 'a';
    return { a: true };
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Palco de frente: X = lógica x, Y = altura, Z = profundidade. Convidados sentados atrás da mesa
  // (Z ≈ 320), Anfitrião em pé no meio, ainda mais atrás, com o jornal na frente do rosto.
  camera: { pos: [480, 290, 1080], target: [480, 98, 400], fov: 36 },
  env: { bg: '#0b0709', fog: [1000, 2400], ambient: 0.7, sun: 1.3, sunDir: [-0.2, 1, 0.9], sunColor: '#ffe0bf' },
  S3: 1.6, TH3: 58, GZ3: 300, HZ3: 270, TZ3: 440, SEAT3: 28,

  // posição 3D do convidado (sentado atrás da mesa) — usada pelos rótulos do motor
  worldPos(g, p) { return { x: p.x, y: this.TH3 - this.SEAT3, z: this.GZ3 }; },

  w3(x, z, lx, ly, lz, dir, S, oy) {
    const cs = Math.cos(dir), sn = Math.sin(dir);
    return { x: x + (lx * cs - lz * sn) * S, y: oy + ly * S, z: z + (lx * sn + lz * cs) * S };
  },

  draw3d(g, r) {
    const d = g.data, h = d.host, t = g.time, S = this.S3, TH = this.TH3, GZ = this.GZ3, TZ = this.TZ3, HX = 480, HZ = this.HZ3;
    // ---- refeitório da cadeia: azulejo encardido, piso de caquinho, passa-pratos gradeado atrás do diretor ----
    r.room(-200, 158, 1160, 900, { estilo: 'refeitorio', h: 460, paintH: 200, lamps: 2, paint: '#8f8b80', top: '#6b6555', floor: '#4e241d' });
    // cano industrial atravessando a sala
    r.beam(-200, 330, 175, 1200, 330, 175, 14, '#3a3f46', { metal: 0.7, rough: 0.4 });
    // fluorescente pendurada sobre a mesa
    for (const sx of [-50, 50]) r.beam(HX + sx, 460, 380, HX + sx, 252, 380, 1.5, '#222222');
    r.box(HX, 244, 380, 150, 8, 18, '#5d5f5c', { metal: 0.5 });
    r.box(HX, 241, 380, 140, 3, 10, '#eafff0', { glow: true });
    r.light(HX, 236, 400, '#e8f4dc', 2.4, 900);
    r.light(140, 220, 260, '#ff9a5a', 0.8, 420);
    r.light(820, 220, 260, '#ff9a5a', 0.8, 420);
    // ---- Anfitrião (em pé atrás da mesa) ----
    this.drawHost3d(g, r);
    // ---- convidados nas cadeiras ----
    for (const p of g.players) {
      const b = p.data, side = p.x < g.W / 2 ? 1 : -1, dir = Math.PI / 2 - side * 0.35;
      // cadeira
      const dead = !p.alive;
      r.box(p.x, 56, GZ - 4, 46, 6, 44, '#3b2518', { rough: 0.6, rotZ: dead ? side * -0.25 : 0 });
      r.box(p.x, 62, GZ - 28, 46, 66, 6, '#3b2518', { rough: 0.6, rotZ: dead ? side * -0.25 : 0 });
      for (const [lx, lz] of [[-19, -22], [19, -22], [-19, 14], [19, 14]]) r.box(p.x + lx, 0, GZ - 4 + lz, 5, 56, 5, '#2a190f');
      if (!p.alive) continue;
      const eating = b.eatT > 0;
      const aimed = d.shot && d.shot.id === p.id && Math.floor(t * 10) % 2 === 0;
      r.character({ ...p, y: GZ }, { pose: 'sit', y: TH - this.SEAT3 + (eating ? 3 : 0), dir, scale: S, flash: aimed });
      if (b.done) r.label(p.x, TH + 90 * S, GZ, 'SATISFEITO', '#7bd84a', 12);
    }
    // ---- mesa com toalha ----
    r.box(480, TH - 6, TZ, 900, 6, 196, '#ebe6da', { rough: 0.9 });
    r.box(480, 14, TZ + 98, 904, TH - 14, 3, '#e2dccf', { rough: 0.9 });
    for (let x = 50; x < 920; x += 40) r.box(x + 10, 14, TZ + 100, 20, TH - 14, 1, '#d2cbbd', { shadow: false });
    r.box(480, 14, TZ + 101, 904, 4, 1, '#b84a3a', { shadow: false });
    r.plane(480, TH + 0.3, TZ + 20, 860, 34, '#7a1f1f', { rough: 0.9 });   // trilho de mesa
    // travessa com campânula no centro
    r.cyl(480, TH, TZ + 30, 46, 2, '#b9bec4', { metal: 0.85, rough: 0.25 });
    r.sphere(480, TH + 2, TZ + 30, 38, '#c9ced4', { metal: 0.9, rough: 0.2 });
    r.sphere(480, TH + 42, TZ + 30, 5, '#c9ced4', { metal: 0.9, rough: 0.2 });
    // castiçais
    for (const cx of [210, 750]) {
      r.cyl(cx, TH, TZ - 64, 7, 3, '#c9a74a', { metal: 0.9, rough: 0.3 });
      r.cyl(cx, TH + 3, TZ - 64, 2, 22, '#c9a74a', { metal: 0.9, rough: 0.3 });
      r.cyl(cx, TH + 25, TZ - 64, 3, 12, '#f2ecd8');
      r.sphere(cx, TH + 40, TZ - 64, 2.6 + Math.sin(t * 13 + cx) * 0.4, '#ffcf5a', { glow: true });
    }
    // ---- pratos, ervilhas e garfos ----
    for (const p of g.players) this.drawPlate3d(g, r, p);
    // ---- tiro: rastro do disparo ----
    if (d.shot) {
      const tgt = g.players[d.shot.id], gun = this.gunPose(g, tgt);
      if (d.flashT > 0) {
        r.beam(gun.mx, gun.my, gun.mz, tgt.x, TH + 40, GZ + 14, 2.5, '#fff6a0', { glow: true });
        r.sphere(gun.mx, gun.my, gun.mz, 9, '#fff3a0', { glow: true });
        r.light(gun.mx, gun.my, gun.mz + 20, '#ffe08a', 4, 600);
      }
    }
  },

  // posição do revólver do Anfitrião apontando para o alvo
  gunPose(g, tgt) {
    const S2 = 2.05, side = tgt.x < 480 ? -1 : 1;
    const hx = 480 + side * 104, hy = 100, hz = this.HZ3 + 30;
    const tx = tgt.x, ty = this.TH3 + 40, tz = this.GZ3 + 14;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, L = Math.hypot(dx, dy, dz) || 1;
    return { hx, hy, hz, mx: hx + dx / L * 30, my: hy + dy / L * 30, mz: hz + dz / L * 30, S2 };
  },

  drawHost3d(g, r) {
    const d = g.data, h = d.host, t = g.time, HX = 480, HZ = this.HZ3, HS = 2.05;
    const watching = h.state === 'watch' || !!d.shot;
    // o diretor da cadeia: terno cinza, camisa, gravata e a placa na mesa
    r.character({ id: 'host', x: HX, y: HZ, alive: true, color: '#3a3d42', label: false }, { pose: 'arms', dir: Math.PI / 2, scale: HS, key: 'host' });
    r.box(HX, 62, HZ + 11.5, 8, 22, 1.5, '#eeeeee', { shadow: false });
    r.box(HX, 66, HZ + 12.5, 3, 16, 1, '#a01818', { shadow: false });
    // olhos (vermelhos quando vigia)
    for (const ex of [-6, 6]) r.sphere(HX + ex, 52 * HS + 1, HZ + 14.5, 3, watching ? '#ff2a2a' : '#5fe8e8', { glow: true });
    if (watching) r.light(HX, 52 * HS, HZ + 40, '#ff2a2a', 1.4, 260);
    // revólver no tiro (o jornal já está abaixado)
    if (d.shot) {
      const gp = this.gunPose(g, g.players[d.shot.id]);
      r.beam(gp.hx, gp.hy, gp.hz, gp.mx, gp.my, gp.mz, 6, '#2a2c30', { metal: 0.8, rough: 0.3 });
      r.sphere(gp.hx, gp.hy, gp.hz, 4.5, '#d8d2c8');
      const sx = 480 + Math.sign(gp.hx - 480) * 26;
      r.beam(sx, 84, HZ, gp.hx, gp.hy, gp.hz, 9, '#16181c');
      if (!d.shot.fired) { const tg = g.players[d.shot.id]; r.beam(gp.mx, gp.my, gp.mz, tg.x, this.TH3 + 44, this.GZ3 + 8, 0.8, '#ff2020', { glow: true }); r.sphere(tg.x, this.TH3 + 44, this.GZ3 + 10, 2.2, '#ff2020', { glow: true }); }
    }
    // jornal: sobe/desce com h.k (tremendo na finta); 0 = cobrindo o rosto
    const k = d.shot ? 1 : h.k;
    const shake = h.state === 'fake' ? Math.sin(t * 60) * 3 : 0;
    // a caixa gira em torno da borda de baixo: ao abaixar, o jornal tomba para a frente sobre a mesa
    const a = k * 0.22, PW = 172, PH = 96;
    const by = 46 - 60 * k + shake, bz = HZ + 44;
    const ca = Math.cos(a), sa = Math.sin(a);
    // ponto da página (lx = lado, ly = altura a partir da borda de baixo, lz = espessura) → mundo
    const pt = (lx, ly, lz) => ({ x: 480 + lx, y: by + ly * ca - lz * sa, z: bz + ly * sa + lz * ca });
    r.box(480, by, bz, PW, PH, 2, '#e8e2cf', { rotX: a, rough: 0.95 });
    const line = (lx, ly, w, hh, col) => { const q = pt(lx, ly, 1.4); r.box(q.x, q.y, q.z, w, hh, 0.8, col, { rotX: a, shadow: false }); };
    line(-44, 70, 74, 16, '#2a2a2a');
    for (let i = 0; i < 5; i++) { line(-44, 54 - i * 11, 76, 3.5, '#9a968a'); line(44, 80 - i * 14, 76, 4, '#9a968a'); }
    line(0, 3, 1, PH - 6, '#a9a395');
    // mãos segurando o jornal
    for (const sx of [-1, 1]) { const q = pt(sx * (PW / 2 + 2), PH * 0.8, 0); r.sphere(q.x, q.y, q.z, 6, '#c9c3b8'); }
  },

  drawPlate3d(g, r, p) {
    const b = p.data, TH = this.TH3, side = p.x < g.W / 2 ? 1 : -1, GZ = this.GZ3;
    const px = p.x + side * 6, pz = 378;
    r.cyl(px, TH, pz, 34, 2, '#f4f4f4', { rough: 0.3 });
    r.ring(px, TH + 2.1, pz, 26, 33, '#d8d8d8', { shadow: false });
    const left = this.GOAL - b.eaten - b.fork, n = Math.ceil((left / this.GOAL) * 22);
    for (let i = 0; i < n; i++) {
      const ax = ((i * 37) % 44) - 22, az = ((i * 13) % 26) - 13;
      r.sphere(px + ax, TH + 4.5, pz + az * 0.9, 3.4, '#5cbf2a', { rough: 0.5 });
    }
    if (!p.alive) {
      // tombou de cara na mesa
      r.disc(px - side * 10, TH + 0.6, pz - 10, 30, '#3a0a0a', { opacity: 0.85 });
      r.character({ ...p, y: pz - 14 }, { pose: 'dead', y: TH - 2, dir: side > 0 ? Math.PI : 0, scale: this.S3 * 0.9 });
      return;
    }
    if (b.done) return;
    // garfo: desce ao espetar, sobe até a boca ao comer
    const dir = Math.PI / 2 - side * 0.35;
    let tip, hand;
    if (b.eatT > 0) {
      tip = this.w3(p.x, GZ, 11, 46, 0, dir, this.S3, TH - this.SEAT3 + 3);
      hand = { x: tip.x + side * 10, y: tip.y - 16, z: tip.z + 22 };
    } else {
      tip = { x: px + side * 4, y: TH + (b.stabT > 0 ? 4 : 18), z: pz - 2 };
      hand = { x: tip.x - side * 8, y: tip.y + 22, z: tip.z - 26 };
    }
    r.beam(hand.x, hand.y, hand.z, tip.x, tip.y, tip.z, 2.2, '#cfd3d8', { metal: 0.9, rough: 0.2 });
    r.sphere(hand.x, hand.y, hand.z, 4.6, '#d8d2c8');
    const L = Math.hypot(hand.x - tip.x, hand.y - tip.y, hand.z - tip.z) || 1;
    for (let i = 0; i < b.fork; i++) {
      const u = (3 + i * 3.6) / L;
      r.sphere(tip.x + (hand.x - tip.x) * u, tip.y + (hand.y - tip.y) * u, tip.z + (hand.z - tip.z) * u, 2.8, '#5cbf2a');
    }
  },

  // HUD 2D por cima do 3D: placar de ervilhas na toalha e o aviso de vigia
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, h = g.data.host;
    for (const p of g.players) {
      const b = p.data, s0 = TN.R3.project(p.x, 36, this.TZ3 + 102), s = { x: TN.util.clamp(s0.x, 58, g.W - 58), y: s0.y };
      D.text(c, `${b.eaten}/${this.GOAL}`, s.x, s.y - 8, { size: 15, color: p.alive ? '#333' : '#999', align: 'center', shadow: false });
      D.bar(c, s.x - 46, s.y + 4, 92, 9, b.eaten / this.GOAL, p.alive ? p.color : '#777', '#bbb');
      c.fillStyle = '#333'; c.fillRect(s.x - 1, s.y + 2, 2, 13);
      D.text(c, p.alive ? (b.done ? 'LIMPOU O PRATO' : `garfo ${b.fork}`) : 'MAL-EDUCADO', s.x, s.y + 26, { size: 11, color: p.alive ? '#555' : '#a33', align: 'center', shadow: false });
    }
    if (h.state === 'watch') D.text(c, 'ELE ESTÁ OLHANDO', g.W / 2, 52, { size: 15, color: '#f55', align: 'center' });
  },

  draw(g, c) {
    const d = g.data, D = TN.draw, h = d.host, TY = this.TABLE_Y;
    // sala de jantar
    c.fillStyle = '#2a1c22'; c.fillRect(0, 0, g.W, g.H);
    for (let x = 0; x < g.W; x += 48) { c.fillStyle = (x / 48) % 2 ? '#2f2027' : '#33232b'; c.fillRect(x, 34, 24, TY - 34); }
    c.fillStyle = '#1d1318'; c.fillRect(0, TY - 120, g.W, 8);   // rodameio
    // quadro e lustre
    c.fillStyle = '#5a4630'; c.fillRect(g.W / 2 - 300, 70, 120, 84); c.fillStyle = '#1e2a33'; c.fillRect(g.W / 2 - 292, 78, 104, 68);
    c.fillStyle = '#5a4630'; c.fillRect(g.W / 2 + 180, 70, 120, 84); c.fillStyle = '#332a1e'; c.fillRect(g.W / 2 + 188, 78, 104, 68);
    c.strokeStyle = '#a08850'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.W / 2, 34); c.lineTo(g.W / 2, 64); c.stroke();
    c.fillStyle = '#c9a74a'; c.beginPath(); c.ellipse(g.W / 2, 70, 40, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,230,150,0.08)'; c.beginPath(); c.moveTo(g.W / 2 - 40, 72); c.lineTo(g.W / 2 + 40, 72); c.lineTo(g.W / 2 + 260, TY); c.lineTo(g.W / 2 - 260, TY); c.fill();

    this.drawHost(g, c);
    // convidados (atrás da mesa)
    for (const p of g.players) this.drawGuest(g, c, p);
    // mesa: tampo e toalha
    c.fillStyle = '#6b4a2e'; c.fillRect(30, TY, g.W - 60, 26);
    c.fillStyle = '#e9e4d8'; c.fillRect(30, TY + 26, g.W - 60, g.H - TY - 26);
    c.fillStyle = '#d6d0c2'; for (let x = 30; x < g.W - 30; x += 40) c.fillRect(x, TY + 26, 20, g.H - TY - 26);
    // pratos, garfos e placar de ervilhas
    for (const p of g.players) this.drawPlate(g, c, p);
    if (d.flashT > 0 && d.shot) {
      const tgt = g.players[d.shot.id];
      c.strokeStyle = '#fff6a0'; c.lineWidth = 3; c.beginPath(); c.moveTo(g.W / 2 + (tgt.x < g.W / 2 ? -70 : 70), 260); c.lineTo(tgt.x, tgt.y - 55); c.stroke();
    }
    // aviso sutil do estado
    if (h.state === 'watch') D.text(c, 'ELE ESTÁ OLHANDO', g.W / 2, 50, { size: 14, color: '#f55', align: 'center' });
  },

  drawHost(g, c) {
    const d = g.data, h = d.host, x = g.W / 2, TY = this.TABLE_Y;
    const watching = h.state === 'watch' || (d.shot && true);
    // corpo de terno
    c.fillStyle = '#16181c'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - 70, TY - 150, 140, 160, 24); c.fill(); c.stroke();
    c.fillStyle = '#eee'; c.beginPath(); c.moveTo(x - 16, TY - 150); c.lineTo(x + 16, TY - 150); c.lineTo(x, TY - 110); c.fill();
    c.fillStyle = '#a01818'; c.beginPath(); c.moveTo(x - 8, TY - 146); c.lineTo(x + 8, TY - 146); c.lineTo(x, TY - 120); c.fill();
    // cabeça
    c.fillStyle = '#8a8f99'; c.beginPath(); c.roundRect(x - 44, TY - 232, 88, 78, 16); c.fill(); c.stroke();
    c.fillStyle = '#111'; c.fillRect(x - 46, TY - 246, 92, 18); c.fillRect(x - 30, TY - 290, 60, 48);   // cartola
    c.fillStyle = '#a01818'; c.fillRect(x - 30, TY - 256, 60, 8);
    // olhos (vermelhos quando está vigiando)
    c.fillStyle = watching ? '#ff2a2a' : '#7ff';
    c.fillRect(x - 28, TY - 205, 18, 10); c.fillRect(x + 10, TY - 205, 18, 10);
    if (watching) { c.fillStyle = 'rgba(255,40,40,0.25)'; c.beginPath(); c.arc(x - 19, TY - 200, 16, 0, Math.PI * 2); c.arc(x + 19, TY - 200, 16, 0, Math.PI * 2); c.fill(); }
    // revólver apontando no tiro
    if (d.shot) {
      const tgt = g.players[d.shot.id];
      const side = tgt.x < x ? -1 : 1;
      const ang = Math.atan2(tgt.y - 55 - (TY - 120), tgt.x - (x + side * 60));
      c.save(); c.translate(x + side * 60, TY - 120); c.rotate(ang);
      c.fillStyle = '#16181c'; c.fillRect(-10, -8, 40, 16);
      c.fillStyle = '#555'; c.fillRect(28, -6, 26, 9); c.fillRect(28, 2, 10, 12);
      if (d.flashT > 0) { c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(60, -2, 14, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    // jornal: sobe/desce conforme h.k (com tremida na finta)
    const k = d.shot ? 1 : h.k;
    const shake = h.state === 'fake' ? Math.sin(g.time * 60) * 3 : 0;
    const py = TY - 270 + k * 170 + shake;
    c.fillStyle = '#e8e2cf'; c.strokeStyle = '#555'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 110, py); c.lineTo(x + 110, py); c.lineTo(x + 104, py + 130); c.lineTo(x - 104, py + 130); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#999'; c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + 130); c.stroke();
    TN.draw.text(c, 'DIÁRIO DA', x - 54, py + 18, { size: 11, color: '#222', align: 'center', shadow: false });
    TN.draw.text(c, 'NOITE', x - 54, py + 34, { size: 16, color: '#222', align: 'center', shadow: false });
    c.fillStyle = '#bbb';
    for (let i = 0; i < 6; i++) { c.fillRect(x - 96, py + 50 + i * 12, 82, 4); c.fillRect(x + 12, py + 14 + i * 16, 84, 5); }
    c.fillStyle = '#888'; c.fillRect(x - 96, py + 50 + 6 * 12, 40, 4);
    // mãos segurando o jornal
    c.fillStyle = '#8a8f99'; c.beginPath(); c.arc(x - 108, py + 60, 10, 0, Math.PI * 2); c.arc(x + 108, py + 60, 10, 0, Math.PI * 2); c.fill();
  },

  drawGuest(g, c, p) {
    const b = p.data, TY = this.TABLE_Y, facing = p.x < g.W / 2 ? 1 : -1;
    if (!p.alive) {
      // caído de cara no prato
      c.save(); c.translate(p.x, TY + 4); c.rotate(facing * 1.1);
      TN.draw.robotSide(c, 0, 0, 52, 74, p.color, { facing, dead: true });
      c.restore();
      TN.draw.text(c, p.label, p.x, TY - 70, { size: 12, color: '#888', align: 'center' });
      return;
    }
    const bob = b.eatT > 0 ? -4 : 0;
    TN.draw.robotSide(c, p.x, TY + 6 + bob, 52, 80, p.color, { facing, label: p.label });
    if (b.done) TN.draw.text(c, 'SATISFEITO', p.x, TY - 112, { size: 11, color: '#7bd84a', align: 'center' });
  },

  drawPlate(g, c, p) {
    const b = p.data, TY = this.TABLE_Y, D = TN.draw, facing = p.x < g.W / 2 ? 1 : -1;
    const px = p.x + facing * 26;
    // prato com as ervilhas que sobraram
    c.fillStyle = '#f4f4f4'; c.strokeStyle = '#999'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(px, TY + 8, 40, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    const left = this.GOAL - b.eaten - b.fork;
    const n = Math.ceil((left / this.GOAL) * 26);
    c.fillStyle = '#5cbf2a';
    for (let i = 0; i < n; i++) {
      const ax = ((i * 37) % 54) - 27, ay = ((i * 13) % 9) - 4;   // espalhadas de forma fixa
      c.beginPath(); c.arc(px + ax, TY + 6 + ay * 0.8, 3.2, 0, Math.PI * 2); c.fill();
    }
    // garfo: desce ao espetar, sobe até a boca ao comer
    if (p.alive && !b.done) {
      let fx = p.x + facing * 30, fy = TY - 16;
      if (b.stabT > 0) fy += 18;
      if (b.eatT > 0) { fx = p.x + facing * 18; fy = TY - 50; }
      c.strokeStyle = '#ccc'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(p.x + facing * 10, TY - 24); c.lineTo(fx, fy); c.lineTo(fx, fy + 22); c.stroke();
      c.lineWidth = 1.5;
      for (const o of [-3, 0, 3]) { c.beginPath(); c.moveTo(fx + o, fy + 22); c.lineTo(fx + o, fy + 30); c.stroke(); }
      c.fillStyle = '#5cbf2a';
      for (let i = 0; i < b.fork; i++) { c.beginPath(); c.arc(fx + ((i % 2) ? 3 : -3), fy + 20 - i * 4.2, 3, 0, Math.PI * 2); c.fill(); }
    }
    // placar de ervilhas na toalha
    const done = b.eaten / this.GOAL;
    D.text(c, `${b.eaten}/${this.GOAL}`, p.x, TY + 58, { size: 16, color: p.alive ? '#333' : '#999', align: 'center', shadow: false });
    D.bar(c, p.x - 50, TY + 74, 100, 10, done, p.alive ? p.color : '#777', '#bbb');
    c.fillStyle = '#333'; c.fillRect(p.x - 1, TY + 72, 2, 14);   // marca da metade
    D.text(c, `garfo ${b.fork}`, p.x, TY + 100, { size: 12, color: '#666', align: 'center', shadow: false });
  },
});
