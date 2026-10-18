// TRIAGEM — inspirado em "THE FILTER" (burn_recycle) de Machine Party.
// Cada um tem a sua esteira, com a MESMA sequência de itens para todos. Arte vai para o fogo,
// tecnologia vai para a reciclagem. No fim de cada turno, o pior da linha é esmagado pela prensa.
// Vários turnos (cada um 1 s mais curto) dentro da mesma rodada, até sobrar um.
TN.registerMinigame({
  id: 'triagem',
  title: 'TRIAGEM',
  inspiredBy: 'The Filter (burn_recycle)',
  tagline: 'A SOBREVIVÊNCIA É IMPROVÁVEL.',
  brief: ['Trabalhe na linha: queime a ARTE (vermelho).', 'Recicle a TECNOLOGIA (verde).', 'No fim do turno, o pior da linha é prensado.'],
  controls: { a: 'QUEIMAR (arte)', b: 'RECICLAR (tecnologia)' },
  icon: '♻',
  color: '#ff5a3c',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes (originais: turno 15 s, −1 s por turno, mín. 10; erro trava 0,2 s; 500 itens) ----
  FIRST_TIME: 15, MIN_TIME: 10, LOCK: 0.2, SEQ_LEN: 500, MAX_SUBS: 8,
  PAUSA: 1.5,              // pausa com contagem 3-2-1 entre os turnos
  SLOT_X: 178, SLOT_GAP: 68, VISIBLE: 10,
  // 8 tipos: 0–3 arte (queimar), 4–7 tecnologia (reciclar)
  ITEMS: [
    { name: 'QUADRO', art: true }, { name: 'BUSTO', art: true }, { name: 'VASO', art: true }, { name: 'PARTITURA', art: true },
    { name: 'CHIP', art: false }, { name: 'BATERIA', art: false }, { name: 'ENGRENAGEM', art: false }, { name: 'MONITOR', art: false },
  ],

  init(g) {
    const d = g.data, a = g.arena, U = TN.util;
    d.seq = [];
    for (let i = 0; i < this.SEQ_LEN; i++) d.seq.push(U.randInt(0, 7));
    d.sub = 1; d.subTime = this.FIRST_TIME; d.timer = d.subTime;
    d.phase = 'play';     // play → judge → pause → play ...
    d.banner = null;
    d.flying = [];        // itens saindo da esteira (animação)
    const n = g.players.length, laneH = Math.min(102, a.h / n);
    const top = a.y + (a.h - laneH * n) / 2;
    g.players.forEach((p, i) => {
      p.x = 92; p.y = top + laneH * i + laneH / 2; p.dir = 0;
      Object.assign(p.data, { lane: { y: top + laneH * i, h: laneH }, idx: 0, sub: 0, total: 0, lock: 0, wrong: 0, shift: 0, crush: 0 });
    });
  },

  // Age no item ativo: certo +1, errado trava; em ambos a esteira avança.
  act(g, p, burn) {
    const d = g.data, pd = p.data;
    const item = this.ITEMS[d.seq[pd.idx % d.seq.length]];
    const ok = item.art === burn;
    d.flying.push({ type: d.seq[pd.idx % d.seq.length], x: this.SLOT_X, y: p.y, vy: burn ? -260 : 260, t: 0.35, burn, lane: p });
    pd.idx++; pd.shift = 1;
    if (ok) {
      pd.sub++; pd.total++;
      g.sfx(burn ? 'shoot' : 'coin');
      g.particles(this.SLOT_X, p.y, burn ? '#ff7a2a' : '#46e27b', 6, 120, 0.35);
    } else {
      pd.lock = this.LOCK; pd.wrong = 0.3;
      g.sfx('buzz');
    }
  },

  update(g, dt) {
    const d = g.data;
    if (d.phase === 'play') {
      d.timer -= dt;
      if (d.timer <= 3 && d.timer > 0 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt)) g.sfx('tick');
      if (d.timer <= 0) this.endSub(g);
    } else if (d.phase === 'pause') {
      d.pauseT -= dt;
      const n = Math.ceil(d.pauseT / (this.PAUSA / 3));   // 3 → 2 → 1 → 0
      if (n !== d.contagem && n > 0) g.sfx('tick');
      d.contagem = Math.max(0, n);
      if (d.pauseT <= 0) {
        d.phase = 'play'; d.timer = d.subTime;
        g.sfx('go'); g.flash('#fff', 0.1); g.message('JÁ!', 0.6, '#ff5a3c');
      }
    }
    for (const p of g.players) {
      const pd = p.data;
      pd.lock -= dt; pd.wrong -= dt; pd.shift = Math.max(0, pd.shift - dt * 9); pd.subFlash = Math.max(0, (pd.subFlash || 0) - dt);
      if (pd.crush > 0) pd.crush = Math.min(1, pd.crush + dt * 4);
      if (!p.alive) pd.deadT = (pd.deadT || 0) + dt;   // só para a animação 3D da prensa subindo
      if (!p.alive || d.phase !== 'play' || pd.lock > 0) continue;
      if (p.input.aPressed) this.act(g, p, true);
      else if (p.input.bPressed) this.act(g, p, false);
    }
    for (const f of d.flying) { f.y += f.vy * dt; f.t -= dt; }
    d.flying = d.flying.filter((f) => f.t > 0);
  },

  // Fim do turno: decide quem a prensa esmaga.
  endSub(g) {
    const d = g.data, U = TN.util;
    d.phase = 'judge'; d.timer = 0;
    g.sfx('buzz');
    const al = g.alive();
    const min = Math.min(...al.map((p) => p.data.sub));
    const lows = al.filter((p) => p.data.sub === min);
    let victim = null;
    if (min === 0) victim = U.pick(lows);          // ninguém pontuou? sorteia um dos zerados
    else if (lows.length === 1) victim = lows[0];  // menor pontuação única
    d.banner = victim ? { text: `PIOR DA LINHA: ${victim.label} (${min})`, color: '#f55' } : { text: `EMPATE NO ÚLTIMO LUGAR (${min}): NINGUÉM SAI`, color: '#9f9' };
    g.after(1.3, () => {
      if (victim) {
        victim.data.crush = 0.01;
        g.after(0.3, () => { g.eliminate(victim, { sound: 'boom', msg: 'PRENSADO!' }); g.shake(10); g.particles(victim.x, victim.y, '#999', 20, 200); });
      }
      g.after(1.4, () => {
        if (g.alive().length <= 1) return; // o motor encerra a rodada
        if (d.sub >= this.MAX_SUBS) {
          // limite de segurança: fecha o expediente; quem fez menos no total sai primeiro (empatados no topo ficam)
          const rest = g.alive().sort((p, q) => p.data.total - q.data.total);
          const best = rest[rest.length - 1].data.total;
          for (const p of rest) if (p.data.total < best) g.eliminate(p, { sound: 'hurt', msg: 'DEMITIDO' });
          d.banner = { text: 'EXPEDIENTE ENCERRADO', color: '#9f9' };
          g.finish(1.5);
          return;
        }
        d.banner = null;
        d.sub++;
        d.subTime = Math.max(this.MIN_TIME, this.FIRST_TIME - (d.sub - 1));
        // pausa com contagem 3-2-1 antes do turno: sem ela o turno novo começava seco e ninguém percebia
        d.phase = 'pause'; d.pauseT = this.PAUSA; d.contagem = 3;
        for (const p of g.players) { p.data.sub = 0; p.data.subFlash = 0.5; }
        g.sfx('tick');
      });
    });
  },

  // Bot: reação de 0,25–0,45 s e acerta ~88% das vezes.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (b.wait === undefined) b.wait = U.rand(0.25, 0.45);
    if (d.phase !== 'play' || b.lock > 0) return {};
    b.wait -= dt;
    if (b.wait > 0) return {};
    b.wait = U.rand(0.25, 0.45);
    const art = this.ITEMS[d.seq[b.idx % d.seq.length]].art;
    const burn = U.chance(0.88) ? art : !art;
    return burn ? { a: true } : { b: true };
  },

  // ---------- 3D (câmera fixa): X = x da lógica, Z = baia, esteiras correndo da esquerda para a direita ----------
  camera: { pos: [480, 600, 930], target: [480, 0, 280], fov: 39 },
  env: { ambient: 0.5, sun: 1.7, sunDir: [-0.4, 1, 0.5] },

  // item 3D low-poly sobre uma bandeja vermelha (arte) ou verde (tecnologia); base em y
  item3d(r, type, x, y, z, k = 1, op = 1) {
    const it = this.ITEMS[type], o = op < 1 ? { opacity: op } : {};
    r.box(x, y, z, 40 * k, 2, 40 * k, it.art ? '#6a1d1d' : '#174a27', { emissive: it.art ? '#3a0606' : '#06280f', ...o });
    y += 2;
    switch (type) {
      case 0: // quadro: moldura dourada em pé com a pintura
        r.box(x, y, z, 30 * k, 24 * k, 4 * k, '#c9a24a', { metal: 0.6, rough: 0.4, ...o });
        r.box(x, y + 4 * k, z + 2.2 * k, 22 * k, 16 * k, 1, '#5fa8e8', { emissive: '#12324f', ...o });
        break;
      case 1: // busto em pedestal
        r.box(x, y, z, 16 * k, 8 * k, 16 * k, '#9b958a', o);
        r.box(x, y + 8 * k, z, 20 * k, 7 * k, 10 * k, '#e8e2d6', o);
        r.sphere(x, y + 21 * k, z, 7 * k, '#e8e2d6', { rough: 0.5, ...o });
        break;
      case 2: // vaso de cerâmica
        r.sphere(x, y + 10 * k, z, 10 * k, '#d0703a', { rough: 0.6, ...o });
        r.cyl(x, y + 16 * k, z, 4.5 * k, 10 * k, '#c0602c', o);
        break;
      case 3: // partitura num suporte
        r.box(x, y, z, 26 * k, 20 * k, 2, '#f2ecd9', { rotX: -0.35, ...o });
        r.sphere(x - 4 * k, y + 8 * k, z + 3, 3.2 * k, '#111', o);
        r.box(x + 1 * k, y + 8 * k, z + 2.5, 1.6, 12 * k, 1.6, '#111', o);
        break;
      case 4: // chip
        r.box(x, y, z, 24 * k, 5 * k, 24 * k, '#1d1f22', { metal: 0.4, ...o });
        r.box(x, y + 5 * k, z, 10 * k, 1.5, 10 * k, '#46e27b', { glow: true, ...o });
        r.box(x, y + 1, z, 30 * k, 2, 6 * k, '#c8c8c8', { metal: 0.9, rough: 0.3, ...o });
        break;
      case 5: // bateria
        r.cyl(x, y, z, 8 * k, 24 * k, '#d8d8d8', { metal: 0.5, rough: 0.4, ...o });
        r.cyl(x, y + 6 * k, z, 8.4 * k, 11 * k, '#2fbf62', o);
        r.cyl(x, y + 24 * k, z, 3 * k, 3 * k, '#999', { metal: 0.8, ...o });
        break;
      case 6: // engrenagem
        r.cyl(x, y, z, 11 * k, 6 * k, '#b8c0c8', { metal: 0.85, rough: 0.3, ...o });
        r.box(x, y, z, 28 * k, 6 * k, 5 * k, '#a9b1b9', { metal: 0.85, rough: 0.3, ...o });
        r.box(x, y, z, 5 * k, 6 * k, 28 * k, '#a9b1b9', { metal: 0.85, rough: 0.3, ...o });
        break;
      default: // monitor
        r.box(x, y, z, 8 * k, 6 * k, 8 * k, '#888', o);
        r.box(x, y + 6 * k, z, 30 * k, 20 * k, 5 * k, '#c4c4c4', { metal: 0.3, ...o });
        r.box(x, y + 9 * k, z + 2.8 * k, 24 * k, 14 * k, 1, '#1d6b3f', { glow: true, ...o });
    }
  },

  draw3d(g, r) {
    const a = g.arena, d = g.data;
    const BX0 = this.SLOT_X - 34, BX1 = a.x + a.w - 96, BH = 22, SX = this.SLOT_X;
    // incinerador do subsolo: sala de concreto com a boca da fornalha na parede; mureta atrás das baias
    const zp = a.y - 60;
    r.room(a.x - 90, zp, a.x + a.w + 90, a.y + a.h + 60, { estilo: 'subsolo' });
    r.box(480, 0, zp + 6, 200, 120, 14, '#2a2725', { metal: 0.4 });                       // fornalha
    r.box(480, 14, zp + 13, 150, 70, 2, '#1a0a04', { tex: false });
    r.box(480, 21, zp + 14.5, 136, 56, 1, '#ff5a1a', { glow: true, opacity: 0.55 });
    r.box(480, 0, a.y - 14, a.w + 60, 40, 20, '#363b42', { metal: 0.3 });
    for (let i = 0; i < 9; i++) r.box(a.x + 6 + i * (a.w - 12) / 8, 0, a.y - 3, 26, 4, 2, i % 2 ? '#111' : '#f5c400', { shadow: false });
    r.box(a.x - 12, 0, a.y + a.h / 2, 20, 46, a.h + 8, '#40464e', { metal: 0.3 });
    r.box(a.x + a.w + 12, 0, a.y + a.h / 2, 20, 46, a.h + 8, '#40464e', { metal: 0.3 });
    r.light(300, 300, 160, '#ffd9a8', 0.7, 700);
    r.light(660, 300, 400, '#ffd9a8', 0.7, 700);
    for (const p of g.players) {
      const pd = p.data, L = pd.lane, cy = p.y, dead = !p.alive;
      // baia
      r.plane(480, 0, cy, a.w, L.h - 6, dead ? '#141518' : '#1d2126', { rough: 0.95 });
      r.plane(a.x + 4, 0.4, cy, 8, L.h - 6, dead ? '#333' : p.color, { glow: !dead });
      r.plane(480, 0.4, L.y + 2, a.w, 2, '#f5c400', { opacity: 0.35 });
      // esteira: corpo, lona, roletes nas pontas e ripas que andam junto com os itens
      r.box((BX0 + BX1) / 2, 0, cy, BX1 - BX0, BH, 60, '#2a2e34', { metal: 0.5, rough: 0.5 });
      r.plane((BX0 + BX1) / 2, BH + 0.3, cy, BX1 - BX0 - 4, 56, '#16181b', { rough: 0.9 });
      for (const ex of [BX0, BX1]) this.hcylZ(r, ex, BH / 2 + 1, cy, 62, BH / 2 + 1, '#4a5058');
      for (let k = 0; k < this.VISIBLE; k++) {
        const x = SX + 34 + (k + pd.shift) * this.SLOT_GAP;
        if (x > BX1 - 6 || x < BX0 + 4) continue;
        r.box(x, BH, cy, 3, 1.2, 56, '#2f343b', { shadow: false });
      }
      // incinerador (atrás do item ativo) e calha de reciclagem (na frente)
      const fl = Math.round((0.6 + 0.4 * Math.sin(g.time * 14 + p.id * 1.7)) * 5) / 5;
      r.box(SX, 0, cy - 41, 70, 34, 14, '#26292e', { metal: 0.5 });
      r.box(SX, 34, cy - 41, 60, 1, 10, dead ? '#2a1a12' : '#ff7a1a', { glow: !dead, opacity: dead ? 1 : 0.5 + 0.5 * fl });
      if (!dead) r.light(SX, 50, cy - 46, '#ff7a2a', 0.35 + 0.25 * fl, 120);
      r.box(SX, 0, cy + 41, 70, 12, 14, '#1d3a27', { metal: 0.4 });
      r.box(SX, 12, cy + 41, 60, 1, 10, dead ? '#13241a' : '#2fbf62', { glow: !dead });
      // itens da fila (o primeiro é o ativo)
      if (!dead) {
        for (let k = this.VISIBLE - 1; k >= 0; k--) {
          const x = SX + (k + pd.shift) * this.SLOT_GAP;
          if (x > BX1 - 22) continue;
          this.item3d(r, d.seq[(pd.idx + k) % d.seq.length], x, BH + 0.5, cy, k === 0 ? 1.1 : 0.85);
        }
        // moldura do item ativo
        const wrong = pd.wrong > 0, fc = wrong ? '#ff3030' : '#ffd23f';
        r.beam(SX - 31, BH + 2, cy - 31, SX + 31, BH + 2, cy - 31, 2.5, fc, { glow: true });
        r.beam(SX - 31, BH + 2, cy + 31, SX + 31, BH + 2, cy + 31, 2.5, fc, { glow: true });
        r.beam(SX - 31, BH + 2, cy - 31, SX - 31, BH + 2, cy + 31, 2.5, fc, { glow: true });
        r.beam(SX + 31, BH + 2, cy - 31, SX + 31, BH + 2, cy + 31, 2.5, fc, { glow: true });
        if (wrong) r.plane(SX, BH + 1, cy, 60, 60, '#ff2020', { glow: true, opacity: 0.35 });
      }
      // base do placar no fim da esteira
      r.box(a.x + a.w - 46, 0, cy, 70, 30, 50, '#22262b', { metal: 0.5 });
      r.box(a.x + a.w - 46, 30, cy - 20, 66, 1, 6, dead ? '#444' : p.color, { glow: !dead });
      // operador (de frente para a esteira)
      r.character(p, { pose: dead ? 'dead' : 'arms', dir: 0, flash: !dead && pd.wrong > 0.15 });
      // prensa hidráulica: desce do teto em cima do operador
      if (dead) r.disc(p.x + 26, 0.6, cy, 34, '#4a0c0c', { rough: 0.4 });
      const up = dead ? TN.util.clamp(((pd.deadT || 0) - 0.6) / 0.5, 0, 1) : 0;
      if ((pd.crush > 0 || dead) && up < 1) {
        // desce; 0,6 s depois da morte a prensa volta para o teto e deixa ver o operador esmagado
        const k = dead ? 1 : pd.crush;
        const hy = 200 - 192 * k + 320 * up, px = p.x + (dead ? 26 : 0);
        r.beam(px, hy + 18, cy, px, 320, cy, 10, '#9aa3ad', { metal: 0.9, rough: 0.25 });
        r.box(px, hy, cy, 70, 18, 64, '#f5c400', { metal: 0.3 });
        for (let i = 0; i < 4; i++) r.box(px - 26 + i * 17, hy - 0.5, cy + 32.5, 8, 19, 1.5, '#111', { shadow: false, rotZ: 0.5 });
      }
    }
    // itens saindo da esteira: para trás (fogo) ou para a frente (reciclagem), com arco e queda
    for (const f of d.flying) {
      const u = 1 - Math.max(0, f.t) / 0.35, dir = f.burn ? -1 : 1;
      const z = f.lane.y + dir * Math.min(u * 90, 40);
      const y = BH + 26 * Math.sin(Math.min(1, u * 1.4) * Math.PI) - (u > 0.65 ? (u - 0.65) * 90 : 0);
      this.item3d(r, f.type, f.x, Math.max(0, y), z, 0.75, Math.max(0.1, Math.round((1 - u) * 10) / 10));
    }
  },

  // cilindro deitado ao longo do eixo Z (roletes da esteira), centrado em x,z
  hcylZ(r, x, y, z, len, rad, color) {
    r.cyl(x, y, z - len / 2, rad, len, color, { metal: 0.8, rough: 0.3, rotX: Math.PI / 2 });
  },

  // placares por baia + faixa de status (2D por cima do 3D)
  drawOverlay(g, c) {
    if (!g.uses3d || !g.uses3d()) return;
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    for (const p of g.players) {
      const pd = p.data, dead = !p.alive;
      const s = TN.R3.project(a.x + a.w - 46, 30, p.y);
      D.panel(c, s.x - 34, s.y - 26, 68, 44, { stroke: dead ? '#444' : p.color, fill: 'rgba(0,0,0,0.7)' });
      D.text(c, dead ? '✖' : String(pd.sub), s.x, s.y - 4, { size: 28, color: dead ? '#f55' : pd.subFlash > 0 && Math.floor(g.time * 10) % 2 ? '#ff5a3c' : '#fff', align: 'center' });
    }
    const t = d.phase === 'play' ? d.timer : 0;
    c.fillStyle = 'rgba(8,10,13,0.7)'; c.fillRect(a.x, 37, a.w, 30);
    D.text(c, `TURNO ${d.sub}`, a.x + 10, 52, { size: 16, color: '#ff5a3c' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 4 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, 'AÇÃO: QUEIMAR ARTE', a.x + a.w - 250, 45, { size: 12, color: '#ff7a5a', align: 'left' });
    D.text(c, 'EXTRA: RECICLAR TECNOLOGIA', a.x + a.w - 250, 59, { size: 12, color: '#46e27b', align: 'left' });
    if (d.phase === 'pause') {
      D.text(c, `TURNO ${d.sub}`, g.W / 2, g.H / 2 - 40, { size: 40, color: '#ff5a3c', align: 'center' });
      D.text(c, String(d.contagem || 'JÁ!'), g.W / 2, g.H / 2 + 30, { size: 64, color: '#fff', align: 'center' });
    }
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, g.H / 2 - 26, 500, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, g.H / 2, { size: 20, color: d.banner.color, align: 'center' });
    }
  },

  // ---------- desenho 2D (alternativa sem WebGL): ícones (centro x,y; s = meia largura) ----------
  drawItem(c, type, x, y, s = 22) {
    const it = this.ITEMS[type];
    c.save(); c.translate(x, y);
    // base colorida (vermelho = arte, verde = tecnologia)
    c.fillStyle = it.art ? '#5a1a1a' : '#163f22'; c.strokeStyle = it.art ? '#ff5a4a' : '#46e27b'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-s, -s, s * 2, s * 2, 6); c.fill(); c.stroke();
    c.lineWidth = 2;
    switch (type) {
      case 0: // quadro: moldura com montanha e sol
        c.fillStyle = '#c9a24a'; c.fillRect(-15, -12, 30, 24);
        c.fillStyle = '#7fc4ff'; c.fillRect(-11, -8, 22, 16);
        c.fillStyle = '#3d7a3a'; c.beginPath(); c.moveTo(-11, 8); c.lineTo(-3, -3); c.lineTo(3, 3); c.lineTo(7, -1); c.lineTo(11, 8); c.fill();
        c.fillStyle = '#ffe14a'; c.beginPath(); c.arc(6, -4, 2.5, 0, Math.PI * 2); c.fill();
        break;
      case 1: // busto: cabeça em pedestal
        c.fillStyle = '#e8e2d6'; c.beginPath(); c.arc(0, -7, 7, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(-10, 6); c.quadraticCurveTo(0, -4, 10, 6); c.fill();
        c.fillStyle = '#9b958a'; c.fillRect(-8, 6, 16, 4); c.fillRect(-11, 10, 22, 5);
        break;
      case 2: // vaso
        c.fillStyle = '#d0703a';
        c.beginPath(); c.moveTo(-5, -14); c.lineTo(5, -14); c.lineTo(4, -9); c.quadraticCurveTo(14, -2, 7, 14); c.lineTo(-7, 14); c.quadraticCurveTo(-14, -2, -4, -9); c.closePath(); c.fill();
        c.strokeStyle = '#7a3a18'; c.beginPath(); c.moveTo(-9, 1); c.lineTo(9, 1); c.stroke();
        break;
      case 3: // partitura: nota musical
        c.fillStyle = '#f2ecd9'; c.fillRect(-14, -14, 28, 28);
        c.strokeStyle = '#999'; c.lineWidth = 1;
        for (let k = -8; k <= 8; k += 4) { c.beginPath(); c.moveTo(-12, k); c.lineTo(12, k); c.stroke(); }
        c.fillStyle = '#111'; c.beginPath(); c.ellipse(-3, 7, 4, 3, -0.4, 0, Math.PI * 2); c.fill();
        c.fillRect(0, -10, 2, 17); c.fillRect(0, -10, 7, 3);
        break;
      case 4: // chip
        c.fillStyle = '#222'; c.fillRect(-10, -10, 20, 20);
        c.fillStyle = '#c8c8c8';
        for (let k = -7; k <= 7; k += 5) { c.fillRect(-15, k - 1, 5, 2); c.fillRect(10, k - 1, 5, 2); c.fillRect(k - 1, -15, 2, 5); c.fillRect(k - 1, 10, 2, 5); }
        c.fillStyle = '#46e27b'; c.fillRect(-4, -4, 8, 8);
        break;
      case 5: // bateria
        c.fillStyle = '#ddd'; c.fillRect(-7, -14, 14, 28); c.fillRect(-3, -17, 6, 3);
        c.fillStyle = '#46e27b'; c.fillRect(-5, -2, 10, 14);
        c.fillStyle = '#111'; c.fillRect(-3, -10, 6, 2); c.fillRect(-1, -12, 2, 6);
        break;
      case 6: { // engrenagem
        c.fillStyle = '#b8c0c8';
        for (let k = 0; k < 8; k++) { c.save(); c.rotate((k * Math.PI) / 4); c.fillRect(-3, -15, 6, 6); c.restore(); }
        c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#163f22'; c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fill();
        break;
      }
      case 7: // monitor
        c.fillStyle = '#ccc'; c.fillRect(-15, -12, 30, 20);
        c.fillStyle = '#123'; c.fillRect(-12, -9, 24, 14);
        c.fillStyle = '#46e27b'; c.fillRect(-9, -6, 8, 2); c.fillRect(-9, -2, 14, 2);
        c.fillStyle = '#999'; c.fillRect(-3, 8, 6, 4); c.fillRect(-9, 12, 18, 3);
        break;
    }
    c.restore();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    for (const p of g.players) {
      const pd = p.data, L = pd.lane, cy = p.y, dead = !p.alive;
      // fundo da baia
      c.fillStyle = dead ? '#151515' : '#1b1f24'; c.fillRect(a.x, L.y + 3, a.w, L.h - 6);
      c.fillStyle = dead ? '#333' : p.color; c.fillRect(a.x, L.y + 3, 6, L.h - 6);
      // esteira com roletes andando
      const bx = this.SLOT_X - 34, bw = a.x + a.w - 96 - bx;
      c.fillStyle = '#2b2f35'; c.fillRect(bx, cy - 30, bw, 60);
      c.save(); c.beginPath(); c.rect(bx, cy - 30, bw, 60); c.clip();
      c.strokeStyle = '#353a41'; c.lineWidth = 3;
      const off = (pd.idx + (1 - pd.shift)) * this.SLOT_GAP / 3 % 22;
      for (let x = bx - 22 - off + 22; x < bx + bw + 22; x += 22) { c.beginPath(); c.moveTo(x, cy - 30); c.lineTo(x - 10, cy + 30); c.stroke(); }
      c.restore();
      c.strokeStyle = '#111'; c.lineWidth = 2; c.strokeRect(bx, cy - 30, bw, 60);
      // itens da fila (o primeiro é o ativo)
      if (!dead) {
        for (let k = this.VISIBLE - 1; k >= 0; k--) {
          const x = this.SLOT_X + (k + pd.shift) * this.SLOT_GAP;
          if (x > bx + bw - 26) continue;
          this.drawItem(c, d.seq[(pd.idx + k) % d.seq.length], x, cy, k === 0 ? 24 : 20);
        }
        // moldura do item ativo
        const wrong = pd.wrong > 0;
        c.strokeStyle = wrong ? '#f33' : '#ffd23f'; c.lineWidth = 3;
        c.strokeRect(this.SLOT_X - 31, cy - 31, 62, 62);
        if (wrong) { c.globalAlpha = 0.35; c.fillStyle = '#f00'; c.fillRect(this.SLOT_X - 31, cy - 31, 62, 62); c.globalAlpha = 1; }
      }
      // placar do turno
      D.panel(c, a.x + a.w - 86, cy - 28, 80, 56, { stroke: dead ? '#444' : p.color, fill: 'rgba(0,0,0,0.6)' });
      D.text(c, dead ? '✖' : String(pd.sub), a.x + a.w - 46, cy + 2, { size: 30, color: dead ? '#f55' : '#fff', align: 'center' });
      // operador
      g.drawPlayer(c, p, { flash: pd.wrong > 0.15 });
      // prensa hidráulica
      if (pd.crush > 0 || dead) {
        const k = dead ? 1 : pd.crush;
        const h = (cy - L.y - 4) + 22 * k;
        c.fillStyle = '#555'; c.fillRect(p.x - 4, L.y + 3, 8, Math.max(0, h - 30));
        D.hazardStripes(c, p.x - 34, L.y + 3 + Math.max(0, h - 30), 68, 26, 8);
      }
    }
    // itens voando para o fogo (sobe) / reciclagem (desce), presos à própria baia
    for (const f of d.flying) {
      const L = f.lane.data.lane;
      c.save(); c.beginPath(); c.rect(a.x, L.y + 3, a.w, L.h - 6); c.clip();
      c.globalAlpha = Math.max(0, f.t / 0.35);
      this.drawItem(c, f.type, f.x, f.y, 18);
      c.restore();
    }
    // boca do incinerador (em cima) e calha de reciclagem (embaixo) do item ativo
    for (const p of g.alive()) {
      const cy = p.y, f = 0.6 + 0.4 * Math.sin(g.time * 14 + p.id);
      c.fillStyle = `rgba(255,${90 + 60 * f | 0},30,0.9)`; c.fillRect(this.SLOT_X - 31, cy - 40, 62, 5);
      c.fillStyle = '#2fa85a'; c.fillRect(this.SLOT_X - 31, cy + 35, 62, 5);
    }
    // faixa de status: turno, tempo, legenda
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#ff5a3c' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 4 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, 'AÇÃO: QUEIMAR ARTE', a.x + a.w - 250, 46, { size: 12, color: '#ff7a5a', align: 'left' });
    D.text(c, 'EXTRA: RECICLAR TECNOLOGIA', a.x + a.w - 250, 60, { size: 12, color: '#46e27b', align: 'left' });
    if (d.phase === 'pause') {
      D.text(c, `TURNO ${d.sub}`, g.W / 2, g.H / 2 - 40, { size: 40, color: '#ff5a3c', align: 'center' });
      D.text(c, String(d.contagem || 'JÁ!'), g.W / 2, g.H / 2 + 30, { size: 64, color: '#fff', align: 'center' });
    }
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, g.H / 2 - 26, 500, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, g.H / 2, { size: 20, color: d.banner.color, align: 'center' });
    }
  },
});
