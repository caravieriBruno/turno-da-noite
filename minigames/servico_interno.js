(function () {
// SERVIÇO INTERNO — inspirado em "INSIDE JOB" (knife_at_the_office) de Machine Party.
// Fase 1: todos revistam os móveis do pavilhão (segurar AÇÃO 1 s). Quem completar a N-ésima busca acha a seringa,
// mas ninguém fica sabendo quem foi: as luzes apagam. Fase 2: 3 s de escuro e uma contagem de 30 s. O portador
// infecta quem estiver perto; o infectado fica congelado 5 s e depois caça também. Cada um tem uma lanterna
// (EXTRA acende/apaga): acesa, enxerga longe mas é visto de longe; apagada, some no breu (e quase não enxerga).
// Pontos (+1 achar, +1 por infecção, +1 por escapar) só aparecem no fim, para não entregar quem é o portador.
// Tela dividida como no original: uma câmera acompanha cada jogador.

// ---------- planta do pavilhão (constantes; calculadas uma vez) ----------
// Mundo de 1800×1200: 9 celas em cima e 9 embaixo (200 de largura, 210 de fundo, porta de 76 num dos lados),
// pátio no meio com mesas de concreto, armários, pilares e três blocos (lavanderia, posto da guarda e
// chuveiros) para dar volta e despistar.
const MW = 1800, MH = 1200, CELA_W = 200, CELA_D = 210, T = 12;
const PLANTA = (() => {
  const walls = [], layout = [], decor = [], celas = [], portas = [];
  for (const baixo of [false, true]) {
    // em coordenadas "de cima" (y a partir do fundo da cela); embaixo, espelha: y' = MH - y - h
    const Y = (y, h) => (baixo ? MH - y - h : y);
    for (let k = 0; k < 9; k++) {
      const x0 = k * CELA_W, par = k % 2 === 0;
      if (k > 0) walls.push([x0 - T / 2, Y(0, CELA_D), T, CELA_D]);               // divisória
      const d0 = par ? x0 + 18 : x0 + 106, d1 = d0 + 76;                           // porta
      walls.push([k === 0 ? x0 : x0 + T / 2, Y(CELA_D, T), d0 - (k === 0 ? x0 : x0 + T / 2), T]);
      walls.push([d1, Y(CELA_D, T), x0 + CELA_W - T / 2 - d1 + (k === 8 ? T / 2 : 0), T]);
      portas.push([(d0 + d1) / 2, Y(CELA_D, T) + T / 2, (baixo ? 200 : 100) + k + 1]);
      const cama = par ? [x0 + 139, 8, 46, 104] : [x0 + 15, 8, 46, 104];
      const vaso = par ? [x0 + 14, 8, 26, 26] : [x0 + 160, 8, 26, 26];
      const pia = par ? [x0 + 52, 6, 30, 20] : [x0 + 118, 6, 30, 20];
      const arm = par ? [x0 + 94, 6, 34, 30] : [x0 + 72, 6, 34, 30];
      const R = ([x, y, w, h]) => [x, Y(y, h), w, h];
      // uma coisa revistável por cela: a cama ou o armarinho, alternando (e trocado na fileira de baixo)
      const revistaCama = par !== baixo;
      (revistaCama ? layout : decor).push(['cama', ...R(cama), baixo]);
      (revistaCama ? decor : layout).push(['armarinho', ...R(arm), baixo]);
      decor.push(['vaso', ...R(vaso), baixo], ['pia', ...R(pia), baixo]);
      celas.push([par ? x0 + 70 : x0 + 130, Y(118, 0)]);                          // canto livre (esconderijo)
    }
  }
  // pátio: mesas de concreto com bancos (140×114), duas fileiras de armários, bancos soltos
  for (const [cx, cy] of [[330, 380], [630, 380], [1170, 380], [1470, 380], [630, 830], [1170, 830]]) layout.push(['mesa', cx - 70, cy - 57, 140, 114]);
  layout.push(['armario', 840, 318, 120, 36], ['armario', 840, 846, 120, 36]);
  decor.push(['banco', 284, 840, 92, 26], ['banco', 1424, 840, 92, 26]);
  // blocos (paredes altas) e pilares: sólidos e bloqueiam a luz
  const blocos = [['LAVANDERIA', 300, 540, 170, 150], ['POSTO', 800, 520, 200, 170], ['CHUVEIROS', 1330, 540, 170, 150]];
  const pilares = [[182, 430], [1582, 430], [182, 760], [1582, 760], [582, 600], [1182, 600]].map(([x, y]) => [x, y, 36, 36]);
  for (const [, x, y, w, h] of blocos) walls.push([x, y, w, h]);
  for (const p of pilares) walls.push(p);
  return { walls, layout, decor, blocos, pilares, celas, portas };
})();

// Cache da navegação dos bots e dos sólidos fixos (derivados das constantes; não fazem parte do estado da rodada)
const NAV = {}; let FIXOS = null, PAREDES = null;

TN.registerMinigame({
  id: 'servico_interno',
  title: 'SERVIÇO INTERNO',
  inspiredBy: 'Inside Job (knife_at_the_office)',
  tagline: 'REVISTE. CACE. ESCONDA-SE.',
  brief: ['Revistem o pavilhão: segure AÇÃO junto a camas, armários e mesas.', 'Quem achar a seringa fica em segredo: as luzes apagam.', 'EXTRA liga/desliga a lanterna. Apagada, ninguém te vê (e você mal enxerga).', 'Infectados caçam também. Escape por 30 s.'],
  controls: { move: 'andar', a: 'revistar (segurar) / infectar', b: 'lanterna' },
  icon: '✚',
  color: '#9be15d',
  rounds: 3,
  scoring: 'points',          // +1 achar, +1 por infecção, +1 por escapar (somados no fim da rodada)
  endWhenOneLeft: false,

  // ---- constantes (originais: busca 1,0 s, recarga 0,5 s, congelado 5 s, infectado 1,15×, contagem 30 s,
  //      lanterna começa apagada e é um holofote de ~58°) ----
  // Ritmo: aqui o caçador anda IGUAL aos fugitivos (antes: portador 1,3× e infectado 1,15×); a vantagem dele é
  // um tranco curto ao golpear (TRANCO, com recarga), não a velocidade.
  SPEED: 175, HOLDER_MULT: 1.05, HUNTER_MULT: 1.05,   // caçadores 5% mais rápidos que os fugitivos
  SEARCH_TIME: 1.0, REACH: 14,            // distância (px) da borda do móvel para conseguir revistar
  INFECT_RANGE: 56, INFECT_CD: 0.5, FREEZE: 5, SWING: 0.2,
  TRANCO: 300, TRANCO_CD: 2.5, TRANCO_DECAY: 7,
  GRACE: 3, HUNT_TIME: 30, FORCE_AT: 45,  // FORCE_AT: se ninguém achou até aqui, a próxima busca acha
  // lanterna: cone de alcance LANT_R e meia-abertura LANT_HALF; AURA = o que cada um enxerga em volta de si no breu
  LANT_R: 300, LANT_HALF: 0.5, AURA: 80, HALO: 42,
  BOT_VISTA: 420, BOT_OUVE: 180,          // bots: até onde enxergam (o tamanho da vista) e ouvem passos
  ARENA: { x: 0, y: 0, w: MW, h: MH },
  WALLS: PLANTA.walls,
  LAYOUT: PLANTA.layout,                  // revistáveis: [tipo, x, y, w, h, embaixo?]
  DECOR: PLANTA.decor,                    // sólidos que não se revista (vaso, pia, cama/armarinho sobrando, bancos)
  BLOCOS: PLANTA.blocos, PILARES: PLANTA.pilares, CELAS: PLANTA.celas, PORTAS: PLANTA.portas,
  SPAWNS: [[720, 470], [1080, 470], [720, 750], [1080, 750]],   // no pátio, em volta do posto

  init(g) {
    const U = TN.util, d = g.data;
    g.arena = { ...this.ARENA };
    d.furniture = this.LAYOUT.map(([kind, x, y, w, h, baixo], i) => ({ kind, x, y, w, h, i, baixo: !!baixo, searched: false, papers: null }));
    // seringa: N-ésima busca (como o original: 26 móveis para 4 jogadores, menos até a metade, ao acaso)
    const F = d.furniture.length;
    const base = Math.round(F * g.playerCount / 4);
    d.N = U.clamp(base - Math.round(base * 0.5 * Math.random()), 1, F);
    d.searches = 0;
    d.phase = 'search';        // search → grace → hunt → end
    d.phaseT = 0;
    d.huntLeft = this.HUNT_TIME;
    d.holderId = -1;          // id de quem achou a seringa (não é mostrado a ninguém)
    const spawns = U.shuffle(this.SPAWNS.slice());
    g.players.forEach((p, i) => {
      [p.x, p.y] = spawns[i % spawns.length];
      p.dir = p.y < MH / 2 ? -Math.PI / 2 : Math.PI / 2;
      p.data = { infected: false, frozen: 0, cd: 0, swing: 0, tranco: 0, searchT: 0, searchF: null, holder: false, lant: false, pts: 0, mov: false };
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
  // empurra o jogador para fora dos sólidos (colisão círculo x retângulo)
  collide(g, p) {
    for (const f of this.solidos(g)) {
      if (p.x + p.r < f.x || p.x - p.r > f.x + f.w || p.y + p.r < f.y || p.y - p.r > f.y + f.h) continue;
      const nx = Math.max(f.x, Math.min(p.x, f.x + f.w)), ny = Math.max(f.y, Math.min(p.y, f.y + f.h));
      const dx = p.x - nx, dy = p.y - ny, dd = Math.hypot(dx, dy);
      if (dd >= p.r) continue;
      if (dd > 0) { p.x = nx + (dx / dd) * p.r; p.y = ny + (dy / dd) * p.r; }
      else { // centro dentro do sólido: sai pelo lado mais próximo
        const opts = [[p.x - f.x, -1, 0], [f.x + f.w - p.x, 1, 0], [p.y - f.y, 0, -1], [f.y + f.h - p.y, 0, 1]].sort((a, b) => a[0] - b[0]);
        p.x += opts[0][1] * (opts[0][0] + p.r); p.y += opts[0][2] * (opts[0][0] + p.r);
      }
    }
    const a = g.arena;
    p.x = TN.util.clamp(p.x, a.x + p.r, a.x + a.w - p.r);
    p.y = TN.util.clamp(p.y, a.y + p.r, a.y + a.h - p.r);
  },
  // paredes (bloqueiam a luz) e tudo o que é sólido: móveis (do estado), decoração e paredes (constantes)
  paredes() {
    if (!PAREDES) PAREDES = this.WALLS.map(([x, y, w, h]) => ({ x, y, w, h, wall: true }));
    return PAREDES;
  },
  solidos(g) {
    if (!FIXOS) FIXOS = this.paredes().concat(this.DECOR.map(([kind, x, y, w, h]) => ({ kind, x, y, w, h })));
    return g.data.furniture.concat(FIXOS);
  },
  isHunter(p) { return p.data.infected && p.data.frozen <= 0; },
  escuro(g) { return g.data.phase === 'grace' || g.data.phase === 'hunt' || (g.data.phase === 'end' && g.data.holderId >= 0); },

  // ---------- luz e visão ----------
  // fração (0..1) do segmento em que ele entra no retângulo (Liang–Barsky); -1 se não cruza
  segRect(x1, y1, x2, y2, r) {
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    for (const [pp, q] of [[-dx, x1 - r.x], [dx, r.x + r.w - x1], [-dy, y1 - r.y], [dy, r.y + r.h - y1]]) {
      if (pp === 0) { if (q < 0) return -1; continue; }
      const t = q / pp;
      if (pp < 0) { if (t > t1) return -1; if (t > t0) t0 = t; }
      else { if (t < t0) return -1; if (t < t1) t1 = t; }
    }
    return t0;
  },
  // alguma parede entre os dois pontos?
  bloqueia(x1, y1, x2, y2) {
    for (const r of this.paredes()) if (this.segRect(x1, y1, x2, y2, r) >= 0) return true;
    return false;
  },
  // até onde vai um raio de luz saindo de (x, y) no ângulo `an` (para na primeira parede)
  raio(x, y, an, max) {
    const ex = x + Math.cos(an) * max, ey = y + Math.sin(an) * max;
    let t = 1;
    for (const r of this.paredes()) { const k = this.segRect(x, y, ex, ey, r); if (k >= 0 && k < t) t = k; }
    return t * max;
  },
  // polígono do cone da lanterna (no chão), recortado pelas paredes: [[x, y], ...] começando no jogador
  cone(p, n = 14) {
    const pts = [[p.x, p.y]];
    for (let k = 0; k <= n; k++) {
      const an = p.dir - this.LANT_HALF + (2 * this.LANT_HALF * k) / n, L = this.raio(p.x, p.y, an, this.LANT_R);
      pts.push([p.x + Math.cos(an) * L, p.y + Math.sin(an) * L]);
    }
    return pts;
  },
  // `a` está no facho da lanterna de L (alcance, abertura e sem parede no meio)?
  noFacho(L, a) {
    if (L === a || !L.data.lant) return false;
    const dx = a.x - L.x, dy = a.y - L.y, dd = Math.hypot(dx, dy);
    if (dd > this.LANT_R + a.r) return false;
    let da = Math.atan2(dy, dx) - L.dir;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > this.LANT_HALF + Math.atan2(a.r, Math.max(1, dd))) return false;
    return !this.bloqueia(L.x, L.y, a.x, a.y);
  },
  // o que aparece na vista de `o` (null = vista geral): com luz, todos; no breu, só quem está perto de `o`,
  // quem está com a lanterna acesa (o corpo fica iluminado) e quem cai no facho aceso de alguém
  visivel(g, o, a) {
    if (o === a || !this.escuro(g)) return true;
    if (o && Math.hypot(a.x - o.x, a.y - o.y) < this.AURA + a.r) return true;
    if (a.data.lant) return true;
    return g.players.some((L) => this.noFacho(L, a));
  },
  // percepção dos bots: o mesmo que a vista mostraria, até o tamanho da vista, mais os passos ouvidos de perto
  botSabe(g, o, a) {
    const dd = Math.hypot(a.x - o.x, a.y - o.y);
    if (dd > this.BOT_VISTA) return false;
    return this.visivel(g, o, a) || (a.data.mov && dd < this.BOT_OUVE);
  },

  foundSyringe(g, p) {
    const d = g.data;
    d.holderId = p.id; p.data.holder = true; p.data.infected = true;
    d.phase = 'grace'; d.phaseT = 0;
    p.data.pts += 1;                       // o ponto só aparece no fim (não entrega quem achou)
    g.sfx('pickup'); g.after(0.35, () => g.sfx('buzz'));
    g.flash('#000', 0.6); g.shake(4);
    g.message('AS LUZES APAGARAM!', 2.2, '#9be15d');
    for (const o of g.players) { o.data.searchT = 0; o.data.searchF = null; o.data.lant = true; }   // lanternas acendem
  },

  infect(g, o, by) {
    o.data.infected = true; o.data.frozen = this.FREEZE;
    by.data.pts += 1;
    g.sfx('hurt'); g.shake(5);
    g.particles(o.x, o.y, '#9be15d', 22, 220);
    g.popup('INFECTADO!', o.x, o.y - 52, '#9be15d');
  },

  endRound(g, msg) {
    const d = g.data;
    if (d.phase === 'end') return;
    d.phase = 'end';
    for (const p of g.players) {
      if (!p.data.infected) { p.data.pts += 1; g.popup('ESCAPOU!', p.x, p.y - 52, '#fff'); }
      if (p.data.holder) g.popup('ESTAVA COM A SERINGA', p.x, p.y - 80, '#9be15d');
      if (p.data.pts) g.addScore(p, p.data.pts);
    }
    g.message(msg, 2, '#9be15d');
    g.sfx('win');
    g.finish(2.2);
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
      g.sfx('go'); g.message('A CAÇADA COMEÇOU', 1.3, '#9be15d');
    }
    if (d.phase === 'hunt') {
      const before = Math.ceil(d.huntLeft);
      d.huntLeft -= dt;
      if (Math.ceil(d.huntLeft) !== before && d.huntLeft < 5.5 && d.huntLeft > 0) g.sfx('tick');
      if (d.huntLeft <= 0) { d.huntLeft = 0; this.endRound(g, 'AS LUZES VOLTARAM'); return; }
    }

    for (const p of g.players) {
      const pd = p.data, ox = p.x, oy = p.y;
      pd.cd -= dt; pd.swing -= dt; pd.tranco -= dt;
      if (pd.frozen > 0) {
        pd.frozen -= dt; pd.mov = false;
        if (pd.frozen <= 0) { g.sfx('buzz'); g.popup('CAÇANDO!', p.x, p.y - 52, '#9be15d'); }
        continue;
      }
      // lanterna (EXTRA): só no escuro
      if (d.phase !== 'search' && p.input.bPressed) { pd.lant = !pd.lant; g.sfx('blip', 0.5); }
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
            f.papers = Array.from({ length: 4 }, () => ({ x: Math.round(U.rand(-10, f.w + 10)), y: Math.round(U.rand(-10, f.h + 10)), a: Math.round(U.rand(0, 30)) / 10 }));
            pd.searchF = null; pd.searchT = 0;
            if (d.searches >= d.N) { this.foundSyringe(g, p); }
            else { g.sfx('blip'); g.popup('nada...', f.x + f.w / 2, f.y - 8, '#999'); }
          }
        }
      }
      if (!searching) { pd.searchF = null; pd.searchT = 0; }

      const speed = searching ? 0 : this.SPEED * (pd.holder ? this.HOLDER_MULT : pd.infected ? this.HUNTER_MULT : 1);
      g.movePlayer(p, speed, dt);
      g.decayPush(p, dt, this.TRANCO_DECAY);
      this.collide(g, p);

      // infectar (só na contagem): golpe com recarga; de vez em quando o golpe dá um tranco para a frente.
      // Durante o golpe (SWING s) pega todos os não infectados ao alcance.
      if (d.phase === 'hunt' && pd.infected && p.input.aPressed && pd.cd <= 0) {
        pd.cd = this.INFECT_CD; pd.swing = this.SWING;
        g.sfx('whoosh');
        if (pd.tranco <= 0) { pd.tranco = this.TRANCO_CD; g.push(p, Math.cos(p.dir) * this.TRANCO, Math.sin(p.dir) * this.TRANCO); }
      }
      if (d.phase === 'hunt' && pd.infected && pd.swing > 0) {
        for (const o of g.players) {
          if (o === p || o.data.infected) continue;
          if (U.dist(p.x, p.y, o.x, o.y) < this.INFECT_RANGE) this.infect(g, o, p);
        }
      }
      pd.mov = Math.hypot(p.x - ox, p.y - oy) > 0.5;
    }
    U.separate(g.players);
    for (const p of g.players) this.collide(g, p);

    if (d.phase === 'hunt' && g.players.every((p) => p.data.infected)) this.endRound(g, 'TODOS INFECTADOS');
  },

  // ---------- navegação dos bots ----------
  // Grade de 10 px sobre o pavilhão: uma célula é livre se o boneco (raio 16 + folga) cabe nela sem tocar parede
  // nem móvel. Nada muda de lugar, então a grade é calculada uma vez (cache do arquivo, fora do estado da
  // rodada). Os bots fazem uma busca em largura (BFS) a partir de onde estão e seguem o caminho até o alvo.
  nav() {
    if (NAV.free) return NAV;
    const A = this.ARENA, C = NAV.C = 10, cols = NAV.cols = Math.floor(A.w / C), rows = NAV.rows = Math.floor(A.h / C);
    const rects = this.WALLS.concat(this.LAYOUT.map(([, x, y, w, h]) => [x, y, w, h]), this.DECOR.map(([, x, y, w, h]) => [x, y, w, h]))
      .map(([x, y, w, h]) => ({ x, y, w, h }));
    const free = NAV.free = new Uint8Array(cols * rows), R = 17;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = A.x + (i + 0.5) * C, y = A.y + (j + 0.5) * C;
      if (x < A.x + 16 || x > A.x + A.w - 16 || y < A.y + 16 || y > A.y + A.h - 16) continue;
      let ok = 1;
      for (const f of rects) {
        if (x < f.x - R || x > f.x + f.w + R || y < f.y - R || y > f.y + f.h + R) continue;
        if (Math.hypot(x - TN.util.clamp(x, f.x, f.x + f.w), y - TN.util.clamp(y, f.y, f.y + f.h)) < R) { ok = 0; break; }
      }
      free[j * cols + i] = ok;
    }
    // células de onde dá para revistar cada móvel
    NAV.serve = this.LAYOUT.map(([, x, y, w, h]) => {
      const f = { x, y, w, h }, out = [];
      const i0 = Math.max(0, Math.floor((x - 40) / C)), i1 = Math.min(cols - 1, Math.ceil((x + w + 40) / C));
      const j0 = Math.max(0, Math.floor((y - 40) / C)), j1 = Math.min(rows - 1, Math.ceil((y + h + 40) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * cols + i;
        if (!free[k]) continue;
        const q = { x: A.x + (i + 0.5) * C, y: A.y + (j + 0.5) * C, r: 16 };
        if (this.rectGap(q, f) < this.REACH - 3) out.push(k);
      }
      return out;
    });
    // pontos de ronda (caçadores) e esconderijos (fugitivos): o canto livre de cada cela e uma malha no pátio
    NAV.celas = this.CELAS.map(([x, y]) => this.cell(x, y)).filter((k) => k >= 0);
    NAV.patio = [];
    for (let y = 270; y <= 930; y += 110) for (let x = 100; x <= 1700; x += 160) {
      const k = this.cell(x, y);
      if (k >= 0 && !NAV.patio.includes(k)) NAV.patio.push(k);
    }
    NAV.pontos = NAV.celas.concat(NAV.patio);
    return NAV;
  },
  cell(x, y) {
    const N = NAV.free ? NAV : this.nav(), A = this.ARENA, C = N.C;
    const i0 = TN.util.clamp(Math.floor((x - A.x) / C), 0, N.cols - 1), j0 = TN.util.clamp(Math.floor((y - A.y) / C), 0, N.rows - 1);
    if (N.free[j0 * N.cols + i0]) return j0 * N.cols + i0;
    let best = -1, bd = 1e9;   // encostado num móvel: a célula livre mais perto
    for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
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
    const N = this.nav(), cols = N.cols;
    if (alvo < 0 || dist[alvo] < 0) return null;
    const caminho = [alvo];
    let k = alvo;
    while (dist[k] > 0 && caminho.length < 3000) {
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
  // anda até um ponto pelo caminho (recalcula de vez em quando)
  botIr(p, x, y, pensa) {
    const pd = p.data;
    if (Math.hypot(x - p.x, y - p.y) < 40) pd.bDir = TN.util.norm(x - p.x, y - p.y);
    else if (pensa || !pd.bDir) pd.bDir = this.rumo(p, this.bfs([this.cell(p.x, p.y)]), this.cell(x, y)) || TN.util.norm(x - p.x, y - p.y);
    return { x: pd.bDir.x, y: pd.bDir.y };
  },

  // ---------- bot ----------
  bot(g, p, dt) {
    const pd = p.data, d = g.data;
    if (pd.frozen > 0 || d.phase === 'end') return { x: 0, y: 0 };
    const out = this.botMove(g, p, dt);
    // lanterna: aperta EXTRA quando quer mudar (um quadro por vez)
    const quer = d.phase === 'search' ? pd.lant : this.botQuerLanterna(g, p);
    const b = quer !== pd.lant && !pd.bPrevB;
    pd.bPrevB = b;
    return { ...out, b };
  },
  // Lanterna dos bots. Fugitivo: apaga um pouco depois do apagão (cada um no seu tempo) ou assim que vê um
  // caçador, e fica no escuro. Caçador: acesa para procurar; o portador começa apagado (esconde quem é) e
  // acende quando a caçada começa.
  botQuerLanterna(g, p) {
    const pd = p.data, d = g.data;
    if (pd.infected) return !(pd.holder && d.phase === 'grace');
    if (pd.bApaga == null) pd.bApaga = g.time + TN.util.rand(0.3, 5);
    return !(pd.bViu || g.time > pd.bApaga);
  },
  botMove(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    // detecção de "preso" (encostado em parede ou móvel): se mal andou em 0,6 s, dá um passo de lado
    pd.bStuckT = (pd.bStuckT || 0) + dt;
    if (pd.bStuckT > 0.6) {
      const moved = U.dist(p.x, p.y, pd.bLastX ?? p.x, pd.bLastY ?? p.y);
      if (moved < 10 && !pd.searchF && !pd.bParado) { pd.bSide = { x: U.rand(-1, 1), y: U.rand(-1, 1), t: 0.35 }; pd.bThink = 0; }
      pd.bLastX = p.x; pd.bLastY = p.y; pd.bStuckT = 0;
    }
    pd.bParado = false;
    if (pd.bSide && pd.bSide.t > 0) { pd.bSide.t -= dt; return { x: pd.bSide.x, y: pd.bSide.y }; }
    pd.bThink = (pd.bThink || 0) - dt;
    const pensa = pd.bThink <= 0 || !pd.bDir;
    if (pensa) pd.bThink = U.rand(0.12, 0.2);

    // fase 1: vai até o móvel não revistado mais perto PELO CAMINHO (evita o que outro bot já escolheu) e segura AÇÃO
    if (d.phase === 'search') {
      const N = this.nav();
      const f = pd.bTarget != null ? d.furniture[pd.bTarget] : null;
      if (f && !f.searched && this.rectGap(p, f) < this.REACH - 3) { pd.bDir = null; return { x: 0, y: 0, a: true }; }
      if (!pensa && f && !f.searched && pd.bDir) return { x: pd.bDir.x, y: pd.bDir.y };
      const dist = this.bfs([this.cell(p.x, p.y)]);
      let best = null, bs = 1e9, bk = -1;
      for (const o of d.furniture) {
        if (o.searched) continue;
        let dk = -1, dmin = 1e9;
        for (const k of N.serve[o.i]) if (dist[k] >= 0 && dist[k] < dmin) { dmin = dist[k]; dk = k; }
        if (dk < 0) continue;
        const taken = g.players.some((q) => q !== p && q.data.bTarget === o.i);
        const s = dmin * N.C + (taken ? 300 : 0) + (o.i === pd.bTarget ? -30 : U.rand(0, 60));
        if (s < bs) { bs = s; best = o; bk = dk; }
      }
      if (!best) return { x: 0, y: 0 };
      pd.bTarget = best.i;
      if (dist[bk] <= 1) {   // já na frente do móvel: encosta direto
        const nx = U.clamp(p.x, best.x, best.x + best.w), ny = U.clamp(p.y, best.y, best.y + best.h);
        pd.bDir = U.norm(nx - p.x, ny - p.y);
      } else pd.bDir = this.rumo(p, dist, bk) || pd.bDir || { x: 0, y: 0 };
      return { x: pd.bDir.x, y: pd.bDir.y };
    }

    // fase 2, infectado: persegue quem consegue ver (ou ouvir); senão vai aonde viu alguém por último; senão faz ronda
    if (pd.infected) {
      let prey = null, bd = 1e9;
      for (const o of g.players) {
        if (o.data.infected || !this.botSabe(g, p, o)) continue;
        const dd = U.dist(p.x, p.y, o.x, o.y);
        if (dd < bd) { bd = dd; prey = o; }
      }
      if (prey) pd.bMem = { x: prey.x, y: prey.y, t: g.time };
      const want = d.phase === 'hunt' && prey && bd < this.INFECT_RANGE + (pd.tranco <= 0 ? 30 : -4) && pd.cd <= 0;
      const press = !!want && !pd.bPrevA; pd.bPrevA = press;
      let mv;
      if (prey) mv = bd < 70 ? (pd.bDir = U.norm(prey.x - p.x, prey.y - p.y)) : this.botIr(p, prey.x, prey.y, pensa);
      else if (pd.bMem && g.time - pd.bMem.t < 4 && U.dist(p.x, p.y, pd.bMem.x, pd.bMem.y) > 30) mv = this.botIr(p, pd.bMem.x, pd.bMem.y, pensa);
      else {
        pd.bMem = null;
        const N = this.nav();
        if (pd.bRonda == null || U.dist(p.x, p.y, this.centro(pd.bRonda).x, this.centro(pd.bRonda).y) < 40) pd.bRonda = U.pick(U.chance(0.65) ? N.celas : N.patio);
        const c = this.centro(pd.bRonda);
        mv = this.botIr(p, c.x, c.y, pensa);
      }
      return { x: mv.x, y: mv.y, a: press };
    }

    // fase 2, fugitivo: lembra dos caçadores que viu (ou ouviu) nos últimos 3 s e foge deles PELO CAMINHO
    // (distância andando, que conta as paredes); sem ameaça à vista, vai para um esconderijo e fica quieto
    pd.bAmeaca = (pd.bAmeaca || []).filter((m) => g.time - m.t < 3 && g.players.some((q) => q.id === m.id && q.data.infected));
    for (const o of g.players) {
      if (!o.data.infected || o.data.frozen > 1.5 || !this.botSabe(g, p, o)) continue;
      pd.bAmeaca = pd.bAmeaca.filter((m) => m.id !== o.id);
      pd.bAmeaca.push({ id: o.id, x: o.x, y: o.y, t: g.time });
      if (d.phase === 'hunt' || U.dist(p.x, p.y, o.x, o.y) < 250) pd.bViu = true;
    }
    if (pd.bAmeaca.length) {
      pd.bEsc = null;
      if (pensa) {
        const N = this.nav(), dh = this.bfs(pd.bAmeaca.map((m) => this.cell(m.x, m.y)));
        const livre = (x, y) => { const k = this.cell(x, y); return k >= 0 && N.free[k] && U.dist(x, y, this.centro(k).x, this.centro(k).y) < N.C ? k : -1; };
        let best = null, bs = -1e9;
        for (let k = 0; k < 16; k++) {
          const an = (k / 16) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
          let s = 0;
          for (const step of [30, 80]) {
            const kk = livre(p.x + cx * step, p.y + cy * step);
            if (kk < 0) { s -= step === 30 ? 600 : 150; continue; }
            s += Math.min(400, (dh[kk] < 0 ? 400 : dh[kk] * N.C)) * (step === 80 ? 1 : 0.5);
          }
          if (pd.bDir) s += (cx * pd.bDir.x + cy * pd.bDir.y) * 40;  // inércia: evita tremer
          s += U.rand(0, 25);
          if (s > bs) { bs = s; best = { x: cx, y: cy }; }
        }
        pd.bDir = best;
      }
      return { x: pd.bDir.x, y: pd.bDir.y };
    }
    const N = this.nav();
    if (pd.bEsc == null) pd.bEsc = U.chance(0.6) ? U.pick(N.celas) : U.pick(N.patio);
    const c = this.centro(pd.bEsc);
    if (U.dist(p.x, p.y, c.x, c.y) < 14) { pd.bParado = true; pd.bDir = null; return { x: 0, y: 0 }; }
    return this.botIr(p, c.x, c.y, pensa);
  },

  // ---------- câmeras: uma por jogador (tela dividida, como o original) ----------
  // A câmera fica alta e um pouco atrás do jogador e o acompanha; no escuro, a dos infectados abre mais.
  // Com 3 jogadores o quarto quadro mostra o pavilhão inteiro (no escuro, só as lanternas acesas aparecem).
  CAM: { h: 360, z: 150, fov: 42 },
  camSegue(p, g) {
    const k = p.data.infected && this.escuro(g) ? 1.2 : 1, C = this.CAM;
    const x = TN.util.clamp(p.x, 120, MW - 120), z = TN.util.clamp(p.y, 90, MH - 60);
    return { pos: [x, C.h * k, z + C.z * k], target: [x, 0, z + 8], fov: C.fov };
  },
  camGeral: { pos: [900, 1650, 1330], target: [900, 0, 620], fov: 38 },
  viewports(g) {
    const ps = g.players, n = ps.length, Y = 34, H = TN.H - Y, W = TN.W, hw = W / 2, hh = H / 2;
    if (n <= 1) return [{ rect: [0, Y, W, H], camera: this.camSegue(ps[0], g) }];
    if (n === 2) return ps.map((p, i) => ({ rect: [0, Y + i * hh, W, hh], camera: this.camSegue(p, g) }));
    const q = [[0, Y], [hw, Y], [0, Y + hh], [hw, Y + hh]];
    const vs = ps.slice(0, 4).map((p, i) => ({ rect: [q[i][0], q[i][1], hw, hh], camera: this.camSegue(p, g) }));
    if (n === 3) vs.push({ rect: [hw, Y + hh, hw, hh], camera: this.camGeral });
    return vs;
  },
  camera: { pos: [900, 1650, 1330], target: [900, 0, 620], fov: 38 },   // reserva (sem viewports)
  WALL_H: 92,
  env: { bg: '#0a0c10', fog: [900, 2600], ambient: 0.62, sun: 1.3, sunDir: [-0.3, 1, 0.5], sunColor: '#fff1dc' },

  // ---------- 3D ----------
  furniture3d(r, f, hi, dark) {
    const { x, y, w, h } = f, cx = x + w / 2, cz = y + h / 2;
    const S = f.searched, frente = f.baixo ? -1 : 1;   // lado da frente (para dentro da cela)
    switch (f.kind) {
      case 'cama':
        r.prop('beliche', cx, cz);
        if (S) r.prop('colchao', cx + (f.baixo ? 18 : -18) * (f.x % 400 < 200 ? 1 : -1), cz + frente * 30, { rotY: 0.5, color: '#857f63' });
        break;
      case 'armarinho':
        r.box(cx, 0, cz, w, 54, h, S ? '#4b554e' : '#5f6b62', { metal: 0.5, rough: 0.5 });
        r.box(cx, 10, cz + frente * (h / 2 + (S ? 8 : 0.5)), w - 6, 38, S ? 14 : 1, '#47524a', { metal: 0.5, rotY: S ? 0.6 : 0 });
        break;
      case 'armario':
        for (let k = 0; k < 3; k++) {
          const lx = x + 20 + k * 40;
          r.box(lx, 0, cz, 38, 96, h, S && k === 1 ? '#48525c' : '#59636e', { metal: 0.5, rough: 0.5 });
          for (const vy of [76, 82]) r.box(lx, vy, y + h + 0.5, 22, 2, 1, '#2a2f34', { tex: false });
          if (S && k === 1) r.box(lx - 16, 6, y + h + 14, 4, 84, 30, '#5d6772', { metal: 0.5, rotY: 0.3 });
        }
        break;
      case 'mesa':
        r.prop('mesa', cx, cz);
        if (!S) r.box(cx + 20, 37, cz - 6, 22, 2, 14, '#c9c2a8');   // dominó/baralho em cima
        break;
    }
    if (S) for (const pp of f.papers || []) r.plane(x + pp.x, 0.6, y + pp.y, 10, 8, '#e8e8e8', { rotY: pp.a });
    else if (hi && !dark) r.plane(cx, 0.4, cz, w + 10, h + 10, '#ffd23f', { glow: true, opacity: 0.35 });
  },
  decor3d(r, k) {
    const [kind, x, y, w, h, baixo] = k, cx = x + w / 2, cz = y + h / 2;
    switch (kind) {
      case 'cama': r.prop('beliche', cx, cz); break;
      case 'armarinho':
        r.box(cx, 0, cz, w, 54, h, '#5f6b62', { metal: 0.5, rough: 0.5 });
        r.box(cx, 10, cz + (baixo ? -1 : 1) * (h / 2 + 0.5), w - 6, 38, 1, '#47524a', { metal: 0.5 });
        break;
      case 'vaso': r.prop('vaso', cx, cz, { rotY: baixo ? Math.PI / 2 : -Math.PI / 2 }); break;
      case 'pia':
        r.box(cx, 0, cz, 10, 26, 10, '#7d817d', { metal: 0.6 });
        r.box(cx, 26, cz, w, 8, h, '#9a9d9a', { metal: 0.7, rough: 0.3 });
        r.box(cx, 33, cz, w - 8, 1.5, h - 8, '#2b3133', { tex: false });
        break;
      case 'banco': r.prop('banco', cx, cz); break;
    }
  },

  // paredes das celas (meia-altura pintada + faixa de concreto + topo escuro), blocos altos e pilares
  paredes3d(r, dark) {
    const WH = this.WALL_H, blocos = new Set(this.BLOCOS.map(([, x, y]) => x + ',' + y)), pil = new Set(this.PILARES.map(([x, y]) => x + ',' + y));
    for (const [x, y, w, h] of this.WALLS) {
      const cx = x + w / 2, cz = y + h / 2, key = x + ',' + y;
      if (blocos.has(key)) continue;
      if (pil.has(key)) { r.box(cx, 0, cz, w, 230, h, '#77746a', { tex: 'concreto' }); r.box(cx, 0, cz, w + 4, 10, h + 4, '#2b2622'); continue; }
      r.box(cx, 0, cz, w, WH * 0.55, h, '#8a8470', { tex: 'tinta' });
      r.box(cx, WH * 0.55, cz, w, WH * 0.45, h, '#6c6a60', { tex: 'concreto' });
      r.box(cx, WH, cz, w + 1, 3, h + 1, '#17181a', { tex: false });
    }
    for (const [nome, x, y, w, h] of this.BLOCOS) {
      const cx = x + w / 2, cz = y + h / 2, posto = nome === 'POSTO';
      r.box(cx, 0, cz, w, 60, h, posto ? '#5d6a73' : '#8e8873', { tex: 'tinta' });
      r.box(cx, 60, cz, w, 70, h, posto ? '#46525a' : '#6c6a60', { tex: posto ? 'metal' : 'azulejo' });
      r.box(cx, 130, cz, w + 6, 4, h + 6, '#17181a', { tex: false });
      if (posto) for (const s of [-1, 1]) r.box(cx, 70, cz + s * (h / 2 + 0.5), w - 40, 40, 1, dark ? '#0d1418' : '#9cc6d8', dark ? { tex: false } : { glow: true, opacity: 0.6 });
      if (!dark) r.label(cx, 140, cz, nome, '#c9c2a8', 10);
    }
    if (!dark) for (const [x, z, n] of this.PORTAS) r.label(x, 100, z, String(n), '#c9c2a8', 9);
  },

  draw3d(g, r) {
    const d = g.data, U = TN.util;
    const dark = this.escuro(g);
    const fade = dark ? Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1) : 0;
    if (dark) r.env({ bg: '#020306', fog: [900, 2600], ambient: U.lerp(0.62, 0.34, fade), sun: U.lerp(1.3, 0.25, fade), sunDir: [-0.3, 1, 0.5], sunColor: '#8fa6d8', hemiSky: '#4a5a80', hemiGround: '#0a0806', envMap: 0 });
    // ---- pavilhão: chão de cimento, paredes do fundo e laterais (as celas de cima ficam no fundo) ----
    r.room(0, 0, MW, MH, { estilo: 'cela', h: 240, lamps: 0, props: false, bars: false, windows: 0, frente: 200 });
    r.box(MW / 2, 0, MH + 8, MW + 32, 34, 16, '#6c6a60', { tex: 'concreto' });                // mureta da frente
    // piso das celas (mais escuro) e faixa amarela de circulação no pátio
    for (const z of [CELA_D / 2, MH - CELA_D / 2]) r.plane(MW / 2, 0.3, z, MW, CELA_D, '#4c4a44', { tex: 'piso' });
    r.plane(MW / 2, 0.35, CELA_D + T + 30, MW - 60, 4, '#b8962c', { tex: false });
    r.plane(MW / 2, 0.35, MH - CELA_D - T - 30, MW - 60, 4, '#b8962c', { tex: false });
    // galeria do 2º andar na parede do fundo (passarela e guarda-corpo), só de enfeite
    r.box(MW / 2, 150, 14, MW, 6, 28, '#4a4b47', { metal: 0.5 });
    r.box(MW / 2, 178, 28, MW, 3, 3, '#3a3b37', { metal: 0.6 });
    for (let x = 30; x < MW; x += 120) r.box(x, 150, 28, 3, 28, 3, '#3a3b37', { metal: 0.6 });
    this.paredes3d(r, dark);
    for (const k of this.DECOR) this.decor3d(r, k);
    // ---- móveis revistáveis ----
    const hi = new Set();
    if (d.phase === 'search') for (const p of g.players) { const f = this.reachable(g, p); if (f) hi.add(f); }
    for (const f of d.furniture) this.furniture3d(r, f, hi.has(f), dark);
    // ---- luzes ----
    if (!dark) {
      for (const [lx, lz] of [[300, 600], [900, 300], [1500, 600], [900, 900], [300, 1100], [1500, 100]]) r.light(lx, 200, lz, '#fff1dc', 0.55, 760, { fundo: true });
    } else {
      // lanternas acesas: luz à frente do jogador e o facho no chão (verde para infectados)
      for (const p of g.players) {
        if (!p.data.lant) continue;
        const inf = p.data.infected, c = Math.cos(p.dir), s = Math.sin(p.dir), cor = inf ? '#c8ff9a' : '#ffe8c0';
        r.light(p.x + c * 90, 50, p.y + s * 90, cor, 0.3 + 1.0 * fade, this.LANT_R * 1.3);
        const L = this.LANT_HALF / Math.PI;
        r.ring(p.x, 0.9, p.y, 18, this.LANT_R * 0.9, cor, { glow: true, opacity: 0.1, arc: L, rotY: -Math.PI / 2 - this.LANT_HALF - p.dir });
        r.sphere(p.x + c * 16, 40, p.y + s * 16, 3.5, cor, { glow: true });
      }
    }
    // ---- jogadores ----
    for (const p of g.players) {
      const pd = p.data;
      if (pd.infected && dark) r.disc(p.x, 0.8, p.y, p.r + 9 + Math.sin(g.time * 8) * 2, '#9be15d', { glow: true, opacity: pd.frozen > 0 ? 0.2 : 0.35 });
      let pose = 'auto';
      if (pd.frozen > 0) pose = 'crouch';
      else if (this.isHunter(p) && d.phase !== 'search') pose = pd.swing > 0 ? 'swing' : 'hold';   // seringa/garra na mão
      else if (pd.searchT > 0) pose = 'work';
      r.character(p, { pose, flash: pd.frozen > 0 && Math.floor(g.time * 6) % 2 === 0, label: dark ? false : undefined });
      if (this.isHunter(p) && pd.swing > 0) {
        const L = 0.29, rho = -Math.PI / 2 - L * Math.PI - p.dir;
        r.ring(p.x, 20, p.y, this.INFECT_RANGE - 10, this.INFECT_RANGE - 4, '#dcffb4', { glow: true, arc: L, rotY: rho });
      }
      if (pd.holder && dark) {   // seringa na mão do portador (só aparece se ele estiver iluminado)
        const c = Math.cos(p.dir), s = Math.sin(p.dir);
        r.beam(p.x + c * 14, 34, p.y + s * 14, p.x + c * 30, 38, p.y + s * 30, 3.5, '#9be15d', { glow: true });
      }
      if (pd.frozen > 0) r.ring(p.x, 1.2, p.y, p.r + 4, p.r + 8, '#9be15d', { glow: true, arc: Math.max(0.01, pd.frozen / this.FREEZE) });
      if (pd.searchT > 0) {
        r.ring(p.x, 1.1, p.y, p.r + 5, p.r + 10, '#333333', {});
        r.ring(p.x, 1.3, p.y, p.r + 5, p.r + 10, '#ffd23f', { glow: true, arc: Math.min(1, pd.searchT / this.SEARCH_TIME) });
      }
    }
  },

  // ---------- camada 2D: breu por vista, nomes de quem aparece, plaquinha de cada vista e o painel ----------
  drawOverlay(g, c) {
    if (!TN.R3.available || !g.uses3d()) return;
    const d = g.data, vs = this.viewports(g), D = TN.draw, dark = this.escuro(g);
    const fade = dark ? Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1) : 0;
    vs.forEach((v, i) => {
      const eu = g.players.length === 3 && i === 3 ? null : g.players[i];
      const [rx, ry, rw, rh] = v.rect;
      c.save(); c.beginPath(); c.rect(rx, ry, rw, rh); c.clip();
      if (dark) {
        this.breu(g, c, i, eu, fade);
        // nomes de quem aparece nesta vista
        for (const p of g.players) {
          if (!this.visivel(g, eu, p)) continue;
          const s = TN.R3.project(p.x, 74, p.y, i);
          D.text(c, p.label, s.x, s.y, { size: 12, color: p.color, align: 'center' });
        }
      }
      // plaquinha da vista: nome, lanterna e papel de quem está nela
      if (eu) {
        const ed = eu.data;
        let txt = eu.label, cor = '#ddd';
        if (dark) {
          txt += ed.lant ? ' · LANTERNA ACESA' : ' · NO ESCURO';
          if (ed.holder) { txt += ' · VOCÊ TEM A SERINGA'; cor = '#9be15d'; }
          else if (ed.infected) { txt += ed.frozen > 0 ? ' · INFECTADO' : ' · CAÇANDO'; cor = '#9be15d'; }
        }
        const tw = Math.min(rw - 12, 10 + txt.length * 7.2);
        D.panel(c, rx + 6, ry + rh - 26, tw, 20, { stroke: eu.color, fill: 'rgba(8,10,13,0.75)' });
        D.text(c, txt, rx + 12, ry + rh - 16, { size: 11, color: cor });
      } else if (dark) D.text(c, 'PAVILHÃO (VISTA GERAL)', rx + 10, ry + rh - 14, { size: 11, color: '#888' });
      // vinheta verde de quem foi infectado
      if (eu && eu.data.infected && dark) {
        const gr = c.createRadialGradient(rx + rw / 2, ry + rh / 2, Math.min(rw, rh) * 0.35, rx + rw / 2, ry + rh / 2, Math.max(rw, rh) * 0.65);
        gr.addColorStop(0, 'rgba(155,225,93,0)'); gr.addColorStop(1, 'rgba(155,225,93,0.2)');
        c.fillStyle = gr; c.fillRect(rx, ry, rw, rh);
      }
      c.restore();
    });
    // moldura entre as vistas
    c.fillStyle = '#000';
    for (const v of vs) { const [rx, ry, rw, rh] = v.rect; if (rx > 0) c.fillRect(rx - 2, ry, 4, rh); if (ry > 34) c.fillRect(rx, ry - 2, rw, 4); }
    this.drawStatus(g, c);
  },

  // breu da vista i: escurece tudo e "abre" a aura de quem olha, o facho de cada lanterna acesa (recortado
  // pelas paredes) e um halo em volta de quem está com a lanterna acesa
  breu(g, c, i, eu, fade) {
    const P = (x, z) => TN.R3.project(x, 0, z, i);
    const escala = (x, z, R) => { const s = P(x, z), sx = P(x + R, z), sz = P(x, z + R); return { s, rx: Math.max(3, Math.abs(sx.x - s.x)), ry: Math.max(3, Math.abs(sz.y - s.y)) }; };
    c.save();
    c.fillStyle = `rgba(2,4,8,${0.95 * fade})`; c.fillRect(0, 0, TN.W, TN.H);
    c.globalCompositeOperation = 'destination-out';
    const furo = (x, z, R) => {
      const { s, rx, ry } = escala(x, z, R);
      c.save(); c.translate(s.x, s.y); c.scale(1, ry / rx);
      const gr = c.createRadialGradient(0, 0, rx * 0.5, 0, 0, rx);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
    };
    if (eu) furo(eu.x, eu.y, this.AURA + 30);
    for (const L of g.players) {
      if (!L.data.lant) continue;
      furo(L.x, L.y, this.HALO + 20);
      const pts = this.cone(L), { s, rx } = escala(L.x, L.y, this.LANT_R);
      const gr = c.createRadialGradient(s.x, s.y, rx * 0.15, s.x, s.y, rx * 1.05);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.beginPath();
      pts.forEach(([x, z], k) => { const q = P(x, z); if (k) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); });
      c.closePath(); c.fill();
    }
    c.restore();
  },

  // painel de estado no alto (o portador nunca é nomeado)
  drawStatus(g, c) {
    const d = g.data, D = TN.draw;
    if (d.phase === 'search') {
      D.panel(c, g.W / 2 - 170, 40, 340, 24, { stroke: '#ffd23f' });
      D.text(c, `REVISTE O PAVILHÃO · BUSCAS: ${d.searches}`, g.W / 2, 52, { size: 14, color: '#ffd23f', align: 'center' });
    } else if (d.phase === 'grace') {
      D.panel(c, g.W / 2 - 190, 40, 380, 24, { stroke: '#9be15d' });
      D.text(c, 'ALGUÉM ESTÁ COM A SERINGA. ESCONDAM-SE!', g.W / 2, 52, { size: 14, color: '#9be15d', align: 'center' });
    } else {
      const free = g.players.filter((p) => !p.data.infected).length;
      D.panel(c, g.W / 2 - 150, 40, 300, 26, { stroke: d.huntLeft < 5 ? '#f55' : '#9be15d' });
      D.text(c, `ESCURO ${TN.util.formatTime(d.huntLeft)} · LIVRES: ${free}`, g.W / 2, 53, { size: 16, color: d.huntLeft < 5 ? '#f55' : '#fff', align: 'center' });
    }
  },

  // ---------- 2D de reserva (sem WebGL): o pavilhão inteiro reduzido numa tela só ----------
  K2D: 0.42,
  drawScene(g, c) {
    const D = TN.draw, d = g.data, K = this.K2D, ox = (g.W - MW * K) / 2, oy = 36;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    c.save(); c.translate(ox, oy); c.scale(K, K);
    D.floor(c, 0, 0, MW, MH, { tile: 60, a: '#3a3a36', b: '#3f3f3a' });
    c.fillStyle = '#2e2d29'; c.fillRect(0, 0, MW, CELA_D); c.fillRect(0, MH - CELA_D, MW, CELA_D);
    c.strokeStyle = '#59616c'; c.lineWidth = 10; c.strokeRect(-5, -5, MW + 10, MH + 10);
    c.fillStyle = '#7a776c'; for (const [x, y, w, h] of this.WALLS) c.fillRect(x, y, w, h);
    const cores = { cama: '#6d6a58', armarinho: '#5f6b62', vaso: '#9a9d9a', pia: '#9a9d9a', banco: '#6e6b63', mesa: '#7c7e79', armario: '#59636e' };
    for (const [kind, x, y, w, h] of this.DECOR) { c.fillStyle = cores[kind]; c.fillRect(x, y, w, h); }
    const hi = new Set();
    if (d.phase === 'search') for (const p of g.players) { const f = this.reachable(g, p); if (f) hi.add(f); }
    for (const f of d.furniture) {
      c.fillStyle = cores[f.kind]; c.fillRect(f.x, f.y, f.w, f.h);
      c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(f.x, f.y, f.w, f.h);
      if (f.searched) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(f.x, f.y, f.w, f.h); }
      else if (hi.has(f)) { c.strokeStyle = '#ffd23f'; c.lineWidth = 5; c.strokeRect(f.x - 5, f.y - 5, f.w + 10, f.h + 10); }
    }
    for (const p of g.players) {
      const pd = p.data;
      if (pd.infected && this.escuro(g)) { c.fillStyle = 'rgba(155,225,93,0.35)'; c.beginPath(); c.arc(p.x, p.y, p.r + 10, 0, Math.PI * 2); c.fill(); }
      g.drawPlayer(c, p, { flash: pd.frozen > 0 && Math.floor(g.time * 6) % 2 === 0 });
      if (pd.searchT > 0) {
        c.strokeStyle = '#ffd23f'; c.lineWidth = 5; c.beginPath(); c.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pd.searchT / this.SEARCH_TIME)); c.stroke();
      }
    }
    c.restore();
  },

  draw(g, c) {
    const d = g.data, D = TN.draw, K = this.K2D, ox = (g.W - MW * K) / 2, oy = 36;
    this.drawScene(g, c);
    if (this.escuro(g)) {
      // tela única: breu, e só aparece o que está na aura de cada um ou numa lanterna acesa
      const fade = Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1);
      c.fillStyle = `rgba(2,4,8,${0.92 * fade})`; c.fillRect(0, 0, g.W, g.H);
      const regiao = (fn) => { c.save(); c.translate(ox, oy); c.scale(K, K); c.beginPath(); fn(); c.restore(); c.save(); c.clip(); this.drawScene(g, c); c.restore(); };
      for (const p of g.players) {
        regiao(() => c.arc(p.x, p.y, p.data.lant ? this.HALO : this.AURA * 0.6, 0, Math.PI * 2));
        if (p.data.lant) regiao(() => { this.cone(p, 8).forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); });
      }
      for (const p of g.players) if (p.data.lant) D.text(c, p.label, ox + p.x * K, oy + p.y * K - 18, { size: 12, color: p.color, align: 'center' });
    }
    this.drawStatus(g, c);
  },
});
})();
