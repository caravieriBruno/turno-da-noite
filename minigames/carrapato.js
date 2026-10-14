// CARRAPATO — inspirado em "SPINE BREAKER" (spine_breaker) de Machine Party.
// Um dispositivo rastejante escolhe uma vítima, corre atrás dela e gruda nas costas. Ele tem um timer de 15 s:
// se zerar com ele grudado em você, quebra sua coluna. Solte AÇÃO (depois de 0,4 s grudado) para arremessá-lo
// para a frente — de preferência em cima de outro jogador. Último de pé vence.
TN.registerMinigame({
  id: 'carrapato',
  title: 'CARRAPATO',
  inspiredBy: 'Spine Breaker (spine_breaker)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Não deixe ele te pegar.', 'Se pegar, arranque e arremesse.', 'Quando o timer zera, quem carrega morre.'],
  controls: { move: 'andar', a: 'soltar AÇÃO = arremessar o carrapato' },
  icon: '✱',
  color: '#ff3b5c',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (originais: timer 15 s, vel. 7 alvo novo / 5 perseguindo (+1 em 10 s), arremesso 25 com
  //      atrito 50/s, imunidade 0,5 s, 0,4 s grudado antes de poder arremessar, 3 s até o próximo alvo) ----
  SPEED: 175, CARRY_MULT: 0.92,
  CHASE_SPEED: 250, NEAR_SPEED: 200, RAMP: 45, RAMP_T: 10,
  ATTACH_R: 30, PROX_R: 120, ACTIVATION: 15, RESTART: 3, START: 1.5,
  THROW_V: 900, FRICTION: 2000, IMMUNE: 0.5, ATTACH_DELAY: 0.4, DEV_R: 13,

  init(g) {
    const a = g.arena, d = g.data;
    d.pillars = [[0.27, 0.3], [0.73, 0.3], [0.27, 0.72], [0.73, 0.72]].map(([fx, fy]) => ({ x: a.x + a.w * fx, y: a.y + a.h * fy, r: 30 }));
    d.dev = {
      x: a.x + a.w / 2, y: a.y + a.h / 2, vx: 0, vy: 0, ang: 0, walk: 0,
      state: 'idle', idleT: this.START, target: -1, carrier: -1, attachT: 0,
      timer: this.ACTIVATION, timerOn: false, armed: false,
      base: this.CHASE_SPEED, followT: 0, immune: -1, immuneT: 0, side: 1, sideT: 0,
    };
    g.placeInCircle(a.x + a.w / 2, a.y + a.h / 2 + 10, 165);
    for (const p of g.players) p.data = {};
  },

  // ---------- auxiliares ----------
  byId(g, id) { return g.players.find((p) => p.id === id) || null; },
  // empurra um círculo para fora dos pilares; devolve o pilar tocado
  pillarPush(g, o, r) {
    let hit = null;
    for (const pl of g.data.pillars) {
      const dx = o.x - pl.x, dy = o.y - pl.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < pl.r + r) { o.x = pl.x + (dx / dd) * (pl.r + r); o.y = pl.y + (dy / dd) * (pl.r + r); hit = pl; }
    }
    return hit;
  },
  nearest(g, x, y, exceptId = -1) {
    let best = null, bd = 1e9;
    for (const p of g.alive()) {
      if (p.id === exceptId) continue;
      const dd = TN.util.dist(x, y, p.x, p.y);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  },
  follow(g, target, speed) {
    const dev = g.data.dev;
    dev.state = 'follow'; dev.target = target ? target.id : -1; dev.base = speed; dev.followT = 0;
  },
  attach(g, p) {
    const dev = g.data.dev;
    dev.state = 'attached'; dev.carrier = p.id; dev.attachT = 0; dev.vx = dev.vy = 0;
    g.sfx('hurt'); g.shake(4);
    g.popup('GRUDOU!', p.x, p.y - 44, '#ff3b5c');
    if (dev.armed) this.breakSpine(g, p);   // timer já tinha zerado: mata na hora
  },
  breakSpine(g, p) {
    const dev = g.data.dev;
    g.eliminate(p, { sound: 'boom', msg: 'COLUNA QUEBRADA!' });
    g.particles(p.x, p.y, '#ff3b5c', 30, 260); g.shake(10); g.flash('#f00', 0.15);
    dev.state = 'idle'; dev.idleT = this.RESTART; dev.carrier = -1; dev.target = -1;
    dev.timerOn = false; dev.armed = false; dev.timer = this.ACTIVATION;
    dev.x = p.x; dev.y = p.y + 4;
  },

  update(g, dt) {
    const U = TN.util, d = g.data, dev = d.dev, a = g.arena;

    // ---- jogadores ----
    for (const p of g.alive()) {
      const carrying = dev.state === 'attached' && dev.carrier === p.id;
      g.movePlayer(p, this.SPEED * (carrying ? this.CARRY_MULT : 1), dt);
      this.pillarPush(g, p, p.r);
    }
    U.separate(g.alive());

    // ---- timer de ativação (pisca cada vez mais rápido) ----
    if (dev.timerOn && !dev.armed) {
      const before = dev.timer;
      dev.timer -= dt;
      const per = 0.12 + 0.88 * Math.max(0, dev.timer) / this.ACTIVATION;   // período do bipe
      if (Math.floor(before / per) !== Math.floor(dev.timer / per)) g.sfx('tick');
      if (dev.timer <= 0) {
        dev.timer = 0;
        const carrier = dev.state === 'attached' ? this.byId(g, dev.carrier) : null;
        if (carrier && carrier.alive) this.breakSpine(g, carrier);
        else { dev.armed = true; g.message('ARMADO!', 1.2, '#ff3b5c'); g.sfx('buzz'); }
      }
    }
    dev.immuneT -= dt;
    if (dev.immuneT <= 0) dev.immune = -1;

    // ---- dispositivo ----
    if (dev.state === 'idle') {
      dev.idleT -= dt;
      if (dev.idleT <= 0 && g.alive().length > 1) {
        this.follow(g, U.pick(g.alive()), this.CHASE_SPEED);
        dev.timer = this.ACTIVATION; dev.timerOn = true; dev.armed = false;
        g.sfx('go');
      }
    } else if (dev.state === 'follow') {
      let t = this.byId(g, dev.target);
      if (!t || !t.alive || t.id === dev.immune) { t = this.nearest(g, dev.x, dev.y, dev.immune); dev.target = t ? t.id : -1; }
      // alguém mais perto entrou no raio de proximidade: troca de alvo
      const nb = this.nearest(g, dev.x, dev.y, dev.immune);
      if (nb && t && nb !== t && U.dist(dev.x, dev.y, nb.x, nb.y) < this.PROX_R && U.dist(dev.x, dev.y, nb.x, nb.y) < U.dist(dev.x, dev.y, t.x, t.y)) {
        dev.target = nb.id; t = nb; dev.base = this.NEAR_SPEED;
      }
      if (t) {
        dev.followT += dt;
        const sp = dev.base + this.RAMP * Math.min(1, dev.followT / this.RAMP_T) + (dev.armed ? 40 : 0);
        let n = U.norm(t.x - dev.x, t.y - dev.y);
        // contorna pilares no caminho: anda pela tangente, mantendo o mesmo lado por um tempo (não fica indeciso)
        dev.sideT -= dt;
        for (const pl of d.pillars) {
          const dx = pl.x - dev.x, dy = pl.y - dev.y, dd = Math.hypot(dx, dy) || 1;
          const dot = (dx * n.x + dy * n.y) / dd;
          if (dd < pl.r + 48 && dot > 0.2) {
            if (!(dev.sideT > 0)) { dev.side = dx * n.y - dy * n.x > 0 ? 1 : -1; dev.sideT = 0.7; }
            const tx = (-dy / dd) * dev.side, ty = (dx / dd) * dev.side;
            const w = 1 - (dd - pl.r) / 48;
            n = U.norm(n.x * (1 - w) * 0.6 + tx * (0.4 + w), n.y * (1 - w) * 0.6 + ty * (0.4 + w));
          }
        }
        dev.x += n.x * sp * dt; dev.y += n.y * sp * dt;
        dev.ang = Math.atan2(n.y, n.x); dev.walk += sp * dt * 0.08;
        this.pillarPush(g, dev, this.DEV_R);
        dev.x = U.clamp(dev.x, a.x + this.DEV_R, a.x + a.w - this.DEV_R); dev.y = U.clamp(dev.y, a.y + this.DEV_R, a.y + a.h - this.DEV_R);
        if (t.id !== dev.immune && U.dist(dev.x, dev.y, t.x, t.y) < this.ATTACH_R) this.attach(g, t);
      }
    } else if (dev.state === 'attached') {
      const c = this.byId(g, dev.carrier);
      if (!c || !c.alive) { dev.state = 'idle'; dev.idleT = 0.5; }
      else {
        dev.attachT += dt;
        dev.x = c.x - Math.cos(c.dir) * 9; dev.y = c.y - Math.sin(c.dir) * 9; dev.ang = c.dir; dev.walk += dt * 6;
        // soltar AÇÃO arremessa para a frente
        if (c.input.aReleased && dev.attachT >= this.ATTACH_DELAY) {
          const fx = Math.cos(c.dir), fy = Math.sin(c.dir);
          dev.state = 'thrown'; dev.carrier = -1;
          dev.x = c.x + fx * 26; dev.y = c.y + fy * 26; dev.vx = fx * this.THROW_V; dev.vy = fy * this.THROW_V;
          dev.immune = c.id; dev.immuneT = this.IMMUNE;
          g.sfx('whoosh');
        }
      }
    } else if (dev.state === 'thrown') {
      dev.x += dev.vx * dt; dev.y += dev.vy * dt; dev.ang += dt * 14;
      const sp = Math.hypot(dev.vx, dev.vy), ns = Math.max(0, sp - this.FRICTION * dt);
      dev.vx *= sp ? ns / sp : 0; dev.vy *= sp ? ns / sp : 0;
      // quica nas paredes e nos pilares
      const R = this.DEV_R;
      if (dev.x < a.x + R) { dev.x = a.x + R; dev.vx = Math.abs(dev.vx); }
      if (dev.x > a.x + a.w - R) { dev.x = a.x + a.w - R; dev.vx = -Math.abs(dev.vx); }
      if (dev.y < a.y + R) { dev.y = a.y + R; dev.vy = Math.abs(dev.vy); }
      if (dev.y > a.y + a.h - R) { dev.y = a.y + a.h - R; dev.vy = -Math.abs(dev.vy); }
      const pl = this.pillarPush(g, dev, R);
      if (pl) { const n = U.norm(dev.x - pl.x, dev.y - pl.y), dot = dev.vx * n.x + dev.vy * n.y; if (dot < 0) { dev.vx -= 2 * dot * n.x; dev.vy -= 2 * dot * n.y; } g.sfx('step'); }
      // acerta alguém no caminho = gruda nele
      for (const p of g.alive()) {
        if (p.id === dev.immune) continue;
        if (U.dist(dev.x, dev.y, p.x, p.y) < this.ATTACH_R + 4) { this.attach(g, p); break; }
      }
      if (dev.state === 'thrown' && ns < 30) this.follow(g, this.nearest(g, dev.x, dev.y, dev.immune), this.NEAR_SPEED);
    }
  },

  // ---------- bot ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, dev = d.dev, pd = p.data, a = g.arena;
    // carregando: espera um pouco (reação), mira no mais próximo e solta AÇÃO
    if (dev.state === 'attached' && dev.carrier === p.id) {
      if (pd.bThrowAt === undefined || pd.bThrowAt < 0) pd.bThrowAt = g.time + U.rand(0.5, 1.4);
      const urgent = dev.timerOn && dev.timer < 2.5;
      const prey = this.nearest(g, p.x, p.y, p.id);
      if (!prey) return { x: 0, y: 0, a: true };
      const n = U.norm(prey.x - p.x, prey.y - p.y), dd = U.dist(p.x, p.y, prey.x, prey.y);
      const ready = dev.attachT >= this.ATTACH_DELAY && g.time >= pd.bThrowAt && (dd < 280 || urgent);
      if (ready) { pd.bThrowAt = -1; return { x: n.x, y: n.y, a: false }; }   // soltar = arremessar
      return { x: n.x, y: n.y, a: true };
    }
    pd.bThrowAt = -1;
    // fugindo: testa 16 direções e escolhe a mais longe do carrapato (e de quem o carrega), sem bater em nada
    pd.bThink = (pd.bThink || 0) - dt;
    if (pd.bThink <= 0 || !pd.bDir) {
      pd.bThink = U.rand(0.1, 0.2);
      const threat = dev.state === 'attached' ? this.byId(g, dev.carrier) : dev;
      const targeted = dev.state === 'follow' && dev.target === p.id;
      let best = null, bs = -1e9;
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
        const qx = p.x + cx * 70, qy = p.y + cy * 70;
        let s = 0;
        if (qx < a.x + 30 || qx > a.x + a.w - 30 || qy < a.y + 30 || qy > a.y + a.h - 30) s -= 300;
        for (const pl of d.pillars) if (U.dist(qx, qy, pl.x, pl.y) < pl.r + p.r + 6) s -= 250;
        if (threat) s += Math.min(400, U.dist(qx, qy, threat.x, threat.y)) * (targeted || dev.state !== 'follow' ? 1 : 0.6);
        // fica longe das paredes (cantos são armadilha)
        s -= Math.max(0, 90 - Math.min(qx - a.x, a.x + a.w - qx, qy - a.y, a.y + a.h - qy)) * 1.2;
        if (pd.bDir) s += (cx * pd.bDir.x + cy * pd.bDir.y) * 30;
        s += U.rand(0, 20);
        if (s > bs) { bs = s; best = { x: cx, y: cy }; }
      }
      pd.bDir = best;
    }
    const far = U.dist(p.x, p.y, dev.x, dev.y) > 330 && dev.state !== 'thrown';
    return far ? { x: pd.bDir.x * 0.4, y: pd.bDir.y * 0.4 } : { x: pd.bDir.x, y: pd.bDir.y };
  },

  // ---------- desenho 3D (câmera fixa) ----------
  camera: { pos: [480, 700, 740], target: [480, 0, 288], fov: 40 },
  env: { bg: '#07090b', fog: [1150, 2700], ambient: 0.5, sun: 1.7, sunDir: [-0.35, 1, 0.5], sunColor: '#d6e8ff' },

  // a luz do carrapato está acesa neste quadro? (mesma regra do 2D: pisca mais rápido perto do fim)
  devLit(g, dev) {
    if (dev.timerOn && !dev.armed) return (g.time % (0.12 + 0.88 * dev.timer / this.ACTIVATION)) < 0.07 + 0.05 * dev.timer / this.ACTIVATION;
    return dev.armed ? Math.floor(g.time * 12) % 2 === 0 : false;
  },

  // aranha mecânica low-poly: corpo, cúpula, cabeça, 6 patas (2 segmentos cada) e a luz de status
  drawDevice3d(g, r, dev, x, z, y0, ang, footY, lit) {
    const S = 1.45, ca = Math.cos(ang), sa = Math.sin(ang);
    const W = (fx, sx) => [x + (ca * fx - sa * sx) * S, z + (sa * fx + ca * sx) * S];
    const rot = -ang, hot = lit || dev.armed;
    r.box(x, y0 + 3 * S, z, 26 * S, 8 * S, 17 * S, '#555b65', { rotY: rot, metal: 0.7, rough: 0.35 });
    for (const fx of [-7, 0, 7]) { const [px, pz] = W(fx, 0); r.box(px, y0 + 10.5 * S, pz, 3 * S, 2 * S, 15 * S, '#8a919c', { rotY: rot, metal: 0.8, rough: 0.3 }); }
    const [bx, bz] = W(-3, 0); r.sphere(bx, y0 + 11 * S, bz, 7 * S, '#3a3f47', { metal: 0.7, rough: 0.3 });
    const [hx, hz] = W(15, 0); r.sphere(hx, y0 + 8 * S, hz, 5.5 * S, '#b4bac4', { metal: 0.8, rough: 0.25 });
    for (const s of [-1, 1]) { const [ex, ez] = W(19.5, s * 2.6); r.sphere(ex, y0 + 9.5 * S, ez, 1.7 * S, hot ? '#ff3b5c' : '#ff8a8a', { glow: true }); }
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const sw = Math.sin(dev.walk * 6 + k * 2 + (s > 0 ? 0 : Math.PI)), ph = sw * 4, lift = Math.max(0, sw) * 4 * S;
      const lx = -7 + k * 7;
      const [ax, az] = W(lx, s * 8), [kx, kz] = W(lx + 3 + ph, s * 17), [fx2, fz2] = W(lx + 6 + ph, s * 23);
      r.beam(ax, y0 + 6 * S, az, kx, y0 + 16 * S + lift, kz, 3 * S, '#2a2d33', { metal: 0.6, rough: 0.4 });
      r.beam(kx, y0 + 16 * S + lift, kz, fx2, footY + lift * 0.6, fz2, 2.2 * S, '#3a3e45', { metal: 0.6, rough: 0.4 });
    }
    const [lx, lz] = W(-3, 0);
    r.sphere(lx, y0 + 19 * S, lz, 3.4 * S, lit ? '#ff3b5c' : '#4a1018', { glow: true });
    if (lit) {
      r.sphere(lx, y0 + 19 * S, lz, 11 * S, '#ff3b5c', { glow: true, opacity: 0.25 });
      r.light(lx, y0 + 40, lz, '#ff2a48', 1.6, 260);
    }
  },

  draw3d(g, r) {
    const a = g.arena, d = g.data, dev = d.dev, t = g.time;
    // piso: entorno escuro + ladrilhos de concreto esverdeado
    r.plane(480, -1, 290, 1800, 1200, '#0b0e0f');
    const T = 55;
    for (let i = 0; i * T < a.w; i++) for (let j = 0; j * T < a.h; j++) {
      const x0 = a.x + i * T, z0 = a.y + j * T, w = Math.min(T, a.x + a.w - x0), h = Math.min(T, a.y + a.h - z0);
      r.plane(x0 + w / 2, 0, z0 + h / 2, w - 1.5, h - 1.5, (i + j) % 2 ? '#2b3535' : '#273131', { rough: 0.9 });
    }
    // paredes baixas + faixa de perigo na parede do fundo
    const H = 34, Wd = 14;
    r.box(a.x + a.w / 2, 0, a.y - Wd / 2, a.w + Wd * 2, H, Wd, '#3d4646', { metal: 0.25 });
    r.box(a.x + a.w / 2, 0, a.y + a.h + Wd / 2, a.w + Wd * 2, H * 0.6, Wd, '#3d4646', { metal: 0.25 });
    r.box(a.x - Wd / 2, 0, a.y + a.h / 2, Wd, H, a.h, '#3d4646', { metal: 0.25 });
    r.box(a.x + a.w + Wd / 2, 0, a.y + a.h / 2, Wd, H, a.h, '#3d4646', { metal: 0.25 });
    for (let i = 0; i < 22; i++) r.box(a.x + 20 + i * 40, 10, a.y - 0.5, 20, 14, 1.5, i % 2 ? '#111' : '#f5c400', { shadow: false });
    // pilares de concreto com faixa de perigo e lâmpada no topo
    for (const pl of d.pillars) {
      r.cyl(pl.x, 0, pl.y, pl.r + 4, 4, '#2b3033', { metal: 0.4 });
      r.cyl(pl.x, 0, pl.y, pl.r, 60, '#7a8282', { rough: 0.85 });
      r.cyl(pl.x, 14, pl.y, pl.r + 1, 14, '#f5c400', { rough: 0.6 });
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2 + 0.3;
        r.box(pl.x + Math.cos(an) * (pl.r + 1.3), 14, pl.y + Math.sin(an) * (pl.r + 1.3), 2, 14, 11, '#141414', { rotY: -an });
      }
      r.cyl(pl.x, 60, pl.y, pl.r + 5, 7, '#4a5155', { metal: 0.6, rough: 0.35 });
      r.cyl(pl.x, 67, pl.y, 8, 4, '#ffe0b0', { glow: true });
      r.light(pl.x, 125, pl.y, '#ffcf96', 0.75, 460);
    }
    // corpos: mancha no chão + boneco caído
    for (const p of g.players) if (!p.alive) { r.disc(p.x, 0.6, p.y, 24, '#3a0a12', { opacity: 0.7 }); r.character(p); }
    // alvo atual: linha tracejada no chão e anel pulsante embaixo dele
    const lit = this.devLit(g, dev);
    const tgt = dev.state === 'follow' ? this.byId(g, dev.target) : null;
    if (tgt && tgt.alive) {
      const n = 9, off = (t * 2.5) % 1;
      for (let i = 0; i < n; i++) {
        const k0 = (i + off) / n, k1 = Math.min(1, (i + off + 0.45) / n);
        r.beam(dev.x + (tgt.x - dev.x) * k0, 1.5, dev.y + (tgt.y - dev.y) * k0, dev.x + (tgt.x - dev.x) * k1, 1.5, dev.y + (tgt.y - dev.y) * k1, 2.5, '#ff3b5c', { glow: true, opacity: 0.55 });
      }
      r.ring(tgt.x, 1.2, tgt.y, tgt.r + 8, tgt.r + 12 + Math.sin(t * 10) * 2, '#ff3b5c', { glow: true, opacity: 0.7 });
    }
    // jogadores vivos
    for (const p of g.alive()) {
      const carrying = dev.state === 'attached' && dev.carrier === p.id;
      if (carrying) r.ring(p.x, 1.2, p.y, p.r + 6, p.r + 11 + Math.sin(t * 14) * 2, '#ff3b5c', { glow: true });
      r.character(p, { flash: carrying && lit });
    }
    // o carrapato: no chão, voando (arremessado) ou nas costas de quem carrega
    if (dev.state === 'attached') {
      const c = this.byId(g, dev.carrier);
      this.drawDevice3d(g, r, dev, dev.x, dev.y, 33, c ? c.dir : dev.ang, 24, lit);
    } else {
      const hop = dev.state === 'thrown' ? Math.min(1, Math.hypot(dev.vx, dev.vy) / this.THROW_V) * 26 : 0;
      r.disc(dev.x, 0.5, dev.y, 18, '#000', { opacity: 0.35 });
      this.drawDevice3d(g, r, dev, dev.x, dev.y, 4 + hop, dev.ang, hop, lit);
    }
    if (dev.timerOn || dev.armed) {
      const txt = dev.armed ? '!!' : String(Math.ceil(dev.timer));
      r.label(dev.x, dev.state === 'attached' ? 98 : 50, dev.y, txt, dev.armed || dev.timer < 4 ? '#ff3b5c' : '#fff', 18);
    }
  },

  // painel do timer (fixo na tela, por cima do 3D)
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, dev = g.data.dev;
    let label, col = '#fff';
    if (dev.armed) { label = 'ARMADO! QUEM FOR PEGO MORRE'; col = '#ff3b5c'; }
    else if (dev.timerOn) { label = `ATIVAÇÃO EM ${dev.timer.toFixed(1)} s`; if (dev.timer < 4) col = '#ff3b5c'; }
    else label = 'O CARRAPATO ESTÁ ESCOLHENDO...';
    D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ff3b5c' });
    D.text(c, label, g.W / 2, 52, { size: 14, color: col, align: 'center' });
  },

  // ---------- desenho 2D (alternativa sem WebGL) ----------
  drawDevice(g, c, dev) {
    const lit = dev.timerOn && !dev.armed
      ? (g.time % (0.12 + 0.88 * dev.timer / this.ACTIVATION)) < 0.07 + 0.05 * dev.timer / this.ACTIVATION
      : dev.armed ? Math.floor(g.time * 12) % 2 === 0 : false;
    c.save(); c.translate(dev.x, dev.y); c.rotate(dev.ang);
    // patas
    c.strokeStyle = '#15171b'; c.lineWidth = 3;
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const ph = Math.sin(dev.walk * 6 + k * 2 + (s > 0 ? 0 : Math.PI)) * 4;
      const bx = -6 + k * 7;
      c.beginPath(); c.moveTo(bx, s * 6); c.lineTo(bx + 3 + ph, s * 15); c.lineTo(bx + 7 + ph, s * 21); c.stroke();
    }
    // corpo segmentado
    c.fillStyle = '#2a2d33'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#4a4f58'; c.lineWidth = 1.5;
    for (const x of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, -8); c.lineTo(x, 8); c.stroke(); }
    c.fillStyle = '#9aa0aa'; c.beginPath(); c.arc(14, 0, 4, 0, Math.PI * 2); c.fill();   // cabeça
    c.restore();
    // luz de status
    if (lit) { c.fillStyle = 'rgba(255,40,60,0.35)'; c.beginPath(); c.arc(dev.x, dev.y, 16, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = lit ? '#ff3b5c' : '#5a1220'; c.beginPath(); c.arc(dev.x, dev.y, 4, 0, Math.PI * 2); c.fill();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, dev = d.dev;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 44, a: '#1f2a2a', b: '#233030' });
    c.strokeStyle = '#4a5555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    // pilares
    for (const pl of d.pillars) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(pl.x + 4, pl.y + 6, pl.r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6a7070'; c.strokeStyle = '#111'; c.lineWidth = 3;
      c.beginPath(); c.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#f5c400'; c.lineWidth = 4; c.setLineDash([7, 6]);
      c.beginPath(); c.arc(pl.x, pl.y, pl.r - 7, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#7d8484'; c.beginPath(); c.arc(pl.x, pl.y, pl.r - 13, 0, Math.PI * 2); c.fill();
    }
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    // linha de mira do carrapato até o alvo
    const t = dev.state === 'follow' ? this.byId(g, dev.target) : null;
    if (t && t.alive) {
      c.strokeStyle = 'rgba(255,59,92,0.35)'; c.lineWidth = 2; c.setLineDash([6, 8]);
      c.beginPath(); c.moveTo(dev.x, dev.y); c.lineTo(t.x, t.y); c.stroke(); c.setLineDash([]);
    }
    if (dev.state !== 'attached') this.drawDevice(g, c, dev);
    for (const p of g.alive()) {
      const carrying = dev.state === 'attached' && dev.carrier === p.id;
      if (carrying) { // anel pulsante em quem carrega
        c.strokeStyle = '#ff3b5c'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, p.r + 8 + Math.sin(g.time * 14) * 2, 0, Math.PI * 2); c.stroke();
      }
      g.drawPlayer(c, p);
      if (carrying) this.drawDevice(g, c, dev);
    }
    // contador sobre o carrapato
    if (dev.timerOn || dev.armed) {
      const txt = dev.armed ? '!!' : String(Math.ceil(dev.timer));
      D.text(c, txt, dev.x + 30, dev.y - 20, { size: 16, color: dev.armed || dev.timer < 4 ? '#ff3b5c' : '#fff', align: 'center' });
    }
    // painel do timer logo abaixo do HUD
    let label, col = '#fff';
    if (dev.armed) { label = 'ARMADO! QUEM FOR PEGO MORRE'; col = '#ff3b5c'; }
    else if (dev.timerOn) { label = `ATIVAÇÃO EM ${dev.timer.toFixed(1)} s`; if (dev.timer < 4) col = '#ff3b5c'; }
    else label = 'O CARRAPATO ESTÁ ESCOLHENDO...';
    D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ff3b5c' });
    D.text(c, label, g.W / 2, 52, { size: 14, color: col, align: 'center' });
  },
});
