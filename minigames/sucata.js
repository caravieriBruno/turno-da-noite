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

  init(g) {
    const d = g.data, n = g.playerCount;
    // plataformas: 2×2 para 4 jogadores, em fila para 2 ou 3
    d.plats = [];
    if (n === 4) {
      for (let i = 0; i < 4; i++) d.plats.push({ x: i % 2 ? 555 : 115, y: i < 2 ? 92 : 318, w: 290, h: 150 });
    } else {
      const w = n === 3 ? 240 : 300, gap = n === 3 ? 80 : 200, x0 = 480 - (n * w + (n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) d.plats.push({ x: x0 + i * (w + gap), y: 160, w, h: 200 });
    }
    d.plats.forEach((pl, i) => Object.assign(pl, { owner: g.players[i].id, over: 0, dead: false, fallT: 0, shakeT: 0 }));
    d.cubes = []; d.nextCubeId = 1;
    d.nextDrop = 1.2;
    g.players.forEach((p, i) => {
      const pl = d.plats[i];
      p.x = pl.x + pl.w / 2; p.y = pl.y + pl.h / 2; p.dir = Math.PI / 2;
      p.data = { held: -1, stun: 0, falling: 0 };
    });
  },

  // ---------- auxiliares ----------
  platAt(g, x, y, pad = 0) {
    return g.data.plats.find((pl) => !pl.dead && x >= pl.x - pad && x <= pl.x + pl.w + pad && y >= pl.y - pad && y <= pl.y + pl.h + pad) || null;
  },
  platOf(g, p) { return g.data.plats.find((pl) => pl.owner === p.id); },
  cubeById(g, id) { return g.data.cubes.find((cb) => cb.id === id) || null; },
  countOn(g, pl) {
    let n = 0;
    for (const cb of g.data.cubes) if (cb.state === 'ground' && cb.x >= pl.x && cb.x <= pl.x + pl.w && cb.y >= pl.y && cb.y <= pl.y + pl.h) n++;
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
        this.newCube(g, U.rand(pl.x + 22, pl.x + pl.w - 22), U.rand(pl.y + 22, pl.y + pl.h - 22), this.DROP_Z, 'drop');
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
      p.x = U.clamp(p.x, 4, g.W - 4); p.y = U.clamp(p.y, 38, g.H - 4);

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
          g.particles(pl.x + pl.w / 2, pl.y + pl.h / 2, '#8a8f96', 40, 300);
          for (const p of g.alive()) {
            if (p.data.falling > 0) continue;
            if (p.x >= pl.x - 2 && p.x <= pl.x + pl.w + 2 && p.y >= pl.y - 2 && p.y <= pl.y + pl.h + 2) {
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
    const inside = (x, y) => ({ x: U.clamp(x, home.x + M, home.x + home.w - M), y: U.clamp(y, home.y + M, home.y + home.h - M) });
    const pulse = (want) => { const v = want && !pd.bPrevA; pd.bPrevA = v; return v; };
    let goal = null, act = false, face = null;

    const held = this.cubeById(g, pd.held);
    if (held) {
      // mira a plataforma rival com mais cubos (para fazer desabar)
      let target = null, bc = -1;
      for (const pl of d.plats) {
        if (pl.dead || pl === home) continue;
        const cnt = this.countOn(g, pl) + U.rand(0, 0.9);
        if (cnt > bc) { bc = cnt; target = pl; }
      }
      if (target) {
        // ponto de mira com erro (sorteado ao pegar o cubo) e um tempinho de "pontaria" antes de arremessar
        if (!pd.bAim || pd.bAim.cube !== held.id) pd.bAim = { cube: held.id, ox: U.rand(-0.45, 0.45), oy: U.rand(-0.45, 0.45), wait: U.rand(0.35, 1.1) };
        const T = { x: target.x + target.w * (0.5 + pd.bAim.ox), y: target.y + target.h * (0.5 + pd.bAim.oy) };
        const n = U.norm(T.x - p.x, T.y - p.y);
        goal = inside(T.x - n.x * this.THROW_DIST, T.y - n.y * this.THROW_DIST);
        if (U.dist(p.x, p.y, goal.x, goal.y) < 14) {
          pd.bAim.wait -= dt;
          if (pd.bAim.wait > 0) return { x: 0, y: 0 };   // parado mirando
          face = n; act = true;                           // vira e arremessa no mesmo quadro
        }
      } else { // não sobrou rival: joga no vazio mais perto
        const out = [{ x: -1, y: 0, d: p.x - home.x }, { x: 1, y: 0, d: home.x + home.w - p.x }, { x: 0, y: -1, d: p.y - home.y }, { x: 0, y: 1, d: home.y + home.h - p.y }].sort((a, b) => a.d - b.d)[0];
        face = out; act = true;
      }
    } else {
      // pega o cubo no chão mais perto da própria plataforma
      let best = null, bd = 1e9;
      for (const cb of d.cubes) {
        if (cb.state !== 'ground' || cb.x < home.x || cb.x > home.x + home.w || cb.y < home.y || cb.y > home.y + home.h) continue;
        const dd = U.dist(p.x, p.y, cb.x, cb.y);
        if (dd < bd) { bd = dd; best = cb; }
      }
      if (best) { goal = inside(best.x, best.y); if (bd < this.PICK_R - 8) act = true; }
      else {
        if (!pd.bWander || U.chance(0.01)) pd.bWander = { x: U.rand(-40, 40), y: U.rand(-25, 25) };
        goal = inside(home.x + home.w / 2 + pd.bWander.x, home.y + home.h / 2 + pd.bWander.y);
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
  // Plataformas de chapa sobre pilares num abismo escuro (névoa engole o fundo). Borda acesa na cor do dono,
  // marcador de cubos (6 luzes), sucata caindo do alto com anel vermelho de aviso no chão, plataforma
  // tremendo/avermelhando antes de desabar e despencando (y negativo) com o pilar.
  camera: { pos: [480, 660, 820], target: [480, -20, 282], fov: 41 },
  env: { bg: '#04060a', fog: [850, 1500], ambient: 0.75, sun: 2.3, sunDir: [-0.35, 1, 0.45], sunColor: '#ffe6c8' },

  draw3d(g, r) {
    const U = TN.util, d = g.data;
    const q = (v) => Math.round(U.clamp(v, 0, 1) * 10) / 10;
    const lights = [];
    // ---- ferro-velho do pátio: laje de cimento em volta de um fosso, com sucata encostada no muro ----
    const PX0 = 16, PX1 = 944, PZ0 = 20, PZ1 = 540, lj = '#3b3934';
    r.yard(-60, -60, 1020, 580, { floor: false });
    r.plane(480, 0, (PZ0 - 700) / 2, 2600, PZ0 + 700, lj);
    r.plane((PX0 - 1200) / 2, 0, 900, PX0 + 1200, 1800, lj);
    r.plane((PX1 + 2160) / 2, 0, 900, 2160 - PX1, 1800, lj);
    r.plane(480, 0, (PZ1 + 1800) / 2, PX1 - PX0, 1800 - PZ1, lj);
    for (const [x, z, w, dd] of [[480, PZ0, PX1 - PX0, 10], [480, PZ1, PX1 - PX0, 10], [PX0, (PZ0 + PZ1) / 2, 10, PZ1 - PZ0], [PX1, (PZ0 + PZ1) / 2, 10, PZ1 - PZ0]]) r.box(x, -700, z, w, 700, dd, '#2a2926');
    for (let k = 0; k < 15; k++) r.box(PX0 + 30 + k * 62, -2, PZ1 + 8, 30, 3, 6, k % 2 ? '#141414' : '#c9a400', { shadow: false });
    for (const [x, z, n] of [[-25, 0, 'pneu'], [-5, -30, 'tambor'], [985, 10, 'tambor'], [960, -32, 'pneu'], [990, 70, 'pneu']]) r.prop(n, x, z, { rotY: x * 0.01 });
    // ---- abismo: fundo distante e vigas perdidas na névoa ----
    r.plane(480, -700, 280, 3000, 2400, '#0a0e14');
    for (const [x, z] of [[20, 40], [940, 40], [480, 10], [250, 0], [710, 0]]) r.box(x, -700, z, 18, 640, 18, '#1a1f26', { metal: 0.5 });
    // ---- plataformas ----
    const platY = (pl) => (pl.dead ? -0.5 * 900 * pl.fallT * pl.fallT : 0);
    for (const pl of d.plats) {
      if (pl.dead && pl.fallT > 1.4) continue;
      const owner = g.players.find((o) => o.id === pl.owner);
      const cnt = this.countOn(g, pl);
      const sh = pl.over > 0 ? Math.sin(g.time * 70) * 3 : 0;
      const y = platY(pl), cx = pl.x + pl.w / 2 + sh, cz = pl.y + pl.h / 2;
      const tilt = pl.dead ? { rotZ: pl.fallT * 0.5, rotX: pl.fallT * 0.25 } : {};
      r.box(cx, y - 26, cz, pl.w, 26, pl.h, '#4a525c', { metal: 0.55, rough: 0.5, ...tilt });
      r.cyl(cx, y - 700, cz, 30, 674, '#262b31', { metal: 0.5, sides: 8 });
      if (pl.dead) continue;
      // juntas da chapa e faixas zebradas nas bordas de cima e de baixo
      for (let x = pl.x + 58; x < pl.x + pl.w - 10; x += 58) r.plane(x + sh, 0.2, cz, 1.5, pl.h - 12, '#30353c');
      r.plane(cx, 0.2, cz, pl.w, 1.5, '#30353c');
      const n = 10, sw = pl.w / n;
      for (let k = 0; k < n; k++) for (const ez of [pl.y + 3, pl.y + pl.h - 3]) r.box(pl.x + sh + (k + 0.5) * sw, 0, ez, sw, 1, 6, k % 2 ? '#141414' : '#f5c400', { shadow: false });
      // borda acesa na cor do dono
      const bc = owner.alive ? owner.color : '#555555';
      r.box(cx, -6, pl.y - 1, pl.w + 4, 4, 2, bc, { glow: true });
      r.box(cx, -6, pl.y + pl.h + 1, pl.w + 4, 4, 2, bc, { glow: true });
      r.box(pl.x - 1 + sh, -6, cz, 2, 4, pl.h + 4, bc, { glow: true });
      r.box(pl.x + pl.w + 1 + sh, -6, cz, 2, 4, pl.h + 4, bc, { glow: true });
      // alerta de sobrecarga
      if (pl.over > 0 || cnt > this.LIMIT) {
        r.plane(cx, 0.5, cz, pl.w, pl.h, '#ff2828', { glow: true, opacity: q(0.15 + 0.15 * Math.sin(g.time * 30)) });
        lights.unshift([cx, 60, cz, '#ff3020', 1.2 + Math.sin(g.time * 30) * 0.6, 320]);
      }
      // marcador de cubos (6 luzes) no canto de trás e nome do dono
      for (let i = 0; i < this.LIMIT + 1; i++) {
        const on = i < cnt;
        r.box(pl.x + pl.w - 14 - i * 12 + sh, 0, pl.y + 14, 9, on ? 4 : 2, 9, on ? (cnt > this.LIMIT ? '#ff3333' : '#d98b3a') : '#2a2e34', on ? { glow: true } : {});
      }
      r.label(pl.x + 22, 8, pl.y + 14, owner.label, owner.alive ? owner.color : '#777', 13);
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
    for (const pl of d.plats) if (!pl.dead) lights.push([pl.x + pl.w / 2, 240, pl.y + pl.h / 2, '#ffd9a8', 1.0, 480]);
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
      r.character(p, { pose: pd.held >= 0 ? 'arms' : 'auto', flash: pd.stun > 0 && Math.floor(g.time * 12) % 2 === 0 });
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
      c.save(); c.translate(pl.x + pl.w / 2 + sh, pl.y + pl.h / 2); c.scale(k, k); c.globalAlpha = Math.max(0, k);
      const x = -pl.w / 2, y = -pl.h / 2;
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 8, y + 10, pl.w, pl.h);           // sombra
      D.floor(c, x, y, pl.w, pl.h, { tile: 30, a: '#3a4048', b: '#353b42' });
      if (pl.over > 0 || cnt > this.LIMIT) { c.fillStyle = `rgba(255,40,40,${0.15 + 0.15 * Math.sin(g.time * 30)})`; c.fillRect(x, y, pl.w, pl.h); }
      D.hazardStripes(c, x, y, pl.w, 6, 7); D.hazardStripes(c, x, y + pl.h - 6, pl.w, 6, 7);
      c.strokeStyle = owner.alive ? owner.color : '#555'; c.lineWidth = 3; c.strokeRect(x, y, pl.w, pl.h);
      c.restore(); c.globalAlpha = 1;
      if (!pl.dead) {
        D.text(c, owner.label, pl.x + 8, pl.y + 18, { size: 13, color: owner.alive ? owner.color : '#777' });
        // contador de cubos (vermelho acima do limite)
        for (let i = 0; i < this.LIMIT + 1; i++) {
          c.fillStyle = i < cnt ? (cnt > this.LIMIT ? '#f33' : '#d98b3a') : 'rgba(255,255,255,0.12)';
          c.fillRect(pl.x + pl.w - 14 - i * 12, pl.y + 12, 9, 9);
        }
      }
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
  },
});
