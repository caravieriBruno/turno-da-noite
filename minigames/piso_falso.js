// PISO FALSO — inspirado em "STABLE FOOTING" (disco_dodge) de Machine Party.
// Piso de ladrilhos sobre um poço. Os símbolos (X, ■, ●) são embaralhados três vezes de mentira;
// depois o painel mostra o símbolo SEGURO e, 3 s depois, todo ladrilho com outro símbolo cai.
// A cada ciclo alguns ladrilhos somem para sempre. AÇÃO empurra. Último de pé vence.
TN.registerMinigame({
  id: 'piso_falso',
  title: 'PISO FALSO',
  inspiredBy: 'Stable Footing (disco_dodge)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Os ladrilhos são embaralhados.', 'O painel mostra o símbolo seguro.', 'Fique em cima dele. Não caia no poço.'],
  controls: { move: 'andar', a: 'empurrar' },
  icon: '▦',
  color: '#c86bff',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (original: grade 20×12, 3 embaralhamentos de 1 s, 3 s até cair, 3 s caído,
  //      6 ladrilhos somem por ciclo, espera 7 s; empurrão 0,1 s de preparo + 0,3 s) ----
  COLS: 14, ROWS: 8, TILE: 50,
  SPEED: 175, SHOVE: 560, SHOVE_WIND: 0.1, SHOVE_LOCK: 0.4, SHOVE_RANGE: 58,
  SHUFFLES: 3, SHUFFLE_T: 1, DROP_T: 2.5, WAIT_T: 3, REMOVE: 6,
  SYMS: ['X', '■', '●'], SYM_COLORS: ['#ff4d6d', '#4dc3ff', '#ffd23f'],

  init(g) {
    const d = g.data;
    d.gx = g.W / 2 - (this.COLS * this.TILE) / 2; d.gy = 75;
    d.tiles = [];
    for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) d.tiles.push({ c, r, sym: -1, state: 'up', fall: 0 });
    d.phase = 'idle'; d.phaseT = 0; d.phaseDur = 1.0; d.shuffleN = 0; d.cycle = 0;
    d.display = -1; d.safe = -1; d.decoy = false;
    g.placeInCircle(g.W / 2, d.gy + (this.ROWS * this.TILE) / 2, 110);
    for (const p of g.players) Object.assign(p.data, { lock: 0, wind: 0, shoveT: 0, react: 0, fallT: -1, target: null, misread: false, wander: null, wanderT: 0 });
  },

  tileAt(g, x, y) {
    const d = g.data, c = Math.floor((x - d.gx) / this.TILE), r = Math.floor((y - d.gy) / this.TILE);
    if (c < 0 || r < 0 || c >= this.COLS || r >= this.ROWS) return null;
    return d.tiles[r * this.COLS + c];
  },
  center(g, t) { return { x: g.data.gx + (t.c + 0.5) * this.TILE, y: g.data.gy + (t.r + 0.5) * this.TILE }; },
  solid(t) { return t && t.state === 'up'; },
  // chão firme no ponto e em volta dele (para o bot não andar rente ao buraco)
  roomy(g, x, y, m) { return [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m]].every(([ox, oy]) => this.solid(this.tileAt(g, x + ox, y + oy))); },

  randomize(g) {
    for (const t of g.data.tiles) if (t.state !== 'gone') t.sym = TN.util.randInt(0, 2);
  },

  setPhase(g, ph, dur) { g.data.phase = ph; g.data.phaseT = 0; g.data.phaseDur = dur; },

  update(g, dt) {
    const U = TN.util, d = g.data;
    d.phaseT += dt;
    // ---------- ciclo do piso ----------
    if (d.phaseT >= d.phaseDur) {
      if (d.phase === 'idle' || (d.phase === 'shuffle' && d.shuffleN < this.SHUFFLES)) {
        // embaralhamento falso: o painel mostra um símbolo qualquer
        d.shuffleN = d.phase === 'idle' ? 1 : d.shuffleN + 1;
        this.randomize(g); d.display = U.randInt(0, 2); d.decoy = true;
        this.setPhase(g, 'shuffle', this.SHUFFLE_T); g.sfx('tick');
      } else if (d.phase === 'shuffle') {
        // layout final: o símbolo seguro precisa existir em alguns ladrilhos
        this.randomize(g);
        const live = d.tiles.filter((t) => t.state === 'up');
        const counts = [0, 1, 2].map((s) => live.filter((t) => t.sym === s).length);
        const options = [0, 1, 2].filter((s) => counts[s] >= Math.min(3, Math.max(...counts)));
        d.safe = U.pick(options); d.display = d.safe; d.decoy = false;
        this.setPhase(g, 'final', Math.max(1.0, 3 - d.cycle * 0.45)); g.sfx('select');
        for (const p of g.players) { p.data.react = U.rand(0.25, 1.1); p.data.misread = U.chance(0.2); }
      } else if (d.phase === 'final') {
        for (const t of d.tiles) if (t.state === 'up' && t.sym !== d.safe) t.state = 'down';
        this.setPhase(g, 'drop', this.DROP_T); g.sfx('boom'); g.shake(6);
      } else if (d.phase === 'drop') {
        // os ladrilhos voltam, menos alguns que somem para sempre
        const down = U.shuffle(d.tiles.filter((t) => t.state === 'down'));
        // a partir do 5º ciclo nada volta (morte súbita), para a rodada sempre acabar
        const n = d.cycle >= 4 ? down.length : this.REMOVE + d.cycle * 4;
        down.forEach((t, i) => { t.state = i < n ? 'gone' : 'up'; });
        for (const t of d.tiles) t.sym = -1;
        d.display = -1; d.safe = -1; d.cycle++;
        this.setPhase(g, 'idle', this.WAIT_T); g.sfx('step');
      }
    }
    for (const t of d.tiles) t.fall = U.approach(t.fall, t.state === 'up' ? 0 : 1, dt * 2.5);

    // ---------- jogadores ----------
    const bounds = { x: d.gx, y: d.gy, w: this.COLS * this.TILE, h: this.ROWS * this.TILE };
    for (const p of g.alive()) {
      const b = p.data;
      b.lock -= dt;
      const stunned = Math.hypot(p.vx, p.vy) > 40;
      if (stunned) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, bounds); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt, bounds);
      g.decayPush(p, dt, 5);
      if (p.input.aPressed && b.lock <= 0 && !stunned) { b.lock = this.SHOVE_LOCK; b.wind = this.SHOVE_WIND; }
      if (b.wind > 0) { b.wind -= dt; if (b.wind <= 0) this.shove(g, p); }
    }
    U.separate(g.alive());
    // quem estiver sobre buraco cai
    for (const p of g.alive()) {
      if (!this.solid(this.tileAt(g, p.x, p.y))) {
        p.data.fallT = 0;
        g.eliminate(p, { sound: 'whoosh', particles: false, msg: 'CAIU!' });
      }
    }
    for (const p of g.players) if (p.data.fallT >= 0) p.data.fallT += dt;
  },

  shove(g, p) {
    const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
    g.sfx('whoosh');
    for (const o of g.alive()) {
      if (o === p) continue;
      const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
      if (dist < this.SHOVE_RANGE && (dx * fx + dy * fy) / (dist || 1) > 0.2) {
        o.vx = (dx / dist) * this.SHOVE; o.vy = (dy / dist) * this.SHOVE;   // não acumula
        g.sfx('hit'); g.particles((o.x + p.x) / 2, (o.y + p.y) / 2, '#fff', 6, 140);
      }
    }
  },

  // Bot: depois do símbolo seguro (com tempo de reação e às vezes lendo errado) vai para o
  // ladrilho seguro mais próximo, de preferência cercado de outros seguros; às vezes empurra.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (Math.hypot(p.vx, p.vy) > 40) return {};
    if (b.shoveT > 0) { b.shoveT -= dt; const n = U.norm(b.shoveDx, b.shoveDy); return { x: n.x, y: n.y, a: true }; }
    let goal = null;
    if (d.phase === 'final' || d.phase === 'drop') {
      if (d.phase === 'final' && d.phaseT < b.react) return {};          // ainda "lendo" o painel
      const fooled = d.phase === 'final' && b.misread && d.phaseT < b.react + 0.9;
      const want = fooled ? (d.safe + 1) % 3 : d.safe;
      const here = this.tileAt(g, p.x, p.y);
      if (d.phase === 'drop' && this.solid(here)) goal = this.center(g, here);
      else {
        let best = null, bs = 1e9;
        for (const t of d.tiles) {
          if (t.state !== 'up' || t.sym !== want) continue;
          const cc = this.center(g, t);
          let s = U.dist(p.x, p.y, cc.x, cc.y);
          for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = this.tileAt(g, cc.x + dc * this.TILE, cc.y + dr * this.TILE);
            if (n && n.state === 'up' && n.sym === want) s -= 12;
          }
          for (const o of g.alive()) if (o !== p && this.tileAt(g, o.x, o.y) === t) s += 70;
          if (b.target === t.c + t.r * 100) s -= 20;
          if (s < bs) { bs = s; best = t; }
        }
        if (best) { b.target = best.c + best.r * 100; goal = this.center(g, best); }
      }
      // já no lugar: talvez empurre um vizinho
      if (goal && U.dist(p.x, p.y, goal.x, goal.y) < 8 && d.phase === 'final' && b.lock <= 0) {
        const o = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 52);
        if (o && U.chance(0.04)) { b.shoveT = 0.12; b.shoveDx = o.x - p.x; b.shoveDy = o.y - p.y; return { x: b.shoveDx, y: b.shoveDy, a: true }; }
      }
    } else {
      // esperando: passeia perto do meio do piso, onde há mais opções
      b.wanderT -= dt;
      if (b.wanderT <= 0 || !b.wander) {
        b.wanderT = U.rand(0.8, 2);
        const ups = d.tiles.filter((t) => { if (t.state !== "up") return false; const cc = this.center(g, t); return this.roomy(g, cc.x, cc.y, this.TILE) && !g.others(p).some((o) => o.data.wander && U.dist(o.data.wander.x, o.data.wander.y, cc.x, cc.y) < 70); });
        const mid = { x: g.W / 2, y: d.gy + (this.ROWS * this.TILE) / 2 };
        ups.sort((t1, t2) => { const a1 = this.center(g, t1), a2 = this.center(g, t2); return U.dist(a1.x, a1.y, mid.x, mid.y) - U.dist(a2.x, a2.y, mid.x, mid.y); });
        const t = U.pick(ups.slice(0, Math.max(1, Math.min(24, ups.length))));
        b.wander = t ? this.center(g, t) : mid;
      }
      goal = b.wander;
      if (d.phase === 'idle' && b.lock <= 0) {
        const o = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 48);
        if (o && U.chance(0.01)) { b.shoveT = 0.12; b.shoveDx = o.x - p.x; b.shoveDy = o.y - p.y; return { x: b.shoveDx, y: b.shoveDy, a: true }; }
      }
    }
    if (!goal || U.dist(p.x, p.y, goal.x, goal.y) < 6) return {};
    return this.steer(g, p, goal);
  },

  // anda em direção ao alvo sem pisar em buraco (testa ângulos alternativos)
  steer(g, p, goal) {
    const base = Math.atan2(goal.y - p.y, goal.x - p.x);
    for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
      const ang = base + off, look = Math.min(26, TN.util.dist(p.x, p.y, goal.x, goal.y));
      const ok = [0.5, 1].every((k) => this.roomy(g, p.x + Math.cos(ang) * look * k, p.y + Math.sin(ang) * look * k, 9));
      if (ok) return { x: Math.cos(ang), y: Math.sin(ang) };
    }
    return {};
  },

  drawSym(c, s, x, y, size, color, lw = 3) {
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw;
    const h = size / 2;
    if (s === 0) { c.beginPath(); c.moveTo(x - h, y - h); c.lineTo(x + h, y + h); c.moveTo(x + h, y - h); c.lineTo(x - h, y + h); c.stroke(); }
    else if (s === 1) { c.strokeRect(x - h, y - h, size, size); }
    else if (s === 2) { c.beginPath(); c.arc(x, y, h, 0, Math.PI * 2); c.stroke(); }
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Grade de ladrilhos de metal sobre um poço escuro com borda zebrada. Ladrilhos que caem afundam no
  // poço (y negativo) e voltam subindo; símbolos brilhantes em cima (✖ = duas barras, ■ = placa, ● = anel).
  // Dois monitores altos nas laterais mostram o símbolo seguro e a barra do tempo.
  camera: { pos: [480, 650, 790], target: [480, 0, 280], fov: 43 },
  env: { bg: '#07060a', fog: [1000, 2200], ambient: 0.5, sun: 1.6, sunDir: [-0.25, 1, 0.45], sunColor: '#f1dcff' },

  // símbolo deitado no chão (em cima do ladrilho)
  sym3d(r, s, x, y, z, k = 1) {
    const col = this.SYM_COLORS[s], h = 9 * k;
    if (s === 0) {
      r.beam(x - h, y + 1.5, z - h, x + h, y + 1.5, z + h, 4 * k, col, { glow: true });
      r.beam(x - h, y + 1.5, z + h, x + h, y + 1.5, z - h, 4 * k, col, { glow: true });
    } else if (s === 1) r.box(x, y, z, 17 * k, 2.5, 17 * k, col, { glow: true });
    else r.ring(x, y + 0.6, z, 6 * k, 10.5 * k, col, { glow: true });
  },
  // símbolo em pé (na tela de um monitor, virado para +z)
  symScreen(r, s, x, y, z, size, col, o = {}) {
    const h = size / 2;
    if (s === 0) {
      r.beam(x - h, y - h, z, x + h, y + h, z, size * 0.16, col, { glow: true, ...o });
      r.beam(x - h, y + h, z, x + h, y - h, z, size * 0.16, col, { glow: true, ...o });
    } else if (s === 1) {
      r.box(x, y - h, z, size, size, 1.5, col, { glow: true, ...o });
      r.box(x, y - h * 0.68, z + 0.3, size * 0.68, size * 0.68, 1.5, '#0b0e14', {});
    } else r.ring(x, y, z, h * 0.68, h, col, { glow: true, rotX: Math.PI / 2, ...o });
  },

  draw3d(g, r) {
    const d = g.data, T = this.TILE, U = TN.util;
    const W = this.COLS * T, H = this.ROWS * T, cx0 = d.gx + W / 2, cz0 = d.gy + H / 2, PIT = 420;
    const lights = [];
    // ---- piso do galpão em volta, poço, borda ----
    const outer = '#1b1d22';
    r.box(cx0, -20, d.gy - 140, 1800, 20, 280 - 20, outer, { rough: 0.95 });
    r.box(cx0, -20, d.gy + H + 160, 1800, 20, 300 + 20, outer, { rough: 0.95 });
    r.box(d.gx - 300 - 10, -20, cz0, 600, 20, H + 20, outer, { rough: 0.95 });
    r.box(d.gx + W + 300 + 10, -20, cz0, 600, 20, H + 20, outer, { rough: 0.95 });
    // paredes internas do poço e fundo
    r.box(cx0, -PIT, d.gy - 6, W + 12, PIT - 8, 12, '#16131c', { rough: 1 });
    r.box(cx0, -PIT, d.gy + H + 6, W + 12, PIT - 8, 12, '#16131c', { rough: 1 });
    r.box(d.gx - 6, -PIT, cz0, 12, PIT - 8, H, '#16131c', { rough: 1 });
    r.box(d.gx + W + 6, -PIT, cz0, 12, PIT - 8, H, '#16131c', { rough: 1 });
    r.plane(cx0, -PIT, cz0, W, H, '#1a0d24', { glow: true });
    // borda zebrada (moldura)
    const rim = (x, z, w, dd, n, alongX) => {
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (alongX) r.box(x - w / 2 + t * w, -2, z, w / n, 4, dd, k % 2 ? '#141414' : '#e0b400', { shadow: false });
        else r.box(x, -2, z - dd / 2 + t * dd, w, 4, dd / n, k % 2 ? '#141414' : '#e0b400', { shadow: false });
      }
    };
    rim(cx0, d.gy - 10, W + 40, 16, 22, true);
    rim(cx0, d.gy + H + 10, W + 40, 16, 22, true);
    rim(d.gx - 10, cz0, 16, H, 12, false);
    rim(d.gx + W + 10, cz0, 16, H, 12, false);
    // ---- ladrilhos ----
    for (const t of d.tiles) {
      if (t.fall >= 1 && t.state === 'gone') continue;
      const x = d.gx + (t.c + 0.5) * T, z = d.gy + (t.r + 0.5) * T;
      const y = -t.fall * t.fall * 260;
      const dark = t.fall > 0.5;
      const col = dark ? '#2a2f38' : (t.c + t.r) % 2 ? '#4a5263' : '#55607a';
      r.box(x, y - 10, z, T - 4, 10, T - 4, col, { metal: 0.55, rough: 0.45, rotX: t.fall * 0.35 * ((t.c % 2) ? 1 : -1), rotZ: t.fall * 0.25 });
      if (t.sym >= 0 && t.fall < 0.5) this.sym3d(r, t.sym, x, y + 0.2, z);
    }
    // ---- monitores laterais com o símbolo seguro ----
    for (const px of [d.gx / 2 + 4, g.W - d.gx / 2 - 4]) this.drawMonitor3d(g, r, px, cz0 - 70, 0, lights);
    // ---- holofotes ----
    lights.push([cx0 - 220, 260, cz0 - 40, '#ffe0c0', 0.9, 700], [cx0 + 220, 260, cz0 - 40, '#ffe0c0', 0.9, 700]);
    if (d.phase === 'drop') lights.unshift([cx0, -120, cz0, '#c86bff', 1.6, 600]);
    for (const l of lights.slice(0, 6)) r.light(...l);
    // ---- jogadores ----
    for (const p of g.players) {
      if (p.alive) {
        const busy = p.data.wind > 0;
        r.character(p, { pose: busy ? 'arms' : 'auto', flash: Math.hypot(p.vx, p.vy) > 40 || busy });
        continue;
      }
      const ft = p.data.fallT;
      if (ft < 0 || ft > 1.3) continue;
      r.character(p, { pose: 'fall', y: -0.5 * 900 * ft * ft, label: ft < 0.5 ? undefined : false });
    }
  },

  drawMonitor3d(g, r, x, z, rot, lights) {
    const d = g.data;
    // pedestal e gabinete
    r.box(x, 0, z, 40, 8, 40, '#22252b', { metal: 0.6 });
    r.cyl(x, 8, z, 6, 70, '#3a3f47', { metal: 0.7, rough: 0.35 });
    r.box(x, 70, z, 88, 150, 16, '#2b2f37', { metal: 0.5, rough: 0.5, rotY: rot });
    const fx = Math.sin(rot) * 9, fz = Math.cos(rot) * 9;     // frente da tela (+z girado)
    const sx = x + fx, sz = z + fz;
    r.box(sx, 78, sz, 78, 134, 1, '#0b0e14', { rotY: rot });
    r.box(sx, 220, sz - fz * 0.2, 88, 4, 2, d.phase === 'final' ? '#c86bff' : '#3a3344', { glow: true, rotY: rot });
    if (d.display >= 0) {
      const col = this.SYM_COLORS[d.display];
      const pulse = d.decoy ? 1 : 1 + Math.sin(g.time * 10) * 0.06;
      // símbolo de mentira: apagado (cor escura) ; seguro: aceso e pulsando
      this.symScreen(r, d.display, sx + Math.sin(rot) * 1.5, 170, sz + Math.cos(rot) * 1.5, 48 * pulse, col, { opacity: d.decoy ? 0.35 : 1, rotY: rot });
      if (d.phase === 'final') {
        const k = TN.util.clamp(1 - d.phaseT / d.phaseDur, 0, 1);
        r.box(sx + Math.sin(rot) * 1.5 - Math.cos(rot) * 30 * (1 - k), 96, sz + Math.cos(rot) * 1.5 + Math.sin(rot) * 30 * (1 - k), Math.max(1, 60 * k), 8, 1, '#c86bff', { glow: true, rotY: rot });
      }
      if (!d.decoy) lights.push([sx + fx * 3, 160, sz + fz * 3, col, 0.9, 260]);
    }
    const label = d.display >= 0 ? (d.decoy ? 'EMBARALHANDO' : 'SEGURO') : d.phase === 'drop' ? 'CAIU' : 'AGUARDE';
    const lcol = d.display >= 0 ? (d.decoy ? '#888' : '#fff') : d.phase === 'drop' ? '#f55' : '#888';
    r.label(sx, d.display >= 0 ? 118 : 150, sz, label, lcol, d.decoy ? 10 : 14);
  },

  draw(g, c) {
    const d = g.data, T = this.TILE, D = TN.draw, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    const W = this.COLS * T, H = this.ROWS * T;
    // poço
    const gr = c.createRadialGradient(g.W / 2, d.gy + H / 2, 40, g.W / 2, d.gy + H / 2, W * 0.6);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#16121c');
    c.fillStyle = gr; c.fillRect(d.gx - 6, d.gy - 6, W + 12, H + 12);
    c.strokeStyle = '#3a3344'; c.lineWidth = 4; c.strokeRect(d.gx - 8, d.gy - 8, W + 16, H + 16);
    // ladrilhos
    for (const t of d.tiles) {
      if (t.state === 'gone' && t.fall >= 1) continue;
      const cx = d.gx + (t.c + 0.5) * T, cy = d.gy + (t.r + 0.5) * T;
      const s = 1 - t.fall * 0.7, sz = (T - 4) * s;
      c.globalAlpha = 1 - t.fall * 0.9;
      c.fillStyle = (t.c + t.r) % 2 ? '#3b4250' : '#424a59';
      c.fillRect(cx - sz / 2, cy - sz / 2, sz, sz);
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(cx - sz / 2, cy - sz / 2, sz, 4 * s);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(cx - sz / 2, cy + sz / 2 - 4 * s, sz, 4 * s);
      if (t.sym >= 0) this.drawSym(c, t.sym, cx, cy, 18 * s, this.SYM_COLORS[t.sym], 3);
      c.globalAlpha = 1;
    }
    // painéis dos dois lados com o símbolo
    for (const px of [d.gx / 2 + 2, g.W - d.gx / 2 - 2]) this.drawPanel(g, c, px, d.gy + H / 2);
    // jogadores: caindo (encolhendo) e vivos
    for (const p of g.players) {
      if (p.alive) continue;
      const k = U.clamp(p.data.fallT / 0.7, 0, 1);
      if (k >= 1) continue;
      c.globalAlpha = 1 - k;
      D.robot(c, p.x, p.y, p.r * (1 - k * 0.8), p.color, { dir: p.dir + k * 6 });
      c.globalAlpha = 1;
    }
    for (const p of g.alive()) g.drawPlayer(c, p, { flash: Math.hypot(p.vx, p.vy) > 40 || p.data.wind > 0 });
  },

  drawPanel(g, c, x, y) {
    const d = g.data, D = TN.draw;
    const w = 76, h = 200;
    D.panel(c, x - w / 2, y - h / 2, w, h, { stroke: d.phase === 'final' ? '#c86bff' : '#3a3344' });
    if (d.display >= 0) {
      const col = this.SYM_COLORS[d.display];   // símbolo de mentira aparece colorido, mas apagado
      const pulse = d.decoy ? 1 : 1 + Math.sin(g.time * 10) * 0.06;
      c.globalAlpha = d.decoy ? 0.45 : 1;
      this.drawSym(c, d.display, x, y - 20, 40 * pulse, col, 6);
      c.globalAlpha = 1;
      D.text(c, d.decoy ? 'EMBARALHANDO' : 'SEGURO', x, y + 32, { size: d.decoy ? 9 : 13, color: d.decoy ? '#888' : '#fff', align: 'center' });
      if (d.phase === 'final') D.bar(c, x - 28, y + 54, 56, 8, 1 - d.phaseT / d.phaseDur, '#c86bff');
    } else if (d.phase === 'drop') {
      D.text(c, 'CAIU', x, y, { size: 16, color: '#f55', align: 'center' });
    } else {
      D.text(c, 'AGUARDE', x, y, { size: 12, color: '#888', align: 'center' });
    }
  },
});
