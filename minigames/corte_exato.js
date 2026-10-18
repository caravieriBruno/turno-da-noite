// CORTE EXATO — inspirado em "SHAPE CUTTER" (shape_cutter), minigame inacabado de Machine Party.
// Todos ao mesmo tempo: a mesma figura aparece por 2 s e depois cada um recorta com o maçarico
// na sua própria chapa (um quadrante da tela por jogador). Nota = precisão do corte (0–100 %).
// No fim de cada rodada a pior nota sai; repete com outra figura até sobrar um.
TN.registerMinigame({
  id: 'corte_exato',
  title: 'CORTE EXATO',
  inspiredBy: 'Shape Cutter (shape_cutter, não lançado)',
  tagline: 'MEÇA DUAS VEZES. CORTE UMA.',
  brief: ['Todos cortam a mesma figura ao mesmo tempo, cada um na sua chapa.', 'Segure AÇÃO para cortar. EXTRA entrega antes do tempo.', 'A pior nota da rodada sai. Repete até sobrar um.'],
  controls: { move: 'mover o maçarico', a: 'segurar para cortar', b: 'entregar a peça' },
  icon: '⬡',
  color: '#ff9b2f',
  rounds: 1,
  scoring: 'survival',
  hudValue(g, p) { return p.data.result ? p.data.result.score + '%' : '—'; },

  // ---- constantes (original: preview de 2 s; nota por desvio radial em pattern_matcher.gd) ----
  PREVIEW: 2, PREVIEW_MIN: 1, CUT_TIME: 8, SHOW: 2.2, MAX_RODADAS: 5, SPEED: 150, R: 120,
  K: 0.6,        // escala da figura (o contorno original cabia numa chapa de 450×390; aqui é 300×190)
  TOL: 22,       // desvio radial (px, na escala original) a partir do qual o ponto não vale nada
  BINS: 72,      // setores angulares para medir quanto do contorno foi coberto
  PLATE_Q: { w: 300, h: 190 },   // chapa de cada jogador, centrada no seu quadrante
  HUD_Y: 60,                      // os quadrantes começam abaixo do cabeçalho da rodada
  SHAPES: ['RETÂNGULO', 'TRIÂNGULO', 'TRIÂNGULO INVERTIDO', 'HEXÁGONO', 'CÍRCULO'],

  init(g) {
    const d = g.data;
    d.round = 0; d.usadas = []; d.shape = null;
    for (const p of g.players) Object.assign(p.data, { cursor: { x: 0, y: 0 }, strokes: [], cutting: false, done: false, result: null, plan: null });
    this.novaRodada(g);
  },

  // Rodada nova: figura ainda não usada (acabando, qualquer uma menos a anterior), cursores no canto, prévia mais curta a cada rodada.
  novaRodada(g) {
    const d = g.data, U = TN.util, K = this.K, Q = this.PLATE_Q;
    d.round++;
    let livres = this.SHAPES.filter((s) => !d.usadas.includes(s));
    if (!livres.length) { d.usadas = []; livres = this.SHAPES.filter((s) => s !== d.shape); }
    d.shape = U.pick(livres); d.usadas.push(d.shape);
    d.poly = this.shapePoints(d.shape, 0, 0).map((q) => ({ x: q.x * K, y: q.y * K }));
    for (const p of g.alive()) {
      Object.assign(p.data, { cursor: { x: -Q.w / 2 + 20, y: Q.h / 2 - 20 }, strokes: [], cutting: false, done: false, result: null, plan: null });
    }
    d.phase = 'preview'; d.phaseT = Math.max(this.PREVIEW_MIN, this.PREVIEW - 0.3 * (d.round - 1));
    this.posicionar(g);
    g.sfx('select');
  },

  // posição "lógica" de cada jogador = o centro do seu quadrante (rótulos, popups e partículas do motor no 2D)
  posicionar(g) {
    for (const p of g.alive()) { const q = this.quadrante(g, p); p.x = q.cx; p.y = q.cy; }
  },

  // Quadrante de `p` na tela: 2 colunas; com 2 vivos lado a lado, com 3 dois em cima e um embaixo centralizado, com 4 grade 2×2.
  quadrante(g, p) {
    const vivos = g.players.filter((q) => q.alive).sort((a, b) => a.id - b.id);
    const n = vivos.length, i = Math.max(0, vivos.indexOf(p));
    const y0 = this.HUD_Y, H = g.H - y0, W = g.W;
    let x, y, w, h;
    if (n <= 2) { w = W / 2; h = H; x = i * w; y = y0; }
    else { w = W / 2; h = H / 2; x = (i % 2) * w; y = y0 + Math.floor(i / 2) * h; if (n === 3 && i === 2) x = W / 4; }
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
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

  // Raio do contorno na direção `ang` (interseção do raio que sai do centro 0,0 com o polígono).
  radiusAt(g, ang) {
    const poly = g.data.poly, dx = Math.cos(ang), dy = Math.sin(ang);
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x, ey = b.y - a.y, ax = a.x, ay = a.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ey - ay * ex) / den, u = (ax * dy - ay * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  },

  // Nota de `p`: precisão (desvio radial médio de cada ponto) × cobertura (quanto do contorno foi percorrido).
  avaliar(g, p) {
    const pts = p.data.strokes.flat(), TOL = this.TOL * this.K;
    if (pts.length < 8) return { score: 0, precision: 0, coverage: 0 };
    const bins = new Array(this.BINS).fill(0);
    let sum = 0;
    for (const q of pts) {
      const ang = Math.atan2(q.y, q.x);
      const dev = Math.abs(Math.hypot(q.x, q.y) - this.radiusAt(g, ang));
      const w = Math.max(0, 1 - dev / TOL);
      sum += w;
      if (w > 0.35) bins[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * this.BINS) % this.BINS] = 1;
    }
    const precision = sum / pts.length;
    const coverage = bins.reduce((s, v) => s + v, 0) / this.BINS;
    // trechos inteiros sem corte pesam mais (como a penalidade por seção do original)
    const score = Math.round(100 * precision * Math.pow(coverage, 1.3));
    return { score, precision, coverage };
  },

  // os vivos com a menor nota da rodada; vazio quando todos empatam
  piores(g) {
    const al = g.alive(), nota = (p) => (p.data.result ? p.data.result.score : 0);
    const min = Math.min(...al.map(nota)), max = Math.max(...al.map(nota));
    if (min === max) return [];
    return al.filter((p) => nota(p) === min);
  },

  update(g, dt) {
    const d = g.data, U = TN.util, Q = this.PLATE_Q;
    if (d.phase === 'end') return;
    d.phaseT -= dt;
    if (d.phase === 'preview') {
      if (d.phaseT <= 0) { d.phase = 'cut'; d.phaseT = this.CUT_TIME; g.sfx('go'); }
    } else if (d.phase === 'cut') {
      for (const p of g.alive()) {
        const b = p.data;
        if (b.done) continue;
        let { x, y } = p.input;
        const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
        const cur = b.cursor;
        cur.x = U.clamp(cur.x + x * this.SPEED * dt, -Q.w / 2 + 6, Q.w / 2 - 6);
        cur.y = U.clamp(cur.y + y * this.SPEED * dt, -Q.h / 2 + 6, Q.h / 2 - 6);
        if (p.input.a) {
          if (!b.cutting) { b.cutting = true; b.strokes.push([{ x: cur.x, y: cur.y }]); }
          const s = b.strokes[b.strokes.length - 1], last = s[s.length - 1];
          if (U.dist(last.x, last.y, cur.x, cur.y) >= 3) s.push({ x: cur.x, y: cur.y });
          if (U.chance(0.04)) g.sfx('laser');
        } else b.cutting = false;
        if (p.input.bPressed) { b.done = true; b.cutting = false; g.sfx('confirm'); }
      }
      if (d.phaseT <= 0 || g.alive().every((p) => p.data.done)) {
        for (const p of g.alive()) { p.data.done = true; p.data.cutting = false; p.data.result = this.avaliar(g, p); }
        const melhor = Math.max(...g.alive().map((p) => p.data.result.score));
        g.sfx(melhor >= 70 ? 'win' : melhor >= 40 ? 'confirm' : 'lose');
        d.phase = 'show'; d.phaseT = this.SHOW;
      }
    } else if (d.phase === 'show' && d.phaseT <= 0) {
      const ruins = this.piores(g);
      for (const p of ruins) g.eliminate(p, { sound: 'boom', msg: 'ÚLTIMO LUGAR.' });
      if (!ruins.length) g.message('EMPATE: TODOS SEGUEM', 1.2, '#9f9');
      if (g.alive().length > 1 && d.round < this.MAX_RODADAS) this.novaRodada(g);
      else { d.phase = 'end'; g.finish(1.5); }   // o motor também encerra quando sobra 1
    }
  },

  // Bot: segue o contorno verdadeiro com ruído gaussiano e pula um trecho; no fim do caminho entrega.
  bot(g, p, dt) {
    const d = g.data, U = TN.util, b = p.data;
    if (d.phase !== 'cut' || b.done) { b.plan = null; return {}; }
    if (!b.plan) {
      const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      const skill = U.rand(2.5, 8) * this.K;             // desvio-padrão do tremor da mão (px)
      const poly = d.poly, way = [];
      let ox = 0, oy = 0;                                 // tremor suavizado (passa-baixa do ruído gaussiano)
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], bq = poly[(i + 1) % poly.length], n = Math.max(1, Math.round(U.dist(a.x, a.y, bq.x, bq.y) / 8));
        for (let k = 0; k < n; k++) {
          ox = ox * 0.8 + gauss() * skill * 0.6; oy = oy * 0.8 + gauss() * skill * 0.6;
          way.push({ x: U.lerp(a.x, bq.x, k / n) + ox, y: U.lerp(a.y, bq.y, k / n) + oy });
        }
      }
      const start = U.randInt(0, way.length - 1);
      const path = way.slice(start).concat(way.slice(0, start + 1));
      // trecho pulado: até 25 % do contorno, a partir de um ponto aleatório
      const skipLen = U.chance(0.6) ? Math.floor(path.length * U.rand(0, 0.25)) : 0;
      const skipAt = U.randInt(1, Math.max(1, path.length - skipLen - 1));
      b.plan = { path, i: 0, skipAt, skipEnd: skipAt + skipLen, started: false };
    }
    const pl = b.plan, cur = b.cursor;
    if (pl.i >= pl.path.length) return { b: true };
    const t = pl.path[pl.i];
    const dist = U.dist(cur.x, cur.y, t.x, t.y);
    if (dist < 4) { pl.i++; if (pl.i === 1) pl.started = true; }
    const n = U.norm(t.x - cur.x, t.y - cur.y), k = Math.min(1, dist / 5);
    const cutting = pl.started && !(pl.i >= pl.skipAt && pl.i < pl.skipEnd);
    return { x: n.x * k, y: n.y * k, a: cutting };
  },

  // ---------- 3D (câmera fixa): oficina ao fundo, uma bancada pequena por jogador; o jogo em si é a camada 2D ----------
  camera: { pos: [480, 400, 1010], target: [480, 70, 270], fov: 40 },
  env: { bg: '#0c0a09', fog: [1000, 2400], ambient: 0.6, sun: 1.6, sunDir: [-0.3, 1, 0.5], sunColor: '#ffe2bd' },
  TABLE_Z: 380,
  tableX(i) { return 135 + i * 230; },
  standPos(g, p) { return { x: this.tableX(p.id), z: this.TABLE_Z - 92, dir: Math.PI / 2 }; },
  worldPos(g, p) { const s = this.standPos(g, p); return { x: s.x, y: 0, z: s.z }; },

  draw3d(g, r) {
    const d = g.data, TZ = this.TABLE_Z;
    // serralheria da oficina
    r.room(-140, 75, 1100, 560, { estilo: 'oficina', h: 460, props: false });
    r.light(250, 300, TZ, '#ffd9a8', 1.0, 600);
    r.light(710, 300, TZ, '#ffd9a8', 1.0, 600);
    g.players.forEach((p, i) => {
      const tx = this.tableX(i), b = p.data;
      // mesa de corte (grelha) + chapa de aço pequena
      r.box(tx, 0, TZ, 205, 36, 120, '#2a2e33', { metal: 0.5 });
      r.box(tx, 36, TZ, 170, 3, 100, '#7a838c', { metal: 0.8, rough: 0.35 });
      r.box(tx, 0.5, TZ + 64, 205, 2, 4, p.alive ? p.color : '#333', { glow: p.alive });   // faixa da cor do dono
      if (p.alive && d.phase === 'cut' && b.cutting) {
        const fl = 0.5 + 0.5 * Math.abs(Math.sin(g.time * 40 + i));
        r.sphere(tx + b.cursor.x * 0.5, 41, TZ + b.cursor.y * 0.5, 3 + 2 * fl, '#ffffff', { glow: true });
        r.light(tx, 70, TZ, '#ff9b2f', 1.2 + fl, 220);
      }
      // operador atrás da bancada, olhando para a câmera
      const s = this.standPos(g, p);
      r.character({ ...p, x: s.x, y: s.z }, { key: 'ce' + p.id, dir: s.dir, scale: 1.15, pose: !p.alive ? 'dead' : d.phase === 'cut' && !b.done ? 'work' : 'idle', label: false });
    });
  },

  // ---------- HUD comum (3D e 2D): cabeçalho da rodada e um quadrante por vivo ----------
  drawHud(g, c, fundo) {
    const D = TN.draw, d = g.data;
    const fase = { preview: 'MEMORIZE!', cut: 'CORTE!', show: 'RESULTADO', end: 'FIM' }[d.phase] || '';
    D.text(c, `RODADA ${d.round} · ${d.shape} · ÚLTIMO LUGAR SAI`, 480, 46, { size: 14, color: '#ff9b2f', align: 'center', maxWidth: 600 });
    D.text(c, fase, 30, 46, { size: 14, color: d.phase === 'cut' ? '#fff' : '#5ff' });
    if (d.phase === 'cut') D.text(c, TN.util.formatTime(Math.max(0, d.phaseT)), 930, 46, { size: 14, color: d.phaseT < 3 ? '#f55' : '#fff', align: 'right' });
    for (const p of g.players) if (p.alive) this.drawQuadrante(g, c, p, fundo);
  },

  drawShape(c, poly, ox, oy, color, alpha, width, dash) {
    c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width;
    if (dash) c.setLineDash(dash);
    c.beginPath(); poly.forEach((q, i) => (i ? c.lineTo(ox + q.x, oy + q.y) : c.moveTo(ox + q.x, oy + q.y))); c.closePath(); c.stroke();
    c.restore();
  },

  // O quadrante de `p`: moldura na sua cor, nome, chapa, figura, traços, cursor e nota.
  drawQuadrante(g, c, p, fundo) {
    const D = TN.draw, d = g.data, b = p.data, Q = this.PLATE_Q, q = this.quadrante(g, p);
    const ruim = d.phase === 'show' && this.piores(g).includes(p);
    if (fundo) { c.fillStyle = fundo; c.fillRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4); }
    c.strokeStyle = ruim ? '#f55' : p.color; c.lineWidth = 2; c.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
    D.text(c, p.label + (p.isBot ? ' BOT' : ''), q.x + 14, q.y + 18, { size: 13, color: p.color, maxWidth: 160 });
    // chapa de aço
    const px = q.cx - Q.w / 2, py = q.cy - Q.h / 2 + 8, cx = q.cx, cy = q.cy + 8;
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(px + 4, py + 5, Q.w, Q.h);
    c.fillStyle = '#6f777f'; c.fillRect(px, py, Q.w, Q.h);
    c.fillStyle = '#7a838c'; for (let y = py + 6; y < py + Q.h; y += 12) c.fillRect(px, y, Q.w, 2);
    c.strokeStyle = '#3c4248'; c.lineWidth = 3; c.strokeRect(px, py, Q.w, Q.h);
    // figura: forte na prévia, quase invisível no corte, verde no resultado
    if (d.phase === 'preview') {
      this.drawShape(c, d.poly, cx, cy, '#5ff', 0.75 + 0.25 * Math.sin(g.time * 12), 4);
      this.drawShape(c, d.poly, cx, cy, '#fff', 0.6, 1.2);
    } else if (d.phase === 'cut') this.drawShape(c, d.poly, cx, cy, '#5ff', 0.1, 2.5);
    else this.drawShape(c, d.poly, cx, cy, '#46e27b', 0.8, 2.5, [6, 5]);
    // cortes (brasa laranja)
    for (const s of b.strokes) {
      if (s.length < 2) continue;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = '#1b1208'; c.lineWidth = 5;
      c.beginPath(); s.forEach((o, i) => (i ? c.lineTo(cx + o.x, cy + o.y) : c.moveTo(cx + o.x, cy + o.y))); c.stroke();
      c.strokeStyle = '#ff9b2f'; c.lineWidth = 1.8;
      c.beginPath(); s.forEach((o, i) => (i ? c.lineTo(cx + o.x, cy + o.y) : c.moveTo(cx + o.x, cy + o.y))); c.stroke();
    }
    // maçarico
    if ((d.phase === 'cut' || d.phase === 'preview') && !b.done) {
      const ux = cx + b.cursor.x, uy = cy + b.cursor.y;
      c.strokeStyle = p.color; c.lineWidth = 2;
      c.beginPath(); c.arc(ux, uy, 9, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(ux - 14, uy); c.lineTo(ux - 5, uy); c.moveTo(ux + 5, uy); c.lineTo(ux + 14, uy);
      c.moveTo(ux, uy - 14); c.lineTo(ux, uy - 5); c.moveTo(ux, uy + 5); c.lineTo(ux, uy + 14); c.stroke();
      c.fillStyle = b.cutting ? '#fff' : '#ff9b2f';
      c.beginPath(); c.arc(ux, uy, b.cutting ? 3.5 + 2 * Math.abs(Math.sin(g.time * 40)) : 2.5, 0, Math.PI * 2); c.fill();
      if (b.cutting) { c.fillStyle = 'rgba(255,155,47,0.35)'; c.beginPath(); c.arc(ux, uy, 9, 0, Math.PI * 2); c.fill(); }
    }
    if (d.phase === 'cut' && b.done) D.text(c, 'ENTREGOU', q.x + q.w - 14, q.y + 18, { size: 12, color: '#9f9', align: 'right' });
    // nota grande no resultado
    if (b.result && d.phase !== 'cut') {
      const res = b.result;
      D.panel(c, cx - 70, cy - 30, 140, 60, { stroke: ruim ? '#f55' : '#46e27b', fill: 'rgba(8,10,13,0.85)' });
      D.text(c, `${res.score}%`, cx, cy - 8, { size: 26, color: '#fff', align: 'center' });
      D.text(c, ruim ? 'ÚLTIMO LUGAR' : `traço ${Math.round(res.precision * 100)}% · contorno ${Math.round(res.coverage * 100)}%`, cx, cy + 16, { size: 10, color: ruim ? '#f55' : '#9c9', align: 'center', maxWidth: 130 });
    }
  },

  // por cima do 3D: cada quadrante ganha um fundo escuro translúcido
  drawOverlay(g, c) {
    if (!g.uses3d || !g.uses3d()) return;
    this.drawHud(g, c, 'rgba(8,10,13,0.85)');
  },

  // ---------- desenho 2D (alternativa sem WebGL) ----------
  draw(g, c) {
    const D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, 0, 34, g.W, g.H - 34, { tile: 48, a: '#16191d', b: '#191c21' });
    this.drawHud(g, c, 'rgba(8,10,13,0.6)');
  },
});
