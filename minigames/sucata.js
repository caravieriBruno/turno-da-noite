// PLATAFORMAS DE SUCATA — inspirado em "DEBRIS PLATFORMS" (junk_platform) de Machine Party.
// Cada jogador tem uma plataforma sobre o vazio. Cubos de sucata despencam nas plataformas (a sombra avisa onde).
// Plataforma com mais de 5 cubos por 0,5 s desaba. AÇÃO pega um cubo e AÇÃO de novo arremessa — de preferência
// na plataforma dos outros. Cubo que acerta alguém derruba e atordoa. Caiu no vazio = eliminado.
TN.registerMinigame({
  id: 'sucata',
  title: 'PLATAFORMAS DE SUCATA',
  inspiredBy: 'Debris Platforms (junk_platform)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Cada um tem uma plataforma.', 'Sucata cai sem parar nela.', 'Mais de 5 cubos e ela desaba.', 'Jogue a sua sucata nos outros.'],
  controls: { move: 'andar', a: 'pegar / arremessar cubo' },
  icon: '▣',
  color: '#d98b3a',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (originais: intervalo 3,0 → 1,0 s nos primeiros 10 s, máx. 40 cubos, >5 cubos por 0,5 s desaba,
  //      impulso 15 (×1,4 arremessado)) ----
  SPEED: 175, CUBE: 24, MAX_CUBES: 40, LIMIT: 5, COLLAPSE_T: 0.5,
  DROP_Z: 320, GRAV: 900, THROW_V: 420, THROW_VZ: 270, THROW_Z: 26, THROW_DIST: 280,
  HIT_PUSH: 420, THROW_PUSH: 590, STUN: 0.6, PICK_R: 38, FALL_T: 0.55,
  HURRY_AT: 45, HARD_END: 110,

  // ---- mapa (o do original: 4 pilares redondos em 2×2 sobre o poço da casa de máquinas, de raio 6 m e a 26 m
  //      um do outro). O raio dá a mesma área das antigas chapas de 290 × 150; o vão entre pilares vizinhos
  //      (156 px) fica no alcance do arremesso, já o vão na diagonal não (como no original, que é bem mais largo).
  //      Com menos de 4 jogadores os pilares sobrando ficam vazios, só de cenário. ----
  PLAT_R: 110, PLAT_GAP: 310, CX: 480, CZ: 282,
  // ordem dos pilares: fundo-esq., fundo-dir., frente-dir., frente-esq.; 2 jogadores ficam lado a lado na frente
  SLOTS: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  slotsFor(n) { return n === 2 ? [3, 2] : n === 3 ? [0, 3, 2] : [0, 1, 2, 3].slice(0, n); },
  slotPos(i) { const [sx, sz] = this.SLOTS[i], h = this.PLAT_GAP / 2; return { x: this.CX + sx * h, y: this.CZ + sz * h }; },

  init(g) {
    const d = g.data, n = g.playerCount;
    d.plats = this.slotsFor(n).map((s, i) => ({ ...this.slotPos(s), r: this.PLAT_R, slot: s, owner: g.players[i].id, over: 0, dead: false, fallT: 0, shakeT: 0 }));
    d.cubes = []; d.nextCubeId = 1;
    d.nextDrop = 1.2;
    g.players.forEach((p, i) => {
      const pl = d.plats[i];
      p.x = pl.x; p.y = pl.y; p.dir = Math.PI / 2;
      p.data = { held: -1, stun: 0, falling: 0 };
    });
  },

  // ---------- auxiliares ----------
  // plataformas redondas: (pl.x, pl.y) é o centro e pl.r o raio
  platAt(g, x, y, pad = 0) {
    return g.data.plats.find((pl) => !pl.dead && Math.hypot(x - pl.x, y - pl.y) <= pl.r + pad) || null;
  },
  platOf(g, p) { return g.data.plats.find((pl) => pl.owner === p.id); },
  cubeById(g, id) { return g.data.cubes.find((cb) => cb.id === id) || null; },
  countOn(g, pl) {
    let n = 0;
    for (const cb of g.data.cubes) if (cb.state === 'ground' && Math.hypot(cb.x - pl.x, cb.y - pl.y) <= pl.r) n++;
    return n;
  },
  newCube(g, x, y, z, state) {
    const U = TN.util, d = g.data;
    const cb = { id: d.nextCubeId++, x, y, z, vx: 0, vy: 0, vz: 0, state, ang: U.rand(0, Math.PI), spin: U.rand(-3, 3), kind: U.randInt(0, 3), thrower: -1, age: 0, voidT: 0 };
    d.cubes.push(cb);
    return cb;
  },
  // derruba o jogador: impulso, atordoamento e larga o cubo que segurava
  knock(g, p, ix, iy, big) {
    const pd = p.data;
    g.push(p, ix, iy);
    pd.stun = this.STUN * (big ? 1.3 : 1);
    this.dropHeld(g, p);
    g.sfx('hit'); g.shake(big ? 6 : 4);
    g.particles(p.x, p.y, '#ffd28a', 10, 180);
  },
  dropHeld(g, p) {
    const cb = this.cubeById(g, p.data.held);
    p.data.held = -1;
    if (!cb) return;
    cb.state = 'air'; cb.x = p.x; cb.y = p.y; cb.z = 20; cb.vx = 0; cb.vy = 0; cb.vz = 60; cb.thrower = p.id; cb.age = 0;
  },

  update(g, dt) {
    const U = TN.util, d = g.data, a = g.arena;

    // ---- sucata despencando nas plataformas vivas ----
    if (g.time >= d.nextDrop) {
      const interval = g.time > this.HURRY_AT ? 0.6 : U.lerp(3.0, 1.0, Math.min(1, g.time / 10));
      d.nextDrop = g.time + interval;
      for (const pl of d.plats) {
        const owner = g.players.find((o) => o.id === pl.owner);
        if (pl.dead || !owner.alive || d.cubes.length >= this.MAX_CUBES) continue;
        const an = U.rand(0, Math.PI * 2), rr = (pl.r - 22) * Math.sqrt(Math.random());   // ponto sorteado no disco
        this.newCube(g, pl.x + Math.cos(an) * rr, pl.y + Math.sin(an) * rr, this.DROP_Z, 'drop');
      }
      g.sfx('whoosh');
    }
    if (g.time > this.HARD_END) g.finish(0.5);   // segurança (na prática nunca chega aqui)

    // ---- jogadores ----
    for (const p of g.alive()) {
      const pd = p.data;
      if (pd.falling > 0) {
        pd.falling -= dt;
        p.x += p.vx * dt * 0.3; p.y += p.vy * dt * 0.3;
        if (pd.falling <= 0) g.eliminate(p, { sound: 'lose', particles: false, msg: 'CAIU!' });
        continue;
      }
      pd.stun -= dt;
      if (pd.stun > 0) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, null); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt, null);
      g.decayPush(p, dt, 5);
      p.x = U.clamp(p.x, -200, g.W + 200); p.y = U.clamp(p.y, -200, g.H + 260);   // (fora das plataformas ele cai antes)

      if (pd.stun <= 0 && p.input.aPressed) {
        const held = this.cubeById(g, pd.held);
        if (held) { // arremessa na direção em que olha
          const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
          Object.assign(held, { state: 'air', x: p.x + fx * 18, y: p.y + fy * 18, z: this.THROW_Z, vx: fx * this.THROW_V, vy: fy * this.THROW_V, vz: this.THROW_VZ, thrower: p.id, age: 0 });
          pd.held = -1; g.sfx('jump');
        } else { // pega o cubo no chão mais perto
          let best = null, bd = this.PICK_R;
          for (const cb of d.cubes) {
            if (cb.state !== 'ground') continue;
            const dd = U.dist(p.x, p.y, cb.x, cb.y);
            if (dd < bd) { bd = dd; best = cb; }
          }
          if (best) { best.state = 'held'; pd.held = best.id; g.sfx('pickup'); }
        }
      }
      // cubo segurado acompanha o jogador
      const held = this.cubeById(g, pd.held);
      if (held) { held.x = p.x + Math.cos(p.dir) * 10; held.y = p.y + Math.sin(p.dir) * 10; held.z = 30; }
      // fora de qualquer plataforma = despenca
      if (!this.platAt(g, p.x, p.y, 2)) { pd.falling = this.FALL_T; this.dropHeld(g, p); g.sfx('whoosh'); }
    }
    U.separate(g.alive().filter((p) => p.data.falling <= 0));

    // ---- cubos ----
    for (const cb of d.cubes) {
      cb.age += dt;
      if (cb.state === 'drop' || cb.state === 'air') {
        cb.vz -= this.GRAV * dt; cb.z += cb.vz * dt;
        cb.x += cb.vx * dt; cb.y += cb.vy * dt; cb.ang += cb.spin * dt;
        // cubo arremessado acerta alguém no caminho
        if (cb.state === 'air' && cb.z < 42) {
          for (const p of g.alive()) {
            if (p.data.falling > 0 || (p.id === cb.thrower && cb.age < 0.4)) continue;
            if (U.dist(p.x, p.y, cb.x, cb.y) < p.r + this.CUBE * 0.6 && Math.hypot(cb.vx, cb.vy) > 80) {
              const n = U.norm(cb.vx, cb.vy);
              this.knock(g, p, n.x * this.THROW_PUSH, n.y * this.THROW_PUSH, true);
              cb.vx *= -0.2; cb.vy *= -0.2;
            }
          }
        }
        if (cb.z <= 0) {
          cb.z = 0;
          if (cb.state === 'drop') { // impacto da queda derruba quem estiver embaixo
            for (const p of g.alive()) {
              if (p.data.falling > 0) continue;
              const dd = U.dist(p.x, p.y, cb.x, cb.y);
              if (dd < p.r + this.CUBE * 0.6) { const n = dd > 1 ? U.norm(p.x - cb.x, p.y - cb.y) : { x: 1, y: 0 }; this.knock(g, p, n.x * this.HIT_PUSH, n.y * this.HIT_PUSH, false); }
            }
            g.particles(cb.x, cb.y, '#8a8f96', 6, 90);
          }
          const pl = this.platAt(g, cb.x, cb.y, -4);
          if (pl) { cb.state = 'ground'; cb.vx = 0; cb.vy = 0; cb.vz = 0; g.sfx('step'); }
          else cb.state = 'void';
        }
      } else if (cb.state === 'void') cb.voidT += dt;
      else if (cb.state === 'ground' && !this.platAt(g, cb.x, cb.y, 0)) cb.state = 'void';
    }
    d.cubes = d.cubes.filter((cb) => !(cb.state === 'void' && cb.voidT > 0.7));

    // ---- plataformas: mais de 5 cubos por 0,5 s → desaba ----
    for (const pl of d.plats) {
      if (pl.dead) { pl.fallT += dt; continue; }
      if (this.countOn(g, pl) > this.LIMIT) {
        if (pl.over === 0) g.sfx('buzz');
        pl.over += dt;
        if (pl.over >= this.COLLAPSE_T) {
          pl.dead = true; pl.fallT = 0;
          g.sfx('boom'); g.shake(10);
          g.particles(pl.x, pl.y, '#8a8f96', 40, 300);
          for (const p of g.alive()) {
            if (p.data.falling > 0) continue;
            if (Math.hypot(p.x - pl.x, p.y - pl.y) <= pl.r + 2) {
              p.data.falling = this.FALL_T; this.dropHeld(g, p); g.popup('DESABOU!', p.x, p.y - 40, '#f55');
            }
          }
        }
      } else pl.over = 0;
    }
  },

  // ---------- bot ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (pd.falling > 0 || pd.stun > 0) return { x: 0, y: 0 };
    const home = this.platAt(g, p.x, p.y) || this.platOf(g, p);
    const M = 28;
    const inside = (x, y, m = M) => {   // ponto mais próximo dentro do disco (com margem)
      const dx = x - home.x, dy = y - home.y, dd = Math.hypot(dx, dy), lim = home.r - m;
      return dd <= lim ? { x, y } : { x: home.x + (dx / dd) * lim, y: home.y + (dy / dd) * lim };
    };
    const pulse = (want) => { const v = want && !pd.bPrevA; pd.bPrevA = v; return v; };
    let goal = null, act = false, face = null;

    const held = this.cubeById(g, pd.held);
    if (held) {
      // mira a plataforma rival com mais cubos (para fazer desabar); a escolha vale para o cubo inteiro
      // (sortear a cada quadro entre rivais empatados deixava o bot indeciso, sem nunca arremessar)
      if (!pd.bAim || pd.bAim.cube !== held.id || !d.plats.some((pl) => pl.slot === pd.bAim.slot && !pl.dead)) {
        let best = null, bc = -1;
        for (const pl of d.plats) {
          if (pl.dead || pl === home) continue;
          const cnt = this.countOn(g, pl) + U.rand(0, 0.9);
          if (cnt > bc) { bc = cnt; best = pl; }
        }
        pd.bAim = { cube: held.id, slot: best ? best.slot : -1, ox: U.rand(-0.4, 0.4), oy: U.rand(-0.4, 0.4), wait: U.rand(0.35, 1.1) };
      }
      const target = d.plats.find((pl) => pl.slot === pd.bAim.slot && !pl.dead && pl !== home) || null;
      if (target) {
        // ponto de mira com erro e um tempinho de "pontaria" antes de arremessar; arremessa da beirada
        const T = { x: target.x + target.r * pd.bAim.ox, y: target.y + target.r * pd.bAim.oy };
        const n = U.norm(T.x - p.x, T.y - p.y);
        goal = inside(T.x - n.x * this.THROW_DIST, T.y - n.y * this.THROW_DIST, 16);
        if (U.dist(p.x, p.y, goal.x, goal.y) < 14) {
          pd.bAim.wait -= dt;
          if (pd.bAim.wait > 0) return { x: 0, y: 0 };   // parado mirando
          face = n; act = true;                           // vira e arremessa no mesmo quadro
        }
      } else { // não sobrou rival: joga no vazio, para fora do pilar
        const dx = p.x - home.x, dy = p.y - home.y;
        face = Math.hypot(dx, dy) > 4 ? U.norm(dx, dy) : { x: 0, y: 1 }; act = true;
      }
    } else {
      // pega o cubo no chão mais perto da própria plataforma
      let best = null, bd = 1e9;
      for (const cb of d.cubes) {
        if (cb.state !== 'ground' || Math.hypot(cb.x - home.x, cb.y - home.y) > home.r) continue;
        const dd = U.dist(p.x, p.y, cb.x, cb.y);
        if (dd < bd) { bd = dd; best = cb; }
      }
      if (best) { goal = inside(best.x, best.y); if (bd < this.PICK_R - 8) act = true; }
      else {
        if (!pd.bWander || U.chance(0.01)) pd.bWander = { x: U.rand(-40, 40), y: U.rand(-25, 25) };
        goal = inside(home.x + pd.bWander.x, home.y + pd.bWander.y);
      }
    }
    // foge das sombras de cubos que estão caindo
    let fx = 0, fy = 0;
    for (const cb of d.cubes) {
      if (cb.state !== 'drop' || cb.z > 260) continue;
      const dx = p.x - cb.x, dy = p.y - cb.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < 44) { fx += (dx / dd) * 2; fy += (dy / dd) * 2; }
    }
    if (fx || fy) { const s = inside(p.x + fx * 30, p.y + fy * 30); const n = U.norm(s.x - p.x, s.y - p.y); return { x: n.x, y: n.y }; }
    if (face) return { x: face.x, y: face.y, a: pulse(act) };
    const dx = goal.x - p.x, dy = goal.y - p.y, dd = Math.hypot(dx, dy);
    const n = U.norm(dx, dy), sp = dd < 8 ? 0 : Math.min(1, dd / 30);
    return { x: n.x * sp, y: n.y * sp, a: pulse(act) };
  },

  // ---------- desenho ----------
  CUBE_COLORS: [['#8a5a3a', '#5e3b24'], ['#7d8590', '#555c66'], ['#5d7a4a', '#3e5531'], ['#a0763a', '#6e5024']],
  drawCube(c, cb, x, y, s) {
    const [f, e] = this.CUBE_COLORS[cb.kind], h = (this.CUBE * s) / 2;
    c.save(); c.translate(x, y); c.rotate(cb.ang);
    c.fillStyle = f; c.strokeStyle = '#111'; c.lineWidth = 2;
    c.fillRect(-h, -h, h * 2, h * 2); c.strokeRect(-h, -h, h * 2, h * 2);
    c.strokeStyle = e; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-h + 3, -h + 3); c.lineTo(h - 3, h - 3); c.moveTo(-h + 3, h * 0.2); c.lineTo(h * 0.2, -h + 3); c.stroke();
    c.fillStyle = e; c.fillRect(h * 0.3, h * 0.3, h * 0.5, h * 0.5);
    c.restore();
  },

  // ---------- 3D (câmera fixa) ----------
  // Pilares redondos e altos (caixas d'água velhas da casa de máquinas da cadeia) sobre o poço, como no
  // original. O topo tem os anéis concêntricos do original, que aqui são o marcador de cubos: acendem de
  // dentro para fora (verde → vermelho) e piscam acima do limite. A borda acende na cor do dono. Ao desabar,
  // a prensa da oficina desce sobre o pilar e o tampo despenca no poço.
  camera: { pos: [480, 396, 730], target: [480, 0, 396], fov: 50 },
  env: { bg: '#161922', fog: [700, 1700], ambient: 0.75, sun: 2.1, sunDir: [-0.2, 1, 0.35], sunColor: '#dfe9ea' },
  RING_COLORS: ['#3cff5a', '#9dff3c', '#e6ff3c', '#ffd23c', '#ff8a2c', '#ff2a2a'],

  // um pilar: corpo enferrujado com cintas e nervuras, tampo e os anéis (cnt = cubos; -1 = sem dono)
  drawPillar(g, r, x, z, y, R, cnt, over, tilt) {
    r.cyl(x, y - 900, z, R + 8, 886, '#4a4239', { metal: 0.45, rough: 0.7 });
    for (let k = 0; k < 4; k++) r.cyl(x, y - 70 - k * 150, z, R + 12, 16, '#2c2925', { metal: 0.6 });
    for (let k = 0; k < 10; k++) {
      const an = (k / 10) * Math.PI * 2 + 0.2;
      r.box(x + Math.cos(an) * (R + 10), y - 640, z + Math.sin(an) * (R + 10), 8, 620, 8, '#3a342e', { rotY: -an, metal: 0.5 });
    }
    r.cyl(x, y - 16, z, R + 13, 16, '#37322c', { metal: 0.55, rough: 0.5, ...tilt });   // tampo
    r.disc(x, y + 0.3, z, R + 2, '#26231f', { ...tilt });
    if (tilt.rotZ) return;
    const pisca = over > 0 && Math.floor(g.time * 5) % 2 === 0;   // pisca a 0,1 s, como o alarme do original
    for (let i = 0; i < this.LIMIT + 1; i++) {
      const ri = R * (0.16 + 0.135 * i), on = i < cnt;
      const col = on ? (over > 0 || cnt > this.LIMIT ? (pisca ? '#5a0a0a' : '#ff2a2a') : this.RING_COLORS[i]) : '#5f5b53';
      r.ring(x, y + 0.6, z, ri, ri + R * 0.075, col, on ? { glow: true } : { tex: false });
    }
    r.disc(x, y + 0.6, z, R * 0.07, cnt > 0 ? this.RING_COLORS[0] : '#5f5b53', cnt > 0 ? { glow: true } : { tex: false });
  },

  draw3d(g, r) {
    const U = TN.util, d = g.data;
    const q = (v) => Math.round(U.clamp(v, 0, 1) * 10) / 10;
    const lights = [];
    const CX = this.CX, CZ = this.CZ, R = this.PLAT_R, H = this.PLAT_GAP / 2;
    // ---- o poço da casa de máquinas: paredão do fundo, escada de manutenção no meio, canos e caldeiras ----
    r.plane(CX, -900, CZ, 3200, 2600, '#0b0d12');
    r.box(CX, -900, CZ - H - R - 150, 1500, 900, 30, '#2b2a2c', { metal: 0.3 });
    for (let k = 0; k < 5; k++) r.box(CX - 600 + k * 300, -900, CZ - H - R - 130, 90, 900, 20, '#34312d', { metal: 0.5 });
    for (const y of [-40, -110, -200]) r.tube(CX - 760, y, CZ - H - R - 120, CX + 760, y, CZ - H - R - 120, 9, '#4d4038', { metal: 0.5 });
    // escada/passarela de manutenção entre os pilares, do fundo até a frente
    const z0 = CZ - H - R - 120, z1 = CZ + H + R + 260, ly = -34;
    for (const s of [-1, 1]) r.box(CX + s * 24, ly, (z0 + z1) / 2, 6, 6, z1 - z0, '#3d3833', { metal: 0.6 });
    for (let z = z0 + 10; z < z1; z += 32) r.box(CX, ly + 1, z, 48, 3, 5, '#2f2b27', { metal: 0.6 });
    for (const s of [-1, 1]) r.tube(CX + s * 44, -70, z0, CX + s * 44, -70, z1, 7, '#39443f', { metal: 0.5 });
    // canos e vigas dos lados, em várias profundidades (somem na névoa)
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const x = CX + s * (H + R + 70 + k * 46), y = -50 - k * 55;
        r.tube(x, y, CZ - H - R - 120, x, y, CZ + H + R + 300, 7 + (k % 2) * 4, k % 2 ? '#4d4038' : '#3b3f3c', { metal: 0.5 });
      }
      for (const zz of [CZ - H, CZ + H]) r.tube(CX + s * (H + R + 6), -60, zz, CX + s * 700, -60, zz, 10, '#4a3b30', { metal: 0.5 });   // canos que saem dos pilares
      r.tube(CX + s * 640, -170, CZ - 260, CX + s * 640, -170, CZ + 120, 48, '#3e3a35', { metal: 0.5 });   // caldeira
      r.box(CX + s * 640, -260, CZ - 70, 70, 90, 50, '#2c2925', { metal: 0.5 });
      for (let k = 0; k < 4; k++) r.box(CX + s * 560, -400, CZ - 300 + k * 230, 14, 400, 14, '#262421', { metal: 0.5 });   // pilaretes
    }
    // ---- pilares: os de jogo e, com menos de 4 jogadores, os que sobram (vazios) ----
    const platY = (pl) => (pl.dead ? -0.5 * 900 * pl.fallT * pl.fallT : 0);
    const usados = new Set(d.plats.map((pl) => pl.slot));
    for (let s = 0; s < 4; s++) if (!usados.has(s)) { const c = this.slotPos(s); this.drawPillar(g, r, c.x, c.y, 0, R, 0, 0, {}); }
    for (const pl of d.plats) {
      if (pl.dead && pl.fallT > 1.4) continue;
      const owner = g.players.find((o) => o.id === pl.owner);
      const cnt = this.countOn(g, pl);
      const sh = pl.over > 0 ? Math.sin(g.time * 70) * 3 : 0;
      const y = platY(pl), cx = pl.x + sh, cz = pl.y;
      const tilt = pl.dead ? { rotZ: pl.fallT * 0.5, rotX: pl.fallT * 0.25 } : {};
      this.drawPillar(g, r, cx, cz, y, pl.r, cnt, pl.over, tilt);
      // prensa da oficina: desce de cima e esmaga o tampo quando a plataforma desaba
      if (pl.dead) {
        // (só aparece perto do tampo: lá no alto, colada na câmera, ela taparia a tela)
        const t = pl.fallT, yp = t < 0.1 ? 150 * (1 - t / 0.1) : t < 0.45 ? 0 : (t - 0.45) * 600;   // desce, esmaga, sobe
        if (yp < 150) {
          r.box(cx, yp + 8, cz, pl.r * 1.4, 34, pl.r * 1.4, '#4a443d', { metal: 0.6, rough: 0.5 });
          r.box(cx, yp, cz, pl.r * 1.5, 8, pl.r * 1.5, '#c9a400', { metal: 0.4 });
          r.box(cx, yp + 42, cz, 22, 90, 22, '#2f2b27', { metal: 0.6 });
        }
        continue;
      }
      // borda acesa na cor do dono
      r.ring(cx, 0.8, cz, pl.r + 3, pl.r + 9, owner.alive ? owner.color : '#555555', { glow: true });
      if (pl.over > 0 || cnt > this.LIMIT) lights.unshift([cx, 60, cz, '#ff3020', 1.2 + Math.sin(g.time * 30) * 0.6, 320]);
      r.label(cx, 2, cz + pl.r + 22, owner.label, owner.alive ? owner.color : '#777', 13);
    }
    // ---- cubos ----
    for (const cb of d.cubes) {
      const [col] = this.CUBE_COLORS[cb.kind], S = this.CUBE;
      let y = 0;
      if (cb.state === 'drop' || cb.state === 'air') y = cb.z;
      else if (cb.state === 'held') y = 64;            // carregado acima da cabeça (não esconde o boneco)
      else if (cb.state === 'void') y = cb.z - 0.5 * 900 * cb.voidT * cb.voidT;
      const o = { rotY: -cb.ang, metal: cb.kind === 1 ? 0.7 : 0.3, rough: 0.6 };
      if (cb.state === 'drop' || cb.state === 'air') { o.rotX = cb.ang * 0.6; }
      r.box(cb.x, y, cb.y, S, S, S, col, o);
      r.box(cb.x, y + S, cb.y, S * 0.5, 2, S * 0.5, this.CUBE_COLORS[cb.kind][1], { rotY: -cb.ang });
      // aviso no chão (só para o que está caindo sobre uma plataforma)
      if ((cb.state === 'drop' || cb.state === 'air') && this.platAt(g, cb.x, cb.y)) {
        const t = 1 - Math.min(1, cb.z / this.DROP_Z);
        r.disc(cb.x, 0.6, cb.y, 6 + 10 * t, '#000000', { opacity: q(0.25 + 0.35 * t) });
        if (cb.state === 'drop') r.ring(cb.x, 0.8, cb.y, 15 - 6 * t, 18 - 6 * t, '#ff503c', { glow: true, opacity: q(0.4 + 0.5 * t) });
      }
    }
    // ---- luzes de trabalho (uma por plataforma) ----
    for (const pl of d.plats) if (!pl.dead) lights.push([pl.x, 240, pl.y, '#d6ecee', 1.0, 480]);
    for (const l of lights.slice(0, 6)) r.light(...l);
    // ---- jogadores ----
    for (const p of g.players) {
      if (!p.alive) continue;                      // quem caiu sumiu no abismo
      const pd = p.data;
      if (pd.falling > 0) {
        const t = this.FALL_T - pd.falling;
        r.character(p, { pose: 'fall', y: -0.5 * 900 * t * t });
        continue;
      }
      r.character(p, { pose: pd.held >= 0 ? 'hold' : 'auto', flash: pd.stun > 0 && Math.floor(g.time * 12) % 2 === 0 });
    }
  },

  draw(g, c) {
    const D = TN.draw, d = g.data;
    // vazio: fundo escuro com linhas de profundidade
    const bg = c.createRadialGradient(g.W / 2, g.H / 2, 40, g.W / 2, g.H / 2, 560);
    bg.addColorStop(0, '#11161f'); bg.addColorStop(1, '#030407');
    c.fillStyle = bg; c.fillRect(0, 0, g.W, g.H);
    c.strokeStyle = 'rgba(80,110,150,0.10)'; c.lineWidth = 1;
    for (let k = 0; k < 24; k++) {
      const an = (k / 24) * Math.PI * 2;
      c.beginPath(); c.moveTo(g.W / 2 + Math.cos(an) * 30, g.H / 2 + Math.sin(an) * 30); c.lineTo(g.W / 2 + Math.cos(an) * 700, g.H / 2 + Math.sin(an) * 700); c.stroke();
    }
    // o 2×2 de pilares passa da altura da tela: encolhe o mundo para caber abaixo do HUD
    const ext = this.PLAT_GAP / 2 + this.PLAT_R + 30, k2 = Math.min(1, (g.H - 44) / (2 * ext));
    c.save(); c.translate(this.CX, 44 + (g.H - 44) / 2); c.scale(k2, k2); c.translate(-this.CX, -this.CZ);
    for (const cb of d.cubes) if (cb.state === 'void') { // cubos sumindo no vazio
      const k = Math.max(0, 1 - cb.voidT / 0.7);
      c.globalAlpha = k; this.drawCube(c, cb, cb.x, cb.y, 0.4 + 0.6 * k); c.globalAlpha = 1;
    }
    // plataformas
    for (const pl of d.plats) {
      const owner = g.players.find((o) => o.id === pl.owner);
      let k = 1;
      if (pl.dead) { k = 1 - pl.fallT / 0.9; if (k <= 0) continue; }
      const cnt = this.countOn(g, pl);
      const sh = pl.over > 0 ? Math.sin(g.time * 70) * 3 : 0;
      c.save(); c.translate(pl.x + sh, pl.y); c.scale(k, k); c.globalAlpha = Math.max(0, k);
      const R = pl.r;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(8, 10, R + 6, 0, Math.PI * 2); c.fill();   // sombra
      c.fillStyle = '#3a3530'; c.beginPath(); c.arc(0, 0, R + 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#26231f'; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
      // anéis do marcador de cubos (acendem de dentro para fora)
      for (let i = 0; i < this.LIMIT + 1; i++) {
        c.strokeStyle = i < cnt ? (pl.over > 0 || cnt > this.LIMIT ? '#f33' : this.RING_COLORS[i]) : 'rgba(255,255,255,0.18)';
        c.lineWidth = R * 0.075; c.beginPath(); c.arc(0, 0, R * (0.2 + 0.135 * i), 0, Math.PI * 2); c.stroke();
      }
      c.strokeStyle = owner.alive ? owner.color : '#555'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, R + 4, 0, Math.PI * 2); c.stroke();
      c.restore(); c.globalAlpha = 1;
      if (!pl.dead) D.text(c, owner.label, pl.x, pl.y + pl.r + 22, { size: 13, color: owner.alive ? owner.color : '#777', align: 'center' });
    }
    // cubos no chão, sombras de queda
    for (const cb of d.cubes) if (cb.state === 'ground') this.drawCube(c, cb, cb.x, cb.y, 1);
    for (const cb of d.cubes) if (cb.state === 'drop' || cb.state === 'air') {
      const t = 1 - Math.min(1, cb.z / this.DROP_Z);
      c.fillStyle = `rgba(0,0,0,${0.25 + 0.35 * t})`;
      c.beginPath(); c.ellipse(cb.x, cb.y, 6 + 10 * t, 4 + 6 * t, 0, 0, Math.PI * 2); c.fill();
      if (cb.state === 'drop') { c.strokeStyle = `rgba(255,80,60,${0.4 + 0.4 * t})`; c.lineWidth = 2; c.beginPath(); c.arc(cb.x, cb.y, 18 - 6 * t, 0, Math.PI * 2); c.stroke(); }
    }
    // jogadores (caindo = encolhendo)
    for (const p of g.players) {
      if (!p.alive) continue;
      if (p.data.falling > 0) {
        const k = p.data.falling / this.FALL_T;
        c.globalAlpha = k; D.robot(c, p.x, p.y, p.r * (0.3 + 0.7 * k), p.color, { dir: p.dir }); c.globalAlpha = 1;
      } else g.drawPlayer(c, p, { flash: p.data.stun > 0 && Math.floor(g.time * 12) % 2 === 0 });
    }
    // cubos no ar e segurados (por cima de tudo, com altura falsa)
    for (const cb of d.cubes) {
      if (cb.state === 'drop' || cb.state === 'air' || cb.state === 'held') this.drawCube(c, cb, cb.x, cb.y - cb.z * 0.6, cb.state === 'held' ? 0.8 : 1 + cb.z / 500);
    }
    c.restore();
  },
});
