// PISA LEVE — inspirado em "MINEFIELD" (exploding_collar_race) de Machine Party.
// Atravesse o campo minado (da esquerda para a direita) até a van. As minas são invisíveis:
// a coleira de cada um vai do verde ao vermelho conforme a mina mais próxima. Segurar AÇÃO
// liga o sonar (parado), que revela as minas por um instante. Parar em cima de uma mina arma
// um pavio de 1 s; sair a tempo cancela. A colheitadeira entra pela esquerda depois de 5 s.
TN.registerMinigame({
  id: 'pisa_leve',
  title: 'PISA LEVE',
  inspiredBy: 'Minefield (exploding_collar_race)',
  tagline: 'SONDE ANTES. PISE DEPOIS.',
  brief: ['Atravesse o campo minado até a van.', 'Segure AÇÃO para o sonar revelar as minas.', 'A coleira fica vermelha perto de uma mina.', 'A colheitadeira não espera ninguém.'],
  controls: { move: 'andar', a: 'sonar (segure, fica parado)' },
  icon: '✱',
  color: '#9be04a',
  rounds: 3,
  scoring: 'points',          // +1 metade, +1 chegar, +1 primeiro, +1 sem dano
  endWhenOneLeft: false,

  // ---- constantes (original: campo 16×80, espaçamento 3,5, gatilho 1,0, detecção/explosão 5,
  //      sonar raio 4 em 2 s, pavio 1 s, 2 vidas, −25% vel. ferido, colheitadeira após 5 s) ----
  SPEED: 100, HURT_MULT: 0.75, LIVES: 2,
  SPACING: 78,       // distância mínima entre minas (Poisson-disc)
  TRIG: 26,          // raio do gatilho (centro do jogador até a mina)
  DETECT: 110,       // a coleira começa a reagir a partir daqui
  BLAST: 82,         // raio da explosão
  FUSE: 1.0,         // pavio
  SONAR_R: 120, SONAR_TIME: 2.0, REVEAL: 2.2,
  HARV_DELAY: 5, HARV_V0: 16, HARV_V1: 56, HARV_W: 96,

  init(g) {
    const U = TN.util, a = g.arena, d = g.data;
    d.startX = a.x + 30;                       // coluna de largada
    d.goalX = a.x + a.w - 64;                  // linha da van (passou = chegou)
    d.midX = (d.startX + d.goalX) / 2;
    d.mines = this.makeMines(g);
    d.scorch = []; d.trail = []; d.rings = [];
    d.harv = { x: a.x - 30, on: false, spin: 0 };
    d.firstDone = false; d.vanSeats = 0;
    d.seed = U.randInt(1, 1e6);                // semente dos tufos de mato (decoração gerada no draw)
    g.players.forEach((p, i) => {
      p.x = d.startX; p.y = a.y + a.h * (i + 0.5) / g.players.length; p.dir = 0;
      Object.assign(p.data, { active: true, done: false, lives: this.LIVES, hurt: false, half: false, fuse: 0, inv: 0,
        sonarT: 0, prox: 1, lastMx: 1, lastMy: 0, trailAcc: 0, distSinceSonar: 999, caution: U.rand(0.7, 1.3), noise: 0, noiseT: 0 });
    });
  },

  // Amostragem tipo Poisson-disc (dardos com distância mínima) na faixa entre a largada e a van.
  makeMines(g) {
    const U = TN.util, a = g.arena, d = g.data, mines = [];
    const x0 = a.x + 95, x1 = d.goalX - 40, y0 = a.y + 16, y1 = a.y + a.h - 16;
    for (let tries = 0; tries < 4000; tries++) {
      const m = { x: U.rand(x0, x1), y: U.rand(y0, y1) };
      if (mines.every((o) => (o.x - m.x) ** 2 + (o.y - m.y) ** 2 >= this.SPACING ** 2)) mines.push(m);
    }
    for (const m of mines) Object.assign(m, { reveal: 0, known: false, dead: false });
    return mines;
  },

  active(g) { return g.players.filter((p) => p.data.active); },

  // dano de explosão: perde 1 vida; sem vidas, morre
  damage(g, p, mx, my) {
    if (!p.data.active || p.data.inv > 0) return;
    p.data.lives--; p.data.hurt = true; p.data.inv = 0.6;
    const n = TN.util.norm(p.x - mx, p.y - my);
    g.push(p, n.x * 260, n.y * 260);
    if (p.data.lives <= 0) {
      p.data.active = false;
      g.eliminate(p, { sound: 'boom', msg: 'BUM!' });
      g.particles(p.x, p.y, '#a00', 26, 240);
    } else g.popup('FERIDO!', p.x, p.y - 40, '#f80');
  },

  explode(g, m) {
    if (m.dead) return;
    m.dead = true;
    g.data.scorch.push({ x: m.x, y: m.y, r: TN.util.rand(18, 26) });
    g.data.rings.push({ x: m.x, y: m.y, t: 0 });
    g.sfx('boom'); g.shake(10);
    g.particles(m.x, m.y, '#ffb020', 30, 300); g.particles(m.x, m.y, '#555', 16, 160, 1.0, 5);
    for (const p of this.active(g)) if (TN.util.dist(p.x, p.y, m.x, m.y) < this.BLAST) this.damage(g, p, m.x, m.y);
  },

  reachGoal(g, p) {
    const d = g.data;
    p.data.active = false; p.data.done = true; p.data.seat = d.vanSeats++;
    g.sfx('coin');
    g.addScore(p, 1);
    if (!d.firstDone) { d.firstDone = true; g.after(0.35, () => g.addScore(p, 1)); g.message(`${p.label} CHEGOU PRIMEIRO!`, 1.4, p.color); }
    if (!p.data.hurt) g.after(0.7, () => g.addScore(p, 1));
  },

  update(g, dt) {
    const U = TN.util, a = g.arena, d = g.data;
    const live = d.mines.filter((m) => !m.dead);
    // ---- colheitadeira ----
    const h = d.harv;
    if (!h.on && g.time >= this.HARV_DELAY) { h.on = true; g.sfx('buzz'); g.message('A COLHEITADEIRA LIGOU!', 1.5, '#f55'); }
    if (h.on && h.x < d.goalX) {
      const prog = U.clamp((h.x - (a.x - 30)) / (d.goalX - a.x + 30), 0, 1);
      h.x = Math.min(d.goalX, h.x + (this.HARV_V0 + (this.HARV_V1 - this.HARV_V0) * prog) * dt);
      h.spin += dt * 12;
      // a colheitadeira tritura as minas pelo caminho (estoura sem ferir ninguém, só fumaça)
      for (const m of live) if (!m.dead && m.x < h.x + 6) {
        m.dead = true; d.scorch.push({ x: m.x, y: m.y, r: 14 });
        g.particles(m.x, m.y, '#777', 10, 120, 0.8, 4); g.sfx('hit');
      }
    }
    // ---- jogadores ----
    for (const p of this.active(g)) {
      const b = p.data;
      b.inv -= dt;
      const sonar = p.input.a;
      if (sonar) {
        b.sonarT += dt;
        const r = ((b.sonarT % this.SONAR_TIME) / this.SONAR_TIME) * this.SONAR_R;
        for (const m of live) if (!m.dead && U.dist(p.x, p.y, m.x, m.y) <= r) { if (m.reveal <= 0) g.sfx('blip'); m.reveal = this.REVEAL; m.known = true; }
        b.distSinceSonar = 0;
      } else b.sonarT = 0;
      const ox = p.x, oy = p.y;
      const spd = this.SPEED * (b.lives < this.LIVES ? this.HURT_MULT : 1);
      if (sonar) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt); p.input = save; }
      else g.movePlayer(p, spd, dt);
      g.decayPush(p, dt, 7);
      const mx = p.x - ox, my = p.y - oy, moved = Math.hypot(mx, my);
      if (moved > 0.5) { b.lastMx = mx / moved; b.lastMy = my / moved; }
      b.distSinceSonar += moved;
      // rastro de óleo quando ferido
      if (b.lives < this.LIVES) { b.trailAcc += moved; if (b.trailAcc > 9) { b.trailAcc = 0; d.trail.push({ x: Math.round(p.x + U.rand(-4, 4)), y: Math.round(p.y + U.rand(-4, 4)), t: 4 }); } }
      // coleira: proximidade da mina mais próxima (0 = em cima, 1 = longe)
      let near = null, nd = 1e9;
      for (const m of live) { if (m.dead) continue; const dd = U.dist(p.x, p.y, m.x, m.y); if (dd < nd) { nd = dd; near = m; } }
      b.prox = U.clamp((nd - this.TRIG) / (this.DETECT - this.TRIG), 0, 1);
      // pavio: acumula enquanto estiver dentro do gatilho de alguma mina; sair cancela
      if (near && nd < this.TRIG) {
        if (b.fuse === 0) g.sfx('tick');
        b.fuse += dt;
        if (b.fuse >= this.FUSE) { b.fuse = 0; this.explode(g, near); }
      } else b.fuse = 0;
      if (!b.active) continue;
      // metade e chegada
      if (!b.half && p.x >= d.midX) { b.half = true; g.addScore(p, 1); g.sfx('pickup'); }
      if (p.x >= d.goalX) { this.reachGoal(g, p); continue; }
      // colheitadeira mata no contato
      if (h.on && p.x - p.r * 0.6 < h.x) {
        b.active = false;
        g.eliminate(p, { sound: 'boom', msg: 'TRITURADO!' });
        g.particles(p.x, p.y, '#a00', 30, 260);
      }
    }
    U.separate(this.active(g));
    for (const m of d.mines) m.reveal -= dt;
    for (const t of d.trail) t.t -= dt;
    d.trail = d.trail.filter((t) => t.t > 0);
    for (const r of d.rings) r.t += dt;
    d.rings = d.rings.filter((r) => r.t < 0.5);
    // fim: ninguém mais em campo (todos chegaram ou morreram)
    if (this.active(g).length === 0) g.finish(1.5);
  },

  // Bot: anda para a direita, sonda quando a coleira esquenta, desvia das minas reveladas,
  // recua se o pavio armar e corre sem sondar quando a colheitadeira encosta.
  bot(g, p, dt) {
    const U = TN.util, a = g.arena, d = g.data, b = p.data;
    if (!b.active) return {};
    const harvGap = d.harv.on ? p.x - d.harv.x : 999;
    // pavio armado: recua pelo caminho de onde veio e sonda depois
    if (b.fuse > 0) { b.wantSonar = true; return { x: -b.lastMx, y: -b.lastMy }; }
    // sonar em andamento: segura até o anel quase completar
    if (b.sonarT > 0) {
      if (b.sonarT < 1.45 && harvGap > 90) return { a: true };
      return { a: false };
    }
    // decide sondar: coleira quente e há mina desconhecida no caminho à frente
    let unknownAhead = false;
    for (const m of d.mines) {
      if (m.dead || m.known) continue;
      if (m.x > p.x - 5 && Math.abs(m.y - p.y) < 50 && U.dist(p.x, p.y, m.x, m.y) < 80) unknownAhead = true;
    }
    const hot = b.prox < 0.4 * b.caution;
    if (harvGap > 150 && unknownAhead && (b.wantSonar || (hot && b.distSinceSonar > 20))) {
      b.wantSonar = false;
      return { a: true };
    }
    // direção: para a direita, desviando das minas conhecidas e das bordas
    let fx = 1, fy = 0;
    for (const m of d.mines) {
      if (m.dead || !m.known) continue;
      const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy) || 1;
      if (dist > 95 || dx > 30) continue;
      const w = (95 - dist) / 95;
      fx += (dx / dist) * w * 1.2;
      fy += (Math.abs(dy) < 4 ? (p.y < a.y + a.h / 2 ? 1 : -1) : Math.sign(dy)) * w * 2.6;
    }
    if (b.laneY === undefined) b.laneY = p.y;
    fy += U.clamp((b.laneY - p.y) / 150, -0.4, 0.4);   // cada bot prefere a própria faixa (evita bolo)
    if (p.y < a.y + 30) fy += 0.8;
    if (p.y > a.y + a.h - 30) fy -= 0.8;
    b.noiseT -= dt;
    if (b.noiseT <= 0) { b.noiseT = U.rand(0.6, 1.6); b.noise = U.rand(-0.35, 0.35); }
    fy += b.noise;
    if (harvGap < 150) fx += 1;  // pressa!
    const n = U.norm(fx, fy);
    return { x: n.x, y: n.y };
  },

  draw(g, c) {
    const U = TN.util, a = g.arena, d = g.data, D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    // chão de terra + mato
    c.fillStyle = '#3a3122'; c.fillRect(a.x, a.y, a.w, a.h);
    for (let i = 0; i < 9; i++) { c.fillStyle = i % 2 ? '#3d3424' : '#372f20'; c.fillRect(a.x + 70, a.y + (a.h / 9) * i, d.goalX - a.x - 70, a.h / 9); }
    // tufos de mato: pseudoaleatório fixo a partir da semente da rodada
    let s = d.seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 140; i++) {
      const x = a.x + 70 + rnd() * (d.goalX - a.x - 76), y = a.y + 4 + rnd() * (a.h - 8), sz = 2 + rnd() * 3;
      c.fillStyle = ['#4f5a2a', '#5a6630', '#46502a'][Math.floor(rnd() * 3)]; c.fillRect(x, y, sz, sz * 0.6);
    }
    // largada (concreto)
    D.floor(c, a.x, a.y, 70, a.h, { tile: 35, a: '#4a4f55', b: '#52575d' });
    D.hazardStripes(c, a.x + 64, a.y, 6, a.h, 6);
    // linha da metade
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.setLineDash([10, 10]);
    c.beginPath(); c.moveTo(d.midX, a.y); c.lineTo(d.midX, a.y + a.h); c.stroke(); c.setLineDash([]);
    D.text(c, 'METADE +1', d.midX, a.y + 12, { size: 11, color: 'rgba(255,255,255,0.55)', align: 'center' });
    // marcas de explosão e rastro
    for (const s of d.scorch) {
      const gr = c.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 1.6);
      gr.addColorStop(0, 'rgba(10,8,6,0.95)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(s.x, s.y, s.r * 1.6, 0, Math.PI * 2); c.fill();
    }
    for (const t of d.trail) { c.globalAlpha = Math.min(1, t.t / 2) * 0.8; c.fillStyle = '#2a0a06'; c.beginPath(); c.arc(t.x, t.y, 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    // minas reveladas
    for (const m of d.mines) {
      if (m.dead || m.reveal <= 0) continue;
      c.globalAlpha = Math.min(1, m.reveal / 0.6);
      c.strokeStyle = 'rgba(255,60,40,0.35)'; c.lineWidth = 1; c.setLineDash([3, 4]);
      c.beginPath(); c.arc(m.x, m.y, this.TRIG, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#222'; c.strokeStyle = '#777'; c.lineWidth = 2;
      c.beginPath(); c.arc(m.x, m.y, 9, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = Math.sin(g.time * 14) > 0 ? '#f33' : '#600'; c.beginPath(); c.arc(m.x, m.y, 3.5, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    // anéis de explosão
    for (const r of d.rings) {
      c.strokeStyle = `rgba(255,190,60,${1 - r.t / 0.5})`; c.lineWidth = 4;
      c.beginPath(); c.arc(r.x, r.y, this.BLAST * (0.3 + r.t / 0.5 * 0.7), 0, Math.PI * 2); c.stroke();
    }
    // van (vista de cima, porta traseira aberta para a esquerda)
    this.drawVan(g, c);
    // jogadores mortos, depois vivos com coleira, sonar e vidas
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.players) {
      const b = p.data;
      if (!b.active) continue;
      if (p.input.a && b.sonarT > 0) {
        const k = (b.sonarT % this.SONAR_TIME) / this.SONAR_TIME;
        c.strokeStyle = `rgba(120,255,240,${0.9 - k * 0.7})`; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, Math.max(1, k * this.SONAR_R), 0, Math.PI * 2); c.stroke();
        c.fillStyle = `rgba(120,255,240,${0.08 * (1 - k)})`; c.fill();
      }
      g.drawPlayer(c, p, { flash: b.inv > 0 && Math.sin(g.time * 40) > 0 });
      // coleira: verde (longe) -> vermelho (perto); pisca rápido com o pavio armado
      let col;
      if (b.fuse > 0) col = Math.sin(g.time * 32) > 0 ? '#ff2020' : '#ffffff';
      else { const t = b.prox; col = `rgb(${Math.round(255 * Math.min(1, 2 - 2 * t))},${Math.round(255 * Math.min(1, 2 * t))},40)`; }
      c.strokeStyle = col; c.lineWidth = 4;
      c.beginPath(); c.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); c.stroke();
      if (b.fuse > 0) {
        c.strokeStyle = '#fff'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (b.fuse / this.FUSE)); c.stroke();
      }
      for (let i = 0; i < this.LIVES; i++) {
        c.fillStyle = i < b.lives ? '#ff4d5e' : '#333';
        c.fillRect(p.x - 9 + i * 12, p.y + p.r + 8, 7, 5);
      }
    }
    this.drawHarvester(g, c);
  },

  drawVan(g, c) {
    const a = g.arena, d = g.data, D = TN.draw;
    const x = d.goalX + 6, y = a.y + a.h / 2 - 110, w = a.x + a.w - x, h = 220;
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 6, y + 8, w, h);
    c.fillStyle = '#d8dde2'; c.strokeStyle = '#222'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x, y, w, h, 10); c.fill(); c.stroke();
    c.fillStyle = '#1c2228'; c.fillRect(x + 6, y + 14, w - 18, h - 28);   // caçamba aberta
    c.fillStyle = '#8fd3ff'; c.fillRect(x + w - 10, y + 20, 6, h - 40);   // para-brisa
    D.text(c, 'VAN', x + w / 2 - 4, y - 12, { size: 14, color: '#9be04a', align: 'center' });
    // quem chegou fica sentado na van
    for (const p of g.players) {
      if (!p.data.done) continue;
      const s = p.data.seat;
      TN.draw.robot(c, x + 20 + (s % 2) * 18, y + 40 + Math.floor(s / 2) * 46 + (s % 2) * 20, 11, p.color, { dir: 0 });
    }
    // faixa de chegada
    D.hazardStripes(c, d.goalX - 4, a.y, 6, a.h, 6);
    c.fillStyle = 'rgba(155,224,74,0.12)'; c.fillRect(d.goalX - 4, a.y, a.x + a.w - d.goalX + 4, a.h);
  },

  drawHarvester(g, c) {
    const a = g.arena, h = g.data.harv, W = this.HARV_W;
    if (h.x < a.x - 28) return;
    c.save();
    c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
    // corpo
    c.fillStyle = '#b3261e'; c.fillRect(h.x - W - 400, a.y - 6, W + 400 - 18, a.h + 12);
    c.fillStyle = '#7a1912'; c.fillRect(h.x - W - 400, a.y + a.h / 2 - 40, W + 380, 80);
    TN.draw.hazardStripes(c, h.x - 30, a.y - 6, 12, a.h + 12, 8);
    // rolo triturador girando
    c.fillStyle = '#333'; c.fillRect(h.x - 18, a.y - 6, 18, a.h + 12);
    c.fillStyle = '#ccc';
    const off = (h.spin * 14) % 20;
    for (let y = a.y - 20 + off; y < a.y + a.h + 10; y += 20) {
      c.beginPath(); c.moveTo(h.x - 4, y); c.lineTo(h.x + 8, y + 6); c.lineTo(h.x - 4, y + 12); c.fill();
    }
    if (h.on && Math.sin(g.time * 8) > 0) { c.fillStyle = '#ffb020'; c.beginPath(); c.arc(h.x - 50, a.y + 12, 6, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(h.x - 50, a.y + a.h - 12, 6, 0, Math.PI * 2); c.fill(); }
    c.restore();
  },
});
