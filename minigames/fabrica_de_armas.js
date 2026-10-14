// LINHA DE MONTAGEM — inspirado em "FIREARM FACTORY" (manufacture_gun) de Machine Party.
// Cada robô tem uma bancada num canto da fábrica e uma receita de 5 peças em ordem.
// Pegue as peças espalhadas pelo chão, insira na bancada na ordem certa, pegue a arma pronta
// e atire nos colegas. +1 por arma montada, +1 por abate, +1 para o último de pé.
TN.registerMinigame({
  id: 'fabrica_de_armas',
  title: 'LINHA DE MONTAGEM',
  inspiredBy: 'Firearm Factory (manufacture_gun)',
  tagline: 'SIGA A RECEITA. ATIRE PARA MATAR.',
  brief: [
    'Leve as 5 peças à sua bancada na ordem da receita.',
    'Peça errada não entra: confira a peça piscando na bancada.',
    'Com a arma montada, atire nos outros (recarga de 3 s).',
    '+1 por arma, +1 por abate, +1 para o último de pé.',
  ],
  controls: { move: 'andar', a: 'pegar peça / pegar arma / atirar', b: 'inserir na bancada / largar' },
  icon: '⚙',
  color: '#ffb02e',
  rounds: 3,
  timeLimit: 90,              // segurança: a rodada sempre termina
  scoring: 'points',
  endWhenOneLeft: true,

  // ---- constantes (originais: 5 peças, cola nunca primeiro, recarga 3,0 s) ----
  SPEED: 175, PICK_R: 30, BENCH_REACH: 18,
  SHOT_RANGE: 170, SHOT_HALF: 0.24, COOLDOWN: 3,
  RESPAWN: 3, MAX_FLOOR: 12, START_PARTS: 10,
  TYPES: ['engrenagem', 'cano', 'cola', 'chapa', 'modulo'],
  NAMES: { engrenagem: 'ENGRENAGEM', cano: 'CANO', cola: 'COLA', chapa: 'CHAPA', modulo: 'MÓDULO' },

  init(g) {
    const U = TN.util, a = g.arena, d = g.data;
    const BW = 128, BH = 54;
    // bancadas nos 4 cantos (índice = id do jogador)
    d.benches = [
      { x: a.x + 14, y: a.y + 12 }, { x: a.x + a.w - BW - 14, y: a.y + 12 },
      { x: a.x + 14, y: a.y + a.h - BH - 12 }, { x: a.x + a.w - BW - 14, y: a.y + a.h - BH - 12 },
    ].map((b, i) => ({ ...b, w: BW, h: BH, owner: i }));
    // pontos de surgimento das peças (grade no meio da fábrica)
    d.spots = [];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) {
      d.spots.push({ x: a.x + 205 + k * 94 + (r % 2) * 30 - 15, y: a.y + 115 + r * 92 });
    }
    d.parts = [];
    d.respawns = [];          // tempos (g.time) em que nasce uma peça nova
    d.shots = [];             // rastros de tiro (só visual)
    d.lastBonus = false;
    // peças iniciais: ciclos embaralhados dos 5 tipos (como no original)
    let bag = [];
    for (const s of U.shuffle(d.spots.slice()).slice(0, this.START_PARTS)) {
      if (!bag.length) bag = U.shuffle(this.TYPES.slice());
      d.parts.push({ type: bag.pop(), x: s.x + U.rand(-8, 8), y: s.y + U.rand(-8, 8), rot: U.rand(0, 6.28) });
    }
    g.players.forEach((p, i) => {
      const b = d.benches[i];
      p.x = b.x + b.w / 2; p.y = i < 2 ? b.y + b.h + 34 : b.y - 34; p.dir = i < 2 ? Math.PI / 2 : -Math.PI / 2;
      // receita: permutação dos 4 tipos sem cola + cola inserida em qualquer posição menos a primeira
      const rec = U.shuffle(this.TYPES.filter((t) => t !== 'cola'));
      rec.splice(U.randInt(1, 4), 0, 'cola');
      p.data = { recipe: rec, prog: 0, carry: null, gunReady: false, hasGun: false, cd: 0, wrong: 0, okFlash: 0, botPrevA: false, botPrevB: false, bot: { dodge: 0, side: U.chance(0.5) ? 1 : -1 } };
    });
  },

  nearBench(g, p) {
    const b = g.data.benches[p.id], r = this.BENCH_REACH;
    return TN.util.circleRect(p, { x: b.x - r, y: b.y - r, w: b.w + 2 * r, h: b.h + 2 * r });
  },

  // impede o jogador de atravessar as bancadas
  solidBenches(g, p) {
    for (const b of g.data.benches) {
      if (!TN.util.circleRect(p, b)) continue;
      const nx = TN.util.clamp(p.x, b.x, b.x + b.w), ny = TN.util.clamp(p.y, b.y, b.y + b.h);
      let dx = p.x - nx, dy = p.y - ny, dd = Math.hypot(dx, dy);
      if (dd < 0.001) { dx = 0; dy = p.y < b.y + b.h / 2 ? -1 : 1; dd = 1; }
      p.x = nx + (dx / dd) * (p.r + 0.5); p.y = ny + (dy / dd) * (p.r + 0.5);
    }
  },

  dropPart(g, p) {
    if (!p.data.carry) return;
    g.data.parts.push({ type: p.data.carry, x: p.x + Math.cos(p.dir) * 18, y: p.y + Math.sin(p.dir) * 18, rot: TN.util.rand(0, 6.28) });
    p.data.carry = null;
  },

  fire(g, p) {
    const U = TN.util, d = g.data;
    p.data.cd = this.COOLDOWN;
    d.shots.push({ x: p.x, y: p.y, dir: p.dir, t: 0.3 });
    g.sfx('shoot'); g.shake(5);
    for (const o of g.alive()) {
      if (o === p) continue;
      const dist = U.dist(p.x, p.y, o.x, o.y);
      if (dist > this.SHOT_RANGE + o.r) continue;
      let diff = Math.atan2(o.y - p.y, o.x - p.x) - p.dir;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) <= this.SHOT_HALF + Math.atan2(o.r, Math.max(dist, 1))) {
        this.dropPart(g, o);
        g.eliminate(o, { sound: 'boom', msg: 'DEMITIDO!' });
        g.particles(o.x, o.y, '#a00', 26, 240);
        g.addScore(p, 1);
      }
    }
  },

  update(g, dt) {
    const U = TN.util, d = g.data;
    for (const p of g.alive()) {
      const s = p.data;
      s.cd = Math.max(0, s.cd - dt); s.wrong = Math.max(0, s.wrong - dt); s.okFlash = Math.max(0, s.okFlash - dt);
      g.movePlayer(p, this.SPEED, dt);
      this.solidBenches(g, p);
      const near = this.nearBench(g, p);
      // AÇÃO: atirar / pegar arma / pegar peça
      if (p.input.aPressed) {
        if (s.hasGun) {
          if (s.cd <= 0) this.fire(g, p); else g.sfx('tick');
        } else if (near && s.gunReady) {
          s.gunReady = false; s.hasGun = true; s.cd = 0.6;
          g.sfx('pickup'); g.popup('ARMADO!', p.x, p.y - 34, '#ffb02e');
        } else if (!s.carry) {
          let best = null, bd = this.PICK_R;
          for (const part of d.parts) { const dd = U.dist(p.x, p.y, part.x, part.y); if (dd < bd) { bd = dd; best = part; } }
          if (best) { s.carry = best.type; d.parts.splice(d.parts.indexOf(best), 1); g.sfx('pickup'); }
        }
      }
      // EXTRA: inserir na bancada / largar no chão
      if (p.input.bPressed && s.carry) {
        if (near && s.prog < 5) {
          if (s.carry === s.recipe[s.prog]) {
            s.prog++; s.carry = null; s.okFlash = 0.3;
            d.respawns.push(g.time + this.RESPAWN);
            g.sfx('confirm');
            if (s.prog === 5) {
              s.gunReady = true;
              const b = d.benches[p.id];
              g.addScore(p, 1); g.sfx('win');
              g.particles(b.x + b.w / 2, b.y + b.h / 2, '#ffb02e', 24, 200);
              g.popup('ARMA PRONTA!', b.x + b.w / 2, b.y + b.h / 2 - 10, '#ffb02e');
            }
          } else { s.wrong = 0.45; g.sfx('buzz'); }
        } else { this.dropPart(g, p); g.sfx('step'); }
      }
    }
    U.separate(g.alive());
    for (const p of g.alive()) this.solidBenches(g, p);
    // reposição de peças
    for (let i = d.respawns.length - 1; i >= 0; i--) {
      if (g.time < d.respawns[i]) continue;
      d.respawns.splice(i, 1);
      if (d.parts.length >= this.MAX_FLOOR) continue;
      const free = d.spots.filter((sp) => !d.parts.some((pt) => U.dist(pt.x, pt.y, sp.x, sp.y) < 30));
      const sp = free.length ? U.pick(free) : U.pick(d.spots);
      d.parts.push({ type: U.pick(this.TYPES), x: sp.x, y: sp.y, rot: U.rand(0, 6.28) });
      g.particles(sp.x, sp.y, '#fff', 6, 80);
    }
    for (const sh of d.shots) sh.t -= dt;
    d.shots = d.shots.filter((sh) => sh.t > 0);
    // último de pé: +1
    const alive = g.alive();
    if (alive.length === 1 && !d.lastBonus) {
      d.lastBonus = true;
      g.addScore(alive[0], 1);
      g.message('ÚLTIMO FUNCIONÁRIO DE PÉ', 1.5, alive[0].color);
    }
  },

  // ------------------------------------------------------------------ bot
  bot(g, p, dt) {
    const U = TN.util, s = p.data, d = g.data, b = s.bot;
    let mx = 0, my = 0, wantA = false, wantB = false;
    const go = (tx, ty) => { const n = U.norm(tx - p.x, ty - p.y); mx = n.x; my = n.y; };
    const bench = d.benches[p.id], bcx = bench.x + bench.w / 2, bcy = p.id < 2 ? bench.y + bench.h + 10 : bench.y - 10;
    const enemies = g.alive().filter((o) => o !== p);
    if (s.hasGun) {
      // caça o inimigo mais próximo e mira antes de atirar
      let t = null, td = 1e9;
      for (const o of enemies) { const dd = U.dist(p.x, p.y, o.x, o.y); if (dd < td) { td = dd; t = o; } }
      if (t) {
        const ang = Math.atan2(t.y - p.y, t.x - p.x);
        let diff = ang - p.dir; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (td > 120) go(t.x, t.y);
        else { mx = Math.cos(ang) * 0.2; my = Math.sin(ang) * 0.2; }   // gira no lugar para mirar
        if (td < this.SHOT_RANGE - 10 && Math.abs(diff) < 0.1 && s.cd <= 0 && U.chance(0.06)) wantA = true;
      }
    } else {
      // desvia de quem está armado e mirando
      const threat = enemies.find((o) => o.data.hasGun && o.data.cd < 0.8 && U.dist(o.x, o.y, p.x, p.y) < 240 &&
        Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - o.y, p.x - o.x) - o.dir), Math.cos(Math.atan2(p.y - o.y, p.x - o.x) - o.dir))) < 0.5);
      if (threat && b.dodge <= 0 && U.chance(0.08)) b.dodge = U.rand(0.3, 0.6);
      if (s.gunReady) {
        go(bcx, bcy);
        if (this.nearBench(g, p)) wantA = true;
      } else if (s.carry) {
        if (s.carry === s.recipe[s.prog]) { go(bcx, bcy); if (this.nearBench(g, p)) wantB = true; }
        else wantB = true;                         // peça errada: larga
      } else {
        const need = s.recipe[s.prog];
        let best = null, bd = 1e9;
        for (const part of d.parts) {
          if (part.type !== need) continue;
          const dd = U.dist(p.x, p.y, part.x, part.y); if (dd < bd) { bd = dd; best = part; }
        }
        if (best) { go(best.x, best.y); if (bd < this.PICK_R - 8) { wantA = true; mx *= 0.3; my *= 0.3; } }
        else go(g.arena.x + g.arena.w / 2 + Math.cos(g.time + p.id) * 80, g.arena.y + g.arena.h / 2);
      }
      if (b.dodge > 0) {
        b.dodge -= dt;
        if (threat) { const n = U.norm(p.x - threat.x, p.y - threat.y); mx = -n.y * b.side; my = n.x * b.side; }
      }
    }
    // borda de botão: só "aperta" se não estava apertado no quadro anterior
    const a = wantA && !s.botPrevA, bb = wantB && !s.botPrevB;
    s.botPrevA = a; s.botPrevB = bb;
    return { x: mx, y: my, a, b: bb };
  },

  // ------------------------------------------------------------------ 3D (câmera fixa)
  camera: { pos: [480, 720, 880], target: [480, 0, 300], fov: 37 },
  env: { ambient: 0.55, sun: 1.9, sunDir: [-0.3, 1, 0.45] },

  // cano horizontal (cilindro deitado) centrado em x,z, apontando para o ângulo `ang` da lógica
  pipe3d(r, x, y, z, len, rad, ang, color, o = {}) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    r.cyl(x - dx * len / 2, y, z - dz * len / 2, rad, len, color, { metal: 0.7, rough: 0.35, ...o, rotZ: Math.PI / 2, rotY: Math.PI - ang });
  },

  // peça 3D low-poly (base em y). k = escala, rot = giro no chão
  part3d(r, type, x, y, z, k = 1, rot = 0) {
    if (type === 'engrenagem') {
      r.cyl(x, y, z, 8 * k, 4 * k, '#b8c0c8', { metal: 0.85, rough: 0.3 });
      for (let i = 0; i < 3; i++) r.box(x, y, z, 21 * k, 4 * k, 4 * k, '#a9b1b9', { metal: 0.85, rough: 0.3, rotY: rot + (i * Math.PI) / 3 });
      r.cyl(x, y + 4 * k, z, 3 * k, 1, '#2a2d31');
    } else if (type === 'cano') {
      this.pipe3d(r, x, y + 4 * k, z, 26 * k, 4 * k, rot, '#55606d');
      r.cyl(x + Math.cos(rot) * 12 * k, y + 4 * k, z + Math.sin(rot) * 12 * k, 2.4 * k, 1, '#0c0c0c', { rotZ: Math.PI / 2, rotY: Math.PI - rot });
    } else if (type === 'cola') {
      r.cyl(x, y, z, 5 * k, 12 * k, '#f2ead0', { rough: 0.5 });
      r.cyl(x, y + 4.5 * k, z, 5.4 * k, 3.5 * k, '#ff7a1a');
      r.cone(x, y + 12 * k, z, 3 * k, 6 * k, '#ff7a1a');
    } else if (type === 'chapa') {
      r.box(x, y, z, 22 * k, 2.5 * k, 17 * k, '#6f9ccf', { metal: 0.75, rough: 0.3, rotY: rot });
      r.box(x, y + 2.5 * k, z, 15 * k, 0.6, 10 * k, '#d6e6f7', { metal: 0.6, rough: 0.3, rotY: rot });
    } else {
      r.box(x, y, z, 20 * k, 6 * k, 16 * k, '#1f9d55', { rotY: rot });
      r.box(x, y + 6 * k, z, 8 * k, 2 * k, 8 * k, '#111', { rotY: rot });
      r.box(x, y + 6 * k, z, 19 * k, 0.8, 2 * k, '#ffd23f', { rotY: rot, glow: true });
    }
  },

  // arma montada (corpo + cano + faixa + cabo), apontando para `dir`
  gun3d(r, x, y, z, dir, k = 1) {
    const fx = Math.cos(dir), fz = Math.sin(dir);
    r.box(x, y, z, 22 * k, 7 * k, 7 * k, '#2b2f36', { rotY: -dir, metal: 0.6, rough: 0.4 });
    this.pipe3d(r, x + fx * 15 * k, y + 3.5 * k, z + fz * 15 * k, 14 * k, 2 * k, dir, '#1a1c20');
    r.box(x, y + 7 * k, z, 9 * k, 1, 4 * k, '#ffb02e', { rotY: -dir, glow: true });
    r.box(x - fx * 6 * k, y - 8 * k, z - fz * 6 * k, 5 * k, 8 * k, 5 * k, '#2b2f36', { rotY: -dir });
  },

  draw3d(g, r) {
    const a = g.arena, d = g.data, U = TN.util;
    const blink = Math.round((0.5 + 0.5 * Math.sin(g.time * 7)) * 8) / 8; // quantizado: o motor guarda 1 material por opacidade
    // chão: concreto escuro + piso da fábrica
    r.plane(480, -1, 290, 1700, 1200, '#0f1215');
    const TX = a.w / 8, TZ = a.h / 4;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      r.plane(a.x + TX * (i + 0.5), 0, a.y + TZ * (j + 0.5), TX - 2, TZ - 2, (i + j) % 2 ? '#2f343a' : '#2a2f34', { rough: 0.9 });
    }
    // paredes: fundo alto com tubulação, laterais e frente baixas
    r.box(480, 0, a.y - 12, a.w + 60, 130, 20, '#3b4148', { metal: 0.3 });
    r.box(a.x - 12, 0, a.y + a.h / 2, 20, 40, a.h + 4, '#454c54', { metal: 0.3 });
    r.box(a.x + a.w + 12, 0, a.y + a.h / 2, 20, 40, a.h + 4, '#454c54', { metal: 0.3 });
    r.box(480, 0, a.y + a.h + 10, a.w + 44, 16, 16, '#454c54', { metal: 0.3 });
    r.beam(a.x - 20, 104, a.y - 1, a.x + a.w + 20, 104, a.y - 1, 9, '#6b7480', { metal: 0.8, rough: 0.3 });
    r.beam(a.x - 20, 88, a.y - 1, a.x + a.w + 20, 88, a.y - 1, 6, '#8a5a2a', { metal: 0.6, rough: 0.4 });
    for (let i = 0; i < 9; i++) r.box(a.x + 6 + i * (a.w - 12) / 8, 0, a.y - 1, 26, 4, 2, i % 2 ? '#111' : '#f5c400', { shadow: false });
    // luminárias de parede (brilho) + placa
    for (const lx of [a.x + 120, 480, a.x + a.w - 120]) r.box(lx, 116, a.y - 1, 46, 6, 3, '#ffe2b0', { glow: true });
    r.box(480, 52, a.y - 1, 210, 26, 2, '#15181c');
    r.label(480, 65, a.y, 'ESTOQUE DE PEÇAS', '#f5c400', 13);
    // área de peças marcada no chão (faixas amarelas)
    const sx0 = a.x + 160, sx1 = a.x + a.w - 160, sz0 = a.y + 80, sz1 = a.y + a.h - 80;
    const ln = { opacity: 0.6, glow: true };
    r.plane((sx0 + sx1) / 2, 0.5, sz0, sx1 - sx0, 3, '#f5c400', ln);
    r.plane((sx0 + sx1) / 2, 0.5, sz1, sx1 - sx0, 3, '#f5c400', ln);
    r.plane(sx0, 0.5, (sz0 + sz1) / 2, 3, sz1 - sz0, '#f5c400', ln);
    r.plane(sx1, 0.5, (sz0 + sz1) / 2, 3, sz1 - sz0, '#f5c400', ln);
    // luz quente de teto sobre as bancadas
    r.light(a.x + 200, 230, a.y + 120, '#ffd9a8', 0.85, 620);
    r.light(a.x + a.w - 200, 230, a.y + 120, '#ffd9a8', 0.85, 620);
    r.light(a.x + 200, 230, a.y + a.h - 100, '#ffd9a8', 0.75, 620);
    r.light(a.x + a.w - 200, 230, a.y + a.h - 100, '#ffd9a8', 0.75, 620);

    // bancadas
    for (const b of d.benches) {
      const p = g.players[b.owner];
      if (!p) continue;
      const s = p.data, cx = b.x + b.w / 2, cz = b.y + b.h / 2, top = b.owner < 2;
      const own = p.alive ? p.color : '#555';
      const sideZ = top ? b.y + b.h : b.y;            // lado onde o dono trabalha
      const backZ = top ? b.y : b.y + b.h;
      r.box(cx, 0, cz, b.w - 8, 28, b.h - 8, '#2c3137', { metal: 0.4, rough: 0.6 });
      const topCol = s.wrong > 0 ? '#6a2020' : s.okFlash > 0 ? '#205a33' : '#4a5058';
      r.box(cx, 28, cz, b.w + 4, 4, b.h + 4, topCol, { metal: 0.55, rough: 0.4 });
      r.box(cx, 14, sideZ + (top ? 1 : -1), b.w - 10, 6, 2, own, { emissive: own, emissiveIntensity: 0.5 });
      r.box(cx, 32, backZ + (top ? 4 : -4), b.w, 1.2, 4, own, { glow: true });
      r.plane(cx, 0.6, sideZ + (top ? 20 : -20), b.w, 36, own, { opacity: 0.16 });
      // lâmpada de status
      const lamp = s.wrong > 0 ? '#ff2a2a' : s.okFlash > 0 ? '#46e27b' : s.gunReady ? '#ffb02e' : p.alive ? own : '#333';
      r.cyl(b.x + 8, 32, backZ + (top ? 8 : -8), 2, 14, '#222');
      r.sphere(b.x + 8, 48, backZ + (top ? 8 : -8), 4.5, lamp, { glow: true });
      if (s.gunReady) {
        r.plane(cx, 32.4, cz, b.w - 12, b.h - 12, '#ffb02e', { glow: true, opacity: 0.2 + 0.25 * blink });
        this.gun3d(r, cx, 41 + 3 * blink, cz, top ? Math.PI / 2 : -Math.PI / 2, 1.5);
        continue;
      }
      // encaixes da receita sobre a bancada
      for (let i = 0; i < 5; i++) {
        const px = b.x + 18 + i * 23.5;
        const done = i < s.prog, next = i === s.prog && p.alive && !s.hasGun && s.prog < 5;
        r.box(px, 32, cz, 19, 1, 26, done ? '#1b3324' : '#1d2126');
        if (next) r.plane(px, 33.3, cz, 19, 26, s.wrong > 0 ? '#ff3030' : own, { glow: true, opacity: 0.25 + 0.5 * blink });
        if (done) this.part3d(r, s.recipe[i], px, 33, cz, 0.62, 0.3);
      }
    }

    // peças no chão
    for (const part of d.parts) this.part3d(r, part.type, part.x, 0, part.y, 1.25, part.rot);

    // tiros: rajada (feixe + leque) e clarão do cano
    for (const sh of d.shots) {
      const al = Math.round(Math.max(0, sh.t / 0.3) * 10) / 10, fx = Math.cos(sh.dir), fz = Math.sin(sh.dir);
      const x0 = sh.x + fx * 26, z0 = sh.y + fz * 26;
      r.beam(x0, 40, z0, sh.x + fx * this.SHOT_RANGE, 40, sh.y + fz * this.SHOT_RANGE, 3, '#fff6c8', { glow: true, opacity: al });
      for (const sgn of [-1, 1]) {
        const ang = sh.dir + sgn * this.SHOT_HALF;
        r.beam(x0, 40, z0, sh.x + Math.cos(ang) * this.SHOT_RANGE, 40, sh.y + Math.sin(ang) * this.SHOT_RANGE, 1.5, '#ffcf6a', { glow: true, opacity: 0.5 * al });
      }
      r.sphere(x0, 40, z0, 4 + 8 * al, '#fff1a8', { glow: true, opacity: al });
      r.light(x0, 50, z0, '#ffcf6a', 1.6 * al, 260);
    }

    // jogadores
    for (const p of g.players) {
      const s = p.data;
      const holding = p.alive && (s.hasGun || s.carry);
      r.character(p, holding ? { pose: 'arms' } : {});
      if (!p.alive) continue;
      const fx = Math.cos(p.dir), fz = Math.sin(p.dir);
      if (s.hasGun) {
        this.gun3d(r, p.x + fx * 22, 38, p.y + fz * 22, p.dir, 1);
        if (s.cd > 0) r.ring(p.x, 1, p.y, p.r + 5, p.r + 9, '#ffb02e', { glow: true, arc: 1 - s.cd / this.COOLDOWN });
        else {
          r.ring(p.x, 1, p.y, p.r + 5, p.r + 9, '#ffb02e', { glow: true, opacity: 0.6 });
          r.beam(p.x + fx * 34, 40, p.y + fz * 34, p.x + fx * this.SHOT_RANGE, 40, p.y + fz * this.SHOT_RANGE, 1, '#ff5040', { glow: true, opacity: 0.55 });
        }
      } else if (s.carry) {
        const hx = p.x + fx * 22, hz = p.y + fz * 22;
        this.part3d(r, s.carry, hx, 34, hz, 1, p.dir);
        if (s.wrong > 0) r.sphere(hx, 40, hz, 13, '#ff2020', { glow: true, opacity: 0.35 });
      }
    }
  },

  // cartões de receita (2D) presos a cada bancada
  drawOverlay(g, c) {
    if (!g.uses3d || !g.uses3d()) return;
    const D = TN.draw, d = g.data;
    for (const b of d.benches) {
      const p = g.players[b.owner];
      if (!p) continue;
      const s = p.data, top = b.owner < 2, cx = b.x + b.w / 2;
      const an = TN.R3.project(cx, top ? 60 : 0, top ? b.y : b.y + b.h + 14);
      const W = 150, H = 44;
      const x = Math.round(TN.util.clamp(an.x - W / 2, 4, g.W - W - 4)), y = Math.round(TN.util.clamp(top ? an.y - H - 2 : an.y + 2, 38, g.H - H - 4));
      c.save();
      c.globalAlpha = p.alive ? 1 : 0.45;
      c.fillStyle = 'rgba(8,10,13,0.82)'; c.fillRect(x, y, W, H);
      c.fillStyle = p.alive ? p.color : '#555'; c.fillRect(x, y, 4, H);
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
      D.text(c, p.label, x + 18, y + 13, { size: 11, color: p.alive ? p.color : '#777', align: 'center' });
      if (s.gunReady) {
        D.text(c, 'ARMA PRONTA!', x + W / 2 + 10, y + 15, { size: 13, color: '#ffb02e', align: 'center' });
        D.text(c, 'PEGUE (AÇÃO)', x + W / 2 + 10, y + 32, { size: 10, color: '#ffd28a', align: 'center' });
      } else if (s.hasGun || (!p.alive && s.prog >= 5)) {
        D.text(c, 'ARMA EM USO', x + W / 2 + 10, y + H / 2, { size: 12, color: '#999', align: 'center' });
      } else {
        for (let i = 0; i < 5; i++) {
          const sx = x + 33 + i * 23, sy = y + 4;
          const done = i < s.prog, next = i === s.prog;
          c.fillStyle = done ? '#1b2e22' : '#22262c'; c.fillRect(sx, sy, 20, 22);
          c.globalAlpha = (p.alive ? 1 : 0.45) * (done || next ? 1 : 0.35);
          this.drawPart(c, s.recipe[i], sx + 10, sy + 11, 0.72);
          c.globalAlpha = p.alive ? 1 : 0.45;
          if (done) D.text(c, '✔', sx + 15, sy + 18, { size: 10, color: '#46e27b', align: 'center' });
          if (next && p.alive) {
            c.strokeStyle = s.wrong > 0 ? '#f33' : p.color; c.lineWidth = 1.5 + Math.abs(Math.sin(g.time * 5)) * 1.5;
            c.strokeRect(sx - 1, sy - 1, 22, 24);
          }
        }
        if (s.prog < 5) D.text(c, this.NAMES[s.recipe[s.prog]], x + 33 + 57, y + 35, { size: 10, color: s.wrong > 0 ? '#f66' : '#cfd6dd', align: 'center' });
      }
      c.restore();
    }
  },

  // ------------------------------------------------------------------ desenho 2D (alternativa sem WebGL)
  drawPart(c, type, x, y, k = 1, rot = 0) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k);
    c.strokeStyle = '#111'; c.lineWidth = 2;
    if (type === 'engrenagem') {
      c.fillStyle = '#b8c0c8';
      c.beginPath();
      for (let i = 0; i < 16; i++) { const r = i % 2 ? 7 : 10, a = (i / 16) * Math.PI * 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#444'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    } else if (type === 'cano') {
      c.fillStyle = '#4b5563'; c.beginPath(); c.roundRect(-12, -4, 24, 8, 3); c.fill(); c.stroke();
      c.fillStyle = '#9aa5b1'; c.fillRect(-10, -3, 20, 2);
      c.fillStyle = '#111'; c.beginPath(); c.arc(12, 0, 2.5, 0, Math.PI * 2); c.fill();
    } else if (type === 'cola') {
      c.fillStyle = '#f2ead0'; c.beginPath(); c.roundRect(-6, -9, 12, 16, 3); c.fill(); c.stroke();
      c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(-3, -9); c.lineTo(0, -14); c.lineTo(3, -9); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff7a1a'; c.fillRect(-6, -2, 12, 4);
    } else if (type === 'chapa') {
      c.fillStyle = '#6f9ccf'; c.beginPath(); c.rect(-10, -8, 20, 16); c.fill(); c.stroke();
      c.fillStyle = '#d6e6f7'; for (const [rx, ry] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) c.fillRect(rx - 1, ry - 1, 2, 2);
    } else {
      c.fillStyle = '#1f9d55'; c.beginPath(); c.rect(-10, -8, 20, 16); c.fill(); c.stroke();
      c.fillStyle = '#111'; c.fillRect(-4, -4, 8, 8);
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-10, -2); c.lineTo(-4, -2); c.moveTo(4, 2); c.lineTo(10, 2); c.moveTo(0, -8); c.lineTo(0, -4); c.stroke();
    }
    c.restore();
  },

  drawGun(c, x, y, k = 1, rot = 0) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(k, k);
    c.fillStyle = '#2b2f36'; c.strokeStyle = '#111'; c.lineWidth = 1.5;
    c.beginPath(); c.roundRect(-6, -4, 26, 8, 2); c.fill(); c.stroke();          // corpo + cano
    c.fillStyle = '#ffb02e'; c.fillRect(-2, -3, 8, 2);
    c.fillStyle = '#2b2f36'; c.beginPath(); c.roundRect(-6, 2, 7, 9, 2); c.fill(); c.stroke();   // cabo
    c.restore();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 44, a: '#23272c', b: '#272c32' });
    // área de peças marcada no chão
    c.strokeStyle = 'rgba(245,196,0,0.35)'; c.lineWidth = 2; c.setLineDash([10, 8]);
    c.strokeRect(a.x + 160, a.y + 80, a.w - 320, a.h - 160); c.setLineDash([]);
    D.text(c, 'ESTOQUE DE PEÇAS', a.x + a.w / 2, a.y + 68, { size: 12, color: 'rgba(245,196,0,0.6)', align: 'center' });
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    for (const b of d.benches) this.drawBench(g, c, b);
    for (const part of d.parts) {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(part.x + 2, part.y + 9, 11, 4, 0, 0, Math.PI * 2); c.fill();
      this.drawPart(c, part.type, part.x, part.y, 1.2, part.rot);
    }
    // tiros
    for (const sh of d.shots) {
      const al = sh.t / 0.3;
      c.save(); c.translate(sh.x, sh.y); c.rotate(sh.dir);
      c.fillStyle = `rgba(255,220,120,${0.35 * al})`;
      c.beginPath(); c.moveTo(14, 0);
      c.lineTo(Math.cos(this.SHOT_HALF) * this.SHOT_RANGE, Math.sin(this.SHOT_HALF) * this.SHOT_RANGE);
      c.lineTo(Math.cos(-this.SHOT_HALF) * this.SHOT_RANGE, Math.sin(-this.SHOT_HALF) * this.SHOT_RANGE);
      c.closePath(); c.fill();
      c.strokeStyle = `rgba(255,255,200,${al})`; c.lineWidth = 3;
      c.beginPath(); c.moveTo(18, 0); c.lineTo(this.SHOT_RANGE, 0); c.stroke();
      c.fillStyle = `rgba(255,255,255,${al})`; c.beginPath(); c.arc(22, 0, 7 * al + 2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.alive()) {
      const s = p.data;
      g.drawPlayer(c, p);
      if (s.hasGun) {
        this.drawGun(c, p.x + Math.cos(p.dir) * 12, p.y + Math.sin(p.dir) * 12, 1, p.dir);
        // recarga: arco em volta do robô
        if (s.cd > 0) {
          c.strokeStyle = '#ffb02e'; c.lineWidth = 3;
          c.beginPath(); c.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - s.cd / this.COOLDOWN)); c.stroke();
        } else {
          c.strokeStyle = 'rgba(255,176,46,0.5)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(p.x + Math.cos(p.dir) * 30, p.y + Math.sin(p.dir) * 30);
          c.lineTo(p.x + Math.cos(p.dir) * this.SHOT_RANGE, p.y + Math.sin(p.dir) * this.SHOT_RANGE); c.stroke();
        }
      }
      if (s.carry) {
        // peça carregada "na mão", à frente do robô
        const hx = p.x + Math.cos(p.dir) * 22, hy = p.y + Math.sin(p.dir) * 22;
        c.fillStyle = s.wrong > 0 ? 'rgba(255,40,40,0.6)' : 'rgba(10,14,18,0.6)';
        c.beginPath(); c.arc(hx, hy, 12, 0, Math.PI * 2); c.fill();
        c.strokeStyle = s.wrong > 0 ? '#f33' : p.color; c.lineWidth = 2; c.stroke();
        this.drawPart(c, s.carry, hx, hy, 0.9);
      }
    }
  },

  drawBench(g, c, b) {
    const D = TN.draw, p = g.players[b.owner];
    if (!p) return;
    const s = p.data;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(b.x + 4, b.y + 6, b.w, b.h);
    c.fillStyle = s.wrong > 0 ? '#5a1a1a' : s.okFlash > 0 ? '#1d4a2c' : '#3a3f47';
    c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = p.alive ? p.color : '#555'; c.fillRect(b.x, b.y, b.w, 5);
    c.strokeStyle = '#111'; c.lineWidth = 2; c.strokeRect(b.x, b.y, b.w, b.h);
    const top = b.owner < 2;
    D.text(c, `BANCADA ${p.label}`, b.x + b.w / 2, top ? b.y + b.h + 10 : b.y - 10, { size: 11, color: p.alive ? p.color : '#666', align: 'center' });
    if (s.gunReady) {
      c.fillStyle = `rgba(255,176,46,${0.25 + 0.2 * Math.sin(g.time * 8)})`; c.fillRect(b.x + 4, b.y + 8, b.w - 8, b.h - 12);
      this.drawGun(c, b.x + b.w / 2 - 8, b.y + b.h / 2 + 2, 1.6);
      D.text(c, 'PEGUE (AÇÃO)', b.x + b.w / 2, b.y + b.h - 8, { size: 10, color: '#ffd28a', align: 'center' });
      return;
    }
    if (s.hasGun || (!p.alive && s.prog >= 5)) {
      D.text(c, 'ARMA EM USO', b.x + b.w / 2, b.y + b.h / 2 + 2, { size: 12, color: '#888', align: 'center' });
      return;
    }
    // receita: 5 encaixes, o próximo pisca na cor do jogador
    for (let i = 0; i < 5; i++) {
      const sx = b.x + 8 + i * 23.5, sy = b.y + 12;
      const done = i < s.prog, next = i === s.prog;
      c.fillStyle = done ? '#1b2e22' : '#22262c'; c.fillRect(sx, sy, 20, 26);
      c.globalAlpha = done ? 1 : next ? 1 : 0.35;
      this.drawPart(c, s.recipe[i], sx + 10, sy + 13, 0.8);
      c.globalAlpha = 1;
      if (done) D.text(c, '✔', sx + 15, sy + 21, { size: 10, color: '#46e27b', align: 'center' });
      if (next && p.alive) {
        c.strokeStyle = s.wrong > 0 ? '#f33' : p.color; c.lineWidth = 1.5 + Math.abs(Math.sin(g.time * 5)) * 1.5;
        c.strokeRect(sx - 1, sy - 1, 22, 28);
      }
    }
    if (p.alive && s.prog < 5) D.text(c, this.NAMES[s.recipe[s.prog]], b.x + b.w / 2, b.y + b.h - 8, { size: 10, color: '#cfd6dd', align: 'center' });
  },
});
