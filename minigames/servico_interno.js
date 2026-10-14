// SERVIÇO INTERNO — inspirado em "INSIDE JOB" (knife_at_the_office) de Machine Party.
// Fase 1: todos revistam os móveis do escritório (segurar AÇÃO 1 s). Quem completar a N-ésima busca acha a seringa (+1).
// Fase 2: as luzes apagam e, 3 s depois, começa uma contagem de 30 s. O portador infecta quem estiver perto (+1 por
// infecção); o infectado fica congelado 5 s e depois caça também, 1,25× mais rápido. Quem escapar ganha +1.
TN.registerMinigame({
  id: 'servico_interno',
  title: 'SERVIÇO INTERNO',
  inspiredBy: 'Inside Job (knife_at_the_office)',
  tagline: 'REVISTE. CACE. ESCONDA-SE.',
  brief: ['Revistem o escritório: segure AÇÃO junto aos móveis.', 'Quem achar a seringa infecta os outros.', 'Infectados voltam e caçam também.', 'Escape por 30 s no escuro.'],
  controls: { move: 'andar', a: 'revistar (segurar) / infectar' },
  icon: '✚',
  color: '#9be15d',
  rounds: 3,
  scoring: 'points',          // +1 achar, +1 por infecção, +1 por escapar
  endWhenOneLeft: false,

  // ---- constantes (originais: busca 1,0 s, recarga 0,5 s, congelado 5 s, caçador 1,25×, contagem 30 s) ----
  SPEED: 175, HOLDER_MULT: 1.0, HUNTER_MULT: 1.25,
  SEARCH_TIME: 1.0, REACH: 14,            // distância (px) da borda do móvel para conseguir revistar
  INFECT_RANGE: 44, INFECT_CD: 0.5, FREEZE: 5,
  GRACE: 3, HUNT_TIME: 30, FORCE_AT: 45,  // FORCE_AT: se ninguém achou até aqui, a próxima busca acha
  LIGHT_R: 72, LIGHT_R_INF: 122,

  // Móveis: [tipo, x, y, w, h]. Todos são sólidos e podem ser revistados uma vez.
  LAYOUT: [
    // parede de cima
    ['armario', 60, 74, 50, 30], ['armario', 120, 74, 50, 30], ['estante', 300, 74, 90, 28], ['impressora', 470, 74, 60, 34],
    ['estante', 620, 74, 90, 28], ['armario', 800, 74, 50, 30], ['armario', 860, 74, 50, 30],
    // parede de baixo
    ['sofa', 70, 444, 110, 34], ['bebedouro', 282, 444, 34, 34], ['estante', 420, 450, 90, 28], ['armario', 640, 448, 50, 30], ['sofa', 760, 444, 120, 34],
    // mesas de trabalho (com cadeira)
    ['mesa', 148, 167, 84, 46], ['mesa', 328, 167, 84, 46], ['mesa', 548, 167, 84, 46], ['mesa', 728, 167, 84, 46],
    ['mesa', 148, 317, 84, 46], ['mesa', 328, 317, 84, 46], ['mesa', 548, 317, 84, 46], ['mesa', 728, 317, 84, 46],
    // vasos de planta
    ['vaso', 467, 252, 26, 26], ['vaso', 44, 252, 26, 26], ['vaso', 890, 252, 26, 26],
  ],
  SPAWNS: [[100, 265], [290, 265], [670, 265], [850, 265]],

  init(g) {
    const U = TN.util, d = g.data;
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
    for (const f of g.data.furniture) {
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

  // ---------- bot ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, a = g.arena;
    if (pd.frozen > 0 || d.phase === 'end') return { x: 0, y: 0 };
    // detecção de "preso" (encostado em móvel): se mal andou em 0,6 s, dá um passo de lado
    pd.bStuckT = (pd.bStuckT || 0) + dt;
    if (pd.bStuckT > 0.6) {
      const moved = U.dist(p.x, p.y, pd.bLastX ?? p.x, pd.bLastY ?? p.y);
      if (moved < 10 && !pd.searchF) { pd.bSide = { x: U.rand(-1, 1), y: U.rand(-1, 1), t: 0.5 }; pd.bTarget = null; }
      pd.bLastX = p.x; pd.bLastY = p.y; pd.bStuckT = 0;
    }
    if (pd.bSide && pd.bSide.t > 0) { pd.bSide.t -= dt; return { x: pd.bSide.x, y: pd.bSide.y }; }

    // fase 1: vai até o móvel não revistado mais perto (evita o que outro bot já escolheu) e segura AÇÃO
    if (d.phase === 'search') {
      if (!pd.bTarget || pd.bTarget.searched) {
        let best = null, bs = 1e9;
        for (const f of d.furniture) {
          if (f.searched) continue;
          const taken = g.players.some((o) => o !== p && o.data.bTarget === f);
          const s = this.rectGap(p, f) + (taken ? 220 : 0) + U.rand(0, 60);
          if (s < bs) { bs = s; best = f; }
        }
        pd.bTarget = best;
      }
      const f = pd.bTarget;
      if (!f) return { x: 0, y: 0 };
      if (this.rectGap(p, f) < this.REACH - 3) return { x: 0, y: 0, a: true };
      const nx = U.clamp(p.x, f.x, f.x + f.w), ny = U.clamp(p.y, f.y, f.y + f.h);
      const n = U.norm(nx - p.x, ny - p.y);
      return { x: n.x, y: n.y };
    }

    // fase 2, infectado: persegue o sobrevivente mais perto e ataca ao alcance
    if (pd.infected) {
      let prey = null, bd = 1e9;
      for (const o of g.players) {
        if (o.data.infected) continue;
        const dd = U.dist(p.x, p.y, o.x, o.y);
        if (dd < bd) { bd = dd; prey = o; }
      }
      if (!prey) return { x: 0, y: 0 };
      const n = U.norm(prey.x - p.x, prey.y - p.y);
      const want = d.phase === 'hunt' && bd < this.INFECT_RANGE - 4 && pd.cd <= 0;
      const press = want && !pd.bPrevA; pd.bPrevA = press;
      return { x: n.x, y: n.y, a: press };
    }

    // fase 2, sobrevivente: testa 16 direções e escolhe a que deixa mais longe dos caçadores
    // sem bater em móveis ou paredes (assim não fica encurralado num canto)
    const hunters = g.players.filter((o) => o.data.infected && o.data.frozen < 1.5);
    if (!hunters.length) return { x: 0, y: 0 };
    pd.bThink = (pd.bThink || 0) - dt;
    if (pd.bThink <= 0 || !pd.bDir) {
      pd.bThink = U.rand(0.12, 0.25);
      let best = null, bs = -1e9;
      for (let k = 0; k < 16; k++) {
        const an = (k / 16) * Math.PI * 2, cx = Math.cos(an), cy = Math.sin(an);
        let s = 0;
        for (const step of [35, 90]) {
          const q = { x: p.x + cx * step, y: p.y + cy * step, r: p.r };
          if (q.x < a.x + p.r || q.x > a.x + a.w - p.r || q.y < a.y + p.r || q.y > a.y + a.h - p.r) s -= step === 35 ? 400 : 120;
          else if (d.furniture.some((f) => this.rectGap(q, f) < 2)) s -= step === 35 ? 400 : 80;
          for (const h of hunters) s += Math.min(260, U.dist(q.x, q.y, h.x, h.y)) * (step === 90 ? 1 : 0.5);
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
  camera: { pos: [480, 640, 790], target: [480, 0, 282], fov: 41 },
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

  draw3d(g, r) {
    const a = g.arena, d = g.data, U = TN.util;
    const dark = d.phase !== 'search';
    const fade = dark ? Math.min(1, d.phase === 'grace' ? d.phaseT * 3 : 1) : 0;
    if (dark) r.env({ bg: '#020306', fog: [1100, 2400], ambient: U.lerp(0.65, 0.07, fade), sun: U.lerp(1.7, 0.06, fade), sunDir: [-0.3, 1, 0.5], sunColor: '#8fa6d8', hemiSky: '#4a5a80', hemiGround: '#0a0806' });
    // ---- sala da administração: taco, meia-parede de madeira, janelas com persiana; mureta na frente ----
    // (sem pendentes do r.room: ficariam pendurados sobre os móveis; as luminárias de parede apagam no breu)
    r.room(a.x, a.y, a.x + a.w, a.y + a.h, { estilo: 'escritorio', h: 130, windows: 4, lamps: 0, props: false });
    r.plane(a.x + a.w / 2, 0.3, a.y + 197, a.w - 140, 58, '#5a2626', { rough: 1, tex: 'tecido' });    // tapete do corredor
    r.box(a.x + a.w / 2, 0, a.y + a.h + 8, a.w + 32, 18, 16, '#6e4f33', { tex: 'madeira' });
    r.box(a.x + a.w / 2, 18, a.y + a.h + 8, a.w + 32, 2, 18, '#2a2f36');
    for (const lx of [130, 480, 830]) r.box(lx, 116, a.y + 2, 60, 5, 6, dark ? '#2a2a2a' : '#fff4dc', dark ? {} : { glow: true });
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
      else if (this.isHunter(p)) pose = 'arms';
      else if (pd.searchT > 0) pose = 'arms';
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
    // tapete do corredor central
    c.fillStyle = 'rgba(120,40,40,0.18)'; c.fillRect(a.x + 70, a.y + 168, a.w - 140, 58);
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
