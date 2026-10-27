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

  // ---- constantes (original: grade 8×6 de ladrilhos de 4 m (a cena sobrescreve o padrão 20×12 do
  //      script), 3 embaralhamentos de 1 s, 3 s até cair, 3 s caído, 6 ladrilhos somem por ciclo,
  //      espera 7 s; empurrão 0,1 s de preparo + 0,3 s) ----
  COLS: 8, ROWS: 6, TILE: 90,
  SPEED: 175, SHOVE: 560, SHOVE_WIND: 0.1, SHOVE_LOCK: 0.4, SHOVE_RANGE: 58,
  SHUFFLES: 3, SHUFFLE_T: 1, DROP_T: 2.5, WAIT_T: 3, REMOVE: 6,
  TOLERANCIA: 0.15,          // segundos sem chão antes de cair (dá para cortar a quina entre dois pisos)
  JITTER: 0.3,               // variação da espera e da fase final, para a cadência não ser metronômica
  PADROES: ['blocos', 'faixas', 'aneis', 'tabuleiro', 'ruido'],
  SYMS: ['X', '■', '●'], SYM_COLORS: ['#ff4d6d', '#4dc3ff', '#ffd23f'],

  init(g) {
    const d = g.data;
    d.gx = g.W / 2 - (this.COLS * this.TILE) / 2; d.gy = 60;
    d.tiles = [];
    for (let r = 0; r < this.ROWS; r++) for (let c = 0; c < this.COLS; c++) d.tiles.push({ c, r, sym: -1, state: 'up', fall: 0 });
    d.phase = 'idle'; d.phaseT = 0; d.phaseDur = 1.0; d.shuffleN = 0; d.cycle = 0;
    d.display = -1; d.safe = -1; d.decoy = false;
    // como no original: um em cada um dos 4 ladrilhos do meio
    const cx = g.W / 2, cy = d.gy + (this.ROWS * this.TILE) / 2, h = this.TILE / 2;
    const spawns = [[-h, -h], [h, -h], [h, h], [-h, h]];
    g.players.forEach((p, i) => { p.x = cx + spawns[i % 4][0]; p.y = cy + spawns[i % 4][1]; p.dir = Math.PI / 2; });
    for (const p of g.players) Object.assign(p.data, { lock: 0, wind: 0, shoveT: 0, react: 0, fallT: -1, semChaoT: 0, target: null, misread: false, wander: null, wanderT: 0 });
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
  // sem chão = nenhum dos 5 pontos (centro e ±10 px) está sobre piso; antes só o centro contava e a quina
  // entre dois pisos derrubava o jogador
  semChao(g, p) { return [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].every(([ox, oy]) => !this.solid(this.tileAt(g, p.x + ox, p.y + oy))); },
  // layout final com um padrão sorteado (antes cada ladrilho era sorteado sozinho e os seguros ficavam esparsos)
  gerarLayout(g) {
    const U = TN.util, d = g.data, up = d.tiles.filter((t) => t.state === 'up');
    const alvo = 0.45 - 0.05 * Math.min(3, d.cycle);   // proporção segura: ~45% no 1º ciclo, ~30% no 4º
    const safe = U.randInt(0, 2), C = this.COLS, R = this.ROWS;
    const marca = (fn) => { for (const t of up) t.seg = !!fn(t); };
    for (let tent = 0; tent < 6; tent++) {
      d.padrao = tent < 5 ? U.pick(this.PADROES) : 'ruido';
      if (d.padrao === 'blocos') { const bl = {}; marca((t) => { const k = (t.c >> 1) + ',' + (t.r >> 1); if (bl[k] === undefined) bl[k] = U.chance(alvo); return bl[k]; }); }
      else if (d.padrao === 'faixas') { const porLinha = U.chance(0.5), li = {}; marca((t) => { const k = porLinha ? t.r : t.c; if (li[k] === undefined) li[k] = U.chance(alvo); return li[k]; }); }
      else if (d.padrao === 'aneis') { const an = {}; marca((t) => { const k = Math.max(Math.abs(t.c - (C - 1) / 2), Math.abs(t.r - (R - 1) / 2)) | 0; if (an[k] === undefined) an[k] = U.chance(alvo); return an[k]; }); }
      else if (d.padrao === 'tabuleiro') { const par = U.randInt(0, 1); marca((t) => ((t.c >> 1) + (t.r >> 1)) % 2 === par && U.chance(alvo / 0.5)); }
      else marca(() => U.chance(alvo));
      const frac = up.filter((t) => t.seg).length / Math.max(1, up.length);
      if (frac >= 0.25 && frac <= 0.6) break;
    }
    for (const t of up) { t.sym = t.seg ? safe : (safe + U.randInt(1, 2)) % 3; delete t.seg; }
    d.safe = safe; d.display = safe; d.decoy = false;
    this.garantir(g);
  },
  // cada vivo precisa de um piso seguro a até SPEED × final × 0,8; se não houver, o piso 'up' mais perto (fora o
  // que está sob ele) vira seguro. Ladrilhos 'gone' nunca voltam.
  garantir(g) {
    const d = g.data, alc = this.SPEED * d.phaseDur * 0.8, up = d.tiles.filter((t) => t.state === 'up');
    for (const p of g.alive()) {
      const dist = (t) => { const c = this.center(g, t); return Math.hypot(c.x - p.x, c.y - p.y); };
      if (up.some((t) => t.sym === d.safe && dist(t) <= alc)) continue;
      // nunca o piso sob o jogador: quem fica parado tem que andar, senão a rodada não acaba
      const perto = up.filter((t) => dist(t) > this.TILE * 0.75).sort((a, b) => dist(a) - dist(b))[0];
      if (perto) perto.sym = d.safe;
    }
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
        // layout final: padrão sorteado, com um piso seguro garantido ao alcance de cada um
        this.setPhase(g, 'final', Math.max(1.0, 3 - d.cycle * 0.45 + U.rand(-this.JITTER, this.JITTER)));
        this.gerarLayout(g); g.sfx('select');
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
        this.setPhase(g, 'idle', this.WAIT_T + U.rand(-this.JITTER, this.JITTER)); g.sfx('step');
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
      p.data.semChaoT = this.semChao(g, p) ? p.data.semChaoT + dt : 0;
      if (p.data.semChaoT > this.TOLERANCIA) {
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
  // Como no original (Stable Footing): um fosso de concreto fundo, sem chão em volta. A grade 8×6 de
  // chapas de aço sobre pistões fica no meio do fosso, com um vão escuro até as paredes. Nas paredes
  // laterais, dois dutos de ventilação redondos; no alto da parede do fundo, as três janelas gradeadas da
  // sala de controle: as duas primeiras têm os monitores com o símbolo seguro, a terceira está quebrada.
  // Ladrilhos que caem afundam no fosso (y negativo) e voltam subindo; símbolos brilhantes em cima
  // (✖ = duas barras, ■ = placa, ● = anel). Escala: 1 m do original = 22,5 (ladrilho de 4 m = 90).
  camera: { pos: [480, 330, 745], target: [480, 0, 318], fov: 66 },
  env: { bg: '#050505', fog: [900, 2300], ambient: 0.55, sun: 1.1, sunDir: [-0.2, 1, 0.5], sunColor: '#e8e2d2' },
  POCO: { x1: 60, x2: 900, z1: -10, z2: 665, topo: 288, fundo: -900 },

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
    const d = g.data, T = this.TILE, P = this.POCO;
    const W = this.COLS * T, H = this.ROWS * T, cx0 = d.gx + W / 2, cz0 = d.gy + H / 2;
    const lights = [];
    // ---- fosso de concreto: as paredes descem até o fundo escuro ----
    const conc = '#6d6a63', borda = '#7c786f', co = { rough: 0.95, tex: 'concreto' }, alt = P.topo - P.fundo;
    r.box(cx0, P.fundo, P.z1 - 20, P.x2 - P.x1 + 80, alt, 40, conc, co);                          // fundo
    r.box(P.x1 - 20, P.fundo, (P.z1 + P.z2) / 2, 40, alt, P.z2 - P.z1, conc, co);                // esquerda
    r.box(P.x2 + 20, P.fundo, (P.z1 + P.z2) / 2, 40, alt, P.z2 - P.z1, conc, co);                // direita
    r.box(cx0, P.fundo, P.z2 + 20, P.x2 - P.x1 + 80, 14 - P.fundo, 40, conc, co);               // frente: mureta baixa, perto da câmera
    r.box(cx0, 14, P.z2 + 26, P.x2 - P.x1 + 120, 6, 56, borda, co);
    // beiral no alto das paredes (a borda do fosso)
    r.box(cx0, P.topo, P.z1 - 14, P.x2 - P.x1 + 60, 10, 50, borda, co);
    for (const sx of [P.x1 - 14, P.x2 + 14]) r.box(sx, P.topo, (P.z1 + P.z2) / 2, 50, 10, P.z2 - P.z1, borda, co);
    // manchas de umidade escorrendo
    for (let k = 0; k < 6; k++) for (const sx of [P.x1 + 1, P.x2 - 1]) r.box(sx, -160 + (k % 3) * 40, 40 + k * 105, 2, 330, 14 + (k % 2) * 10, '#4a4842', { tex: false, shadow: false });
    for (let k = 0; k < 7; k++) r.box(110 + k * 125, -200 + (k % 2) * 60, P.z1 + 1, 16, 300, 2, '#4a4842', { tex: false, shadow: false });
    r.plane(cx0, P.fundo + 2, (P.z1 + P.z2) / 2, P.x2 - P.x1, P.z2 - P.z1, '#0a0909', { tex: false });
    // ---- dutos de ventilação redondos nas paredes laterais (vent1/vent2 do original) ----
    for (const side of [-1, 1]) {
      const wx = side < 0 ? P.x1 : P.x2, vy = 172, vz = 215, R = 80;
      r.tube(wx - side * 34, vy, vz, wx + side * 4, vy, vz, R + 10, '#6a4630', { metal: 0.5, rough: 0.7 });   // aro enferrujado
      r.tube(wx - side * 35, vy, vz, wx - side * 30, vy, vz, R - 2, '#0b0c0c', { tex: false });              // boca escura
      for (let k = -4; k <= 4; k++) {   // aletas horizontais
        const y = vy + k * 16, half = Math.sqrt(Math.max(0, (R - 6) ** 2 - (k * 16) ** 2));
        if (half > 4) r.beam(wx - side * 38, y, vz - half, wx - side * 38, y - 5, vz + half, 5, '#57504a', { metal: 0.6, rough: 0.5 });
      }
    }
    // ---- três janelas da sala de controle no alto da parede do fundo ----
    [213, 480, 747].forEach((x, i) => this.drawJanela3d(g, r, x, P.z1, i, lights));
    // ---- grade de chapas de aço sobre pistões ----
    for (const t of d.tiles) {
      if (t.fall >= 1 && t.state === 'gone') continue;
      const x = d.gx + (t.c + 0.5) * T, z = d.gy + (t.r + 0.5) * T;
      const y = -t.fall * t.fall * 260;
      const col = t.fall > 0.5 ? '#2a2f38' : (t.c + t.r) % 2 ? '#4c5562' : '#58616f';
      r.box(x, y - 12, z, T - 6, 12, T - 6, col, { metal: 0.55, rough: 0.45, rotX: t.fall * 0.25 * ((t.c % 2) ? 1 : -1), rotZ: t.fall * 0.18 });
      r.cyl(x, y - 272, z, 10, 260, '#3b3f44', { metal: 0.8, rough: 0.35 });   // pistão
      if (t.sym >= 0 && t.fall < 0.5) this.sym3d(r, t.sym, x, y + 0.2, z, 1.6);
    }
    // ---- luzes: a lâmpada no alto do fosso (a OmniLight do original) e uma de serviço do lado da câmera ----
    lights.push([cx0, 230, cz0 - 60, '#e4e0d4', 1.4, 900], [cx0, 280, P.z2 + 40, '#c9d0d8', 0.45, 700]);
    if (d.phase === 'drop') lights.unshift([cx0, -160, cz0, '#c86bff', 1.6, 600]);
    for (const l of lights.slice(0, 6)) r.light(...l);
    // ---- jogadores ----
    for (const p of g.players) {
      if (p.alive) {
        const busy = p.data.wind > 0;
        r.character(p, { pose: busy ? 'work' : 'auto', flash: Math.hypot(p.vx, p.vy) > 40 || busy });
        continue;
      }
      const ft = p.data.fallT;
      if (ft < 0 || ft > 1.3) continue;
      r.character(p, { pose: 'fall', y: -0.5 * 900 * ft * ft, label: ft < 0.5 ? undefined : false });
    }
  },

  // Janela gradeada da sala de controle: moldura de ferro, vão escuro e, atrás, a tela de um monitor.
  // i = 0 e 1 mostram o símbolo (como as duas telas do original); i = 2 está quebrada (cacos e faísca).
  drawJanela3d(g, r, x, zw, i, lights) {
    const d = g.data, y0 = 96, wh = 132, ww = 128, z = zw + 2;
    r.box(x, y0 - 9, z, ww + 22, wh + 18, 6, '#45372a', { metal: 0.5, rough: 0.7 });   // moldura enferrujada
    r.box(x, y0, z + 3.5, ww, wh, 1, '#07090b', { tex: false });                      // vão escuro
    r.box(x, y0 - 12, z + 8, ww + 30, 6, 16, '#7c786f', { tex: 'concreto' });          // peitoril
    if (i === 2) {
      for (let k = 0; k < 5; k++) r.beam(x - ww / 2 + 12 + k * 25, y0 + 12 + (k % 2) * 56, z + 5, x - ww / 2 + 30 + k * 22, y0 + wh - 18 - (k % 3) * 28, z + 5, 2, '#9aa7a8', { opacity: 0.6, shadow: false });
      if (Math.sin(g.time * 7.3) > 0.93) { r.sphere(x + 20, y0 + 50, z + 8, 4, '#ffe8a0', { glow: true }); lights.push([x + 20, y0 + 50, z + 30, '#ffd890', 0.6, 160]); }
      return;
    }
    for (let k = 1; k < 4; k++) r.tube(x - ww / 2 + k * ww / 4, y0, z + 7, x - ww / 2 + k * ww / 4, y0 + wh, z + 7, 1.8, '#3a3836', { metal: 0.6 });
    const sz = z + 4.5;
    r.box(x, y0 + wh - 8, sz, ww - 8, 3, 1, d.phase === 'final' ? '#c86bff' : '#2c2834', { glow: true });
    if (d.display >= 0) {
      const col = this.SYM_COLORS[d.display];
      const pulse = d.decoy ? 1 : 1 + Math.sin(g.time * 10) * 0.06;
      // símbolo de mentira: apagado; seguro: aceso e pulsando
      this.symScreen(r, d.display, x, y0 + 74, sz, 64 * pulse, col, { opacity: d.decoy ? 0.35 : 1 });
      if (d.phase === 'final') {
        const k = TN.util.clamp(1 - d.phaseT / d.phaseDur, 0, 1);
        r.box(x - 50 * (1 - k), y0 + 12, sz, Math.max(1, 100 * k), 8, 1, '#c86bff', { glow: true });
      }
      if (!d.decoy) lights.push([x, y0 + 70, sz + 80, col, 0.9, 340]);
    }
    const label = d.display >= 0 ? (d.decoy ? 'EMBARALHANDO' : 'SEGURO') : d.phase === 'drop' ? 'CAIU' : 'AGUARDE';
    const lcol = d.display >= 0 ? (d.decoy ? '#888' : '#fff') : d.phase === 'drop' ? '#f55' : '#888';
    r.label(x, d.display >= 0 ? y0 - 24 : y0 + 60, sz, label, lcol, d.decoy ? 10 : 14);
  },

  draw(g, c) {
    const d = g.data, T = this.TILE, D = TN.draw, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    const W = this.COLS * T, H = this.ROWS * T;
    // a grade (720×540) não cabe na tela de 960×540 com o HUD: desenha a lógica em escala, centrada
    const K = 0.84, cy0 = d.gy + H / 2;
    c.save(); c.translate(g.W / 2, 292); c.scale(K, K); c.translate(-g.W / 2, -cy0);
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
    c.restore();
    // painéis dos dois lados com o símbolo (fora da escala, nas margens)
    for (const px of [92, g.W - 92]) this.drawPanel(g, c, px, 292);
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
