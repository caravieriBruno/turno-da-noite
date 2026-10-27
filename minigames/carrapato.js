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
  ATTACH_R: 30, PROX_R: 120, RESTART: 3, START: 1.5,
  ATIVACAO_MIN: 11, ATIVACAO_MAX: 17,   // a ativação é sorteada a cada vez (e a contagem não aparece na tela)
  THROW_V: 900, FRICTION: 2000, IMMUNE: 0.5, ATTACH_DELAY: 0.4, DEV_R: 13,

  // ---- mapa (o do original: sala de 36,4 × 24,4 m, proporção 1,49; aqui 1 m = 19,8 px, quase a mesma área do
  //      antigo retângulo de 880 × 410). Os obstáculos são os do
  //      original: 8 blocos quadrados de 2 × 2 m (os de caixa de cabos, dois encostados no fundo e um na parede
  //      da direita) e 8 lajes de concreto, duas delas inclinadas. Cada rodada pode vir espelhada na horizontal.
  //      Jogadores nascem à direita e o carrapato no fundo à esquerda, como no original. ----
  ARENA: { x: 120, y: 30, w: 720, h: 484 }, M: 19.8, OX: 0.16, OZ: -3.4, BLOCO_R: 22,
  BLOCOS: [[-4.88, -4.94], [5.0, -4.93], [-4.87, 5.0], [5.01, 5.0], [-11.6, 4.95], [16.33, 0.87, 'dir'], [6.49, -13.8, 'fundo'], [-9.76, -13.8, 'fundo']],
  // lajes: centro (m), tamanho (m) e inclinação (só visual: rotX/rotZ em rad)
  LAJES: [
    [-9.98, -0.75, 1.14, 2.62, 0, 0], [-8.33, -4.9, 5.03, 0.72, 0, 0], [-1.79, 2.9, 0.62, 3.4, 0, 0], [-2.48, 4.98, 5.02, 0.73, 0, 0],
    [4.18, -0.3, 1.14, 2.05, 0, 0], [11.27, -7.0, 2.04, 0.63, 0, 0], [0.44, -8.35, 1.0, 3.21, 0, 0.22], [9.22, 0.07, 0.9, 3.11, 0.12, -0.2],
  ],
  SPAWNS: [[3.05, 2.85], [7.2, -1.58], [9.49, 3.17], [10.1, -3.59]], DEV_START: [-8.79, -6.81],

  init(g) {
    const d = g.data;
    g.arena = { ...this.ARENA };
    const a = g.arena;
    d.espelho = TN.util.chance(0.5);
    d.pillars = this.gerarPilares(a, d.espelho);
    d.lajes = this.gerarLajes(a, d.espelho);
    const [dx, dz] = this.mapa(a, d.espelho, ...this.DEV_START);
    d.dev = {
      x: dx, y: dz, vx: 0, vy: 0, ang: 0, walk: 0,
      state: 'idle', idleT: this.START, target: -1, carrier: -1, attachT: 0,
      timer: 0, dur: 0, timerOn: false, armed: false,
      base: this.CHASE_SPEED, followT: 0, immune: -1, immuneT: 0, side: 1, sideT: 0, chkT: 0, chkX: dx, chkY: dz,
    };
    const spawns = TN.util.shuffle(this.SPAWNS.slice());
    g.players.forEach((p, i) => {
      [p.x, p.y] = this.mapa(a, d.espelho, ...spawns[i % 4]);
      p.dir = Math.atan2(d.dev.y - p.y, d.dev.x - p.x);   // de olho no carrapato
    });
    for (const p of g.players) p.data = {};
  },

  // ---------- auxiliares ----------
  // metros do original → px da arena (com espelho horizontal opcional)
  mapa(a, esp, mx, mz) {
    const x = (mx - this.OX) * this.M * (esp ? -1 : 1);
    return [a.x + a.w / 2 + x, a.y + a.h / 2 + (mz - this.OZ) * this.M];
  },
  byId(g, id) { return g.players.find((p) => p.id === id) || null; },
  // todos os obstáculos como retângulos alinhados (centro x,y e meias-medidas hw,hh): blocos (r = meio lado) e lajes
  obstaculos(g) {
    const d = g.data, l = [];
    for (const pl of d.pillars) l.push({ x: pl.x, y: pl.y, hw: pl.r, hh: pl.r });
    for (const lj of d.lajes) l.push(lj);
    return l;
  },
  // ponto do retângulo mais perto de (x, y)
  perto(o, x, y) { return { x: TN.util.clamp(x, o.x - o.hw, o.x + o.hw), y: TN.util.clamp(y, o.y - o.hh, o.y + o.hh) }; },
  // empurra um círculo para fora dos blocos e lajes; devolve a normal do último tocado (ou null)
  pillarPush(g, o, r) {
    let hit = null;
    for (const ob of this.obstaculos(g)) {
      const q = this.perto(ob, o.x, o.y), dx = o.x - q.x, dy = o.y - q.y, dd = Math.hypot(dx, dy);
      if (dd >= r) continue;
      let nx, ny;
      if (dd > 0.001) { nx = dx / dd; ny = dy / dd; }
      else {   // centro dentro do retângulo: sai pelo lado mais próximo
        const ex = [ob.x + ob.hw - o.x, o.x - (ob.x - ob.hw), ob.y + ob.hh - o.y, o.y - (ob.y - ob.hh)], k = ex.indexOf(Math.min(...ex));
        [nx, ny] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k];
        q.x = k === 0 ? ob.x + ob.hw : k === 1 ? ob.x - ob.hw : o.x; q.y = k === 2 ? ob.y + ob.hh : k === 3 ? ob.y - ob.hh : o.y;
      }
      o.x = q.x + nx * r; o.y = q.y + ny * r; hit = { x: nx, y: ny };
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
  // arma o cronômetro com uma duração sorteada (11 a 17 s): quem carrega não sabe quanto falta
  armarTimer(g) {
    const dev = g.data.dev;
    dev.dur = TN.util.rand(this.ATIVACAO_MIN, this.ATIVACAO_MAX);
    dev.timer = dev.dur; dev.timerOn = true; dev.armed = false;
  },
  // os 8 blocos do original (r = meio lado, 22 px); os de parede ficam encostados nela
  gerarPilares(a, esp = false) {
    const R = this.BLOCO_R;
    return this.BLOCOS.map(([mx, mz, enc]) => {
      let [x, y] = this.mapa(a, esp, mx, mz);
      if (enc === 'fundo') y = a.y + R;
      if (enc === 'dir') x = esp ? a.x + R : a.x + a.w - R;
      return { x, y, r: R };
    });
  },
  // as 8 lajes (no mínimo 14 px de espessura, para a colisão não deixar ninguém atravessar)
  gerarLajes(a, esp = false) {
    return this.LAJES.map(([mx, mz, w, h, rx, rz]) => {
      const [x, y] = this.mapa(a, esp, mx, mz);
      return { x, y, hw: Math.max(7, (w * this.M) / 2), hh: Math.max(7, (h * this.M) / 2), rx, rz: esp ? -rz : rz };
    });
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
    dev.timerOn = false; dev.armed = false; dev.timer = 0;
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
      const per = 0.12 + 0.88 * Math.max(0, dev.timer) / dev.dur;   // período do bipe
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
        this.armarTimer(g);
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
        // contorna blocos e lajes que estão de fato no caminho (testa a reta até 70 px à frente): anda pela
        // tangente do ponto mais perto do obstáculo, mantendo o mesmo lado por um tempo (não fica indeciso)
        dev.sideT -= dt;
        const look = Math.min(U.dist(dev.x, dev.y, t.x, t.y), 70), RR = this.DEV_R + 4;
        let bloq = null, bs = 1e9;
        for (const ob of this.obstaculos(g)) {
          for (let k = 6; k <= look && k < bs; k += 6) {
            if (Math.abs(dev.x + n.x * k - ob.x) < ob.hw + RR && Math.abs(dev.y + n.y * k - ob.y) < ob.hh + RR) { bs = k; bloq = ob; break; }
          }
        }
        if (bloq) {
          if (!(dev.sideT > 0)) { dev.side = (bloq.x - dev.x) * n.y - (bloq.y - dev.y) * n.x > 0 ? 1 : -1; dev.sideT = 0.8; }
          const q = this.perto(bloq, dev.x, dev.y), dx = q.x - dev.x, dy = q.y - dev.y, dd = Math.hypot(dx, dy) || 1;
          const tx = (-dy / dd) * dev.side, ty = (dx / dd) * dev.side, w = 1 - bs / 76;
          n = U.norm(n.x * (1 - w) * 0.6 + tx * (0.4 + w), n.y * (1 - w) * 0.6 + ty * (0.4 + w));
        }
        // empacou num canto (andou menos de 25 px em 1,2 s): troca o lado do contorno
        dev.chkT = (dev.chkT || 0) + dt;
        if (dev.chkT > 1.2) {
          if (U.dist(dev.x, dev.y, dev.chkX ?? dev.x, dev.chkY ?? dev.y) < 25) { dev.side = -dev.side; dev.sideT = 1.2; }
          dev.chkT = 0; dev.chkX = dev.x; dev.chkY = dev.y;
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
      const n = this.pillarPush(g, dev, R);
      if (n) { const dot = dev.vx * n.x + dev.vy * n.y; if (dot < 0) { dev.vx -= 2 * dot * n.x; dev.vy -= 2 * dot * n.y; } g.sfx('step'); }
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
        for (const ob of this.obstaculos(g)) { const q = this.perto(ob, qx, qy); if (U.dist(qx, qy, q.x, q.y) < p.r + 6) s -= 250; }
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
  // Câmera do original: quase de cima (67° para baixo), 15,7 m de altura, fov 69.
  camera: { pos: [480, 300, 470], target: [480, 0, 318], fov: 68 },
  // luz fria e chapada de casa de força (o retrô tem menos ambiente, para o concreto claro não estourar)
  env: (TN.R3 && TN.R3.RETRO === false)
    ? { bg: '#07090b', fog: [1150, 2700], ambient: 0.5, sun: 1.7, sunDir: [-0.35, 1, 0.5], sunColor: '#d6e8ff' }
    : { bg: '#07090b', fog: [1150, 2700], ambient: 0.3, sun: 0.8, sunDir: [-0.35, 1, 0.5], sunColor: '#d6e8ff', spot: 3.5, spotColor: '#e6eef5' },

  // canaletas de cabos no piso (em metros do original) e as marcas de rastreio (disco preto e branco com LEDs)
  CANALETAS: [
    [[-13.7, -15.4], [-13.7, 1.0], [-8.4, 1.0], [-8.4, 8.8]], [[-13.7, -7.1], [-2.5, -7.1]],
    [[-2.2, -15.4], [-2.2, -2.5], [6.6, -2.5]], [[1.1, -2.5], [1.1, 1.6], [1.9, 2.4], [1.9, 6.2]],
    [[8.4, -10.0], [13.7, -10.0], [13.7, 8.8]], [[6.6, -3.4], [13.7, -3.4]],
  ],
  MARCAS: [[-2.12, -2.22], [-2.07, -9.77], [-13.6, -7.09], [-13.65, -12.62], [-13.65, 1.23], [-9.82, 3.58], [-8.29, 7.36], [2.07, 6.21], [13.82, 7.36], [6.79, -2.22], [13.82, -3.18], [13.78, -5.89], [8.51, -9.77]],
  // cabos pendurados entre os topos dos 4 blocos do meio e daí para o teto (índices em BLOCOS; -1 = teto)
  CABOS: [[0, 1], [1, 3], [3, 2], [2, 0], [0, 3], [0, -1], [1, -1], [3, -1], [2, -1]],
  // quadro de força: caixa cinza com disjuntores e mostradores
  quadro(r, x, z, y, w, h, frente) {
    const lat = frente === 'x';   // de frente para x (na parede lateral) ou para +z (de frente para a câmera)
    if (lat) r.box(x, y, z, 6, h, w, '#5f625e', { metal: 0.5 }); else r.box(x, y, z, w, h, 6, '#5f625e', { metal: 0.5 });
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) {
      const u = -w / 2 + (i + 0.5) * w / 4, v = y + h * (0.3 + 0.4 * k);
      if (lat) r.box(x + 3, v, z + u, 3, 6, w / 6, '#1a1b1c'); else r.box(x + u, v, z + 3, w / 6, 6, 3, '#1a1b1c');
    }
  },

  // a luz do carrapato está acesa neste quadro? (mesma regra do 2D: pisca mais rápido perto do fim)
  devLit(g, dev) {
    if (dev.timerOn && !dev.armed && dev.timer < 3) return true;   // últimos 3 s: luz vermelha contínua
    if (dev.timerOn && !dev.armed) return (g.time % (0.12 + 0.88 * dev.timer / dev.dur)) < 0.07 + 0.05 * dev.timer / dev.dur;
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
    const a = g.arena, d = g.data, dev = d.dev, t = g.time, M = this.M, esp = d.espelho;
    const P = (mx, mz) => this.mapa(a, esp, mx, mz);
    // casa de força no subsolo: paredes de concreto, sem objetos de canto (o piso é desenhado aqui)
    r.room(a.x, a.y, a.x + a.w, a.y + a.h, { estilo: 'subsolo', h: 150, props: false, lamps: 0, floor: '#1d1e1d' });
    // piso de concreto rachado com manchas
    r.plane(a.x + a.w / 2, 0.4, a.y + a.h / 2, a.w, a.h, '#6e706b', { rough: 0.95 });   // (acima das poças do estilo subsolo)
    for (const [mx, mz, rr] of [[-12, -10, 40], [-6, 3, 26], [3, -11, 34], [10, 5, 30], [14, -12, 22], [-15, 6, 30], [0, 7, 20], [7, -6, 18]]) {
      const [x, z] = P(mx, mz); r.disc(x, 0.6, z, rr, '#4f514c', { opacity: 0.6, tex: false });
    }
    // canaletas de cabos no piso e as marcas de rastreio com LEDs vermelhos
    for (const linha of this.CANALETAS) for (let i = 0; i + 1 < linha.length; i++) {
      const [x1, z1] = P(...linha[i]), [x2, z2] = P(...linha[i + 1]);
      r.beam(x1, 1, z1, x2, 1, z2, 11, '#5c6063', { metal: 0.5 });
      r.beam(x1, 2.2, z1, x2, 2.2, z2, 3, '#34383b', { metal: 0.5 });
    }
    for (const [mx, mz] of this.MARCAS) {
      const [x, z] = P(mx, mz);
      r.box(x, 0, z, 22, 2, 22, '#5a4f48');
      r.cyl(x, 2, z, 8, 1, '#e8e8e2', { tex: false });
      r.ring(x, 3.1, z, 0, 8, '#111111', { arc: 0.25 }); r.ring(x, 3.1, z + 0.01, 0, 8, '#111111', { arc: 0.75 });
      for (const s of [-1, 1]) r.box(x + s * 6, 2, z - 9, 3, 3, 3, '#ff2020', { glow: true });
    }
    // canos enferrujados nas paredes laterais
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x = s < 0 ? a.x + 8 : a.x + a.w - 8;
      r.tube(x, 40 + k * 18, a.y, x, 40 + k * 18, a.y + a.h * (s < 0 ? 0.9 : 0.6), 6, k % 2 ? '#6b4a36' : '#5a4a3e', { metal: 0.5 });
    }
    // blocos de concreto (caixas de cabos) com a cruzeta de ferro e o distribuidor de cabos em cima
    const HB = 84;
    for (const pl of d.pillars) {
      r.box(pl.x, 0, pl.y, pl.r * 2, HB, pl.r * 2, '#8b8c86', { rough: 0.9 });
      r.box(pl.x, HB, pl.y, pl.r * 2 + 4, 4, pl.r * 2 + 4, '#3b3d3e', { metal: 0.6 });
      for (const s of [-1, 1]) r.beam(pl.x - pl.r, HB + 5, pl.y - s * pl.r, pl.x + pl.r, HB + 5, pl.y + s * pl.r, 3, '#2a2c2e', { metal: 0.6 });
      r.box(pl.x, HB + 4, pl.y, 12, 8, 12, '#4a4d50', { metal: 0.7 });
    }
    // lajes de concreto (duas inclinadas)
    for (const lj of d.lajes) r.box(lj.x, 0, lj.y, lj.hw * 2, 80, lj.hh * 2, '#868781', { rough: 0.9, rotX: lj.rx, rotZ: lj.rz });
    // quadros de força: na frente do bloco do fundo à esquerda, no bloco da parede direita e na parede esquerda
    { const b = d.pillars[0]; this.quadro(r, b.x, b.y + b.r + 3, 44, 30, 30, 'z'); }
    { const b = d.pillars[5], s = esp ? 1 : -1; this.quadro(r, b.x + s * (b.r + 3), b.y, 40, 30, 30, 'x'); }
    { const [, z] = P(-16, 6.5), x = esp ? a.x + a.w - 3 : a.x + 3; this.quadro(r, x, z, 30, 60, 46, 'x'); }
    // cabos pendurados: entre os topos dos blocos do meio e subindo para o teto (barriga de catenária)
    const cabo = (x1, y1, z1, x2, y2, z2, sag, cor) => {
      let px = x1, py = y1, pz = z1;
      for (let i = 1; i <= 6; i++) {
        const k = i / 6, x = x1 + (x2 - x1) * k, z = z1 + (z2 - z1) * k, y = y1 + (y2 - y1) * k - sag * 4 * k * (1 - k);
        r.tube(px, py, pz, x, y, z, 1.6, cor, { shadow: false }); px = x; py = y; pz = z;
      }
    };
    this.CABOS.forEach(([i, j], n) => {
      const b = d.pillars[i], cor = n % 2 ? '#9a9d9f' : '#2b2c2d';
      if (j >= 0) { const c = d.pillars[j]; cabo(b.x, HB + 8, b.y, c.x, HB + 8, c.y, 26, cor); }
      else { const ex = b.x < a.x + a.w / 2 ? a.x - 40 : a.x + a.w + 40, ez = b.y < a.y + a.h / 2 ? a.y - 40 : a.y + a.h; cabo(b.x, HB + 8, b.y, ex, 300, ez, -40, cor); }
    });
    // luz fria do teto (a do original) e uma de cada lado, mais fraca
    r.light(a.x + a.w / 2, 240, a.y + a.h / 2, '#dfe6ea', 0.6, 650);
    r.light(a.x + a.w * 0.2, 200, a.y + a.h * 0.4, '#cfd8dc', 0.5, 420, { fundo: true });
    r.light(a.x + a.w * 0.8, 200, a.y + a.h * 0.4, '#cfd8dc', 0.5, 420, { fundo: true });
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
    if (dev.armed) r.label(dev.x, dev.state === 'attached' ? 98 : 50, dev.y, '!!', '#ff3b5c', 18);
  },

  // painel do timer (fixo na tela, por cima do 3D)
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, dev = g.data.dev;
    let label, col = '#fff';
    if (dev.armed) { label = 'ARMADO! QUEM FOR PEGO MORRE'; col = '#ff3b5c'; }
    else if (dev.timerOn) { label = 'O CARRAPATO VAI DISPARAR…'; if (dev.timer < 3) col = '#ff3b5c'; }
    else label = 'O CARRAPATO ESTÁ ESCOLHENDO...';
    D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ff3b5c' });
    D.text(c, label, g.W / 2, 52, { size: 14, color: col, align: 'center' });
  },

  // ---------- desenho 2D (alternativa sem WebGL) ----------
  drawDevice(g, c, dev) {
    const lit = this.devLit(g, dev);
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
    // blocos e lajes (vistos de cima)
    for (const ob of this.obstaculos(g)) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(ob.x - ob.hw + 4, ob.y - ob.hh + 6, ob.hw * 2, ob.hh * 2);
      c.fillStyle = '#7a7d78'; c.strokeStyle = '#111'; c.lineWidth = 3;
      c.fillRect(ob.x - ob.hw, ob.y - ob.hh, ob.hw * 2, ob.hh * 2); c.strokeRect(ob.x - ob.hw, ob.y - ob.hh, ob.hw * 2, ob.hh * 2);
    }
    for (const pl of d.pillars) {   // cruzeta de ferro no topo dos blocos
      c.strokeStyle = '#2a2c2e'; c.lineWidth = 3; c.beginPath();
      c.moveTo(pl.x - pl.r, pl.y - pl.r); c.lineTo(pl.x + pl.r, pl.y + pl.r); c.moveTo(pl.x + pl.r, pl.y - pl.r); c.lineTo(pl.x - pl.r, pl.y + pl.r); c.stroke();
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
    if (dev.armed) D.text(c, '!!', dev.x + 30, dev.y - 20, { size: 16, color: '#ff3b5c', align: 'center' });
    // painel do timer logo abaixo do HUD
    let label, col = '#fff';
    if (dev.armed) { label = 'ARMADO! QUEM FOR PEGO MORRE'; col = '#ff3b5c'; }
    else if (dev.timerOn) { label = 'O CARRAPATO VAI DISPARAR…'; if (dev.timer < 3) col = '#ff3b5c'; }
    else label = 'O CARRAPATO ESTÁ ESCOLHENDO...';
    D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ff3b5c' });
    D.text(c, label, g.W / 2, 52, { size: 14, color: col, align: 'center' });
  },
});
