(function () {
// SERVIÇO INTERNO — inspirado em "INSIDE JOB" (knife_at_the_office) de Machine Party.
// Fase 1: todos revistam os móveis do escritório (segurar AÇÃO 1 s). Quem completar a N-ésima busca acha a seringa (+1).
// Fase 2: as luzes apagam e, 3 s depois, começa uma contagem de 30 s. O portador infecta quem estiver perto (+1 por
// infecção); o infectado fica congelado 5 s e depois caça também, 1,25× mais rápido. Quem escapar ganha +1.
// Cache da navegação dos bots e das paredes (derivados das constantes; não fazem parte do estado da rodada)
const NAV = {}; let PAREDES = null;
TN.registerMinigame({
  id: 'servico_interno',
  title: 'SERVIÇO INTERNO',
  inspiredBy: 'Inside Job (knife_at_the_office)',
  tagline: 'REVISTE. CACE. ESCONDA-SE.',
  brief: ['Revistem as salas da administração: segure AÇÃO junto aos móveis.', 'Quem achar a seringa infecta os outros.', 'Infectados voltam e caçam também.', 'Escape por 30 s no escuro.'],
  controls: { move: 'andar', a: 'revistar (segurar) / infectar' },
  icon: '✚',
  color: '#9be15d',
  rounds: 3,
  scoring: 'points',          // +1 achar, +1 por infecção, +1 por escapar
  endWhenOneLeft: false,

  // ---- constantes (originais: busca 1,0 s, recarga 0,5 s, congelado 5 s, caçador 1,25×, contagem 30 s) ----
  SPEED: 175, HOLDER_MULT: 1.3, HUNTER_MULT: 1.15,   // o portador da seringa é sempre o mais rápido
  SEARCH_TIME: 1.0, REACH: 14,            // distância (px) da borda do móvel para conseguir revistar
  INFECT_RANGE: 56, INFECT_CD: 0.5, FREEZE: 3,
  GRACE: 3, HUNT_TIME: 30, FORCE_AT: 45,  // FORCE_AT: se ninguém achou até aqui, a próxima busca acha
  LIGHT_R: 95, LIGHT_R_INF: 122,
  ARENA: { x: 20, y: 44, w: 920, h: 480 },   // sala maior que a arena padrão do motor

  // Planta da ala administrativa, como o escritório de Inside Job: várias salas em volta de um saguão, ligadas
  // por portas. Em cima: diretoria (A), arquivo (B), prontuários (C) e secretaria (D), com portas A↔B e C↔D;
  // embaixo: sala de visitas (E), almoxarifado (F) e copa (G), com porta F↔G; no meio, o saguão com a mesa de
  // reunião e dois pilares. Paredes sólidas: [x, y, w, h] (10 de espessura; as portas são vãos de 60 a 70).
  WALLS: [
    // linha de cima (y 186): portas 150–220, 330–400, 560–630, 740–810
    [20, 186, 130, 10], [220, 186, 110, 10], [400, 186, 160, 10], [630, 186, 110, 10], [810, 186, 130, 10],
    // divisórias de cima: A|B (porta y 100–160), B|C, C|D (porta y 100–160)
    [245, 44, 10, 56], [245, 160, 10, 26], [475, 44, 10, 142], [705, 44, 10, 56], [705, 160, 10, 26],
    // linha de baixo (y 376): portas 220–290, 450–520, 680–750
    [20, 376, 200, 10], [290, 376, 160, 10], [520, 376, 160, 10], [750, 376, 190, 10],
    // divisórias de baixo: E|F, F|G (porta y 430–490)
    [325, 386, 10, 138], [635, 386, 10, 44], [635, 490, 10, 34],
    // pilares do saguão
    [292, 272, 24, 24], [644, 272, 24, 24],
  ],
  // Nomes das salas (plaquinhas no 3D): [texto, x, y]
  SALAS: [['DIRETORIA', 132, 60], ['ARQUIVO', 365, 60], ['PRONTUÁRIOS', 595, 60], ['SECRETARIA', 827, 60],
    ['VISITAS', 172, 400], ['ALMOXARIFADO', 485, 400], ['COPA', 790, 400]],
  // Móveis: [tipo, x, y, w, h]. Todos são sólidos e podem ser revistados uma vez (2 ou 3 por sala).
  LAYOUT: [
    ['mesa', 50, 76, 84, 46], ['armario', 185, 52, 50, 30],                       // A diretoria
    ['estante', 265, 52, 90, 28], ['mesa', 370, 96, 84, 46],                      // B arquivo
    ['impressora', 500, 52, 60, 34], ['estante', 600, 52, 90, 28],                // C prontuários
    ['armario', 730, 52, 50, 30], ['mesa', 830, 96, 84, 46],                      // D secretaria
    ['mesa', 430, 262, 100, 52], ['bebedouro', 30, 300, 34, 34], ['vaso', 900, 300, 30, 30],   // saguão
    ['sofa', 40, 484, 110, 34], ['armario', 250, 488, 50, 30],                    // E visitas
    ['estante', 420, 490, 90, 28], ['mesa', 355, 410, 84, 46],                    // F almoxarifado
    ['sofa', 780, 484, 120, 34], ['impressora', 866, 400, 60, 34],                // G copa
  ],
  SPAWNS: [[100, 286], [370, 236], [590, 336], [860, 286]],   // no saguão

  init(g) {
    const U = TN.util, d = g.data;
    g.arena = { ...this.ARENA };
    d.furniture = this.LAYOUT.map(([kind, x, y, w, h], i) => ({ kind, x, y, w, h, i, searched: false, papers: null }));
    // seringa: N-ésima busca (escala do original: 26 móveis para 4 jogadores)
    const F = d.furniture.length;
    const base = Math.round(F * g.playerCount / 4);
    d.N = U.clamp(base - Math.round(base * 0.5 * Math.random()), 1, F);
    d.searches = 0;
    d.phase = 'search';        // search → grace → hunt → end
    d.phaseT = 0;
    d.huntLeft = this.HUNT_TIME;
    d.holderId = -1;          // id de quem achou a seringa
    const spawns = U.shuffle(this.SPAWNS.slice());
    g.players.forEach((p, i) => {
      [p.x, p.y] = spawns[i % spawns.length];
      p.dir = p.x < g.W / 2 ? 0 : Math.PI;
      p.data = { infected: false, frozen: 0, cd: 0, swing: 0, searchT: 0, searchF: null, holder: false };
    });
  },

  // ---------- auxiliares ----------
  // distância do círculo do jogador até a borda do retângulo
  rectGap(p, f) {
    const nx = Math.max(f.x, Math.min(p.x, f.x + f.w)), ny = Math.max(f.y, Math.min(p.y, f.y + f.h));
    return Math.hypot(p.x - nx, p.y - ny) - p.r;
  },
  // móvel não revistado mais perto, ao alcance
  reachable(g, p) {
    let best = null, bd = this.REACH;
    for (const f of g.data.furniture) {
      if (f.searched) continue;
      const gap = this.rectGap(p, f);
      if (gap < bd) { bd = gap; best = f; }
    }
    return best;
  },
  // empurra o jogador para fora dos móveis (colisão círculo x retângulo)
  collide(g, p) {
    for (const f of this.solidos(g)) {
      const nx = Math.max(f.x, Math.min(p.x, f.x + f.w)), ny = Math.max(f.y, Math.min(p.y, f.y + f.h));
      const dx = p.x - nx, dy = p.y - ny, dd = Math.hypot(dx, dy);
      if (dd >= p.r) continue;
      if (dd > 0) { p.x = nx + (dx / dd) * p.r; p.y = ny + (dy / dd) * p.r; }
      else { // centro dentro do móvel: sai pelo lado mais próximo
        const opts = [[p.x - f.x, -1, 0], [f.x + f.w - p.x, 1, 0], [p.y - f.y, 0, -1], [f.y + f.h - p.y, 0, 1]].sort((a, b) => a[0] - b[0]);
        p.x += opts[0][1] * (opts[0][0] + p.r); p.y += opts[0][2] * (opts[0][0] + p.r);
      }
    }
    const a = g.arena;
    p.x = TN.util.clamp(p.x, a.x + p.r, a.x + a.w - p.r);
    p.y = TN.util.clamp(p.y, a.y + p.r, a.y + a.h - p.r);
  },
  // tudo o que é sólido: móveis (do estado) e paredes (constantes)
  solidos(g) {
    if (!PAREDES) PAREDES = this.WALLS.map(([x, y, w, h]) => ({ x, y, w, h, wall: true }));
    return g.data.furniture.concat(PAREDES);
  },
  isHunter(p) { return p.data.infected && p.data.frozen <= 0; },

  foundSyringe(g, p) {
    const d = g.data;
    d.holderId = p.id; p.data.holder = true; p.data.infected = true;
    d.phase = 'grace'; d.phaseT = 0;
    g.addScore(p, 1);
    g.sfx('pickup'); g.after(0.35, () => g.sfx('buzz'));
    g.flash('#000', 0.6); g.shake(4);
    g.message('AS LUZES APAGARAM!', 2.2, '#9be15d');
    g.popup('SERINGA!', p.x, p.y - 50, '#9be15d');
    for (const o of g.players) { o.data.searchT = 0; o.data.searchF = null; }
  },

  infect(g, o, by) {
    o.data.infected = true; o.data.frozen = this.FREEZE;
    g.addScore(by, 1);
    g.sfx('hurt'); g.shake(5);
    g.particles(o.x, o.y, '#9be15d', 22, 220);
    g.popup('INFECTADO!', o.x, o.y - 52, '#9be15d');
  },

  endRound(g, msg) {
    const d = g.data;
    if (d.phase === 'end') return;
    d.phase = 'end';
    for (const p of g.players) if (!p.data.infected) { g.addScore(p, 1); g.popup('ESCAPOU!', p.x, p.y - 52, '#fff'); }
    g.message(msg, 2, '#9be15d');
    g.sfx('win');
    g.finish(1.8);
  },

  update(g, dt) {
    const U = TN.util, d = g.data;
    d.phaseT += dt;
    if (d.phase === 'end') return;

    // ---- fase 1: revista ----
    if (d.phase === 'search') {
      if (g.time > this.FORCE_AT) d.N = Math.min(d.N, d.searches + 1);             // ninguém achou: força
      if (g.time > this.FORCE_AT + 15) { this.foundSyringe(g, U.pick(g.players)); } // segurança extra
    }
    if (d.phase === 'grace' && d.phaseT >= this.GRACE) {
      d.phase = 'hunt'; d.phaseT = 0;
      g.sfx('go'); g.message('INFECTE TODOS!', 1.3, '#9be15d');
    }
    if (d.phase === 'hunt') {
      const before = Math.ceil(d.huntLeft);
      d.huntLeft -= dt;
      if (Math.ceil(d.huntLeft) !== before && d.huntLeft < 5.5 && d.huntLeft > 0) g.sfx('tick');
      if (d.huntLeft <= 0) { d.huntLeft = 0; this.endRound(g, 'FIM DO EXPEDIENTE'); return; }
    }

    for (const p of g.players) {
      const pd = p.data;
      pd.cd -= dt; pd.swing -= dt;
      if (pd.frozen > 0) {
        pd.frozen -= dt;
        if (pd.frozen <= 0) { g.sfx('buzz'); g.popup('CAÇANDO!', p.x, p.y - 52, '#9be15d'); }
        continue;
      }
      // revistar: segurando AÇÃO junto a um móvel, parado
      let searching = false;
      if (d.phase === 'search' && p.input.a) {
        const f = this.reachable(g, p);
        if (f) {
          searching = true;
          if (pd.searchF !== f) { pd.searchF = f; pd.searchT = 0; }
          pd.searchT += dt;
          if (Math.floor(pd.searchT * 6) !== Math.floor((pd.searchT - dt) * 6)) g.sfx('step');
          if (pd.searchT >= this.SEARCH_TIME) {
            f.searched = true; d.searches++;
            f.papers = Array.from({ length: 4 }, () => ({ x: U.rand(-10, f.w + 10), y: U.rand(-10, f.h + 10), a: U.rand(0, 3) }));
            pd.searchF = null; pd.searchT = 0;
            if (d.searches >= d.N) { this.foundSyringe(g, p); }
            else { g.sfx('blip'); g.popup('nada...', f.x + f.w / 2, f.y - 8, '#999'); }
          }
        }
      }
      if (!searching) { pd.searchF = null; pd.searchT = 0; }

      const speed = searching ? 0 : this.SPEED * (pd.holder ? this.HOLDER_MULT : pd.infected ? this.HUNTER_MULT : 1);
      g.movePlayer(p, speed, dt);
      this.collide(g, p);

      // infectar (só na contagem): todos não infectados ao alcance
      if (d.phase === 'hunt' && pd.infected && p.input.aPressed && pd.cd <= 0) {
        pd.cd = this.INFECT_CD; pd.swing = 0.18;
        g.sfx('whoosh');
        for (const o of g.players) {
          if (o === p || o.data.infected) continue;
          if (U.dist(p.x, p.y, o.x, o.y) < this.INFECT_RANGE) this.infect(g, o, p);
        }
      }
    }
    U.separate(g.players);
    for (const p of g.players) this.collide(g, p);

    if (d.phase === 'hunt' && g.players.every((p) => p.data.infected)) this.endRound(g, 'TODOS INFECTADOS');
  },

  // ---------- navegação dos bots entre as salas ----------
  // Grade de 10 px sobre a arena: uma célula é livre se o boneco (raio 16 + folga) cabe nela sem tocar parede
  // nem móvel. Paredes e móveis nunca mudam de lugar, então a grade é calculada uma vez (cache do arquivo,
  // fora do estado da rodada). Os bots fazem uma busca em largura (BFS) a partir de onde estão e seguem o
  // caminho até o alvo, mirando algumas células à frente.
  nav() {
    if (NAV.free) return NAV;
    const A = this.ARENA, C = NAV.C = 10, cols = NAV.cols = Math.floor(A.w / C), rows = NAV.rows = Math.floor(A.h / C);
    const rects = this.WALLS.map(([x, y, w, h]) => ({ x, y, w, h })).concat(this.LAYOUT.map(([, x, y, w, h]) => ({ x, y, w, h })));
    const free = NAV.free = new Uint8Array(cols * rows), R = 17;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = A.x + (i + 0.5) * C, y = A.y + (j + 0.5) * C;
      if (x < A.x + 16 || x > A.x + A.w - 16 || y < A.y + 16 || y > A.y + A.h - 16) continue;
      free[j * cols + i] = rects.every((f) => Math.hypot(x - TN.util.clamp(x, f.x, f.x + f.w), y - TN.util.clamp(y, f.y, f.y + f.h)) >= R) ? 1 : 0;
    }
    // células de onde dá para revistar cada móvel (lado livre mais perto)
    NAV.serve = this.LAYOUT.map(([, x, y, w, h]) => {
      const f = { x, y, w, h }, out = [];
      for (let k = 0; k < cols * rows; k++) {
        if (!free[k]) continue;
        const q = { x: A.x + ((k % cols) + 0.5) * C, y: A.y + (Math.floor(k / cols) + 0.5) * C, r: 16 };
        if (this.rectGap(q, f) < this.REACH - 3) out.push(k);
      }
      return out;
    });
    return NAV;
  },
  cell(x, y) {
    const N = this.nav(), A = this.ARENA, C = N.C;
    const i0 = TN.util.clamp(Math.floor((x - A.x) / C), 0, N.cols - 1), j0 = TN.util.clamp(Math.floor((y - A.y) / C), 0, N.rows - 1);
    if (N.free[j0 * N.cols + i0]) return j0 * N.cols + i0;
    let best = -1, bd = 1e9;   // encostado num móvel: a célula livre mais perto
    for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= N.cols || j >= N.rows || !N.free[j * N.cols + i]) continue;
      if (di * di + dj * dj < bd) { bd = di * di + dj * dj; best = j * N.cols + i; }
    }
    return best;
  },
  centro(k) { const N = this.nav(), A = this.ARENA; return { x: A.x + ((k % N.cols) + 0.5) * N.C, y: A.y + (Math.floor(k / N.cols) + 0.5) * N.C }; },
  // BFS (8 vizinhos, sem cortar quina) a partir de uma ou mais células; devolve a distância em células (−1 = não alcança)
  bfs(fontes) {
    const N = this.nav(), cols = N.cols, rows = N.rows, dist = new Int16Array(cols * rows).fill(-1), fila = new Int32Array(cols * rows);
    let a = 0, b = 0;
    for (const k of fontes) if (k >= 0 && dist[k] < 0) { dist[k] = 0; fila[b++] = k; }
    while (a < b) {
      const k = fila[a++], i = k % cols, j = (k - i) / cols;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const nk = nj * cols + ni;
        if (!N.free[nk] || dist[nk] >= 0) continue;
        if (di && dj && (!N.free[j * cols + ni] || !N.free[nj * cols + i])) continue;
        dist[nk] = dist[k] + 1; fila[b++] = nk;
      }
    }
    return dist;
  },
  // direção para seguir de (p) até a célula alvo, dado o campo de distâncias a partir de p: refaz o caminho
  // de trás para a frente e mira a célula ~4 passos à frente do bot
  rumo(p, dist, alvo) {
    const N = this.nav(), cols = N.cols, caminho = [alvo];
    let k = alvo;
    while (dist[k] > 0 && caminho.length < 400) {
      const i = k % cols, j = (k - i) / cols;
      let prox = -1;
      for (let dj = -1; dj <= 1 && prox < 0; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj, nk = nj * cols + ni;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= N.rows) continue;
        if (dist[nk] === dist[k] - 1 && (!(di && dj) || (N.free[j * cols + ni] && N.free[nj * cols + i]))) { prox = nk; break; }
      }
      if (prox < 0) break;
      k = prox; caminho.push(k);
    }
    const n = caminho.length, mira = this.centro(caminho[Math.max(0, n - 1 - 4)]);
    return TN.util.norm(mira.x - p.x, mira.y - p.y);
  },

  // ---------- bot ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (pd.frozen > 0 || d.phase === 'end') return { x: 0, y: 0 };
    // detecção de "preso" (encostado em parede ou móvel): se mal andou em 0,6 s, dá um passo de lado
    pd.bStuckT = (pd.bStuckT || 0) + dt;
    if (pd.bStuckT > 0.6) {
      const moved = U.dist(p.x, p.y, pd.bLastX ?? p.x, pd.bLastY ?? p.y);
      if (moved < 10 && !pd.searchF) { pd.bSide = { x: U.rand(-1, 1), y: U.rand(-1, 1), t: 0.35 }; pd.bThink = 0; }
      pd.bLastX = p.x; pd.bLastY = p.y; pd.bStuckT = 0;
    }
    if (pd.bSide && pd.bSide.t > 0) { pd.bSide.t -= dt; return { x: pd.bSide.x, y: pd.bSide.y }; }
    pd.bThink = (pd.bThink || 0) - dt;
    const pensa = pd.bThink <= 0 || !pd.bDir;
    if (pensa) pd.bThink = U.rand(0.12, 0.2);

    // fase 1: vai até o móvel não revistado mais perto PELO CAMINHO (evita o que outro bot já escolheu) e segura AÇÃO
    if (d.phase === 'search') {
      const N = this.nav();
      const f = pd.bTarget != null ? d.furniture[pd.bTarget] : null;
      if (f && !f.searched && this.rectGap(p, f) < this.REACH - 3) { pd.bDir = null; return { x: 0, y: 0, a: true }; }
      if (!pensa && f && !f.searched) return { x: pd.bDir.x, y: pd.bDir.y };
      const dist = this.bfs([this.cell(p.x, p.y)]);
      let best = null, bs = 1e9, bk = -1;
      for (const o of d.furniture) {
        if (o.searched) continue;
        let dk = -1, dmin = 1e9;
        for (const k of N.serve[o.i]) if (dist[k] >= 0 && dist[k] < dmin) { dmin = dist[k]; dk = k; }
        if (dk < 0) continue;
        const taken = g.players.some((q) => q !== p && q.data.bTarget === o.i);
        const s = dmin * N.C + (taken ? 220 : 0) + (o.i === pd.bTarget ? -30 : U.rand(0, 60));
        if (s < bs) { bs = s; best = o; bk = dk; }
      }
      if (!best) return { x: 0, y: 0 };
      pd.bTarget = best.i;
      if (dist[bk] <= 1) {   // já na porta do móvel: encosta direto
        const nx = U.clamp(p.x, best.x, best.x + best.w), ny = U.clamp(p.y, best.y, best.y + best.h);
        pd.bDir = U.norm(nx - p.x, ny - p.y);
      } else pd.bDir = this.rumo(p, dist, bk);
      return { x: pd.bDir.x, y: pd.bDir.y };
    }

    // fase 2, infectado: persegue pelo caminho o sobrevivente mais perto e ataca ao alcance
    if (pd.infected) {
      let prey = null, bd = 1e9;
      for (const o of g.players) {
        if (o.data.infected) continue;
        const dd = U.dist(p.x, p.y, o.x, o.y);
        if (dd < bd) { bd = dd; prey = o; }
      }
      if (!prey) return { x: 0, y: 0 };
      const want = d.phase === 'hunt' && bd < this.INFECT_RANGE - 4 && pd.cd <= 0;
      const press = want && !pd.bPrevA; pd.bPrevA = press;
      if (bd < 70) pd.bDir = U.norm(prey.x - p.x, prey.y - p.y);
      else if (pensa) pd.bDir = this.rumo(p, this.bfs([this.cell(p.x, p.y)]), this.cell(prey.x, prey.y));
      return { x: pd.bDir.x, y: pd.bDir.y, a: press };
    }

    // fase 2, sobrevivente: testa 16 direções e escolhe a que deixa mais longe dos caçadores PELO CAMINHO
    // (distância andando, que conta as paredes), sem bater em paredes ou móveis
    const hunters = g.players.filter((o) => o.data.infected && o.data.frozen < 1.5);
    if (!hunters.length) return { x: 0, y: 0 };
    if (pensa) {
      const N = this.nav(), dh = this.bfs(hunters.map((h) => this.cell(h.x, h.y)));
      const livre = (x, y) => { const k = this.cell(x, y); return k >= 0 && N.free[k] && U.dist(x, y, this.centro(k).x, this.centro(k).y) < N.C ? k : -1; };
      let best = null, bs = -1e9;
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
        let s = 0;
        for (const step of [30, 80]) {
          const kk = livre(p.x + cx * step, p.y + cy * step);
          if (kk < 0) { s -= step === 30 ? 600 : 150; continue; }
          s += Math.min(300, (dh[kk] < 0 ? 300 : dh[kk] * N.C)) * (step === 80 ? 1 : 0.5);
        }
        if (pd.bDir) s += (cx * pd.bDir.x + cy * pd.bDir.y) * 40;  // inércia: evita tremer
        s += U.rand(0, 25);
        if (s > bs) { bs = s; best = { x: cx, y: cy }; }
      }
      pd.bDir = best;
    }
    return { x: pd.bDir.x, y: pd.bDir.y };
  },

  // ---------- 3D (câmera fixa) ----------
  // Escritório em corte: parede do fundo com janelas noturnas e luminárias, paredes laterais, mureta na frente.
  // Móveis revistáveis em 3D (mesas com monitor aceso, arquivos, estantes, sofás...). Quando as luzes apagam,
  // o ambiente vai ao breu e cada jogador leva uma lanterna (r.light) — verde e maior para os infectados.
  // câmera alta e fechada (quase planta, como a vista de cima do original) para enxergar dentro de todas as salas
  camera: { pos: [480, 900, 720], target: [480, 0, 292], fov: 37 },
  WALL_H: 58,
  env: { bg: '#0a0c10', ambient: 0.65, sun: 1.7, sunDir: [-0.3, 1, 0.5], sunColor: '#fff1dc' },

  furniture3d(r, f, hi, dark) {
    const { x, y, w, h } = f, cx = x + w / 2, cz = y + h / 2;
    const S = f.searched;
    switch (f.kind) {
      case 'mesa': {
        r.box(cx, 0, y + h + 12, 18, 14, 18, '#1c1f24');                              // cadeira
        r.box(cx, 14, y + h + 20, 18, 22, 3, '#1c1f24');
        for (const sx of [x + 4, x + w - 4]) r.box(sx, 0, cz, 4, 28, h - 6, '#4a3420');
        r.box(cx, 28, cz, w, 4, h, '#7a5534', { rough: 0.6 });
        r.box(cx, 32, y + 12, 34, 4, 10, '#15181c');                                 // monitor
        r.box(cx, 36, y + 12, 34, 22, 3, '#15181c', { metal: 0.4 });
        r.box(cx, 38, y + 14, 30, 18, 1, S ? '#1a1d22' : '#3a8fd0', S ? {} : { glow: true });
        r.box(cx, 32, y + 28, 28, 2, 8, '#cfcfcf');                                  // teclado
        if (!S) r.box(x + 14, 32, y + 28, 12, 1, 15, '#eeeeee');
        break;
      }
      case 'armario':
        r.box(cx, 0, cz, w, 62, h, S ? '#4a5058' : '#6b7480', { metal: 0.5, rough: 0.5 });
        for (let k = 0; k < 3; k++) r.box(cx + (S && k === 1 ? 0 : 0), 8 + k * 18, y + h + (S && k === 1 ? 10 : 0.5), w - 8, 14, S && k === 1 ? 20 : 1, '#4d545e', { metal: 0.5 });
        break;
      case 'estante':
        r.box(cx, 0, cz, w, 84, h, '#5d3f26');
        for (const sy of [4, 30, 56]) {
          for (let k = 0, bx = x + 4; bx < x + w - 6; k++) {
            const bw = 5 + ((f.i * 7 + k * 13 + sy) % 5);
            if (!(S && k % 2)) r.box(bx + bw / 2, sy, y + h + 0.5, bw, 20, 2, ['#b33', '#3a6', '#36b', '#cb3', '#999'][(f.i + k) % 5]);
            bx += bw + 1;
          }
        }
        break;
      case 'impressora':
        r.box(cx, 0, cz, w - 6, 20, h - 6, '#2a2d31');
        r.box(cx, 20, cz, w, 22, h, '#c9cdd2', { rough: 0.5 });
        r.box(cx, 30, y + h + 0.5, w - 16, 4, 1, '#333');
        r.sphere(x + w - 8, 42, y + 6, 2.5, S ? '#300' : '#4f4', { glow: true });
        break;
      case 'sofa':
        r.box(cx, 0, cz, w, 16, h, '#7a2e3a', { rough: 0.9 });
        r.box(cx, 0, y + h - 6, w, 36, 12, '#6a2430', { rough: 0.9 });
        for (const sx of [x + 5, x + w - 5]) r.box(sx, 0, cz, 10, 24, h, '#6a2430', { rough: 0.9 });
        { const n = Math.round(w / 40); for (let k = 0; k < n; k++) r.box(x + 10 + (k + 0.5) * (w - 20) / n, 16, cz - 3, (w - 20) / n - 4, 6, h - 16, '#93404e', { rough: 0.9, rotZ: S && k === 0 ? 0.4 : 0 }); }
        break;
      case 'bebedouro':
        r.box(cx, 0, cz, w, 42, h, '#dddddd', { rough: 0.5 });
        r.cyl(cx, 42, cz, w * 0.36, 26, '#5ab4ff', { opacity: 0.85, rough: 0.1 });
        break;
      case 'vaso':
        r.cyl(cx, 0, cz, w / 2, 20, '#8a5a3a', { sides: 8 });
        for (let k = 0; k < 5; k++) { const an = k * 1.26 + f.i; r.sphere(cx + Math.cos(an) * 6, 30 + (k % 2) * 6, cz + Math.sin(an) * 6, 9, '#2f8a3f'); }
        break;
    }
    if (S) for (const pp of f.papers || []) r.plane(x + pp.x, 0.6, y + pp.y, 10, 8, '#e8e8e8', { rotY: pp.a });
    else if (hi && !dark) r.plane(cx, 0.4, cz, w + 10, h + 10, '#ffd23f', { glow: true, opacity: 0.35 });
  },

  // divisórias da ala: meia-parede pintada (baixa, para a câmera de cima enxergar dentro das salas), faixa
  // escura no topo como na planta do original, batentes nas portas e plaquinha com o nome de cada sala
  paredes3d(r, dark) {
    const WH = this.WALL_H;
    for (const [x, y, w, h] of this.WALLS) {
      const cx = x + w / 2, cz = y + h / 2, pilar = w === h;
      r.box(cx, 0, cz, w, WH * 0.55, h, pilar ? '#7a776c' : '#8e8873', { tex: 'tinta' });
      r.box(cx, WH * 0.55, cz, w, WH * 0.45, h, '#6c6a60', { tex: 'concreto' });
      r.box(cx, WH, cz, w + 1, 3, h + 1, '#17181a', { tex: false });
      if (!pilar) r.box(cx, 0, cz, w + 2, 7, h + 2, '#2b2622');
    }
    if (!dark) for (const [txt, x, y] of this.SALAS) r.label(x, 4, y + (y > 300 ? 0 : 0), txt, '#c9c2a8', 10);
  },

  draw3d(g, r) {
    const a = g.arena, d = g.data, U = TN.util;
    const dark = d.phase !== 'search';
    const fade = dark ? Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1) : 0;
    if (dark) r.env({ bg: '#020306', fog: [1100, 2400], ambient: U.lerp(0.65, 0.07, fade), sun: U.lerp(1.7, 0.06, fade), sunDir: [-0.3, 1, 0.5], sunColor: '#8fa6d8', hemiSky: '#4a5a80', hemiGround: '#0a0806' });
    // ---- sala da administração: taco, meia-parede de madeira, janelas com persiana; mureta na frente ----
    // (sem pendentes do r.room: ficariam pendurados sobre os móveis; as luminárias de parede apagam no breu)
    r.room(a.x, a.y, a.x + a.w, a.y + a.h, { estilo: 'escritorio', h: 130, windows: 4, lamps: 0, props: false });
    // saguão com passadeira gasta; copa com piso de azulejo
    r.plane(480, 0.3, 286, 820, 120, '#4a2a26', { rough: 1, tex: 'tecido' });
    r.plane(792, 0.4, 455, 290, 134, '#7d8580', { tex: 'azulejo', texWorld: true });
    r.box(a.x + a.w / 2, 0, a.y + a.h + 8, a.w + 32, 18, 16, '#6e4f33', { tex: 'madeira' });
    r.box(a.x + a.w / 2, 18, a.y + a.h + 8, a.w + 32, 2, 18, '#2a2f36');
    for (const lx of [132, 365, 595, 827]) r.box(lx, 116, a.y + 2, 50, 5, 6, dark ? '#2a2a2a' : '#fff4dc', dark ? {} : { glow: true });
    this.paredes3d(r, dark);
    // ---- móveis ----
    const hi = new Set();
    if (d.phase === 'search') for (const p of g.players) { const f = this.reachable(g, p); if (f) hi.add(f); }
    for (const f of d.furniture) this.furniture3d(r, f, hi.has(f), dark);
    // ---- luzes ----
    if (!dark) {
      r.light(260, 170, 230, '#fff1dc', 0.7, 650);
      r.light(700, 170, 230, '#fff1dc', 0.7, 650);
    } else {
      // lanternas: uma por jogador (infectados: verde e maior)
      for (const p of g.players) {
        const inf = p.data.infected, R = inf ? this.LIGHT_R_INF : this.LIGHT_R;
        r.light(p.x, 70, p.y, inf ? '#b6ff7a' : '#ffe8c0', 0.35 + 1.1 * fade, R * 3.2);
      }
    }
    // ---- jogadores ----
    for (const p of g.players) {
      const pd = p.data;
      if (pd.infected) r.disc(p.x, 0.8, p.y, p.r + 9 + Math.sin(g.time * 8) * 2, '#9be15d', { glow: true, opacity: pd.frozen > 0 ? 0.2 : 0.35 });
      if (dark) r.disc(p.x, 0.6, p.y, (pd.infected ? this.LIGHT_R_INF : this.LIGHT_R) * 0.7, pd.infected ? '#9be15d' : '#ffe8c0', { glow: true, opacity: 0.06 });
      let pose = 'auto';
      if (pd.frozen > 0) pose = 'crouch';
      else if (this.isHunter(p)) pose = pd.swing > 0 ? 'swing' : 'hold';   // seringa na mão; golpe ao infectar
      else if (pd.searchT > 0) pose = 'work';
      r.character(p, { pose, flash: pd.frozen > 0 && Math.floor(g.time * 6) % 2 === 0 });
      if (this.isHunter(p) && pd.swing > 0) {
        const L = 0.29, rho = -Math.PI / 2 - L * Math.PI - p.dir;
        r.ring(p.x, 20, p.y, this.INFECT_RANGE - 10, this.INFECT_RANGE - 4, '#dcffb4', { glow: true, arc: L, rotY: rho });
      }
      if (pd.holder) {   // seringa flutuando sobre a cabeça
        const sy = 80 + Math.sin(g.time * 4) * 3, ang = g.time * 2;
        const dx = Math.cos(ang) * 12, dz = Math.sin(ang) * 12;
        r.beam(p.x - dx, sy, p.y - dz, p.x + dx, sy, p.y + dz, 5, '#e8f6ff', { rough: 0.2 });
        r.beam(p.x - dx * 0.6, sy, p.y - dz * 0.6, p.x + dx * 0.3, sy, p.y + dz * 0.3, 5.6, '#9be15d', { glow: true });
        r.beam(p.x + dx, sy, p.y + dz, p.x + dx * 1.6, sy, p.y + dz * 1.6, 1, '#dddddd');
      }
      if (pd.frozen > 0) r.ring(p.x, 1.2, p.y, p.r + 4, p.r + 8, '#9be15d', { glow: true, arc: Math.max(0.01, pd.frozen / this.FREEZE) });
      if (pd.searchT > 0) {
        r.ring(p.x, 1.1, p.y, p.r + 5, p.r + 10, '#333333', {});
        r.ring(p.x, 1.3, p.y, p.r + 5, p.r + 10, '#ffd23f', { glow: true, arc: Math.min(1, pd.searchT / this.SEARCH_TIME) });
      }
    }
  },

  drawOverlay(g, c) {
    if (!TN.R3.available || !g.uses3d()) return;
    const d = g.data;
    if (d.phase !== 'search') {
      // breu desenhado por cima do 3D; cada lanterna "apaga" o breu com um gradiente (borda suave)
      const fade = Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1);
      const P = TN.R3.project;
      c.save();
      c.fillStyle = `rgba(2,4,8,${0.86 * fade})`; c.fillRect(0, 0, g.W, g.H);
      c.globalCompositeOperation = 'destination-out';
      for (const p of g.players) {
        const R = p.data.infected ? this.LIGHT_R_INF : this.LIGHT_R;
        const s = P(p.x, 0, p.y), sx = P(p.x + R, 0, p.y), sz = P(p.x, 0, p.y + R);
        const rx = Math.max(4, Math.abs(sx.x - s.x)), ry = Math.max(4, Math.abs(sz.y - s.y));
        c.save(); c.translate(s.x, s.y - ry * 0.3); c.scale(1, (ry * 1.3) / rx);
        const gr = c.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
      }
      c.restore();
      // nomes sempre visíveis
      for (const p of g.players) { const s = P(p.x, 72, p.y); TN.draw.text(c, p.label, s.x, s.y, { size: 12, color: p.color, align: 'center' }); }
    }
    this.drawStatus(g, c);
  },

  // painel de estado logo abaixo do HUD (versão 3D; o draw 2D tem a sua própria cópia)
  drawStatus(g, c) {
    const d = g.data, D = TN.draw;
    if (d.phase === 'search') {
      D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ffd23f' });
      D.text(c, `REVISTE OS MÓVEIS · BUSCAS: ${d.searches}`, g.W / 2, 52, { size: 14, color: '#ffd23f', align: 'center' });
    } else if (d.phase === 'grace') {
      D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#9be15d' });
      D.text(c, `${g.players.find((p) => p.id === d.holderId).label} ESTÁ COM A SERINGA! CORRAM!`, g.W / 2, 52, { size: 14, color: '#9be15d', align: 'center' });
    } else {
      const free = g.players.filter((p) => !p.data.infected).length;
      D.panel(c, g.W / 2 - 150, 40, 300, 26, { stroke: d.huntLeft < 5 ? '#f55' : '#9be15d' });
      D.text(c, `ESCURO ${TN.util.formatTime(d.huntLeft)} · LIVRES: ${free}`, g.W / 2, 53, { size: 16, color: d.huntLeft < 5 ? '#f55' : '#fff', align: 'center' });
    }
  },

  // ---------- desenho ----------
  drawFurniture(c, f, hi) {
    const { x, y, w, h } = f;
    c.save();
    c.strokeStyle = '#111'; c.lineWidth = 2;
    switch (f.kind) {
      case 'mesa':
        c.fillStyle = '#1c1f24'; c.beginPath(); c.arc(x + w / 2, y + h + 12, 11, 0, Math.PI * 2); c.fill(); // cadeira
        c.fillStyle = '#7a5534'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        c.fillStyle = '#5d3f26'; c.fillRect(x, y + h - 6, w, 6);
        c.fillStyle = '#15181c'; c.fillRect(x + w / 2 - 18, y + 6, 36, 8);                // monitor
        c.fillStyle = f.searched ? '#222' : '#3a6f9a'; c.fillRect(x + w / 2 - 16, y + 7, 32, 5);
        c.fillStyle = '#ccc'; c.fillRect(x + w / 2 - 14, y + 22, 28, 8);                  // teclado
        c.fillStyle = '#eee'; c.fillRect(x + 8, y + 20, 12, 15);                           // papel
        break;
      case 'armario':
        c.fillStyle = '#6b7480'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        c.fillStyle = '#4d545e';
        for (let k = 0; k < 3; k++) c.fillRect(x + 4 + k * (w - 8) / 3, y + h - 7, (w - 8) / 3 - 3, 4);
        break;
      case 'estante':
        c.fillStyle = '#5d3f26'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        for (let k = 0, bx = x + 4; bx < x + w - 6; k++) {
          const bw = 5 + ((f.i * 7 + k * 13) % 5);
          c.fillStyle = ['#b33', '#3a6', '#36b', '#cb3', '#999'][(f.i + k) % 5];
          c.fillRect(bx, y + 4, bw, h - 8); bx += bw + 1;
        }
        break;
      case 'impressora':
        c.fillStyle = '#c9cdd2'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        c.fillStyle = '#333'; c.fillRect(x + 8, y + h - 10, w - 16, 5);
        c.fillStyle = '#4f4'; c.fillRect(x + w - 10, y + 5, 4, 4);
        break;
      case 'sofa':
        c.fillStyle = '#7a2e3a'; c.beginPath(); c.roundRect(x, y, w, h, 8); c.fill(); c.stroke();
        c.fillStyle = '#93404e';
        const n = Math.round(w / 40);
        for (let k = 0; k < n; k++) { c.beginPath(); c.roundRect(x + 6 + k * (w - 12) / n, y + 8, (w - 12) / n - 4, h - 14, 5); c.fill(); }
        break;
      case 'bebedouro':
        c.fillStyle = '#ddd'; c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
        c.fillStyle = '#5ab4ff'; c.beginPath(); c.arc(x + w / 2, y + h / 2, w * 0.36, 0, Math.PI * 2); c.fill(); c.stroke();
        break;
      case 'vaso':
        c.fillStyle = '#8a5a3a'; c.beginPath(); c.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#2f8a3f';
        for (let k = 0; k < 5; k++) { const an = k * 1.26 + f.i; c.beginPath(); c.arc(x + w / 2 + Math.cos(an) * 7, y + h / 2 + Math.sin(an) * 7, 8, 0, Math.PI * 2); c.fill(); }
        break;
    }
    if (f.searched) {
      c.fillStyle = 'rgba(0,0,0,0.42)'; c.fillRect(x, y, w, h);
      c.fillStyle = '#e8e8e8';
      for (const pp of f.papers || []) { c.save(); c.translate(x + pp.x, y + pp.y); c.rotate(pp.a); c.fillRect(-5, -4, 10, 8); c.restore(); }
    } else if (hi) {
      c.strokeStyle = '#ffd23f'; c.lineWidth = 2; c.setLineDash([5, 4]); c.strokeRect(x - 3, y - 3, w + 6, h + 6); c.setLineDash([]);
    }
    c.restore();
  },

  drawScene(g, c) {
    const a = g.arena, D = TN.draw, d = g.data;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 40, a: '#2a3340', b: '#2e3846' });
    c.strokeStyle = '#59616c'; c.lineWidth = 8; c.strokeRect(a.x - 4, a.y - 4, a.w + 8, a.h + 8);
    // passadeira do saguão e divisórias das salas
    c.fillStyle = 'rgba(120,40,40,0.18)'; c.fillRect(70, 226, 820, 120);
    c.fillStyle = '#59616c'; for (const [x, y, w, h] of this.WALLS) c.fillRect(x, y, w, h);
    const hi = new Set();
    if (d.phase === 'search') for (const p of g.players) { const f = this.reachable(g, p); if (f) hi.add(f); }
    for (const f of d.furniture) this.drawFurniture(c, f, hi.has(f));
    // jogadores
    for (const p of g.players) {
      const pd = p.data;
      if (pd.infected) { // aura verde doentia
        c.fillStyle = pd.frozen > 0 ? 'rgba(155,225,93,0.18)' : 'rgba(155,225,93,0.32)';
        c.beginPath(); c.arc(p.x, p.y, p.r + 9 + Math.sin(g.time * 8) * 2, 0, Math.PI * 2); c.fill();
      }
      g.drawPlayer(c, p, { flash: pd.frozen > 0 && Math.floor(g.time * 6) % 2 === 0 });
      if (pd.infected && pd.frozen <= 0) { // garras
        c.save(); c.translate(p.x, p.y); c.rotate(p.dir);
        c.strokeStyle = '#d8ffb0'; c.lineWidth = 2;
        for (const s of [-1, 1]) { c.beginPath(); c.moveTo(p.r - 2, s * 9); c.lineTo(p.r + 9, s * 13); c.moveTo(p.r - 2, s * 5); c.lineTo(p.r + 10, s * 6); c.stroke(); }
        if (pd.swing > 0) { c.strokeStyle = 'rgba(220,255,180,0.8)'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, this.INFECT_RANGE - 6, -0.9, 0.9); c.stroke(); }
        c.restore();
      }
      if (pd.holder) this.drawSyringe(c, p.x + 14, p.y - 22, g.time);
      if (pd.frozen > 0) { // anel do tempo congelado
        c.strokeStyle = '#9be15d'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, p.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pd.frozen / this.FREEZE)); c.stroke();
      }
      if (pd.searchT > 0) { // anel de progresso da revista
        c.strokeStyle = '#333'; c.lineWidth = 5; c.beginPath(); c.arc(p.x, p.y, p.r + 7, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = '#ffd23f'; c.beginPath(); c.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pd.searchT / this.SEARCH_TIME)); c.stroke();
      }
    }
  },

  drawSyringe(c, x, y, t) {
    c.save(); c.translate(x, y); c.rotate(-0.7 + Math.sin(t * 4) * 0.1);
    c.fillStyle = '#e8f6ff'; c.strokeStyle = '#111'; c.lineWidth = 1.5;
    c.fillRect(-10, -3, 16, 6); c.strokeRect(-10, -3, 16, 6);
    c.fillStyle = '#9be15d'; c.fillRect(-8, -2, 9, 4);
    c.fillStyle = '#ccc'; c.fillRect(-14, -1, 4, 2); c.fillRect(-15, -4, 2, 8);
    c.strokeStyle = '#ddd'; c.beginPath(); c.moveTo(6, 0); c.lineTo(14, 0); c.stroke();
    c.restore();
  },

  // caminho com um círculo de luz por jogador (mesmo sentido → união pela regra nonzero)
  lightPath(g, c, k) {
    c.beginPath();
    for (const p of g.players) {
      const r = (p.data.infected ? this.LIGHT_R_INF : this.LIGHT_R) * k;
      c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
  },

  draw(g, c) {
    const d = g.data, D = TN.draw;
    this.drawScene(g, c);
    if (d.phase !== 'search') {
      // escuridão em 3 camadas: breu, penumbra e luz plena perto de cada jogador
      const fade = Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1);
      c.fillStyle = `rgba(2,4,8,${0.94 * fade})`; c.fillRect(0, 0, g.W, g.H);
      c.save(); this.lightPath(g, c, 1); c.clip(); this.drawScene(g, c);
      c.fillStyle = `rgba(2,4,8,${0.55 * fade})`; c.fillRect(0, 0, g.W, g.H); c.restore();
      c.save(); this.lightPath(g, c, 0.68); c.clip(); this.drawScene(g, c); c.restore();
      // nomes sempre visíveis
      for (const p of g.players) D.text(c, p.label, p.x, p.y - p.r * 2.1, { size: 12, color: p.color, align: 'center' });
    }
    // painel de estado logo abaixo do HUD
    if (d.phase === 'search') {
      D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ffd23f' });
      D.text(c, `REVISTE OS MÓVEIS · BUSCAS: ${d.searches}`, g.W / 2, 52, { size: 14, color: '#ffd23f', align: 'center' });
    } else if (d.phase === 'grace') {
      D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#9be15d' });
      D.text(c, `${g.players.find((p) => p.id === d.holderId).label} ESTÁ COM A SERINGA! CORRAM!`, g.W / 2, 52, { size: 14, color: '#9be15d', align: 'center' });
    } else {
      const free = g.players.filter((p) => !p.data.infected).length;
      D.panel(c, g.W / 2 - 150, 40, 300, 26, { stroke: d.huntLeft < 5 ? '#f55' : '#9be15d' });
      D.text(c, `ESCURO ${TN.util.formatTime(d.huntLeft)} · LIVRES: ${free}`, g.W / 2, 53, { size: 16, color: d.huntLeft < 5 ? '#f55' : '#fff', align: 'center' });
    }
  },
});
})();
