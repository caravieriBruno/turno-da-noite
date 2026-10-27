// BONS MODOS — inspirado em "TABLE MANNERS" (green_pea) de Machine Party.
// Mesa comprida vista do pé (como no original). O guarda anda distraído atrás da cabeceira. AÇÃO espeta uma ervilha no
// garfo, EXTRA come o que estiver no garfo. Se o guarda virar e pegar alguém mexendo (mesmo
// sem efeito), atira. Ele vira sem padrão de tempo. Coma todas as ervilhas sem ser visto.
TN.registerMinigame({
  id: 'bons_modos',
  title: 'BONS MODOS',
  inspiredBy: 'Table Manners (green_pea)',
  tagline: 'O JANTAR ESTÁ SERVIDO.',
  brief: ['Seja um bom convidado.', 'Não mexa um dedo com o guarda olhando para a mesa.', 'Termine o seu prato.'],
  controls: { a: 'espetar ervilha', b: 'comer o garfo' },
  icon: '●',
  color: '#7bd84a',
  rounds: 2,
  scoring: 'points',          // +1 metade, +1 terminar, +1 primeiro a terminar
  endWhenOneLeft: false,
  timeLimit: 90,              // segurança: quem não terminou fica com o que já ganhou

  // ---- constantes (original: 100 ervilhas, máx. 15 no garfo, comer 0,23 s + 0,67 s travado,
  //      20% de finta). Aqui 60 ervilhas e 9 no garfo. ----
  GOAL: 60, FORK_MAX: 9, EAT_ANIM: 0.23, EAT_LOCK: 0.67, STAB_ANIM: 0.1,
  // o guarda: anda de costas a 60–140 px/s entre X_MIN e X_MAX; a cada quadro pode virar (risco
  // HAZARD por segundo, nunca antes de MIN_WALK nem depois de MAX_WALK), leva TURN s virando e
  // olha por LOOK_MIN–LOOK_MAX s; 20% das vezes é só uma finta de FAKE s.
  // X_MIN/X_MAX: o guarda anda de um lado para o outro atrás da cabeceira (largura da parede do fundo)
  WALK_MIN: 60, WALK_MAX: 140, X_MIN: 330, X_MAX: 630, TURN: 0.3, LOOK_MIN: 0.7, LOOK_MAX: 2.5,
  HAZARD: 0.4, MIN_WALK: 0.6, MAX_WALK: 8, FAKE_CHANCE: 0.2, FAKE: 0.4,
  AIM: 0.4, SHOT_FREEZE: 1.4,
  SEATS: [130, 290, 670, 830], TABLE_Y: 384,   // só o desenho 2D de reserva (mesa vista de lado)
  // Mesa comprida de metal no sentido da profundidade, como em Table Manners: a câmera fica no pé da mesa,
  // duas cadeiras de cada lado e o guarda na cabeceira, ao fundo. CADEIRAS3: [x, z, lado] (lado +1 = olha para +X).
  CADEIRAS3: [[372, 392, 1], [372, 252, 1], [588, 252, -1], [588, 392, -1]],
  MESA3: { x: 480, z0: 160, z1: 480, w: 130 },   // tampo: x ± w/2, de z0 (cabeceira) a z1 (pé)
  HZ3: 100, HS3: 2.6,                             // linha em que o guarda (grandalhão) anda, atrás da cabeceira

  init(g) {
    const U = TN.util, d = g.data;
    d.host = { state: 'walk', t: 0, dur: 0, x: 480, vx: U.pick([-1, 1]) * U.rand(this.WALK_MIN, this.WALK_MAX), face: 0 };
    d.shot = null; d.queue = []; d.firstDone = false; d.flashT = 0;
    g.players.forEach((p, i) => {
      // p.x/p.y = posição da cadeira no chão do 3D (rótulos, popups e partículas do motor caem nela)
      const [cx, cz, lado] = this.CADEIRAS3[i % 4];
      p.x = cx; p.y = cz; p.dir = lado > 0 ? 0 : Math.PI;
      Object.assign(p.data, { eaten: 0, fork: 0, stabT: 0, eatT: 0, lock: 0, done: false, half: false,
        botT: U.rand(0.3, 0.8), botPress: null, forkTarget: U.randInt(4, 9), stopAt: -1, resumeAt: 0, lastHost: 'walk' });
    });
  },

  // muda o estado do guarda
  setHost(g, state, dur) { const h = g.data.host; h.state = state; h.t = 0; h.dur = dur; },
  // volta a andar, num sentido e numa velocidade novos
  andar(g) { const U = TN.util, h = g.data.host; this.setHost(g, 'walk', 0); h.vx = U.pick([-1, 1]) * U.rand(this.WALK_MIN, this.WALK_MAX); },

  shoot(g, p) {
    const d = g.data;
    if (d.queue.includes(p.id) || (d.shot && d.shot.id === p.id)) return;
    d.queue.push(p.id);
  },

  update(g, dt) {
    const U = TN.util, d = g.data, h = d.host;
    d.flashT -= dt;
    // ---------- sequência de tiro: congela todo mundo ----------
    if (!d.shot && d.queue.length) { d.shot = { id: d.queue.shift(), t: 0, fired: false }; h.face = 1; g.sfx('cough'); }
    if (d.shot) {
      const s = d.shot, p = g.players[s.id];
      s.t += dt;
      if (!s.fired && s.t >= this.AIM) {
        s.fired = true; d.flashT = 0.12;
        g.eliminate(p, { sound: 'shoot', particles: false, msg: 'MAL-EDUCADO!' });
        g.particles(p.x, p.y, '#a00', 26, 220); g.flash('#fff', 0.1);
      }
      if (s.t >= this.SHOT_FREEZE) { d.shot = null; this.andar(g); }   // depois do tiro volta a andar (e MIN_WALK dá fôlego)
      this.checkEnd(g);
      return;
    }
    // ---------- guarda: walk → (fake | turn → look) → walk ----------
    // face: 0 = de costas, 1 = de frente para a mesa
    h.t += dt;
    if (h.state === 'walk') {
      h.x += h.vx * dt;
      if (h.x < this.X_MIN) { h.x = this.X_MIN; h.vx = Math.abs(h.vx); }
      else if (h.x > this.X_MAX) { h.x = this.X_MAX; h.vx = -Math.abs(h.vx); }
      h.face = Math.max(0, h.face - dt / this.TURN);
      // sem padrão: a chance de virar é a mesma a cada instante (depois de MIN_WALK), com teto em MAX_WALK
      if (h.t >= this.MIN_WALK && (h.t >= this.MAX_WALK || U.chance(1 - Math.exp(-this.HAZARD * dt)))) {
        if (U.chance(this.FAKE_CHANCE)) this.setHost(g, 'fake', this.FAKE);
        else this.setHost(g, 'turn', this.TURN);
        g.sfx('step');
      }
    } else if (h.state === 'fake') {
      h.face = 0.4 * Math.sin(Math.PI * Math.min(1, h.t / this.FAKE));
      if (h.t >= h.dur) this.andar(g);
    } else if (h.state === 'turn') {
      h.face = Math.min(1, h.t / this.TURN);
      if (h.t >= h.dur) { this.setHost(g, 'look', U.rand(this.LOOK_MIN, this.LOOK_MAX)); g.sfx('tick'); }
    } else if (h.state === 'look') {
      h.face = 1;
      if (h.t >= h.dur) this.andar(g);
    }

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
      // qualquer gesto com o guarda olhando = tiro (mesmo sem efeito); enquanto ele vira, ainda não
      if (h.state === 'look') { this.shoot(g, p); continue; }
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

  // Bot: espeta/come num ritmo aleatório enquanto o guarda anda de costas; para quando ele
  // começa a virar (com tempo de reação — às vezes tarde demais) e volta depois que ele anda.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, h = d.host, b = p.data;
    if (b.done || d.shot) return {};
    // reage às mudanças do guarda
    if (h.state !== b.lastHost) {
      if (b.lastHost === 'walk' && h.state !== 'walk') b.stopAt = g.time + (U.chance(0.07) ? U.rand(0.8, 1.3) : U.rand(0.05, 0.3));
      if (h.state === 'walk') { b.stopAt = -1; b.resumeAt = g.time + U.rand(0.2, 0.6); }
      b.lastHost = h.state;
    }
    const calm = h.state === 'walk' ? g.time >= b.resumeAt : (b.stopAt > 0 && g.time < b.stopAt);
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
  // Refeitório dos fundos (depósito da cozinha), como a sala de Table Manners: mesa comprida de metal no
  // sentido da profundidade, câmera no pé da mesa, duas cadeiras de cada lado, cadeira vazia na cabeceira e o
  // guarda grandalhão andando atrás dela. Estantes de ferro com latas e caixas, latas de ervilha derramadas.
  camera: { pos: [480, 250, 690], target: [480, 62, 250], fov: 50 },
  env: { bg: '#0b0907', fog: [900, 2200], ambient: 0.6, sun: 1.1, sunDir: [-0.3, 1, 0.7], sunColor: '#ffe6c4' },
  S3: 1.6, TH3: 58, SEAT3: 28,

  // posição 3D do convidado (sentado na cadeira) — usada pelos rótulos do motor
  worldPos(g, p) { return { x: p.x, y: this.TH3 - this.SEAT3, z: p.y }; },

  w3(x, z, lx, ly, lz, dir, S, oy) {
    const cs = Math.cos(dir), sn = Math.sin(dir);
    return { x: x + (lx * cs - lz * sn) * S, y: oy + ly * S, z: z + (lx * sn + lz * cs) * S };
  },
  lado(p) { return Math.cos(p.dir) > 0 ? 1 : -1; },
  // bandeja do convidado (no tampo, à frente da cadeira)
  bandeja(p) { return { x: p.x + this.lado(p) * 70, z: p.y }; },

  // estante de ferro encostada numa parede: o.rotY gira (a frente olha para +Z local), com latas e caixas
  estante3d(r, x, z, o = {}) {
    const a = o.rotY || 0, c = Math.cos(a), s = Math.sin(a), W = o.w ?? 150, D = 40, H = o.h ?? 190;
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const ferro = '#3c3f40';
    for (const [lx, lz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) { const [px, pz] = P(lx, lz); r.box(px, 0, pz, 4, H, 4, ferro, { metal: 0.6 }); }
    const prat = [10, 64, 118, 172].filter((y) => y < H);
    prat.forEach((y, k) => {
      const [px, pz] = P(0, 0);
      r.box(px, y, pz, W + 4, 3, D, ferro, { metal: 0.6, rotY: a });
      // em cada prateleira: caixas de papelão ou fileira de latas (fixo pela posição)
      const seed = Math.abs(Math.round(x * 7 + z * 3 + k * 11));
      if (k === prat.length - 1 || seed % 3 === 0) {
        for (const bx of [-W / 2 + 30, W / 2 - 34]) { const [qx, qz] = P(bx + (seed % 9) - 4, 2); r.box(qx, y + 3, qz, 46, 34, 32, '#8a6a3e', { rotY: a + 0.08 * ((seed % 5) - 2), tex: 'tecido' }); }
      } else {
        for (let i = 0; i < 6; i++) {
          if ((seed + i * 5) % 7 === 0) continue;
          const [qx, qz] = P(-W / 2 + 16 + i * (W - 30) / 5, 4);
          this.lata3d(r, qx, y + 3, qz, (seed + i) % 4 === 0 ? 0.3 : 0);
        }
      }
    });
  },
  // lata de ervilha da cozinha (rótulo verde); deitada se tomb ≠ 0 (rotação em Y = tomb)
  lata3d(r, x, y, z, tomb = 0, dir = 0) {
    if (tomb) {
      const dx = Math.cos(dir) * 11, dz = Math.sin(dir) * 11;
      r.tube(x - dx, y + 8, z - dz, x + dx, y + 8, z + dz, 8, '#b9bcbd', { metal: 0.7, rough: 0.35 });
      r.tube(x - dx * 0.55, y + 8, z - dz * 0.55, x + dx * 0.55, y + 8, z + dz * 0.55, 8.4, '#3f8f3a', { rough: 0.6 });
      return;
    }
    r.cyl(x, y, z, 8, 22, '#b9bcbd', { metal: 0.7, rough: 0.35 });
    r.cyl(x, y + 5, z, 8.4, 12, '#3f8f3a', { rough: 0.6 });
  },
  // cadeira de ferro de refeitório (encosto alto com ripas); dir = para onde o assento olha
  cadeira3d(r, x, z, dir, o = {}) {
    const cs = Math.cos(dir), sn = Math.sin(dir), ferro = o.cor ?? '#5d6062', tomb = o.tomb || 0;
    const P = (f, l) => [x + f * cs - l * sn, z + f * sn + l * cs];   // f = para a frente, l = para o lado
    const rot = { metal: 0.55, rough: 0.5, rotY: -dir, rotZ: tomb };
    const [ax, az] = P(0, 0); r.box(ax, 40, az, 44, 5, 44, ferro, rot);
    const [bx, bz] = P(-22, 0); r.box(bx, 40, bz, 4, 70, 44, ferro, rot);
    for (const l of [-14, 0, 14]) { const [qx, qz] = P(-20, l); r.box(qx, 50, qz, 2, 54, 7, '#4a4d4f', { ...rot, shadow: false }); }
    if (!tomb) for (const [f, l] of [[-19, -19], [19, -19], [-19, 19], [19, 19]]) { const [px, pz] = P(f, l); r.box(px, 0, pz, 4, 40, 4, '#3f4244', { metal: 0.6 }); }
  },

  draw3d(g, r) {
    const d = g.data, t = g.time, S = this.S3, TH = this.TH3, M = this.MESA3;
    // ---- depósito do refeitório: concreto encardido, piso de caquinho ----
    r.room(170, 0, 790, 560, { estilo: 'refeitorio', h: 330, paintH: 150, lamps: 0, props: false, paint: '#7d7a70', top: '#5d5850', floor: '#3a3430', frente: 300 });
    // estantes com latas e caixas: duas no fundo (atrás do guarda) e nas paredes laterais
    this.estante3d(r, 262, 30, { w: 150 });
    this.estante3d(r, 700, 30, { w: 150 });
    this.estante3d(r, 196, 180, { rotY: Math.PI / 2, w: 170 });
    this.estante3d(r, 764, 230, { rotY: -Math.PI / 2, w: 170, h: 150 });
    // caixas empilhadas e cadeira caída ao fundo, à direita (como no original)
    r.box(690, 0, 150, 56, 40, 44, '#8a6a3e', { rotY: 0.3, tex: 'tecido' });
    r.box(694, 40, 152, 50, 34, 40, '#94744a', { rotY: -0.1, tex: 'tecido' });
    r.box(726, 0, 205, 50, 36, 42, '#8a6a3e', { rotY: 0.6, tex: 'tecido' });
    this.cadeira3d(r, 660, 205, 2.2, { tomb: 1.35 });
    r.box(250, 0, 120, 52, 38, 40, '#8a6a3e', { rotY: -0.4, tex: 'tecido' });
    // latas pelo chão
    this.lata3d(r, 270, 0, 330, 1, 0.7); this.lata3d(r, 700, 0, 330, 1, 2.1); this.lata3d(r, 300, 0, 470, 0);
    // fluorescente pendurada sobre a mesa
    for (const sz of [M.z0 + 60, M.z1 - 80]) {
      for (const sx of [-40, 40]) r.beam(M.x + sx, 330, sz, M.x + sx, 236, sz, 1.5, '#222222');
      r.box(M.x, 228, sz, 120, 8, 18, '#5d5f5c', { metal: 0.5 });
      r.box(M.x, 225, sz, 110, 3, 10, '#eafff0', { glow: true });
    }
    r.light(M.x, 220, M.z0 + 120, '#e8f4dc', 2.2, 800);
    r.light(M.x, 220, 60, '#ffb070', 0.8, 420);
    // ---- guarda na cabeceira ----
    this.drawHost3d(g, r);
    // cadeira vazia da cabeceira (afastada da mesa)
    this.cadeira3d(r, M.x, M.z0 - 28, Math.PI / 2);
    // ---- mesa comprida de metal ----
    const zc = (M.z0 + M.z1) / 2, L = M.z1 - M.z0;
    r.box(M.x, TH - 5, zc, M.w, 5, L, '#8d9192', { metal: 0.6, rough: 0.45 });
    r.box(M.x, TH - 13, zc, M.w - 10, 8, L - 10, '#5f6365', { metal: 0.6 });
    for (const [lx, lz] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) r.box(M.x + lx * (M.w / 2 - 8), 0, M.z0 + 10 + lz * (L - 20), 6, TH - 13, 6, '#4b4e50', { metal: 0.6 });
    // latas de ervilha derramadas e a gororoba espalhada (no centro do tampo, entre as bandejas)
    this.lata3d(r, M.x - 14, TH, M.z0 + 80, 0);
    this.lata3d(r, M.x + 20, TH, M.z0 + 132, 1, 0.9);
    this.lata3d(r, M.x - 6, TH, M.z1 - 110, 0);
    this.lata3d(r, M.x + 26, TH, M.z1 - 60, 1, -0.4);
    for (let i = 0; i < 14; i++) r.sphere(M.x - 30 + ((i * 37) % 60), TH + 2.5, M.z0 + 60 + ((i * 53) % (L - 90)), 2.6, '#5cbf2a', { rough: 0.5 });
    // ---- convidados nas cadeiras ----
    for (const p of g.players) {
      const b = p.data, side = this.lado(p);
      this.cadeira3d(r, p.x - side * 12, p.y, p.dir);
      if (!p.alive) continue;
      const eating = b.eatT > 0;
      const aimed = d.shot && d.shot.id === p.id && Math.floor(t * 10) % 2 === 0;
      // nome logo acima da cabeça (sentado, o rótulo automático ficaria alto demais)
      r.character(p, { pose: 'sit', y: TH - this.SEAT3 + (eating ? 3 : 0), dir: p.dir, scale: S, flash: aimed, label: false });
      r.label(p.x, TH + 62, p.y, p.label, p.color, 12);
      if (b.done) r.label(p.x, TH + 82, p.y, 'SATISFEITO', '#7bd84a', 12);
    }
    // ---- bandejas, ervilhas e garfos ----
    for (const p of g.players) this.drawPlate3d(g, r, p);
    // ---- tiro: rastro do disparo ----
    if (d.shot) {
      const tgt = g.players[d.shot.id], gun = this.gunPose(g, tgt);
      if (d.flashT > 0) {
        r.beam(gun.mx, gun.my, gun.mz, gun.tx, gun.ty, gun.tz, 2.5, '#fff6a0', { glow: true });
        r.sphere(gun.mx, gun.my, gun.mz, 9, '#fff3a0', { glow: true });
        r.light(gun.mx, gun.my, gun.mz + 20, '#ffe08a', 4, 600);
      }
    }
  },

  // posição do revólver do guarda apontando para o alvo (sai de onde ele parou)
  gunPose(g, tgt) {
    const h = g.data.host, HZ = this.HZ3;
    const tx = tgt.x, ty = this.TH3 + 44, tz = tgt.y;
    const ax = tx - h.x, az = tz - HZ, al = Math.hypot(ax, az) || 1;
    const hx = h.x + ax / al * 15 * this.HS3, hy = 50 * this.HS3, hz = HZ + az / al * 15 * this.HS3;
    const dx = tx - hx, dy = ty - hy, dz = tz - hz, L = Math.hypot(dx, dy, dz) || 1;
    return { hx, hy, hz, mx: hx + dx / L * 30, my: hy + dy / L * 30, mz: hz + dz / L * 30, tx, ty, tz };
  },

  drawHost3d(g, r) {
    const d = g.data, h = d.host, HZ = this.HZ3, HS = this.HS3, HX = h.x, HY = 0;
    const looking = h.state === 'look' || !!d.shot;
    const face = d.shot ? 1 : h.face;
    // anda de lado ao longo da parede do fundo (0 ou π); ao virar interpola até ficar de frente para a mesa (π/2)
    const walkDir = h.vx > 0 ? 0 : Math.PI;
    let dir = walkDir + (Math.PI / 2 - walkDir) * face;
    if (d.shot) { const tg = g.players[d.shot.id]; dir = Math.atan2(tg.y - HZ, tg.x - HX); }
    const fx = Math.cos(dir), fz = Math.sin(dir), rx = -fz, rz = fx;   // frente e lado direito
    const pose = d.shot ? (d.shot.fired ? 'shoot' : 'aim') : h.state === 'walk' ? 'auto' : 'idle';
    // o guarda: uniforme azul-escuro, quepe e cassetete
    r.character({ id: 'host', x: HX, y: HZ, alive: true, color: '#2b3a6b', label: false }, { pose, dir, scale: HS, key: 'host', y: HY });
    r.box(HX, HY + 59 * HS, HZ, 11 * HS, 2.5 * HS, 10 * HS, '#1d2a52', { rotY: -dir });
    r.box(HX + fx * 7 * HS, HY + 58 * HS, HZ + fz * 7 * HS, 4 * HS, 1 * HS, 8 * HS, '#111318', { rotY: -dir, shadow: false });   // pala
    r.beam(HX + rx * 12 * HS, HY + 34 * HS, HZ + rz * 12 * HS, HX + rx * 12 * HS, HY + 12 * HS, HZ + rz * 12 * HS, 1.8 * HS, '#1a1a1a', { rough: 0.6 });
    // jornal aberto na frente do peito enquanto anda distraído (como o vigia do original); abaixa ao virar
    if (!d.shot && face < 0.6) {
      const k = 1 - face / 0.6, jx = HX + fx * 16 * HS, jz = HZ + fz * 16 * HS, jy = HY + (30 + 12 * k) * HS;
      r.box(jx, jy, jz, 1.5, 15 * HS, 22 * HS, '#d9d4c4', { rotY: -dir, rough: 0.9, tex: false });
      r.box(jx + fx * 1, jy + 9 * HS, jz + fz * 1, 1, 3 * HS, 14 * HS, '#3a3a3a', { rotY: -dir, shadow: false, tex: false });
    }
    // olhos (vermelhos quando olha para a mesa)
    for (const ex of [-6, 6]) r.sphere(HX + fx * 7 * HS + rx * ex, HY + 52 * HS + 1, HZ + fz * 7 * HS + rz * ex, 3, looking ? '#ff2a2a' : '#5fe8e8', { glow: true });
    if (looking) r.light(HX, HY + 52 * HS, HZ + 40, '#ff2a2a', 1.4, 260);
    // revólver no tiro
    if (d.shot) {
      const tg = g.players[d.shot.id], gp = this.gunPose(g, tg);
      r.beam(gp.hx, gp.hy, gp.hz, gp.mx, gp.my, gp.mz, 6, '#2a2c30', { metal: 0.8, rough: 0.3 });
      r.sphere(gp.hx, gp.hy, gp.hz, 4.5, '#d8d2c8');
      r.beam(HX + rx * 7 * HS, HY + 41 * HS, HZ + rz * 7 * HS, gp.hx, gp.hy, gp.hz, 4.4 * HS, '#16181c');
      if (!d.shot.fired) { r.beam(gp.mx, gp.my, gp.mz, gp.tx, gp.ty, gp.tz, 0.8, '#ff2020', { glow: true }); r.sphere(gp.tx, gp.ty, gp.tz, 2.2, '#ff2020', { glow: true }); }
    }
  },

  drawPlate3d(g, r, p) {
    const b = p.data, TH = this.TH3, side = this.lado(p), { x: px, z: pz } = this.bandeja(p);
    // bandeja de inox de cadeia, com divisórias; as ervilhas no compartimento grande
    r.box(px, TH, pz, 44, 2.5, 62, '#a9adb0', { metal: 0.8, rough: 0.3 });
    r.box(px, TH + 2.5, pz - 12, 40, 2, 1.5, '#8f9396', { metal: 0.8, shadow: false });
    r.box(px, TH + 2.5, pz + 16, 1.5, 2, 26, '#8f9396', { metal: 0.8, shadow: false });
    r.box(px - 10, TH + 2.5, pz + 17, 14, 1.5, 20, '#a8865a', { shadow: false });   // pão
    const left = this.GOAL - b.eaten - b.fork, n = Math.ceil((left / this.GOAL) * 22);
    for (let i = 0; i < n; i++) {
      const ax = ((i * 37) % 32) - 16, az = ((i * 13) % 30) - 15;
      r.sphere(px + ax, TH + 5, pz - 2 + az * 0.6 - 8, 3.4, '#5cbf2a', { rough: 0.5 });
    }
    if (!p.alive) {
      // tombou de cara na mesa
      r.disc(px - side * 6, TH + 0.6, pz, 28, '#3a0a0a', { opacity: 0.85 });
      r.character({ ...p, x: px - side * 18, y: pz }, { pose: 'dead', y: TH - 2, dir: side > 0 ? Math.PI : 0, scale: this.S3 * 0.9, label: false });
      return;
    }
    if (b.done) return;
    // garfo: desce ao espetar, sobe até a boca ao comer
    let tip, hand;
    if (b.eatT > 0) {
      tip = this.w3(p.x, p.y, 11, 46, 0, p.dir, this.S3, TH - this.SEAT3 + 3);
      hand = { x: tip.x + side * 10, y: tip.y - 16, z: tip.z + 18 };
    } else {
      tip = { x: px - side * 4, y: TH + (b.stabT > 0 ? 4 : 18), z: pz - 6 };
      hand = { x: tip.x - side * 24, y: tip.y + 20, z: tip.z + 8 };
    }
    r.beam(hand.x, hand.y, hand.z, tip.x, tip.y, tip.z, 2.2, '#cfd3d8', { metal: 0.9, rough: 0.2 });
    r.sphere(hand.x, hand.y, hand.z, 4.6, '#d8d2c8');
    const L = Math.hypot(hand.x - tip.x, hand.y - tip.y, hand.z - tip.z) || 1;
    for (let i = 0; i < b.fork; i++) {
      const u = (3 + i * 3.6) / L;
      r.sphere(tip.x + (hand.x - tip.x) * u, tip.y + (hand.y - tip.y) * u, tip.z + (hand.z - tip.z) * u, 2.8, '#5cbf2a');
    }
  },

  // HUD 2D por cima do 3D: placar de ervilhas de cada um no canto da tela do lado da sua cadeira
  // (fundo à esquerda/direita em cima, perto à esquerda/direita embaixo) e o aviso de vigia
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, h = g.data.host;
    for (const p of g.players) {
      const b = p.data, esq = this.lado(p) > 0, perto = p.y > 320;
      const s = { x: esq ? 92 : g.W - 92, y: perto ? g.H - 52 : 84 };
      D.panel(c, s.x - 74, s.y - 26, 148, 58, { stroke: p.alive ? p.color : '#555', fill: 'rgba(10,8,6,0.72)' });
      D.text(c, `${p.label} ${b.eaten}/${this.GOAL}`, s.x, s.y - 12, { size: 13, color: p.alive ? '#eee' : '#888', align: 'center' });
      D.bar(c, s.x - 60, s.y, 120, 9, b.eaten / this.GOAL, p.alive ? p.color : '#777', '#333');
      c.fillStyle = '#ddd'; c.fillRect(s.x - 1, s.y - 2, 2, 13);
      D.text(c, p.alive ? (b.done ? 'LIMPOU O PRATO' : `garfo ${b.fork}`) : 'MAL-EDUCADO', s.x, s.y + 22, { size: 11, color: p.alive ? '#bbb' : '#f55', align: 'center' });
    }
    if (h.state === 'look') D.text(c, 'O GUARDA VIROU', g.W / 2, 52, { size: 15, color: '#f55', align: 'center' });
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
    // no 2D a mesa é vista de lado: cada convidado no seu lugar da fileira (cópia rasa só para desenhar)
    const ps = g.players.map((p, i) => ({ ...p, x: this.SEATS[i % 4], y: TY }));
    for (const p of ps) this.drawGuest(g, c, p);
    // mesa: tampo e toalha
    c.fillStyle = '#6b4a2e'; c.fillRect(30, TY, g.W - 60, 26);
    c.fillStyle = '#e9e4d8'; c.fillRect(30, TY + 26, g.W - 60, g.H - TY - 26);
    c.fillStyle = '#d6d0c2'; for (let x = 30; x < g.W - 30; x += 40) c.fillRect(x, TY + 26, 20, g.H - TY - 26);
    // pratos, garfos e placar de ervilhas
    for (const p of ps) this.drawPlate(g, c, p);
    if (d.flashT > 0 && d.shot) {
      const tgt = ps[d.shot.id], hx = this.hostX2d(h);
      c.strokeStyle = '#fff6a0'; c.lineWidth = 3; c.beginPath(); c.moveTo(hx + (tgt.x < hx ? -60 : 60), 260); c.lineTo(tgt.x, tgt.y - 55); c.stroke();
    }
    // aviso sutil do estado
    if (h.state === 'look') D.text(c, 'O GUARDA VIROU', g.W / 2, 50, { size: 14, color: '#f55', align: 'center' });
  },

  // x do guarda na vista lateral 2D (a passarela de X_MIN..X_MAX vira a largura da mesa)
  hostX2d(h) { return 160 + (h.x - this.X_MIN) * 640 / (this.X_MAX - this.X_MIN); },

  drawHost(g, c) {
    const d = g.data, h = d.host, x = this.hostX2d(h), TY = this.TABLE_Y;
    const watching = h.state === 'look' || !!d.shot, face = d.shot ? 1 : h.face;
    const walkDir = h.vx > 0 ? 1 : -1, bob = h.state === 'walk' ? Math.sin(g.time * 9) * 3 : 0;
    // corpo de uniforme (estreito de perfil, largo de frente)
    const hw = 34 + 36 * face;
    c.fillStyle = '#2b3a6b'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - hw, TY - 150 + bob, hw * 2, 160, 20); c.fill(); c.stroke();
    c.fillStyle = '#1a1a1a'; c.fillRect(x + walkDir * (hw - 10) - 4, TY - 100 + bob, 8, 50);   // cassetete
    // cabeça e quepe
    const hh = 24 + 20 * face;
    c.fillStyle = '#8a8f99'; c.beginPath(); c.roundRect(x - hh, TY - 232 + bob, hh * 2, 78, 16); c.fill(); c.stroke();
    c.fillStyle = '#1d2a52'; c.fillRect(x - hh - 4, TY - 246 + bob, hh * 2 + 8, 18); c.fillRect(x - hh + 2, TY - 268 + bob, hh * 2 - 4, 26);
    c.fillStyle = '#111318'; c.fillRect(x - hh - 4 + (face < 0.5 ? (walkDir > 0 ? hh * 2 : -18) : 0), TY - 236 + bob, face < 0.5 ? 26 : hh * 2 + 8, 6);   // pala
    // olhos só aparecem quando ele vira (vermelhos quando está vigiando)
    if (face > 0.3) {
      c.fillStyle = watching ? '#ff2a2a' : '#7ff';
      c.fillRect(x - 28 * face, TY - 205 + bob, 18, 10); c.fillRect(x + 10 * face, TY - 205 + bob, 18, 10);
      if (watching) { c.fillStyle = 'rgba(255,40,40,0.25)'; c.beginPath(); c.arc(x - 19, TY - 200, 16, 0, Math.PI * 2); c.arc(x + 19, TY - 200, 16, 0, Math.PI * 2); c.fill(); }
    }
    // revólver apontando no tiro
    if (d.shot) {
      const tgt = { x: this.SEATS[d.shot.id % 4], y: TY };
      const side = tgt.x < x ? -1 : 1;
      const ang = Math.atan2(tgt.y - 55 - (TY - 120), tgt.x - (x + side * 60));
      c.save(); c.translate(x + side * 60, TY - 120); c.rotate(ang);
      c.fillStyle = '#16181c'; c.fillRect(-10, -8, 40, 16);
      c.fillStyle = '#555'; c.fillRect(28, -6, 26, 9); c.fillRect(28, 2, 10, 12);
      if (d.flashT > 0) { c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(60, -2, 14, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
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
