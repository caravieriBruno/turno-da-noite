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
    }
    for (const p of g.players) {
      const pd = p.data;
      pd.lock -= dt; pd.wrong -= dt; pd.shift = Math.max(0, pd.shift - dt * 9);
      if (pd.crush > 0) pd.crush = Math.min(1, pd.crush + dt * 4);
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
        d.timer = d.subTime; d.phase = 'play';
        for (const p of g.players) p.data.sub = 0;
        g.message(`TURNO ${d.sub}`, 1.0, '#ff5a3c'); g.sfx('go');
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

  // ---------- desenho dos ícones (centro x,y; s = meia largura) ----------
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
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, g.H / 2 - 26, 500, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, g.H / 2, { size: 20, color: d.banner.color, align: 'center' });
    }
  },
});
