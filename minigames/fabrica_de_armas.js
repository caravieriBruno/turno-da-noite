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

  // ------------------------------------------------------------------ desenho
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
