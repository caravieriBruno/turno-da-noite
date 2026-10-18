// BATATA QUENTE — brincadeira de roda desconstruída pela gerência.
// Os robôs ficam em roda em volta de um pedestal que dispensa uma "batata" explosiva com pavio secreto.
// AÇÃO passa no sentido horário, EXTRA no anti-horário. Explodiu na sua mão = eliminado; a roda fecha.
TN.registerMinigame({
  id: 'batata_quente',
  title: 'BATATA QUENTE',
  inspiredBy: 'brincadeira: batata quente',
  tagline: 'A BATATA NÃO ESFRIA. VOCÊ SIM.',
  brief: [
    'A batata explode num momento secreto.',
    'AÇÃO passa no sentido horário; EXTRA, no anti-horário.',
    'Explodiu na sua mão? Eliminado.',
    'Apertar sem parar faz você derrubar a batata.',
  ],
  controls: { a: 'passar no sentido horário', b: 'passar no anti-horário' },
  icon: '✹',
  color: '#ff9a2e',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes ----
  CX: 480, CY: 292, RING_R: 172, PED_R: 46,
  TRAVEL: 0.25,        // tempo de voo de um passe
  CATCH_LOCK: 0.3,     // quem recebe não pode devolver na hora
  LAUNCH: 0.75,        // voo do pedestal até a primeira vítima
  FUSE_MIN: 4, FUSE_MAX: 12,
  AQUECE: 0.6, AQUECE_MAX: 3,   // a batata esquenta na mão: o pavio queima 1 + 0,6×s (até 3×) com o tempo seguro
  QUEIMA_AVISO: 1.5,            // segundos na mão até o aviso QUEIMANDO!
  BOT_ESPERA_MAX: 0.7,          // o bot solta entre 0,05 e 0,7 s depois do lock: sempre antes de queimar
  DROP_TIME: 0.7,      // tempo para juntar a batata do chão depois de derrubar
  RESPAWN: 1.8,        // pausa entre uma explosão e a próxima batata

  init(g) {
    g.data.pot = null;
    g.data.scorch = [];
    g.data.pedGlow = 0;
    g.data.ring = g.players.slice();   // ordem da roda = ordem dos ids
    g.players.forEach((p, i) => {
      p.data.ang = -Math.PI / 2 + (i / g.players.length) * Math.PI * 2;
      p.data.lock = 0; p.data.spam = 0; p.data.blast = null;
      this.placeOnRing(p);
    });
    g.after(0.6, () => this.spawnPot(g));
  },

  placeOnRing(p) {
    p.x = this.CX + Math.cos(p.data.ang) * this.RING_R;
    p.y = this.CY + Math.sin(p.data.ang) * this.RING_R;
    p.dir = p.data.ang + Math.PI;  // olhando para o pedestal
  },

  ringAlive(g) { return g.data.ring.filter((p) => p.alive); },

  // vizinho na roda: sentido +1 = horário (ângulo crescente na tela), -1 = anti-horário
  neighbor(g, p, sense) {
    const ring = this.ringAlive(g), i = ring.indexOf(p);
    if (i < 0 || ring.length < 2) return null;
    return ring[(i + sense + ring.length) % ring.length];
  },

  spawnPot(g) {
    const U = TN.util;
    const alive = g.alive();
    if (alive.length < 2 || g.data.pot) return;
    const target = U.pick(alive);
    g.data.pot = {
      state: 'flight', holder: null, from: null, to: target, t: 0, dur: this.LAUNCH, arc: 90,
      fuse: U.rand(this.FUSE_MIN, this.FUSE_MAX),
      mood: U.rand(0.7, 1.35),       // deixa o tique-taque menos legível de batata para batata
      tickT: 0.4, interval: 0.6, blink: 0, x: this.CX, y: this.CY, z: 0, spin: 0,
      heldT: 0, avisou: false,        // tempo na mão do portador atual
    };
    g.data.pedGlow = 1;
    g.sfx('shoot');
    g.message('NOVA BATATA.', 0.9, '#ffb060');
  },

  potPos(g, pot) {
    if (pot.state === 'flight') {
      const fx = pot.from ? pot.from.x : this.CX, fy = pot.from ? pot.from.y : this.CY;
      const k = Math.min(1, pot.t / pot.dur);
      pot.x = fx + (pot.to.x - fx) * k; pot.y = fy + (pot.to.y - fy) * k;
      pot.z = Math.sin(Math.PI * k) * pot.arc;
    } else {
      const h = pot.holder, ix = Math.cos(h.data.ang), iy = Math.sin(h.data.ang);
      const off = pot.state === 'dropped' ? 4 : 24;
      pot.x = h.x - ix * off; pot.y = h.y - iy * off;
      pot.z = pot.state === 'dropped' ? Math.abs(Math.sin(pot.t * 14)) * 14 * (1 - pot.t / this.DROP_TIME) : 6;
    }
  },

  pass(g, p, sense) {
    const U = TN.util, pot = g.data.pot;
    const to = this.neighbor(g, p, sense);
    if (!to) return;
    // quem martelou o botão antes da hora derruba a batata
    const fumble = Math.min(0.7, Math.max(0, p.data.spam - 0.8) * 0.3);
    if (U.chance(fumble)) {
      pot.state = 'dropped'; pot.t = 0;
      p.data.spam = 0;
      g.sfx('hit'); g.popup('DEIXOU CAIR!', p.x, p.y - 40, '#ffb060');
      return;
    }
    pot.state = 'flight'; pot.from = p; pot.to = to; pot.holder = null;
    pot.t = 0; pot.dur = this.TRAVEL; pot.arc = 34; pot.heldT = 0; pot.avisou = false;
    g.sfx('whoosh');
  },

  explode(g, victim) {
    const U = TN.util, pot = g.data.pot;
    g.data.pot = null;
    this.potPos(g, pot);
    g.data.scorch.push({ x: victim.x, y: victim.y, r: U.rand(30, 40), rot: U.rand(0, 6) });
    g.eliminate(victim, { sound: 'boom', particles: false, msg: U.pick(['ASSADO!', 'FRITO!', 'PURÊ!', 'GRATINADO!']) });
    g.particles(pot.x, pot.y - pot.z, '#ffd23f', 30, 340);
    g.particles(pot.x, pot.y - pot.z, '#ff6a00', 30, 260, 0.8, 4);
    g.particles(victim.x, victim.y, '#333', 24, 180, 1.0, 5);
    g.particles(victim.x, victim.y, victim.color, 16, 220);
    g.shake(16); g.flash('#ffb060', 0.25);
    // a explosão arremessa o corpo para fora da roda
    victim.data.blast = { x0: victim.x, y0: victim.y, t: 0 };
    if (g.alive().length > 1) g.after(this.RESPAWN, () => this.spawnPot(g));
  },

  update(g, dt) {
    const U = TN.util, d = g.data, n = this.ringAlive(g).length;
    d.pedGlow = Math.max(0, d.pedGlow - dt * 1.5);

    // a roda se fecha: cada vivo desliza até o seu lugar
    this.ringAlive(g).forEach((p, i) => {
      const target = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const diff = Math.atan2(Math.sin(target - p.data.ang), Math.cos(target - p.data.ang));
      p.data.ang += diff * Math.min(1, dt * 4);
      this.placeOnRing(p);
    });
    // corpos voando para fora
    for (const p of g.players) {
      const b = p.data.blast;
      if (!b || b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt * 2.5);
      const k = 1 - (1 - b.t) ** 2, rr = this.RING_R + 62 * k;
      p.x = this.CX + Math.cos(p.data.ang) * rr; p.y = this.CY + Math.sin(p.data.ang) * rr;
    }

    // botões: passar, ou acumular "nervosismo" se apertar na hora errada
    const pot = d.pot;
    for (const p of g.alive()) {
      p.data.lock -= dt;
      p.data.spam = Math.max(0, p.data.spam - dt * 1.6);
      const press = p.input.aPressed ? 1 : p.input.bPressed ? -1 : 0;
      if (!press) continue;
      const canPass = pot && pot.state === 'held' && pot.holder === p && p.data.lock <= 0;
      if (canPass) this.pass(g, p, press);
      else p.data.spam += 1;
    }

    if (!pot) return;
    pot.spin += dt * 6;
    pot.blink = Math.max(0, pot.blink - dt);
    // pavio secreto; na mão de alguém queima mais rápido quanto mais tempo ele segura
    if (pot.state === 'held') {
      pot.heldT += dt;
      pot.fuse -= dt * Math.min(this.AQUECE_MAX, 1 + this.AQUECE * pot.heldT);
      if (pot.heldT >= this.QUEIMA_AVISO && !pot.avisou && pot.holder) {
        pot.avisou = true; g.popup('QUEIMANDO!', pot.holder.x, pot.holder.y - 40, '#ff6a10'); g.sfx('hit');
      }
    } else pot.fuse -= dt;
    // tique-taque: acelera com o fim chegando, mas com humor variável e um pouco de ruído
    pot.tickT -= dt;
    if (pot.tickT <= 0) {
      pot.interval = U.clamp(pot.fuse * 0.12 * pot.mood + U.rand(-0.05, 0.07), 0.07, 0.8) * (pot.avisou ? 0.6 : 1);
      pot.tickT = pot.interval; pot.blink = 0.09;
      g.sfx('tick');
    }

    if (pot.state === 'flight') {
      pot.t += dt;
      if (pot.t >= pot.dur) {
        pot.state = 'held'; pot.holder = pot.to; pot.t = 0; pot.heldT = 0; pot.avisou = false;
        pot.holder.data.lock = this.CATCH_LOCK;
        g.sfx('blip');
      }
    } else if (pot.state === 'dropped') {
      pot.t += dt;
      if (pot.t >= this.DROP_TIME) { pot.state = 'held'; pot.t = 0; pot.holder.data.lock = 0.1; }
    }
    this.potPos(g, pot);
    if (pot.fuse <= 0 && g.data.pot === pot) {
      // se o pavio acabou no ar, explode em quem estiver mais perto da batata
      let victim = pot.holder;
      if (pot.state === 'flight') victim = pot.from && pot.t / pot.dur < 0.5 ? pot.from : pot.to;
      if (victim && victim.alive) this.explode(g, victim);
    }
  },

  // Bot: espera um tempo de reação aleatório (menor quando o tique acelera) e passa para um lado qualquer.
  bot(g, p, dt) {
    const U = TN.util, pot = g.data.pot, d = p.data;
    const holding = pot && pot.state === 'held' && pot.holder === p;
    if (!holding) {
      d.botWait = null;
      // às vezes um bot ansioso martela o botão enquanto a batata vem na direção dele
      const incoming = pot && pot.state === 'flight' && pot.to === p;
      if (!incoming) { d.botNervous = undefined; return {}; }
      if (d.botNervous === undefined) d.botNervous = U.chance(0.07);
      return d.botNervous ? { a: (g.time * 20 | 0) % 2 === 0 } : {};
    }
    if (d.botWait == null) {
      const urgency = U.clamp(pot.interval / 0.5, 0.3, 1);
      d.botWait = this.CATCH_LOCK + U.rand(0.05, this.BOT_ESPERA_MAX) * urgency;   // solta mais cedo que antes (0,08–0,9)
      d.botSense = U.chance(0.5) ? 1 : -1;
      d.botMash = U.chance(0.06);
    }
    d.botWait -= dt;
    if (pot.interval < 0.18 && d.botWait > this.CATCH_LOCK) d.botWait = U.rand(0.05, 0.3);
    if (d.lock > 0) return d.botMash ? { a: (g.time * 20 | 0) % 2 === 0 } : {};
    if (d.botWait <= 0) return { a: d.botSense === 1, b: d.botSense === -1 };
    return {};
  },

  // ---------- desenho 3D (câmera fixa) ----------
  camera: { pos: [480, 500, 880], target: [480, 0, 268], fov: 40 },
  env: { bg: '#060708', fog: [900, 2000], ambient: 0.35, sun: 0.9, sunDir: [-0.2, 1, 0.35], sunColor: '#ffe2c0' },

  // cor da batata conforme o calor (quantizada para reaproveitar materiais)
  potColor(heat) {
    const h = Math.round(heat * 8) / 8, hx = (v) => Math.round(v).toString(16).padStart(2, '0');
    return '#' + hx(150 + 90 * h) + hx(100 - 40 * h) + hx(50 - 20 * h);
  },

  draw3d(g, r) {
    const d = g.data, cx = this.CX, cy = this.CY, R = this.RING_R, t = g.time, U = TN.util;
    // pátio da cadeia à noite (sem linhas de quadra: a roda pintada é a marcação do chão)
    r.yard(cx - 420, cy - 225, cx + 420, cy + 230, { quadra: false });
    // roda pintada no chão + setas do sentido horário
    r.ring(cx, 0.4, cy, R - 17, R + 17, '#ff9a2e', { glow: true, opacity: 0.16 });
    r.ring(cx, 0.5, cy, R + 16, R + 18, '#ffc878', { glow: true, opacity: 0.35 });
    r.ring(cx, 0.5, cy, R - 18, R - 16, '#ffc878', { glow: true, opacity: 0.35 });
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * Math.PI * 2 + Math.PI / 8;
      r.cone(cx + Math.cos(an) * R, 2, cy + Math.sin(an) * R, 5, 13, '#ffc878', { glow: true, opacity: 0.4, rotZ: -Math.PI / 2, rotY: -(an + Math.PI / 2) });
    }
    // marcas de explosão
    for (const s of d.scorch) {
      r.disc(s.x, 0.7, s.y, s.r, '#000', { opacity: 0.55 });
      r.disc(s.x, 0.8, s.y, s.r * 0.55, '#1a0d05', { opacity: 0.7 });
    }
    // pedestal octogonal com faixa de perigo e o dispensador no topo
    const P = this.PED_R, glow = d.pedGlow;
    r.cyl(cx, 0, cy, P + 6, 6, '#22262b', { sides: 8, metal: 0.5, rough: 0.5 });
    r.cyl(cx, 6, cy, P, 30, '#3a4048', { sides: 8, metal: 0.55, rough: 0.45 });
    r.cyl(cx, 13, cy, P + 0.6, 9, '#f5c400', { sides: 8 });
    const ap = (P + 0.6) * Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k += 2) { const th = (k + 0.5) * Math.PI / 4; r.box(cx + Math.sin(th) * ap, 13, cy + Math.cos(th) * ap, P * 0.77, 9, 1.5, '#141414', { rotY: th }); }
    r.cyl(cx, 36, cy, P - 10, 3, '#20252b', { sides: 8, metal: 0.6 });
    r.cyl(cx, 36, cy, 16, 12, glow > 0.05 ? '#ffaa3c' : '#402010', glow > 0.05 ? { glow: true } : { metal: 0.4 });
    r.ring(cx, 48.2, cy, 10, 16, '#111', {});
    if (glow > 0.05) { r.sphere(cx, 52, cy, 10 + 14 * glow, '#ffaa3c', { glow: true, opacity: 0.35 * glow }); r.light(cx, 80, cy, '#ff9a2e', 2.2 * glow, 380); }
    r.label(cx, 82, cy, d.pot ? '??.?' : '--.-', d.pot ? '#f84' : '#555', 12);
    // holofote quente sobre a roda
    r.light(cx, 360, cy + 40, '#ffd7a0', 1.5, 820);
    r.light(cx - 300, 200, cy - 120, '#5d7aa8', 0.5, 600);
    // corpos: explosão, voo para fora da roda e fumaça
    const pot = d.pot;
    for (const p of g.players) {
      if (p.alive) continue;
      const b = p.data.blast;
      if (b && b.t < 1) {
        const k = b.t;
        r.sphere(b.x0, 30, b.y0, 18 + 70 * k, '#ff8a30', { glow: true, opacity: 0.75 * (1 - k) });
        r.sphere(b.x0, 30, b.y0, 10 + 36 * k, '#fff3c0', { glow: true, opacity: 0.9 * (1 - k) });
        r.ring(b.x0, 1.5, b.y0, 20 + 120 * k, 30 + 150 * k, '#ffd23f', { glow: true, opacity: 0.7 * (1 - k) });
        r.light(b.x0, 60, b.y0, '#ff8a30', 5 * (1 - k), 600);
        r.character(p, { pose: 'fall', y: Math.sin(Math.PI * k) * 55, label: false });
      } else {
        r.character(p, { label: false });
        for (let s = 0; s < 3; s++) {
          const ph = (t * 0.6 + s / 3) % 1;
          r.sphere(p.x + Math.sin(t + s * 2) * 6, 8 + ph * 60, p.y, 5 + ph * 9, '#4a4a4a', { glow: true, opacity: 0.35 * (1 - ph) });
        }
      }
    }
    // dicas de passe do portador: pontinhos no chão até cada vizinho
    if (pot && pot.state === 'held' && pot.holder.alive) {
      const h = pot.holder, ready = h.data.lock <= 0, col = ready ? '#ffd23f' : '#665';
      for (const [sense, key] of [[1, 'A'], [-1, 'B']]) {
        if (!this.neighbor(g, h, sense)) continue;
        const rr = R + 34;
        for (let k = 0; k < 4; k++) {
          const an = h.data.ang + sense * (0.1 + k * 0.07);
          r.sphere(cx + Math.cos(an) * rr, 3, cy + Math.sin(an) * rr, 2.4 + k * 0.5, col, { glow: true });
        }
        const an = h.data.ang + sense * 0.44;
        r.label(cx + Math.cos(an) * (rr + 6), 10, cy + Math.sin(an) * (rr + 6), key, col, 14);
      }
    }
    // jogadores vivos (quem segura estende os braços; quem derrubou se abaixa)
    for (const p of g.alive()) {
      const mine = pot && pot.holder === p && pot.state !== 'flight';
      r.character(p, { pose: mine ? (pot.state === 'dropped' ? 'crouch' : 'arms') : 'idle', flash: mine && pot.blink > 0 });
      if (mine && p.data.lock > 0) r.ring(p.x, 1, p.y, p.r + 6, p.r + 9, '#ffffff', { glow: true, opacity: 0.6, arc: p.data.lock / this.CATCH_LOCK });
    }
    // a batata-bomba
    if (pot) {
      const heat = U.clamp((0.7 - pot.interval) / 0.6, 0, 1);
      const y = pot.state === 'dropped' ? 12 + pot.z : 38 + (pot.state === 'flight' ? pot.z : 0);
      r.disc(pot.x, 0.6, pot.y, 13 - Math.min(8, y * 0.05), '#000', { opacity: 0.45 });
      r.sphere(pot.x, y, pot.y, 12, pot.blink > 0 ? '#ffe0a0' : this.potColor(heat), { rough: 0.8, emissive: heat > 0.3 ? '#5a1400' : undefined });
      for (const [sx, sy, sz] of [[-6, 3, 8], [5, -4, 9], [8, 5, -6]]) r.sphere(pot.x + sx, y + sy, pot.y + sz, 1.8, '#3c1e0a', {});
      r.cyl(pot.x, y - 2, pot.y, 12.6, 4, '#5a5f66', { metal: 0.8, rough: 0.3 });
      r.sphere(pot.x, y, pot.y + 12.6, 2.4, pot.blink > 0 ? '#ff2222' : '#550000', { glow: true });
      // pavio torto com faísca
      const fa = Math.sin(pot.spin) * 0.5 + (pot.state === 'flight' ? pot.t * 18 : 0);
      const fx = pot.x + Math.cos(fa) * 5, fz = pot.y + Math.sin(fa) * 5;
      r.beam(pot.x, y + 10, pot.y, fx, y + 20, fz, 2, '#cccccc', {});
      const fl = 0.75 + 0.25 * Math.sin(t * 53) * Math.sin(t * 31);
      r.sphere(fx, y + 21, fz, 3.2 * fl, '#ffff60', { glow: true });
      r.sphere(fx, y + 21, fz, 7 * fl, '#ff8a00', { glow: true, opacity: 0.45 });
      r.light(fx, y + 30, fz, '#ff9a40', 1 + heat * 1.5, 220);
      if (heat > 0.05) r.sphere(pot.x, y, pot.y, 18 + heat * 12, '#ff5014', { glow: true, opacity: 0.3 * heat });
    }
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, cx = this.CX, cy = this.CY;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, 0, 34, g.W, g.H - 34, { tile: 48, a: '#1a1d22', b: '#1e2228' });
    // vinheta: só a roda é iluminada
    const lg = c.createRadialGradient(cx, cy, 120, cx, cy, 430);
    lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.75)');
    c.fillStyle = lg; c.fillRect(0, 34, g.W, g.H - 34);
    // marcas de explosão
    for (const s of d.scorch) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.rot);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.beginPath();
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = s.r * (k % 2 ? 0.6 : 1); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      c.fill(); c.restore();
    }
    // roda pintada no chão
    c.save();
    c.strokeStyle = 'rgba(255,154,46,0.25)'; c.lineWidth = 34;
    c.beginPath(); c.arc(cx, cy, this.RING_R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(255,200,120,0.35)'; c.lineWidth = 2; c.setLineDash([10, 12]);
    c.beginPath(); c.arc(cx, cy, this.RING_R + 17, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cy, this.RING_R - 17, 0, Math.PI * 2); c.stroke();
    c.restore();
    // setas do sentido horário pintadas no chão
    c.fillStyle = 'rgba(255,200,120,0.25)';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      c.save(); c.translate(cx + Math.cos(a) * this.RING_R, cy + Math.sin(a) * this.RING_R); c.rotate(a + Math.PI / 2);
      c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -6); c.lineTo(-5, 6); c.fill(); c.restore();
    }
    this.drawPedestal(g, c);
    // corpos
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    // setas de passe do portador
    const pot = d.pot;
    if (pot && pot.state === 'held' && pot.holder.alive) this.drawPassHints(g, c, pot.holder);
    for (const p of g.alive()) {
      const hot = pot && pot.holder === p && pot.state !== 'flight';
      g.drawPlayer(c, p, { flash: hot && pot.blink > 0 });
      if (hot && p.data.lock > 0) { c.strokeStyle = '#fff8'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + (p.data.lock / this.CATCH_LOCK) * Math.PI * 2); c.stroke(); }
    }
    if (pot) this.drawPotato(c, pot);
  },

  drawPedestal(g, c) {
    const D = TN.draw, cx = this.CX, cy = this.CY, R = this.PED_R, glow = g.data.pedGlow;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(cx, cy + 10, R + 8, R * 0.7, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#3a4048'; c.strokeStyle = '#111'; c.lineWidth = 3;
    c.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; c.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
    c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.save(); c.beginPath(); c.arc(cx, cy, R - 8, 0, Math.PI * 2); c.clip();
    D.hazardStripes(c, cx - R, cy - R, R * 2, R * 2, 9);
    c.restore();
    c.fillStyle = '#20252b'; c.beginPath(); c.arc(cx, cy, R - 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = glow > 0 ? `rgba(255,170,60,${0.3 + glow * 0.7})` : '#402010';
    c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#111'; c.lineWidth = 2; c.stroke();
    // visor do pavio: nunca diz nada de útil
    const pot = g.data.pot;
    D.text(c, pot ? '??.?' : '--.-', cx, cy + 24, { size: 11, color: pot ? '#f84' : '#555', align: 'center', shadow: false });
  },

  drawPassHints(g, c, h) {
    const D = TN.draw, ready = h.data.lock <= 0;
    for (const [sense, key] of [[1, 'A'], [-1, 'B']]) {
      const to = this.neighbor(g, h, sense);
      if (!to) continue;
      // arco curto saindo do portador na direção do vizinho
      const a0 = h.data.ang, rr = this.RING_R + 34;
      const a1 = a0 + sense * 0.32;
      c.strokeStyle = ready ? '#ffd23f' : '#665'; c.lineWidth = 3;
      c.beginPath(); c.arc(this.CX, this.CY, rr, Math.min(a0 + sense * 0.12, a1), Math.max(a0 + sense * 0.12, a1)); c.stroke();
      const tx = this.CX + Math.cos(a1) * rr, ty = this.CY + Math.sin(a1) * rr;
      c.save(); c.translate(tx, ty); c.rotate(a1 + (sense > 0 ? Math.PI / 2 : -Math.PI / 2));
      c.fillStyle = ready ? '#ffd23f' : '#665';
      c.beginPath(); c.moveTo(8, 0); c.lineTo(-4, -6); c.lineTo(-4, 6); c.fill(); c.restore();
      const lx = this.CX + Math.cos(a1) * (rr + 16), ly = this.CY + Math.sin(a1) * (rr + 16);
      D.text(c, key, lx, ly, { size: 12, color: ready ? '#ffd23f' : '#665', align: 'center' });
    }
  },

  drawPotato(c, pot) {
    const heat = TN.util.clamp((0.7 - pot.interval) / 0.6, 0, 1);
    const x = pot.x, y = pot.y - pot.z;
    // sombra no chão
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(pot.x, pot.y + 8, 13 - pot.z * 0.04, 5, 0, 0, Math.PI * 2); c.fill();
    // brilho de calor
    if (heat > 0.05) {
      const gl = c.createRadialGradient(x, y, 4, x, y, 34 + heat * 14);
      gl.addColorStop(0, `rgba(255,80,20,${0.55 * heat})`); gl.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(x, y, 48, 0, Math.PI * 2); c.fill();
    }
    c.save(); c.translate(x, y); c.rotate(Math.sin(pot.spin) * 0.25 + (pot.state === 'flight' ? pot.t * 18 : 0));
    const r = Math.round(150 + 90 * heat), gg = Math.round(100 - 40 * heat), b = Math.round(50 - 20 * heat);
    c.fillStyle = pot.blink > 0 ? '#ffe0a0' : `rgb(${r},${gg},${b})`;
    c.strokeStyle = '#2a1408'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, 15, 11, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(60,30,10,0.6)';
    for (const [sx, sy] of [[-6, -3], [4, 4], [7, -4], [-2, 5]]) { c.beginPath(); c.arc(sx, sy, 1.6, 0, Math.PI * 2); c.fill(); }
    // cinta metálica com LED
    c.fillStyle = '#555'; c.fillRect(-3, -11, 6, 22);
    c.fillStyle = pot.blink > 0 ? '#f22' : '#500'; c.beginPath(); c.arc(0, -2, 3, 0, Math.PI * 2); c.fill();
    // pavio com faísca
    c.strokeStyle = '#ccc'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -11); c.quadraticCurveTo(6, -18, 3, -22); c.stroke();
    c.fillStyle = Math.random() < 0.5 ? '#ff0' : '#f80'; c.beginPath(); c.arc(3, -23, 2.5 + Math.random() * 2, 0, Math.PI * 2); c.fill();
    c.restore();
  },
});
