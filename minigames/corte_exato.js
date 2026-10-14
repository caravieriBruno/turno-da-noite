// CORTE EXATO — inspirado em "SHAPE CUTTER" (shape_cutter), minigame inacabado de Machine Party.
// Um de cada vez, cada jogador recorta com o maçarico a forma projetada na chapa de aço.
// A forma aparece por 2 s e depois fica quase invisível. Nota = precisão do corte (0–100 %).
TN.registerMinigame({
  id: 'corte_exato',
  title: 'CORTE EXATO',
  inspiredBy: 'Shape Cutter (shape_cutter, não lançado)',
  tagline: 'MEÇA DUAS VEZES. CORTE UMA.',
  brief: ['Na sua vez, decore a forma projetada.', 'Segure AÇÃO para cortar por cima do contorno.', 'EXTRA entrega a peça. Quem for mais preciso vence.'],
  controls: { move: 'mover o maçarico', a: 'segurar para cortar', b: 'entregar a peça' },
  icon: '⬡',
  color: '#ff9b2f',
  rounds: 1,
  scoring: 'rank',
  hudValue(g, p) { return p.data.done ? p.score + '%' : '—'; },

  // ---- constantes (original: preview de 2 s; nota por desvio radial em pattern_matcher.gd) ----
  INTRO: 1.4, PREVIEW: 2, CUT_TIME: 10, SHOW: 2.2, SPEED: 190, R: 120,
  TOL: 22,       // desvio radial (px) a partir do qual o ponto não vale nada
  BINS: 72,      // setores angulares para medir quanto do contorno foi coberto
  PLATE: { x: 255, y: 82, w: 450, h: 390 },
  SHAPES: ['RETÂNGULO', 'TRIÂNGULO', 'TRIÂNGULO INVERTIDO', 'HEXÁGONO', 'CÍRCULO'],

  init(g) {
    const d = g.data, U = TN.util, P = this.PLATE;
    d.cx = P.x + P.w / 2; d.cy = P.y + P.h / 2 + 6;
    d.order = g.players.slice();
    d.turn = 0;
    // cada jogador recebe uma forma (sorteadas sem repetir enquanto der)
    const bag = U.shuffle(this.SHAPES.slice());
    d.order.forEach((p, i) => { p.data.shape = bag[i % bag.length]; p.data.done = false; p.score = 0; });
    // posição "lógica" de cada jogador = a sua linha no placar (o motor escreve P1..P4 ali na contagem)
    d.order.forEach((p, i) => { p.x = 860; p.y = 150 + i * 72 + 32; });
    this.startTurn(g);
  },

  startTurn(g) {
    const d = g.data;
    d.active = d.order[d.turn];
    d.phase = 'intro'; d.phaseT = this.INTRO;
    d.cursor = { x: this.PLATE.x + 30, y: this.PLATE.y + this.PLATE.h - 30 };
    d.strokes = []; d.cutting = false; d.result = null;
    d.poly = this.shapePoints(d.active.data.shape, d.cx, d.cy);
    g.sfx('select');
  },

  // Contorno da forma como polígono fechado (o círculo vira um polígono de 64 lados).
  shapePoints(name, cx, cy) {
    const R = this.R, pts = [];
    const ring = (n, a0, r) => { for (let k = 0; k < n; k++) { const a = a0 + (k / n) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } };
    if (name === 'RETÂNGULO') pts.push({ x: cx - 150, y: cy - 95 }, { x: cx + 150, y: cy - 95 }, { x: cx + 150, y: cy + 95 }, { x: cx - 150, y: cy + 95 });
    else if (name === 'TRIÂNGULO') ring(3, -Math.PI / 2, R * 1.2);
    else if (name === 'TRIÂNGULO INVERTIDO') ring(3, Math.PI / 2, R * 1.2);
    else if (name === 'HEXÁGONO') ring(6, 0, R * 1.08);
    else ring(64, 0, R);
    return pts;
  },

  // Raio do contorno na direção `ang` (interseção do raio que sai do centro com o polígono).
  radiusAt(g, ang) {
    const d = g.data, poly = d.poly, dx = Math.cos(ang), dy = Math.sin(ang);
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x, ey = b.y - a.y, ax = a.x - d.cx, ay = a.y - d.cy;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  },

  // Nota: precisão (desvio radial médio de cada ponto) × cobertura (quanto do contorno foi percorrido).
  evaluate(g) {
    const d = g.data, pts = d.strokes.flat();
    if (pts.length < 8) return { score: 0, precision: 0, coverage: 0 };
    const bins = new Array(this.BINS).fill(0);
    let sum = 0;
    for (const q of pts) {
      const ang = Math.atan2(q.y - d.cy, q.x - d.cx);
      const dev = Math.abs(Math.hypot(q.x - d.cx, q.y - d.cy) - this.radiusAt(g, ang));
      const w = Math.max(0, 1 - dev / this.TOL);
      sum += w;
      if (w > 0.35) bins[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * this.BINS) % this.BINS] = 1;
    }
    const precision = sum / pts.length;
    const coverage = bins.reduce((s, v) => s + v, 0) / this.BINS;
    // trechos inteiros sem corte pesam mais (como a penalidade por seção do original)
    const score = Math.round(100 * precision * Math.pow(coverage, 1.3));
    return { score, precision, coverage };
  },

  submit(g) {
    const d = g.data, p = d.active;
    d.cutting = false;
    d.result = this.evaluate(g);
    p.score = d.result.score; p.data.done = true;
    d.phase = 'show'; d.phaseT = this.SHOW;
    g.sfx(d.result.score >= 70 ? 'win' : d.result.score >= 40 ? 'confirm' : 'lose');
  },

  update(g, dt) {
    const d = g.data, U = TN.util, P = this.PLATE, p = d.active;
    if (!p) return;
    d.phaseT -= dt;
    if (d.phase === 'intro' && d.phaseT <= 0) { d.phase = 'preview'; d.phaseT = this.PREVIEW; g.sfx('blip'); }
    else if (d.phase === 'preview' && d.phaseT <= 0) { d.phase = 'cut'; d.phaseT = this.CUT_TIME; g.sfx('go'); }
    else if (d.phase === 'cut') {
      // maçarico: só o jogador da vez controla
      let { x, y } = p.input;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      const cur = d.cursor;
      cur.x = U.clamp(cur.x + x * this.SPEED * dt, P.x + 6, P.x + P.w - 6);
      cur.y = U.clamp(cur.y + y * this.SPEED * dt, P.y + 6, P.y + P.h - 6);
      if (p.input.a) {
        if (!d.cutting) { d.cutting = true; d.strokes.push([{ x: cur.x, y: cur.y }]); }
        const s = d.strokes[d.strokes.length - 1], last = s[s.length - 1];
        if (U.dist(last.x, last.y, cur.x, cur.y) >= 3) s.push({ x: cur.x, y: cur.y });
        if (U.chance(0.5)) g.particles(cur.x, cur.y, U.pick(['#ffd27a', '#ff9b2f', '#fff']), 1, 140, 0.3, 2);
        if (U.chance(0.06)) g.sfx('laser');
      } else d.cutting = false;
      if (p.input.bPressed || d.phaseT <= 0) this.submit(g);
    } else if (d.phase === 'show' && d.phaseT <= 0) {
      d.turn++;
      if (d.turn >= d.order.length) { d.phase = 'end'; d.active = null; g.finish(1.5); }
      else this.startTurn(g);
    }
  },

  // Bot: segue o contorno verdadeiro com ruído gaussiano e pula um trecho.
  bot(g, p, dt) {
    const d = g.data, U = TN.util;
    if (d.active !== p || d.phase === 'intro' || d.phase === 'show' || d.phase === 'end') { p.data.plan = null; return {}; }
    if (d.phase === 'preview') return {};
    if (!p.data.plan) {
      const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      const skill = U.rand(2.5, 8);                       // desvio-padrão do tremor da mão (px)
      const poly = d.poly, way = [];
      let ox = 0, oy = 0;                                 // tremor suavizado (passa-baixa do ruído gaussiano)
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.round(U.dist(a.x, a.y, b.x, b.y) / 12));
        for (let k = 0; k < n; k++) {
          ox = ox * 0.8 + gauss() * skill * 0.6; oy = oy * 0.8 + gauss() * skill * 0.6;
          way.push({ x: U.lerp(a.x, b.x, k / n) + ox, y: U.lerp(a.y, b.y, k / n) + oy });
        }
      }
      const start = U.randInt(0, way.length - 1);
      const path = way.slice(start).concat(way.slice(0, start + 1));
      // trecho pulado: até 25 % do contorno, a partir de um ponto aleatório
      const skipLen = U.chance(0.6) ? Math.floor(path.length * U.rand(0, 0.25)) : 0;
      const skipAt = U.randInt(1, Math.max(1, path.length - skipLen - 1));
      p.data.plan = { path, i: 0, skipAt, skipEnd: skipAt + skipLen, started: false };
    }
    const pl = p.data.plan, cur = d.cursor;
    if (pl.i >= pl.path.length) return { b: true };
    const t = pl.path[pl.i];
    const dist = U.dist(cur.x, cur.y, t.x, t.y);
    if (dist < 5) { pl.i++; if (pl.i === 1) pl.started = true; }
    const n = U.norm(t.x - cur.x, t.y - cur.y), k = Math.min(1, dist / 6);
    const cutting = pl.started && !(pl.i >= pl.skipAt && pl.i < pl.skipEnd);
    return { x: n.x * k, y: n.y * k, a: cutting };
  },

  // ---------- desenho ----------
  drawShape(c, poly, color, alpha, width, dash) {
    c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.beginPath(); poly.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.closePath(); c.stroke();
    c.restore();
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, P = this.PLATE, U = TN.util, p = d.active;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, 0, 34, g.W, g.H - 34, { tile: 48, a: '#16191d', b: '#191c21' });
    // chapa de aço
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(P.x + 6, P.y + 8, P.w, P.h);
    c.fillStyle = '#6f777f'; c.fillRect(P.x, P.y, P.w, P.h);
    c.fillStyle = '#7a838c'; for (let y = P.y + 6; y < P.y + P.h; y += 12) c.fillRect(P.x, y, P.w, 2);
    c.strokeStyle = '#3c4248'; c.lineWidth = 4; c.strokeRect(P.x, P.y, P.w, P.h);
    c.fillStyle = '#4b5258';
    for (const [rx, ry] of [[12, 12], [P.w - 12, 12], [12, P.h - 12], [P.w - 12, P.h - 12]]) { c.beginPath(); c.arc(P.x + rx, P.y + ry, 5, 0, Math.PI * 2); c.fill(); }
    // forma projetada: forte no preview, quase invisível no corte, verde no resultado
    if (p) {
      if (d.phase === 'preview') {
        const blink = 0.75 + 0.25 * Math.sin(g.time * 12);
        this.drawShape(c, d.poly, '#5ff', blink, 5);
        this.drawShape(c, d.poly, '#fff', 0.6, 1.5);
      } else if (d.phase === 'cut') this.drawShape(c, d.poly, '#5ff', 0.08, 3);
      else if (d.phase === 'show') this.drawShape(c, d.poly, '#46e27b', 0.8, 3, [8, 6]);
    }
    // cortes (brasa laranja)
    for (const s of d.strokes || []) {
      if (s.length < 2) continue;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#1b1208'; c.lineWidth = 6;
      c.beginPath(); s.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke();
      c.strokeStyle = '#ff9b2f'; c.lineWidth = 2;
      c.beginPath(); s.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y))); c.stroke();
    }
    // maçarico
    if (p && (d.phase === 'cut' || d.phase === 'preview')) {
      const cur = d.cursor;
      c.strokeStyle = p.color; c.lineWidth = 2;
      c.beginPath(); c.arc(cur.x, cur.y, 11, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(cur.x - 16, cur.y); c.lineTo(cur.x - 6, cur.y); c.moveTo(cur.x + 6, cur.y); c.lineTo(cur.x + 16, cur.y);
      c.moveTo(cur.x, cur.y - 16); c.lineTo(cur.x, cur.y - 6); c.moveTo(cur.x, cur.y + 6); c.lineTo(cur.x, cur.y + 16); c.stroke();
      c.fillStyle = d.cutting ? '#fff' : '#ff9b2f';
      c.beginPath(); c.arc(cur.x, cur.y, d.cutting ? 4 + 2 * Math.abs(Math.sin(g.time * 40)) : 3, 0, Math.PI * 2); c.fill();
    }
    // painel da esquerda: vez de quem, forma e tempo
    D.panel(c, 18, 82, 220, 390, { stroke: p ? p.color : '#555' });
    if (p) {
      D.text(c, 'VEZ DE', 128, 110, { size: 14, color: '#aaa', align: 'center' });
      D.text(c, p.label + (p.isBot ? ' BOT' : ''), 128, 136, { size: 26, color: p.color, align: 'center' });
      TN.draw.robot(c, 128, 210, 30, p.color, { dir: Math.PI / 2 });
      D.text(c, 'FORMA:', 128, 272, { size: 13, color: '#aaa', align: 'center' });
      D.text(c, p.data.shape, 128, 294, { size: 16, color: '#5ff', align: 'center', maxWidth: 200 });
      const label = { intro: 'PREPARE-SE', preview: 'MEMORIZE!', cut: 'CORTE!', show: 'RESULTADO' }[d.phase] || '';
      D.text(c, label, 128, 336, { size: 22, color: d.phase === 'cut' ? '#ff9b2f' : '#fff', align: 'center' });
      if (d.phase === 'cut') {
        D.bar(c, 38, 362, 180, 14, d.phaseT / this.CUT_TIME, d.phaseT < 3 ? '#f55' : '#ff9b2f');
        D.text(c, U.formatTime(d.phaseT), 128, 392, { size: 18, color: '#fff', align: 'center' });
        D.text(c, 'EXTRA = ENTREGAR', 128, 446, { size: 12, color: '#888', align: 'center' });
      }
      if (d.phase === 'preview') D.bar(c, 38, 362, 180, 14, d.phaseT / this.PREVIEW, '#5ff');
    }
    // painel da direita: placar
    D.panel(c, 722, 82, 220, 390, { stroke: '#ff9b2f' });
    D.text(c, 'PRECISÃO', 832, 108, { size: 16, color: '#ff9b2f', align: 'center' });
    (d.order || []).forEach((q, i) => {
      const y = 150 + i * 72, on = q === p;
      c.fillStyle = on ? 'rgba(255,155,47,0.15)' : 'rgba(255,255,255,0.03)'; c.fillRect(734, y - 26, 196, 56);
      c.fillStyle = q.color; c.fillRect(734, y - 26, 6, 56);
      D.text(c, q.label, 752, y - 8, { size: 16, color: q.color });
      D.text(c, q.data.shape, 752, y + 13, { size: 10, color: '#889', maxWidth: 110 });
      D.text(c, q.data.done ? q.score + '%' : on ? '...' : '—', 920, y, { size: 24, color: q.data.done ? '#fff' : '#666', align: 'right' });
    });
    // resultado do turno
    if (d.phase === 'show' && d.result) {
      const r = d.result;
      D.panel(c, d.cx - 150, P.y + P.h - 92, 300, 76, { stroke: '#46e27b' });
      D.text(c, `${r.score}%`, d.cx, P.y + P.h - 66, { size: 32, color: '#fff', align: 'center' });
      D.text(c, `traço ${Math.round(r.precision * 100)}%  ·  contorno ${Math.round(r.coverage * 100)}%`, d.cx, P.y + P.h - 32, { size: 13, color: '#9c9', align: 'center' });
    }
    if (p && d.phase === 'intro') {
      D.panel(c, d.cx - 170, d.cy - 40, 340, 80, { stroke: p.color });
      D.text(c, `${p.label}: ${p.data.shape}`, d.cx, d.cy, { size: 20, color: p.color, align: 'center', maxWidth: 320 });
    }
  },
});
