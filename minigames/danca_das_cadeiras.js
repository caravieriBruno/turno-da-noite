// DANÇA DAS CADEIRAS — inspirado em "SCAVENGER CHAIRS" (scavenger_chairs), minigame inacabado de Machine Party.
// A cada turno o painel central mostra um item-alvo, e só existem (vivos − 1) cópias dele espalhadas pela sala.
// Quando o tempo acaba o chão se abre: quem não estiver numa plataforma segura SEGURANDO o alvo cai.
// Os turnos se repetem dentro da mesma rodada até sobrar um.
TN.registerMinigame({
  id: 'danca_das_cadeiras',
  title: 'DANÇA DAS CADEIRAS',
  inspiredBy: 'Scavenger Chairs (scavenger_chairs, não lançado)',
  tagline: 'SEMPRE FALTA UM.',
  brief: ['Pegue o item mostrado no painel: há uma cópia a menos que jogadores.', 'Fique numa plataforma verde segurando o item.', 'Empurre quem tem o item para ele cair da mão.'],
  controls: { move: 'andar', a: 'pegar item', b: 'soltar item / empurrar' },
  icon: '♜',
  color: '#c77dff',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes (original: 30 s por turno, empurrão 15, até ×1,5 pelas costas) ----
  SPEED: 175, SUB_TIME: 18, GRAB: 30, SHOVE: 520, SHOVE_LOCK: 0.5, BACK_BONUS: 1.5,
  CORE_R: 52, PAD_W: 76, PAD_H: 60,
  ITEMS: ['CHAVE INGLESA', 'CANECA', 'LÂMPADA', 'PATINHO', 'CONE', 'DISQUETE'],

  init(g) {
    const d = g.data, a = g.arena;
    d.cx = a.x + a.w / 2; d.cy = a.y + a.h / 2;
    const pw = this.PAD_W, ph = this.PAD_H;
    d.pads = [[-160, 0], [160, 0], [0, -122], [0, 122]].map(([ox, oy]) => ({ x: d.cx + ox - pw / 2, y: d.cy + oy - ph / 2, w: pw, h: ph }));
    d.items = []; d.sub = 0; d.batches = []; d.banner = null; d.open = 0;
    g.placeInCircle(d.cx, d.cy, 200);
    for (const p of g.players) Object.assign(p.data, { hold: null, lock: 0, fall: 0 });
    this.newSub(g);
  },

  // Novo turno: sorteia o alvo, espalha (vivos − 1) cópias e alguns itens de distração.
  newSub(g) {
    const d = g.data, U = TN.util, a = g.arena;
    d.sub++;
    d.target = U.randInt(0, this.ITEMS.length - 1);
    d.timer = this.SUB_TIME; d.phase = 'play'; d.open = 0;
    d.items = [];
    for (const p of g.players) p.data.hold = null;
    const n = g.alive().length;
    d.copies = n - 1;
    const kinds = [];
    for (let i = 0; i < n - 1; i++) kinds.push(d.target);
    for (let i = 0; i < n + 2; i++) { let k; do k = U.randInt(0, this.ITEMS.length - 1); while (k === d.target); kinds.push(k); }
    for (const kind of kinds) {
      let x, y, tries = 0;
      do {
        x = U.rand(a.x + 26, a.x + a.w - 26); y = U.rand(a.y + 26, a.y + a.h - 26); tries++;
      } while (tries < 200 && (U.dist(x, y, d.cx, d.cy) < 150 || d.pads.some((pd) => U.circleRect({ x, y }, pd, 26)) ||
        d.items.some((it) => U.dist(x, y, it.x, it.y) < 50) || g.alive().some((p) => U.dist(x, y, p.x, p.y) < 60)));
      d.items.push({ kind, x, y, r: 14, holder: null, vx: 0, vy: 0, bob: U.rand(0, 6) });
    }
    g.message(`ALVO: ${this.ITEMS[d.target]}`, 1.6, '#c77dff');
    g.sfx('go');
  },

  onPad(g, p) { return g.data.pads.some((pd) => TN.util.inRect(p.x, p.y, pd)); },
  drop(g, p, vx = 0, vy = 0) {
    const it = p.data.hold;
    if (!it) return;
    it.holder = null; it.x = p.x; it.y = p.y + 4; it.vx = vx; it.vy = vy;
    p.data.hold = null;
  },

  update(g, dt) {
    const U = TN.util, d = g.data, a = g.arena;
    const playing = d.phase === 'play';
    if (playing) {
      d.timer -= dt;
      if (d.timer <= 3 && d.timer > 0 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt)) g.sfx('tick');
      if (d.timer <= 0) this.endSub(g);
    } else d.open = Math.min(1, d.open + dt * 3);

    for (const p of g.alive()) {
      const pd = p.data;
      pd.lock -= dt;
      const stunned = Math.hypot(p.vx, p.vy) > 40;
      if (stunned || !playing) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt);
      g.decayPush(p, dt, 6);
      // núcleo central é sólido
      const dc = U.dist(p.x, p.y, d.cx, d.cy), md = this.CORE_R + p.r;
      if (dc < md && dc > 0) { p.x = d.cx + (p.x - d.cx) / dc * md; p.y = d.cy + (p.y - d.cy) / dc * md; }
      if (!playing || stunned) continue;
      // AÇÃO: pega o item mais próximo (mãos vazias)
      if (p.input.aPressed && !pd.hold) {
        let best = null, bd = this.GRAB + p.r;
        for (const it of d.items) {
          if (it.holder) continue;
          const dd = U.dist(p.x, p.y, it.x, it.y);
          if (dd < bd) { bd = dd; best = it; }
        }
        if (best) { best.holder = p; pd.hold = best; g.sfx('pickup'); }
      }
      // EXTRA: solta o item, ou empurra se estiver de mãos vazias
      if (p.input.bPressed && pd.lock <= 0) {
        if (pd.hold) { this.drop(g, p); g.sfx('step'); }
        else {
          pd.lock = this.SHOVE_LOCK; g.sfx('whoosh');
          const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
          for (const o of g.alive()) {
            if (o === p) continue;
            const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy) || 1;
            if (dist < 58 && (dx * fx + dy * fy) / dist > 0.2) {
              // pelas costas empurra mais forte
              const back = (Math.cos(o.dir) * dx + Math.sin(o.dir) * dy) / dist > 0.3 ? this.BACK_BONUS : 1;
              g.push(o, (dx / dist) * this.SHOVE * back, (dy / dist) * this.SHOVE * back);
              if (o.data.hold) { this.drop(g, o, (dx / dist) * 260, (dy / dist) * 260); g.popup('LARGOU!', o.x, o.y - 30, '#c77dff'); }
              g.sfx('hit'); g.shake(3);
            }
          }
        }
      }
    }
    U.separate(g.alive());
    // itens: seguem quem segura; soltos deslizam um pouco
    for (const it of d.items) {
      it.bob += dt * 4;
      if (it.holder) { it.x = it.holder.x + Math.cos(it.holder.dir) * 20; it.y = it.holder.y + Math.sin(it.holder.dir) * 20; continue; }
      it.x += it.vx * dt; it.y += it.vy * dt;
      const k = Math.max(0, 1 - 6 * dt); it.vx *= k; it.vy *= k;
      it.x = U.clamp(it.x, a.x + it.r, a.x + a.w - it.r); it.y = U.clamp(it.y, a.y + it.r, a.y + a.h - it.r);
      const dc = U.dist(it.x, it.y, d.cx, d.cy), md = this.CORE_R + it.r;
      if (dc < md && dc > 0) { it.x = d.cx + (it.x - d.cx) / dc * md; it.y = d.cy + (it.y - d.cy) / dc * md; }
    }
    for (const p of g.players) if (!p.alive) p.data.fall += dt;
  },

  // Fim do turno: o chão se abre.
  endSub(g) {
    const d = g.data;
    d.phase = 'judge'; d.timer = 0;
    g.sfx('buzz'); g.shake(8);
    const losers = g.alive().filter((p) => !(this.onPad(g, p) && p.data.hold && p.data.hold.kind === d.target));
    g.after(0.5, () => {
      if (losers.length) {
        d.batches.push(losers.map((p) => p.id));
        for (const p of losers) {
          const why = !this.onPad(g, p) ? 'FORA DA PLATAFORMA!' : 'SEM O ALVO!';
          this.drop(g, p);
          g.eliminate(p, { sound: 'boom', particles: false, msg: why });
        }
      }
      d.banner = losers.length ? { text: `${losers.map((p) => p.label).join(', ')} CAÍ${losers.length > 1 ? 'RAM' : 'U'}!`, color: '#f55' } : { text: 'TODOS A SALVO', color: '#9f9' };
      g.after(1.8, () => {
        d.banner = null;
        if (g.alive().length > 1) this.newSub(g);   // senão o motor encerra a rodada
      });
    });
  },

  // Quem sai junto empata (pontos = nº de eliminados antes do grupo); sobrevivente = nº de jogadores.
  results(g, pts) {
    let before = 0;
    for (const p of g.players) pts[p.id] = p.alive ? g.playerCount : 0;
    for (const batch of g.data.batches) { for (const id of batch) pts[id] = before; before += batch.length; }
  },

  // Bot: pega a cópia mais próxima; se acabaram, persegue e empurra quem tem; depois corre para uma plataforma.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (d.phase !== 'play') return {};
    const b = pd.bt || (pd.bt = { noise: { x: 0, y: 0 }, react: 0 });
    if (U.chance(0.03)) b.noise = { x: U.rand(-0.3, 0.3), y: U.rand(-0.3, 0.3) };
    const go = (tx, ty, extra = {}) => {
      const n = U.norm(tx - p.x, ty - p.y), dist = U.dist(p.x, p.y, tx, ty);
      const k = dist < 8 ? 0 : 1;
      return { x: (n.x + b.noise.x * (dist > 40 ? 1 : 0)) * k, y: (n.y + b.noise.y * (dist > 40 ? 1 : 0)) * k, ...extra };
    };
    const hold = pd.hold;
    if (hold && hold.kind !== d.target) return { b: true };         // item errado: larga
    if (hold) {
      // vai para a plataforma mais próxima e fica no meio dela
      let best = null, bd = 1e9;
      for (const pad of d.pads) { const dd = U.dist(p.x, p.y, pad.x + pad.w / 2, pad.y + pad.h / 2); if (dd < bd) { bd = dd; best = pad; } }
      return go(best.x + best.w / 2, best.y + best.h / 2);
    }
    // cópia livre mais próxima
    let item = null, id = 1e9;
    for (const it of d.items) {
      if (it.holder || it.kind !== d.target) continue;
      const dd = U.dist(p.x, p.y, it.x, it.y);
      if (dd < id) { id = dd; item = it; }
    }
    if (item) return go(item.x, item.y, { a: id < this.GRAB + p.r - 4 && U.chance(0.5) });
    // nenhuma livre: caça quem está segurando o alvo
    let vic = null, vd = 1e9;
    for (const o of g.alive()) {
      if (o === p || !o.data.hold || o.data.hold.kind !== d.target) continue;
      const dd = U.dist(p.x, p.y, o.x, o.y);
      if (dd < vd) { vd = dd; vic = o; }
    }
    if (vic) return go(vic.x, vic.y, { b: vd < 50 && pd.lock <= 0 && U.chance(0.25) });
    return go(d.cx + 80, d.cy);
  },

  // ---------- desenho ----------
  drawIcon(c, kind, x, y, s = 1) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2; c.strokeStyle = '#111';
    switch (kind) {
      case 0: // chave inglesa
        c.rotate(-0.6); c.fillStyle = '#b9c2cc';
        c.fillRect(-3, -2, 6, 18); c.beginPath(); c.arc(0, -6, 8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#2a2f36'; c.fillRect(-3, -15, 6, 8);
        break;
      case 1: // caneca
        c.fillStyle = '#e94f4f'; c.beginPath(); c.roundRect(-9, -10, 16, 20, 3); c.fill(); c.stroke();
        c.strokeStyle = '#e94f4f'; c.lineWidth = 3; c.beginPath(); c.arc(8, 0, 5, -Math.PI / 2, Math.PI / 2); c.stroke();
        break;
      case 2: // lâmpada
        c.fillStyle = '#ffe36b'; c.beginPath(); c.arc(0, -4, 10, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#999'; c.fillRect(-5, 5, 10, 8); c.strokeRect(-5, 5, 10, 8);
        break;
      case 3: // patinho
        c.fillStyle = '#ffd21f'; c.beginPath(); c.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(5, -6, 6, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#ff8a00'; c.beginPath(); c.moveTo(10, -6); c.lineTo(16, -4); c.lineTo(10, -2); c.fill();
        c.fillStyle = '#111'; c.fillRect(5, -8, 2, 2);
        break;
      case 4: // cone
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#fff'; c.fillRect(-5, -1, 10, 3);
        c.fillStyle = '#ff7a1a'; c.fillRect(-12, 10, 24, 4);
        break;
      case 5: // disquete
        c.fillStyle = '#3b6fd8'; c.fillRect(-11, -11, 22, 22); c.strokeRect(-11, -11, 22, 22);
        c.fillStyle = '#ccd'; c.fillRect(-6, -11, 12, 7);
        c.fillStyle = '#eee'; c.fillRect(-7, 2, 14, 9);
        break;
    }
    c.restore();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 44, a: '#24212b', b: '#28252f' });
    // chão se abrindo (fora das plataformas)
    if (d.open > 0) {
      c.save(); c.globalAlpha = d.open * 0.92; c.fillStyle = '#040405'; c.fillRect(a.x, a.y, a.w, a.h); c.restore();
      c.strokeStyle = `rgba(255,60,60,${0.5 * d.open})`; c.lineWidth = 2;
      for (let x = a.x; x < a.x + a.w; x += 44) { c.beginPath(); c.moveTo(x, a.y); c.lineTo(x, a.y + a.h); c.stroke(); }
    }
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    // plataformas seguras
    for (const pad of d.pads) {
      c.fillStyle = '#16301f'; c.fillRect(pad.x, pad.y, pad.w, pad.h);
      c.strokeStyle = '#46e27b'; c.lineWidth = 3; c.strokeRect(pad.x + 2, pad.y + 2, pad.w - 4, pad.h - 4);
      c.strokeStyle = 'rgba(70,226,123,0.25)'; c.lineWidth = 1;
      for (let k = 10; k < pad.w; k += 10) { c.beginPath(); c.moveTo(pad.x + k, pad.y + 4); c.lineTo(pad.x + k, pad.y + pad.h - 4); c.stroke(); }
    }
    // núcleo central com o painel do alvo
    c.fillStyle = '#111'; c.beginPath(); c.arc(d.cx, d.cy, this.CORE_R + 6, 0, Math.PI * 2); c.fill();
    D.hazardStripes(c, d.cx - this.CORE_R - 6, d.cy + this.CORE_R - 2, (this.CORE_R + 6) * 2, 0, 8);
    c.fillStyle = '#1d1430'; c.strokeStyle = '#c77dff'; c.lineWidth = 3;
    c.beginPath(); c.arc(d.cx, d.cy, this.CORE_R, 0, Math.PI * 2); c.fill(); c.stroke();
    D.text(c, 'ALVO', d.cx, d.cy - 32, { size: 11, color: '#c77dff', align: 'center' });
    if (d.target !== undefined) this.drawIcon(c, d.target, d.cx, d.cy + 2, 1.5);
    // itens soltos
    for (const it of d.items) if (!it.holder) {
      const glow = it.kind === d.target;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(it.x, it.y + 12, 12, 4, 0, 0, Math.PI * 2); c.fill();
      if (glow) { c.strokeStyle = `rgba(199,125,255,${0.4 + 0.3 * Math.sin(it.bob)})`; c.lineWidth = 2; c.beginPath(); c.arc(it.x, it.y, 19, 0, Math.PI * 2); c.stroke(); }
      this.drawIcon(c, it.kind, it.x, it.y + Math.sin(it.bob) * 1.5);
    }
    // jogadores (quem caiu encolhe e some no buraco)
    for (const p of g.players) {
      if (!p.alive) {
        const k = 1 - Math.min(1, p.data.fall / 0.7);
        if (k > 0) TN.draw.robot(c, p.x, p.y, p.r * k, p.color, { dir: p.dir, dead: true });
        continue;
      }
      g.drawPlayer(c, p, { flash: Math.hypot(p.vx, p.vy) > 40 });
      const it = p.data.hold;
      if (it) {
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(it.x, it.y, 15, 0, Math.PI * 2); c.fill();
        this.drawIcon(c, it.kind, it.x, it.y, 0.85);
      }
    }
    // faixa de status
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#c77dff' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 5 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, `ALVO: ${this.ITEMS[d.target]}  ·  CÓPIAS: ${d.copies}`, a.x + a.w, 52, { size: 13, color: '#bbb', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 220, a.y + a.h - 70, 440, 46, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, a.y + a.h - 47, { size: 20, color: d.banner.color, align: 'center' });
    }
  },
});
