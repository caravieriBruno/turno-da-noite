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

  // ---------- desenho ----------
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
