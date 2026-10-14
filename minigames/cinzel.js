// ESCULTOR — inspirado em "CHISEL GAUNTLET" (chisel_gauntlet) de Machine Party.
// O telão mostra um bloco de pedra com 19 pedaços (um hexágono de hexágonos) e depois o mesmo
// bloco com alguns pedaços removidos. Memorize! Depois cada um esculpe a mesma figura no seu
// bloco e aperta ENVIAR. Errou, ou não enviou a tempo: eliminado. Os ciclos ficam mais difíceis
// (mais cortes, menos tempo) até sobrar no máximo um escultor.
(function () {
  // ---- geometria do bloco (constantes, calculadas uma vez) ----
  const S3 = Math.sqrt(3);
  const CELLS = [];                       // 19 células em coordenadas axiais, por linhas
  for (let r = -2; r <= 2; r++) for (let q = -2; q <= 2; q++) {
    if (Math.abs(q + r) <= 2) CELLS.push({ q, r, x: S3 * (q + r / 2), y: 1.5 * r });
  }
  const CENTER = CELLS.findIndex((c) => c.q === 0 && c.r === 0);
  const SEND = CELLS.length, RESET = CELLS.length + 1;   // nós extras do cursor: botões
  // posições (em "unidades de hexágono") de todos os nós do cursor
  const NODES = CELLS.map((c) => ({ x: c.x, y: c.y })).concat([{ x: 6.6, y: -0.9 }, { x: 6.6, y: 0.9 }]);
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // Próximo nó na direção pedida (o mais alinhado e próximo, até ~50° de desvio).
  function nav(from, dir) {
    const [dx, dy] = DIRV[dir], a = NODES[from];
    let best = from, bs = 1e9;
    NODES.forEach((b, j) => {
      if (j === from) return;
      const vx = b.x - a.x, vy = b.y - a.y;
      const along = vx * dx + vy * dy, perp = Math.abs(vx * dy - vy * dx);
      if (along <= 0.2 || perp > along * 1.2) return;
      const sc = along + perp * 2;
      if (sc < bs - 1e-6) { bs = sc; best = j; }
    });
    return best;
  }
  // tabela de vizinhos do cursor: ADJ[nó][direção] = próximo nó
  const ADJ = NODES.map((_, i) => ({ up: nav(i, 'up'), down: nav(i, 'down'), left: nav(i, 'left'), right: nav(i, 'right') }));
  // primeira direção do caminho mais curto (BFS) entre dois nós — usado pelo bot
  function firstStep(from, to) {
    const prev = new Array(NODES.length).fill(null), seen = [from], queue = [from];
    while (queue.length) {
      const n = queue.shift();
      if (n === to) break;
      for (const dir of ['up', 'down', 'left', 'right']) {
        const m = ADJ[n][dir];
        if (seen.includes(m)) continue;
        seen.push(m); prev[m] = { n, dir }; queue.push(m);
      }
    }
    let cur = to, step = null;
    while (prev[cur]) { step = prev[cur].dir; cur = prev[cur].n; }
    return cur === from ? step : null;
  }

  TN.registerMinigame({
    id: 'cinzel',
    title: 'ESCULTOR',
    inspiredBy: 'Chisel Gauntlet (chisel_gauntlet)',
    tagline: 'MEMORIZE. ESCULPA. ENVIE.',
    brief: [
      'Memorize quais pedaços somem do bloco no telão.',
      'Esculpa igual no seu bloco e aperte ENVIAR.',
      'Errou ou não enviou a tempo: eliminado.',
      'Cada ciclo tem mais cortes e menos tempo.',
    ],
    controls: { move: 'mover o cinzel', a: 'remover pedaço / ENVIAR / RESETAR' },
    icon: '⬢',
    color: '#d9b77e',
    rounds: 2,
    scoring: 'survival',      // ordem de eliminação; empates no mesmo ciclo (ver results)

    // ---- constantes (originais: memorizar 4 s, esculpir 15 s −1/ciclo (mín. 5), cortes 4 → 9) ----
    MEMO: 4, SHOW_FULL: 1.0, CARVE_START: 15, CARVE_MIN: 5, CUT_START: 4, CUT_MAX: 9,
    REVEAL: 2.6, ELIM_AT: 1.1, MAX_CYCLES: 12,

    quad(i) { return { x: (i % 2) * 480, y: 34 + Math.floor(i / 2) * 253, w: 480, h: 253 }; },
    cuts(cycle) { return Math.min(this.CUT_START + cycle - 1, this.CUT_MAX); },
    carveTime(cycle) { return Math.max(this.CARVE_START - (cycle - 1), this.CARVE_MIN); },

    init(g) {
      g.data.cycle = 0;
      g.data.removedShown = 0;
      g.players.forEach((p, i) => {
        const q = this.quad(i);
        p.x = q.x + 440; p.y = q.y + 200; p.dir = Math.PI;
        p.data = { cells: new Array(19).fill(false), cursor: CENTER, sent: false, result: null, aliveAtElim: 0, bot: null, hold: 0, holdOut: null };
      });
      this.startCycle(g);
    },

    // Novo ciclo: sorteia a figura e mostra no telão.
    startCycle(g) {
      const U = TN.util, d = g.data;
      d.cycle++;
      d.phase = 'memo'; d.phaseT = 0; d.removedShown = 0;
      const n = this.cuts(d.cycle);
      const idx = U.shuffle(CELLS.map((_, i) => i)).slice(0, n);
      d.target = CELLS.map((_, i) => idx.includes(i));
      d.order = idx;                           // ordem da animação de remoção no telão
      d.carveTime = this.carveTime(d.cycle);
      for (const p of g.players) { p.data.result = null; p.data.sent = false; }
      g.sfx('select');
    },

    startCarve(g) {
      const U = TN.util, d = g.data;
      d.phase = 'carve'; d.phaseT = 0;
      for (const p of g.alive()) {
        const s = p.data;
        s.cells = new Array(19).fill(false); s.cursor = CENTER; s.sent = false;
        // plano do bot: lembra cada corte com chance que cai a cada ciclo
        const recall = Math.max(0.6, 0.93 - 0.025 * (d.cycle - 1));
        const plan = [];
        for (const i of d.order) {
          if (U.chance(recall)) plan.push(i);
          else if (U.chance(0.5)) {               // lembrou errado: corta um vizinho qualquer
            const wrong = U.pick(CELLS.map((_, k) => k).filter((k) => !d.target[k] && !plan.includes(k)));
            if (wrong !== undefined) plan.push(wrong);
          }                                       // senão: esqueceu esse corte
        }
        s.bot = { plan: U.shuffle(plan).concat([SEND]), wait: U.rand(0.5, 1.2) };
      }
      g.sfx('go');
    },

    startReveal(g) {
      const d = g.data;
      d.phase = 'reveal'; d.phaseT = 0; d.elimDone = false;
      for (const p of g.alive()) {
        const s = p.data;
        if (!s.sent) s.result = 'late';
        else s.result = s.cells.every((v, i) => v === d.target[i]) ? 'ok' : 'wrong';
      }
      g.sfx('tick');
    },

    update(g, dt) {
      const U = TN.util, d = g.data;
      d.phaseT += dt;
      if (d.phase === 'memo') {
        // animação: os pedaços somem um a um no telão
        const n = d.order.length;
        const shouldShow = d.phaseT < this.SHOW_FULL ? 0 : Math.min(n, Math.floor((d.phaseT - this.SHOW_FULL) / (0.9 / n)) + 1);
        while (d.removedShown < shouldShow) {
          const cell = CELLS[d.order[d.removedShown]];
          g.particles(480 + cell.x * 34, 300 + cell.y * 34, '#d9b77e', 8, 140);
          g.sfx('hit');
          d.removedShown++;
        }
        if (d.phaseT >= this.MEMO) this.startCarve(g);
      } else if (d.phase === 'carve') {
        for (const p of g.alive()) {
          const s = p.data;
          if (s.sent) continue;
          const inp = p.input;
          const dir = inp.upPressed ? 'up' : inp.downPressed ? 'down' : inp.leftPressed ? 'left' : inp.rightPressed ? 'right' : null;
          if (dir) { const nx = ADJ[s.cursor][dir]; if (nx !== s.cursor) { s.cursor = nx; g.sfx('blip'); } }
          if (inp.aPressed) {
            if (s.cursor === SEND) { s.sent = true; g.sfx('confirm'); }
            else if (s.cursor === RESET) { s.cells.fill(false); g.sfx('back'); }
            else if (!s.cells[s.cursor]) {
              s.cells[s.cursor] = true; g.sfx('hit');
              const q = this.quad(p.id), cell = CELLS[s.cursor];
              g.particles(q.x + 175 + cell.x * 19, q.y + 138 + cell.y * 19, '#d9b77e', 6, 100);
            }
          }
        }
        if (d.phaseT >= d.carveTime || g.alive().every((p) => p.data.sent)) this.startReveal(g);
      } else if (d.phase === 'reveal') {
        if (!d.elimDone && d.phaseT >= this.ELIM_AT) {
          d.elimDone = true;
          const losers = g.alive().filter((p) => p.data.result !== 'ok');
          const aliveBefore = g.alive().length;
          for (const p of losers) {
            p.data.aliveAtElim = aliveBefore;    // eliminados juntos empatam (ver results)
            g.eliminate(p, { sound: 'boom', msg: p.data.result === 'late' ? 'ATRASADO!' : 'ERRADO!' });
          }
          if (losers.length) g.flash('#f33', 0.2);
          else g.sfx('coin');
        }
        if (d.phaseT >= this.REVEAL) {
          if (g.alive().length >= 2 && d.cycle < this.MAX_CYCLES) this.startCycle(g);
          else { d.phase = 'done'; g.finish(1.5); }
        }
      }
    },

    // Pontos como no original: todos começam com N e cada eliminado perde o nº de vivos
    // no momento da eliminação → 0/1/2/4, com empate para quem cai no mesmo ciclo.
    results(g, pts) {
      const n = g.playerCount;
      for (const p of g.players) pts[p.id] = (p.alive ? n : n - p.data.aliveAtElim) + p.score;
    },

    // Bot: segue o plano (com erros sorteados no início do ciclo), andando com o cursor.
    bot(g, p, dt) {
      const U = TN.util, s = p.data, d = g.data;
      if (s.hold > 0) { s.hold--; return s.holdOut; }
      if (d.phase !== 'carve' || s.sent || !s.bot) return {};
      const b = s.bot;
      b.wait -= dt;
      if (b.wait > 0) return {};
      b.wait = U.rand(0.1, 0.24);
      const target = b.plan[0];
      if (target === undefined) return {};
      let out;
      if (s.cursor === target) {
        out = { a: true };
        b.plan.shift();
        b.wait = U.rand(0.15, 0.35);
      } else {
        // anda pelo caminho mais curto até o alvo
        const dir = firstStep(s.cursor, target) || U.pick(['up', 'down', 'left', 'right']);
        out = { x: DIRV[dir][0], y: DIRV[dir][1] };
      }
      s.hold = 2; s.holdOut = out;   // segura 3 quadros e depois solta (gera a "borda")
      return out;
    },

    // ------------------------------------------------------------------ desenho 3D
    // Oficina: telão holográfico ao fundo; 4 bancadas de frente para a câmera, cada uma com o bloco
    // de 19 prismas hexagonais. O escultor fica atrás da própria bancada.
    camera: { pos: [480, 400, 1010], target: [480, 70, 270], fov: 40 },
    env: { bg: '#0c0a09', fog: [1000, 2400], sunDir: [-0.35, 1, 0.75], sunColor: '#ffe2bd' },
    S3D: 12, TABLE_Z: 380,
    tableX(i) { return 135 + i * 230; },

    drawBlock3d(r, tx, ty, tz, removed, opts = {}) {
      const S = this.S3D;
      CELLS.forEach((cell, i) => {
        const x = tx + cell.x * S, z = tz + cell.y * S;
        const wrong = opts.compare && removed[i] && !opts.compare[i];
        const missing = opts.compare && !removed[i] && opts.compare[i];
        if (removed[i]) {
          r.cyl(x, ty, z, S * 0.9, 1.5, wrong ? '#ff3030' : '#2a221a', { sides: 6, glow: wrong });
        } else {
          r.cyl(x, ty, z, S * 0.93, 14, missing ? '#c4673f' : '#c9b48c', { sides: 6, rough: 0.95, emissive: missing ? '#5a1a00' : undefined });
        }
      });
    },

    draw3d(g, r) {
      const d = g.data, S = this.S3D;
      // piso de madeira gasta e parede de fundo
      r.plane(480, 0, 300, 1500, 1000, '#2a2420', { rough: 0.95 });
      r.box(480, 0, 60, 1400, 520, 30, '#1b1715');
      // telão com o bloco-alvo (prismas virados para a câmera)
      r.box(480, 120, 98, 330, 280, 18, '#0d0f11', { metal: 0.5 });
      r.box(480, 126, 108, 310, 266, 2, d.phase === 'memo' ? '#1b2a20' : '#0a0d0f', { emissive: d.phase === 'memo' ? '#0c2a16' : '#050607' });
      if (d.phase === 'memo') {
        const shown = CELLS.map(() => false);
        for (let k = 0; k < d.removedShown; k++) shown[d.order[k]] = true;
        CELLS.forEach((cell, i) => {
          if (shown[i]) return;
          r.cyl(480 + cell.x * 24, 258 - cell.y * 24, 110, 22, 8, '#e3cfa6', { sides: 6, rotX: Math.PI / 2, emissive: '#3d2f14' });
        });
        r.light(480, 260, 200, '#ffe7b8', 1.2, 600);
      } else {
        // "?" de estática enquanto esculpem
        for (let k = 0; k < 14; k++) r.box(330 + ((k * 97 + Math.floor(g.time * 12) * 31) % 300), 140 + ((k * 53 + Math.floor(g.time * 12) * 17) % 230), 110, 18, 3, 1, '#2d3b33', { glow: true });
      }
      // lâmpadas sobre as bancadas
      r.light(250, 300, 380, '#ffcf8f', 1.0, 600);
      r.light(710, 300, 380, '#ffcf8f', 1.0, 600);
      // bancadas
      g.players.forEach((p, i) => {
        const tx = this.tableX(i), tz = this.TABLE_Z, s = p.data;
        r.box(tx, 0, tz, 205, 36, 120, '#5a4636', { rough: 0.9 });
        r.box(tx, 36, tz, 210, 6, 124, '#6e5643', { rough: 0.8 });
        r.box(tx, 0.5, tz + 64, 205, 2, 4, p.alive ? p.color : '#333', { glow: p.alive });   // faixa da cor do dono
        const compare = d.phase === 'reveal' ? d.target : null;
        this.drawBlock3d(r, tx - 14, 42, tz, s.cells, { compare });
        // botões ENVIAR / RESETAR na beirada direita
        const btnX = tx - 14 + NODES[SEND].x * S;
        r.box(btnX, 42, tz + NODES[SEND].y * S * 1.6, 20, 6, 16, s.sent ? '#7dffaa' : '#1f8a45', { emissive: '#0b3d1e' });
        r.box(btnX, 42, tz + NODES[RESET].y * S * 1.6, 20, 6, 16, '#d68a1e', { emissive: '#3d2405' });
        // cursor (anel brilhante) durante a escultura
        if (d.phase === 'carve' && !s.sent && p.alive) {
          const n = NODES[s.cursor];
          const cx = s.cursor >= SEND ? btnX : tx - 14 + n.x * S, cz = s.cursor >= SEND ? tz + n.y * S * 1.6 : tz + n.y * S;
          r.ring(cx, 58 + Math.abs(Math.sin(g.time * 6)) * 3, cz, S * 0.75, S * 1.05, p.color, { glow: true });
          r.beam(cx + 6, 62, cz - 6, cx + 16, 86, cz - 16, 3, '#c9ced4', { metal: 0.8 });   // cinzel
        }
        // escultor atrás da bancada, olhando para a câmera
        r.box(tx, 0, tz - 92, 90, 14, 46, '#3b302a');   // degrau do escultor
        r.character({ ...p, x: tx, y: tz - 92 }, { key: p.id, y: 14, scale: 1.15, dir: Math.PI / 2, pose: !p.alive ? 'dead' : d.phase === 'carve' && !s.sent ? 'arms' : 'idle', label: false });
      });
    },

    drawOverlay(g, c) {
      if (!TN.R3.available || !g.uses3d()) return;
      const D = TN.draw, d = g.data;
      // relógio / ciclo no topo
      D.panel(c, 380, 42, 200, 40, { fill: 'rgba(10,8,6,0.85)', stroke: '#d9b77e' });
      if (d.phase === 'memo') D.text(c, d.phaseT < this.SHOW_FULL ? 'O BLOCO...' : 'MEMORIZE!', 480, 62, { size: 20, color: '#ffd9a0', align: 'center' });
      else if (d.phase === 'carve') {
        const left = Math.max(0, d.carveTime - d.phaseT);
        D.text(c, `ESCULPA: ${Math.ceil(left)} s`, 480, 62, { size: 20, color: left < 3 ? '#ff6b6b' : '#fff', align: 'center' });
      } else D.text(c, `CICLO ${d.cycle}`, 480, 62, { size: 20, color: '#d9b77e', align: 'center' });
      D.text(c, `${d.order.length} cortes · ${d.carveTime} s`, 480, 94, { size: 12, color: '#a08a66', align: 'center' });
      // estado de cada escultor acima da cabeça
      g.players.forEach((p, i) => {
        const s = p.data, q = TN.R3.project(this.tableX(i), 110, this.TABLE_Z - 92);
        let st = '', sc = '#aaa';
        if (d.phase === 'reveal' && s.result) { st = s.result === 'ok' ? 'APROVADO' : s.result === 'late' ? 'NÃO ENVIOU' : 'REPROVADO'; sc = s.result === 'ok' ? '#46e27b' : '#ff4d4d'; }
        else if (!p.alive) { st = 'ELIMINADO'; sc = '#f55'; }
        else if (d.phase === 'carve') { st = s.sent ? 'ENVIADO ✔' : 'esculpindo…'; sc = s.sent ? '#46e27b' : '#d9b77e'; }
        D.text(c, p.label + (p.isBot ? ' BOT' : ''), q.x, q.y - 16, { size: 13, color: p.alive ? p.color : '#777', align: 'center' });
        if (st) D.text(c, st, q.x, q.y + 2, { size: 13, color: sc, align: 'center' });
      });
      if (d.phase === 'reveal') D.text(c, 'vermelho = cortou errado · laranja = faltou cortar', 480, TN.H - 14, { size: 12, color: '#a08a66', align: 'center' });
    },

    // ------------------------------------------------------------------ desenho 2D (alternativa)
    hexPath(c, x, y, s) {
      c.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
      c.closePath();
    },

    drawCell(c, x, y, s, removed, opts = {}) {
      if (removed) {
        this.hexPath(c, x, y, s * 0.9);
        c.fillStyle = opts.wrong ? '#5a1414' : '#0a0908'; c.fill();
        c.setLineDash([3, 3]);
        c.strokeStyle = opts.wrong ? '#ff4d4d' : '#6b5a44'; c.lineWidth = 1.5; c.stroke();
        c.setLineDash([]);
        return;
      }
      this.hexPath(c, x, y, s * 0.96);
      c.fillStyle = opts.missing ? '#7a3b2a' : '#a8916b'; c.fill();
      this.hexPath(c, x, y - s * 0.08, s * 0.72);
      c.fillStyle = opts.missing ? '#b4583d' : '#d6c19a'; c.fill();
      this.hexPath(c, x, y, s * 0.96);
      c.strokeStyle = opts.missing ? '#ff4d4d' : '#4f412f'; c.lineWidth = opts.missing ? 2.5 : 1.5; c.stroke();
    },

    drawBoard(c, cx, cy, s, removedArr, opts = {}) {
      CELLS.forEach((cell, i) => {
        const x = cx + cell.x * s, y = cy + cell.y * s;
        let o = {};
        if (opts.compare) {
          if (removedArr[i] && !opts.compare[i]) o = { wrong: true };      // cortou o que não devia
          if (!removedArr[i] && opts.compare[i]) o = { missing: true };    // faltou cortar
        }
        this.drawCell(c, x, y, s, removedArr[i], o);
      });
    },

    draw(g, c) {
      const D = TN.draw, d = g.data;
      c.fillStyle = '#121010'; c.fillRect(0, 0, g.W, g.H);
      if (d.phase === 'memo') this.drawMemo(g, c);
      else {
        for (const p of g.players) this.drawQuadrant(g, c, p);
        // relógio central
        const cx = 480, cy = 287;
        c.fillStyle = '#0b0b0b'; c.beginPath(); c.arc(cx, cy, 32, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#d9b77e'; c.lineWidth = 3; c.stroke();
        if (d.phase === 'carve') {
          const left = Math.max(0, d.carveTime - d.phaseT);
          c.strokeStyle = left < 3 ? '#ff4d4d' : '#46e27b'; c.lineWidth = 5;
          c.beginPath(); c.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (left / d.carveTime)); c.stroke();
          D.text(c, String(Math.ceil(left)), cx, cy + 1, { size: 22, color: left < 3 ? '#ff6b6b' : '#fff', align: 'center' });
        } else {
          D.text(c, 'CICLO', cx, cy - 9, { size: 9, color: '#a08a66', align: 'center' });
          D.text(c, String(d.cycle), cx, cy + 8, { size: 18, color: '#d9b77e', align: 'center' });
        }
      }
    },

    drawMemo(g, c) {
      const D = TN.draw, d = g.data;
      // telão
      D.panel(c, 250, 70, 460, 440, { fill: '#0a0c0e', stroke: '#d9b77e', lw: 3, radius: 10 });
      c.fillStyle = 'rgba(217,183,126,0.05)'; for (let y = 74; y < 506; y += 4) c.fillRect(254, y, 452, 1);
      D.text(c, d.phaseT < this.SHOW_FULL ? 'O BLOCO...' : 'MEMORIZE!', 480, 100, { size: 26, color: '#ffd9a0', align: 'center' });
      D.text(c, `CICLO ${d.cycle}  ·  ${d.order.length} CORTES  ·  ${d.carveTime} s`, 480, 128, { size: 14, color: '#a08a66', align: 'center' });
      const shown = CELLS.map(() => false);
      for (let k = 0; k < d.removedShown; k++) shown[d.order[k]] = true;
      this.drawBoard(c, 480, 300, 34, shown);
      // barra de tempo da memorização
      D.bar(c, 300, 480, 360, 8, 1 - d.phaseT / this.MEMO, '#d9b77e', '#222');
      // escultores (vivos/eliminados) dos lados
      g.players.forEach((p, i) => {
        const x = i % 2 ? 840 : 120, y = i < 2 ? 200 : 400;
        TN.draw.robot(c, x, y, 20, p.color, { dir: i % 2 ? Math.PI : 0, dead: !p.alive, label: p.label });
        if (!p.alive) D.text(c, 'ELIMINADO', x, y + 36, { size: 12, color: '#f55', align: 'center' });
      });
    },

    drawQuadrant(g, c, p) {
      const D = TN.draw, d = g.data, s = p.data, q = this.quad(p.id);
      const bx = q.x + 175, by = q.y + 138, S = 19;
      c.fillStyle = (p.id + Math.floor(p.id / 2)) % 2 ? '#171413' : '#1b1816';
      c.fillRect(q.x, q.y, q.w, q.h);
      c.strokeStyle = p.alive ? p.color : '#333'; c.lineWidth = 2; c.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      // margens maiores do lado do relógio central
      const padL = p.id % 2 ? 46 : 14, padR = p.id % 2 ? 16 : 46;
      D.text(c, p.label + (p.isBot ? ' BOT' : ''), q.x + padL, q.y + 18, { size: 14, color: p.alive ? p.color : '#666' });
      // estado
      let st = '', sc = '#aaa';
      if (!p.alive && !(d.phase === 'reveal' && s.result && s.result !== 'ok')) { st = 'ELIMINADO'; sc = '#f55'; }
      else if (d.phase === 'carve') { st = s.sent ? 'ENVIADO ✔' : 'ESCULPINDO...'; sc = s.sent ? '#46e27b' : '#d9b77e'; }
      else if (d.phase === 'reveal') {
        st = s.result === 'ok' ? 'PERFEITO!' : s.result === 'late' ? 'NÃO ENVIOU!' : s.result === 'wrong' ? 'ERRADO!' : '';
        sc = s.result === 'ok' ? '#46e27b' : '#ff4d4d';
      }
      D.text(c, st, q.x + q.w - padR, q.y + 18, { size: 14, color: sc, align: 'right' });
      if (!p.alive && !(d.phase === 'reveal' && s.result)) {
        this.drawBoard(c, bx, by, S, s.cells);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(q.x + 4, q.y + 30, q.w - 8, q.h - 34);
        g.drawPlayer(c, p);
        return;
      }
      const compare = d.phase === 'reveal' ? d.target : null;
      this.drawBoard(c, bx, by, S, s.cells, { compare });
      // botões
      const btn = (node, label, col) => {
        const n = NODES[node], x = bx + n.x * S - 38, y = by + n.y * S - 12;
        c.fillStyle = s.sent && node === SEND ? '#1d4a2c' : '#26221e'; c.fillRect(x, y, 76, 24);
        c.strokeStyle = col; c.lineWidth = 1.5; c.strokeRect(x, y, 76, 24);
        D.text(c, label, x + 38, y + 12, { size: 12, color: col, align: 'center' });
      };
      if (d.phase !== 'reveal') { btn(SEND, 'ENVIAR', '#46e27b'); btn(RESET, 'RESETAR', '#ffb347'); }
      // cursor (cinzel)
      if (d.phase === 'carve' && !s.sent && p.alive) {
        const n = NODES[s.cursor], x = bx + n.x * S, y = by + n.y * S;
        c.strokeStyle = p.color; c.lineWidth = 3 + Math.abs(Math.sin(g.time * 6)) * 2;
        if (s.cursor >= SEND) c.strokeRect(x - 41, y - 15, 82, 30);
        else { this.hexPath(c, x, y, S * 1.05); c.stroke(); }
        // cinzel desenhado sobre o cursor
        c.save(); c.translate(x + 8, y - 10); c.rotate(-0.6);
        c.fillStyle = '#8b5a2b'; c.fillRect(-3, -18, 6, 12);
        c.fillStyle = '#c9ced4'; c.fillRect(-2, -6, 4, 10);
        c.restore();
      }
      const cut = s.cells.filter(Boolean).length;
      D.text(c, `cortes: ${cut}`, q.x + padL, q.y + q.h - 16, { size: 12, color: '#8a7a62' });
      // selo do resultado (no lugar dos botões, para não esconder a comparação)
      if (d.phase === 'reveal' && s.result) {
        const ok = s.result === 'ok';
        c.save(); c.translate(bx + NODES[SEND].x * S + 16, by - 4); c.rotate(-0.15);
        c.globalAlpha = Math.min(1, d.phaseT * 3);
        D.panel(c, -56, -18, 112, 36, { fill: ok ? 'rgba(20,70,35,0.9)' : 'rgba(90,15,15,0.9)', stroke: ok ? '#46e27b' : '#ff4d4d', lw: 3 });
        D.text(c, ok ? 'APROVADO' : 'REPROVADO', 0, 1, { size: 15, color: ok ? '#7dffaa' : '#ff8080', align: 'center' });
        c.restore(); c.globalAlpha = 1;
        if (!ok) D.lines(c, 'vermelho = cortou errado\nlaranja = faltou cortar', bx + NODES[SEND].x * S - 38, by + 40, { size: 10, color: '#a08a66', lineHeight: 13 });
      }
      g.drawPlayer(c, p);
    },
  });
})();
