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
  let camBlend = 0;                       // 0 = câmera do telão, 1 = câmera dos painéis (só visual, não entra no estado)

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
    // quem tem painel no 3D: os vivos e, só durante o reveal, quem acabou de cair (mostra o erro até o fim da fase)
    comPainel(g) { return g.players.filter((p) => p.alive || (g.data.phase === 'reveal' && p.data.result && p.data.result !== 'ok')).sort((a, b) => a.id - b.id); },
    // painel de `p` por cima do 3D (420×220, escala 17): 4 → grade 2×2 com margens de 20 px; 3 → dois em cima e um embaixo; ≤2 → lado a lado
    painel(g, p) {
      const lista = this.comPainel(g), n = lista.length, i = Math.max(0, lista.indexOf(p));
      const w = 420, h = 220, xs = [20, 520], ys = [92, 316];
      let x, y;
      if (n <= 2) { x = xs[i]; y = 200; }
      else { x = xs[i % 2]; y = ys[Math.floor(i / 2)]; if (n === 3 && i === 2) x = 480 - w / 2; }
      return { x, y, w, h, S: 17, overlay: true };
    },
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
    // Fosso circular de concreto (como o chisel_gauntlet): no centro, o telão suspenso de 4 faces sobre o
    // buraco de cabos; em volta, 4 mesas de controle em diagonal, cada uma com o bloco de 19 prismas do
    // seu escultor, que fica de frente para o centro. Placas de setor (ALFA, BRAVO, CHARLIE, DELTA) na
    // parede de cada um, tambores e paletes encostados. A parede da frente fica aberta para a câmera.
    // duas câmeras: na memorização, de frente para o telão; esculpindo, mais alta e aberta sobre o fosso
    camera: { pos: [480, 470, 1060], target: [480, 160, 300], fov: 42 },
    CAM_PAINEIS: { pos: [480, 720, 1000], target: [480, 20, 300] },
    PIT: { x: 480, z: 300, R: 360, H: 470 },   // centro e raio do fosso (original: ~9,5 u → 38 px/u)
    PANEL_R: 150, SCULPTOR_R: 222, S3D: 11,
    SETORES: ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA'],
    // direção (para fora do centro) da mesa de cada jogador: 0 fundo-esq., 1 fundo-dir., 2 frente-esq., 3 frente-dir.
    eixo(i) { const k = Math.SQRT1_2; return { x: i % 2 ? k : -k, z: i < 2 ? -k : k }; },
    // posição 3D de cada escultor (de frente para o centro): rótulos e partículas do motor
    worldPos(g, p) { const u = this.eixo(p.id); return { x: this.PIT.x + u.x * this.SCULPTOR_R, y: 0, z: this.PIT.z + u.z * this.SCULPTOR_R }; },
    env: { bg: '#0b0b0b', fog: [1100, 2600], ambient: 0.95, sun: 1.5, sunDir: [-0.2, 1, 0.5], sunColor: '#e8e4dc', spot: 0 },

    // bloco de 19 prismas numa mesa: (lx, ly) locais → mundo, com ly crescendo na direção do escultor
    drawBlock3d(r, M, ty, removed, opts = {}) {
      const S = this.S3D;
      CELLS.forEach((cell, i) => {
        const [x, z] = M(cell.x * S, cell.y * S);
        const wrong = opts.compare && removed[i] && !opts.compare[i];
        const missing = opts.compare && !removed[i] && opts.compare[i];
        if (removed[i]) r.cyl(x, ty, z, S * 0.9, 1.5, wrong ? '#ff3030' : '#2a221a', { sides: 6, glow: wrong });
        else r.cyl(x, ty, z, S * 0.93, 14, missing ? '#c4673f' : '#c9b48c', { sides: 6, rough: 0.95, emissive: missing ? '#5a1a00' : undefined });
      });
    },

    // palete de madeira encostado (local: x = largura, sobe em y; ang = giro, incl = inclinação)
    palete(r, x, z, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let k = 0; k < 5; k++) { const lx = -48 + k * 24; r.box(x + lx * c, 0, z - lx * s, 12, 112, 5, '#6d5233', { tex: 'madeira', rotY: ang }); }
      for (const h of [10, 92]) r.box(x - s * 6, h, z - c * 6, 118, 12, 8, '#5a4329', { tex: 'madeira', rotY: ang });
    },

    draw3d(g, r) {
      const d = g.data, P = this.PIT, memo = d.phase === 'memo';
      // câmera: desliza do telão (memo) para a vista aberta (esculpir/reveal) e volta
      camBlend += ((memo ? 0 : 1) - camBlend) * 0.06;
      const L = (a, b) => a.map((v, i) => v + (b[i] - v) * camBlend);
      r.camera(L(this.camera.pos, this.CAM_PAINEIS.pos), L(this.camera.target, this.CAM_PAINEIS.target), this.camera.fov);

      // ---- fosso: piso de chapa, parede circular em gomos (a frente fica aberta), saliências e luminárias
      r.plane(P.x, -1.5, P.z + 300, 2600, 2200, '#2b2c2b', { tex: 'piso' });
      r.disc(P.x, -0.8, P.z, P.R, '#4a4c4b', { tex: 'metal', metal: 0.5, rough: 0.6 });
      const N = 28, segW = (2 * Math.PI * (P.R + 14)) / N + 4;
      for (let k = 0; k < N; k++) {
        const th = (k + 0.5) * 2 * Math.PI / N, cs = Math.cos(th), sn = Math.sin(th);
        if (sn > 0.8) continue;   // abertura da frente (lado da câmera)
        const x = P.x + cs * (P.R + 14), z = P.z + sn * (P.R + 14), rot = -(th + Math.PI / 2);
        r.box(x, 0, z, segW, P.H, 28, '#8f8c85', { tex: 'concreto', rotY: rot });
        r.box(x, 0, z, segW + 1, 14, 30, '#2a2a28', { rotY: rot });                       // rodapé
        for (const y of [150, 310]) {                                                      // saliências em anel
          const x2 = P.x + cs * (P.R - 4), z2 = P.z + sn * (P.R - 4);
          r.box(x2, y, z2, segW, 16, 22, '#8a877f', { tex: 'concreto', rotY: rot });
        }
        if (k % 2 === 0) {                                                                 // pilares
          const x3 = P.x + cs * (P.R - 10), z3 = P.z + sn * (P.R - 10);
          r.box(x3, 0, z3, 26, P.H, 26, '#6a6862', { tex: 'concreto', rotY: rot });
        }
        if (k % 4 === 1) {                                                                 // luminária de parede
          const x4 = P.x + cs * (P.R - 14), z4 = P.z + sn * (P.R - 14);
          r.box(x4, 238, z4, 70, 12, 14, '#3a3b3a', { metal: 0.5, rotY: rot });
          r.box(P.x + cs * (P.R - 22), 240, P.z + sn * (P.R - 22), 60, 5, 2, '#f2fff6', { glow: true, rotY: rot });
        }
      }
      // grade de proteção no alto do fosso
      for (let k = 0; k <= 36; k++) {
        const th = k * 2 * Math.PI / 36;
        if (Math.sin(th) > 0.8) continue;
        r.tube(P.x + Math.cos(th) * (P.R + 8), P.H, P.z + Math.sin(th) * (P.R + 8), P.x + Math.cos(th) * (P.R + 8), P.H + 46, P.z + Math.sin(th) * (P.R + 8), 2, '#3d3e3b', { metal: 0.6 });
      }

      // ---- piso do centro: área de chapa com faixa zebrada em octógono, grelhas em diagonal e o buraco de cabos
      const OCT = 8, oR = 232;
      for (let k = 0; k < OCT; k++) {
        const a0 = (k + 0.5) * 2 * Math.PI / OCT, a1 = (k + 1.5) * 2 * Math.PI / OCT;
        const x0 = P.x + Math.cos(a0) * oR, z0 = P.z + Math.sin(a0) * oR, x1 = P.x + Math.cos(a1) * oR, z1 = P.z + Math.sin(a1) * oR;
        for (let j = 0; j < 8; j++) {
          const t0 = j / 8, xm = x0 + (x1 - x0) * (t0 + 1 / 16), zm = z0 + (z1 - z0) * (t0 + 1 / 16);
          r.plane(xm, 0.3, zm, Math.hypot(x1 - x0, z1 - z0) / 8 + 0.5, 7, j % 2 ? '#141414' : '#d9a800', { tex: false, rotY: -Math.atan2(z1 - z0, x1 - x0) });
        }
      }
      for (const sgn of [-1, 1]) r.plane(P.x, 0.2, P.z, 2 * oR * 0.92, 26, '#1a1b1a', { rotY: sgn * Math.PI / 4, tex: 'metal' });   // grelhas
      r.disc(P.x, 0.5, P.z, 46, '#070707', { tex: false });
      r.ring(P.x, 0.6, P.z, 46, 54, '#3c3d3c', { metal: 0.6 });

      // ---- telão suspenso de 4 faces (jumbotron), cabos até o buraco e semáforo
      const MY = 190, MH = 205, MW = 270, MD = 130, ty = MY + MH / 2;
      r.beam(P.x, MY + MH, P.z, P.x, P.H + 200, P.z, 22, '#262726', { metal: 0.6 });
      for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        r.beam(P.x + ax * MW / 2, MY + MH, P.z + az * MD / 2, P.x + ax * 300, P.H + 30, P.z + az * 300, 3, '#1c1d1c', { metal: 0.4 });   // cabos de sustentação
        r.tube(P.x + ax * 20, 0, P.z + az * 20, P.x + ax * 60, MY, P.z + az * 30, 4, '#1a1a1a', { tex: false });                          // cabos do buraco
      }
      r.box(P.x, MY, P.z, MW + 20, MH, MD + 20, '#202322', { metal: 0.6, rough: 0.5 });
      r.box(P.x, MY - 14, P.z, MW - 40, 14, MD - 10, '#2c2f2e', { metal: 0.5 });
      r.box(P.x, MY - 18, P.z, MW - 70, 4, MD - 40, "#cfe0d8", { glow: true });            // anel de luz embaixo do telão
      const tela = memo ? '#16261c' : '#0a0d0f';
      r.box(P.x, MY + 12, P.z + MD / 2 + 10, MW - 16, MH - 24, 2, tela, { emissive: memo ? '#0c2a16' : '#050607' });
      r.box(P.x, MY + 12, P.z - MD / 2 - 12, MW - 16, MH - 24, 2, tela, { emissive: memo ? '#0c2a16' : '#050607' });
      for (const sx of [-1, 1]) r.box(P.x + sx * (MW / 2 + 11), MY + 12, P.z, 2, MH - 24, MD - 16, tela, { emissive: memo ? '#0c2a16' : '#050607' });
      // semáforo do telão: verde esculpindo, vermelho no veredito
      const sem = d.phase === 'carve' ? '#3dff6e' : d.phase === 'reveal' ? '#ff2a1a' : '#5a4a10';
      r.sphere(P.x + MW / 2 - 6, MY + MH + 12, P.z + MD / 2, 5, sem, { glow: true });
      r.sphere(P.x - MW / 2 + 6, MY + MH + 12, P.z + MD / 2, 5, sem, { glow: true });
      const zt = P.z + MD / 2 + 12;
      if (memo) {
        const shown = CELLS.map(() => false);
        for (let k = 0; k < d.removedShown; k++) shown[d.order[k]] = true;
        CELLS.forEach((cell, i) => {
          if (shown[i]) return;
          r.cyl(P.x + cell.x * 20, ty + 6 - cell.y * 20, zt - 4, 18.5, 8, '#e3cfa6', { sides: 6, rotX: Math.PI / 2, emissive: '#3d2f14' });
        });
        r.light(P.x, ty, zt + 120, '#ffe7b8', 1.1, 560);
      } else {
        // estática enquanto esculpem
        for (let k = 0; k < 14; k++) r.box(P.x - 135 + ((k * 97 + Math.floor(g.time * 12) * 31) % 270), MY + 20 + ((k * 53 + Math.floor(g.time * 12) * 17) % 190), zt, 18, 3, 1, '#2d3b33', { glow: true });
      }

      // ---- tambores e paletes encostados na parede
      const naParede = (th, rr) => [P.x + Math.cos(th) * rr, P.z + Math.sin(th) * rr];
      { const [bx, bz] = naParede(Math.PI * 0.86, P.R - 50); r.prop('tambor', bx, bz, { color: '#5b4a36' }); r.prop('tambor', bx + 30, bz - 26, { color: '#4f5e3a' }); r.prop('tambor', bx + 12, bz - 10, { color: '#5b4a36', y: 44 }); }
      { const [bx, bz] = naParede(Math.PI * 1.62, P.R - 46); r.prop('tambor', bx, bz, { color: '#6b2e22' }); }
      { const th = Math.PI * 1.17, [bx, bz] = naParede(th, P.R - 40); this.palete(r, bx, bz, -(th + Math.PI / 2)); }
      { const th = Math.PI * 0.12, [bx, bz] = naParede(th, P.R - 40); this.palete(r, bx, bz, -(th + Math.PI / 2)); }

      // ---- luzes: teto do fosso e duas de serviço sobre as mesas
      r.light(P.x, P.H, P.z - 60, '#e8f4ff', 0.9, 900);
      r.light(P.x - 230, 260, P.z + 60, '#ffd9a8', 0.7, 520);
      r.light(P.x + 230, 260, P.z + 60, '#ffd9a8', 0.7, 520);

      // ---- mesas de controle (uma por escultor) com o bloco, os botões e a placa do setor
      g.players.forEach((p, i) => {
        const u = this.eixo(i), s = p.data, rx = u.z, rz = -u.x;   // (rx, rz) = direita de quem olha para o centro
        const cx = P.x + u.x * this.PANEL_R, cz = P.z + u.z * this.PANEL_R, ang = Math.atan2(u.z, u.x);
        const M = (lx, ly) => [cx + rx * lx + u.x * ly, cz + rz * lx + u.z * ly];
        const rot = -(ang + Math.PI / 2);   // eixo X local da caixa ao longo da direita do escultor
        r.box(cx, 0, cz, 200, 38, 96, '#2e3231', { metal: 0.45, rough: 0.6, rotY: rot });
        r.box(cx, 38, cz, 206, 5, 102, '#3f4442', { metal: 0.55, rough: 0.45, rotY: rot });
        const [fx, fz] = M(0, 52);
        r.box(fx, 2, fz, 200, 3, 3, p.alive ? p.color : '#333', { glow: p.alive, rotY: rot });   // faixa da cor do dono
        const compare = d.phase === 'reveal' ? d.target : null;
        const B = (lx, ly) => M(lx - 22, ly);
        this.drawBlock3d(r, B, 43, s.cells, { compare });
        // botões ENVIAR / RESETAR na beirada direita
        const S = this.S3D, bS = B(NODES[SEND].x * S, NODES[SEND].y * S * 1.6), bR = B(NODES[RESET].x * S, NODES[RESET].y * S * 1.6);
        r.box(bS[0], 43, bS[1], 18, 6, 15, s.sent ? '#7dffaa' : '#1f8a45', { emissive: '#0b3d1e', rotY: rot });
        r.box(bR[0], 43, bR[1], 18, 6, 15, '#d68a1e', { emissive: '#3d2405', rotY: rot });
        // cursor (anel brilhante) e cinzel durante a escultura
        if (d.phase === 'carve' && !s.sent && p.alive) {
          const n = NODES[s.cursor];
          const [qx, qz] = s.cursor >= SEND ? (s.cursor === SEND ? bS : bR) : B(n.x * S, n.y * S);
          r.ring(qx, 59 + Math.abs(Math.sin(g.time * 6)) * 3, qz, S * 0.75, S * 1.05, p.color, { glow: true });
          r.beam(qx + 6, 63, qz - 6, qx + 16, 87, qz - 16, 3, '#c9ced4', { metal: 0.8 });
        }
        // escultor de frente para o centro
        const w = this.worldPos(g, p);
        r.character({ ...p, x: w.x, y: w.z }, { key: p.id, scale: 1.15, dir: Math.atan2(-u.z, -u.x), pose: !p.alive ? 'dead' : d.phase === 'carve' && !s.sent ? 'work' : 'idle', label: false });
        // placa do setor na parede atrás do escultor
        const [sx, sz] = naParede(ang, P.R - 36);
        r.box(sx, 300, sz, 130, 38, 6, '#1b1d1c', { rotY: rot });
        r.box(sx, 296, sz, 136, 3, 7, p.alive ? p.color : '#444', { glow: p.alive, rotY: rot });
        if (memo) r.label(sx - u.x * 8, 312, sz - u.z * 8, this.SETORES[i], "#e6e1d4", 13);
      });
    },

    drawOverlay(g, c) {
      if (!g.uses3d()) return;   // (uses3d já confere TN.R3.available)
      const D = TN.draw, d = g.data;
      // relógio / ciclo no canto (fora do telão e dos painéis)
      D.panel(c, 20, 38, 200, 46, { fill: 'rgba(10,8,6,0.85)', stroke: '#d9b77e' });
      if (d.phase === 'memo') D.text(c, d.phaseT < this.SHOW_FULL ? 'O BLOCO...' : 'MEMORIZE!', 120, 54, { size: 17, color: '#ffd9a0', align: 'center' });
      else if (d.phase === 'carve') {
        const left = Math.max(0, d.carveTime - d.phaseT);
        D.text(c, `ESCULPA: ${Math.ceil(left)} s`, 120, 54, { size: 17, color: left < 3 ? '#ff6b6b' : '#fff', align: 'center' });
      } else D.text(c, `CICLO ${d.cycle}`, 120, 54, { size: 17, color: '#d9b77e', align: 'center' });
      D.text(c, `${d.order.length} cortes · ${d.carveTime} s`, 120, 73, { size: 10, color: '#a08a66', align: 'center' });
      if (d.phase === 'memo') return;   // na memorização só o telão 3D importa
      // o bloco de cada um, grande, em painéis por cima do cenário
      for (const p of this.comPainel(g)) {
        const q = this.painel(g, p);
        c.fillStyle = 'rgba(10,8,6,0.85)'; c.fillRect(q.x, q.y, q.w, q.h);
        this.drawQuadrant(g, c, p, q);
      }
      if (d.phase === 'reveal') D.text(c, 'vermelho = cortou errado · laranja = faltou cortar', 480, TN.H - 4, { size: 11, color: '#a08a66', align: 'center' });
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

    // o bloco de `p` num retângulo: o quadrante 2D (padrão) ou um painel por cima do 3D (rect.overlay, com rect.S)
    drawQuadrant(g, c, p, rect = this.quad(p.id)) {
      const D = TN.draw, d = g.data, s = p.data, q = rect;
      const bx = q.x + q.w / 2 - 65, by = q.y + q.h / 2 + 10, S = q.S || 19;
      if (!q.overlay) { c.fillStyle = (p.id + Math.floor(p.id / 2)) % 2 ? '#171413' : '#1b1816'; c.fillRect(q.x, q.y, q.w, q.h); }
      c.strokeStyle = p.alive ? p.color : '#333'; c.lineWidth = 2; c.strokeRect(q.x + 3, q.y + 3, q.w - 6, q.h - 6);
      // no 2D, margens maiores do lado do relógio central
      const padL = !q.overlay && p.id % 2 ? 46 : 14, padR = !q.overlay && !(p.id % 2) ? 46 : 16;
      D.text(c, p.label + (p.isBot ? ' BOT' : ''), q.x + padL, q.y + 18, { size: 14, color: p.alive ? p.color : '#666', maxWidth: 150 });
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
        if (!q.overlay) g.drawPlayer(c, p);
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
      if (!q.overlay) g.drawPlayer(c, p);   // no 3D o escultor já está atrás da bancada
    },
  });
})();
