// TEMPORADA DE CAÇA — inspirado em "DUCK HUNT" (duck_hunt) de Machine Party, refeito em duas vistas.
// Assimétrico: a cada rodada um jogador é o GUARDA na torre atrás da largada e os outros são FUGITIVOS,
// que correm da largada até o muro ao fundo, se escondendo atrás de caixotes, barris e montes de terra.
// A tela é dividida: em cima a vista do guarda (luneta), embaixo a dos fugitivos (pelas costas). Os
// fugitivos não veem a torre: só o ponto do laser, que acende meio segundo antes do tiro.
// Eixos da lógica: x = largura do pátio, y = avanço (START_Y perto da torre → WALL_Y no muro).
TN.registerMinigame({
  id: 'temporada_de_caca',
  title: 'TEMPORADA DE CAÇA',
  inspiredBy: 'Duck Hunt (duck_hunt)',
  tagline: 'O guarda da torre tem uma bala para cada um.',
  brief: ['Corra até o muro.', 'O laser aparece meio segundo antes do tiro: mergulhe (EXTRA) atrás de algo.', 'Na torre: mire, trave com AÇÃO e reze para ele não se mexer.'],
  controls: { move: 'andar / mirar', a: 'travar o tiro (guarda)', b: 'mergulhar (fugitivo) / zoom (guarda)' },
  icon: '⌖',
  color: '#ff8c3a',
  rounds: 4,                 // cada rodada tem um guarda diferente
  fixedRounds: true,         // ignora o ajuste "rodadas por jogo" do lobby
  scoring: 'points',
  endWhenOneLeft: false,

  // ---- constantes ----
  FIELD: { x0: 150, x1: 810 }, START_Y: 720, WALL_Y: 80,
  RUN_SPEED: 150, MERGULHO: 0.5, LASER: 0.5, RECARGA: 1.5, AIM_LOCK: 2, MAX_TIME: 40,
  AIM_SPEED: 300, ZOOM_SPEED: 110,
  ALVO_PE: { w: 32, h: 44 }, ALVO_AGACHADO: { w: 24, h: 24 },   // caixa do alvo no chão (x × y), centrada no fugitivo
  COBERTURAS: { caixote: { w: 70, d: 40, h: 60 }, barril: { w: 44, d: 44, h: 50 }, terra: { w: 96, d: 50, h: 36 } },

  // o guarda é guardado pelo id (estado serializável); cada rodada é a vez de um jogador
  guarda(g) { return g.players.find((p) => p.id === g.data.guardaId); },
  fugitivos(g) { return g.players.filter((p) => p.id !== g.data.guardaId); },
  ativos(g) { return this.fugitivos(g).filter((p) => p.alive && !p.data.out); },

  init(g) {
    const U = TN.util, d = g.data, F = this.FIELD;
    d.guardaId = g.players[(g.round - 1) % g.playerCount].id;
    const G = this.guarda(g), fug = this.fugitivos(g);
    d.mira = { x: 480, y: 450 }; d.zoom = false; d.tiro = null; d.recarga = 0;
    d.escapou = false; d.firstOut = false; d.over = false;
    // coberturas: 5 fileiras com 2 cada, x sorteado com distância mínima
    d.covers = [];
    for (const y of [600, 500, 400, 300, 200]) {
      const xs = [];
      for (let tries = 0; xs.length < 2 && tries < 40; tries++) {
        const x = U.rand(F.x0 + 60, F.x1 - 60);
        if (xs.every((o) => Math.abs(o - x) >= 140)) xs.push(x);
      }
      for (const x of xs) {
        const kind = U.pick(['caixote', 'barril', 'terra']), c = this.COBERTURAS[kind];
        d.covers.push({ kind, x, y: y + U.rand(-18, 18), w: c.w, d: c.d, h: c.h });
      }
    }
    fug.forEach((p, i) => {
      p.x = 480 + (i - (fug.length - 1) / 2) * 170; p.y = this.START_Y; p.dir = -Math.PI / 2;
      p.data = { out: false, baleado: false, baleadoT: -9, escapou: false, mergulho: 0, agachado: false };
    });
    G.data = { guarda: true };
    G.x = d.mira.x; G.y = d.mira.y;   // os "+1" do guarda aparecem na mira
  },

  // ---------- regras ----------
  // atrás de uma cobertura (do lado do muro): agachado ali fica invisível para o tiro
  emCobertura(g, p) { return g.data.covers.some((cv) => Math.abs(p.x - cv.x) <= cv.w / 2 + 6 && p.y < cv.y && p.y > cv.y - 50); },
  protegido(g, p) { return !!p.data.agachado && this.emCobertura(g, p); },
  // o fugitivo cuja caixa contém a mira e não está protegido (o mais perto do muro primeiro), ou null
  alvoNaMira(g) {
    const d = g.data;
    const cand = this.ativos(g).filter((p) => {
      if (this.protegido(g, p)) return false;
      const b = p.data.agachado ? this.ALVO_AGACHADO : this.ALVO_PE;
      return Math.abs(d.mira.x - p.x) <= b.w / 2 && Math.abs(d.mira.y - p.y) <= b.h / 2;
    });
    cand.sort((a, b) => a.y - b.y);
    return cand[0] || null;
  },
  travar(g) { g.data.tiro = { t: this.LASER }; g.sfx('laser'); },
  disparar(g) {
    const d = g.data, G = this.guarda(g), alvo = this.alvoNaMira(g);
    g.sfx('shoot'); g.shake(3);
    if (alvo) {
      alvo.data.out = true; alvo.data.baleado = true; alvo.data.baleadoT = g.time;
      g.eliminate(alvo, { sound: 'boom', msg: 'BALEADO!' });
      g.particles(alvo.x, alvo.y, '#c22', 26, 240);
      g.addScore(G, 1);
    } else g.particles(d.mira.x, d.mira.y, '#9a8a6a', 8, 110);
    d.recarga = this.RECARGA; d.tiro = null;
  },
  endRound(g) {
    const d = g.data;
    if (d.over) return;
    d.over = true;
    if (!d.escapou) { g.addScore(this.guarda(g), 1); g.message('NINGUÉM ESCAPOU. +1 GUARDA', 1.8, '#ff8c3a'); }
  },

  update(g, dt) {
    const U = TN.util, d = g.data, F = this.FIELD;
    if (d.over) return;
    // ---- guarda ----
    const G = this.guarda(g);
    d.recarga -= dt;
    if (G.input.bPressed) { d.zoom = !d.zoom; g.sfx('select'); }
    if (g.time >= this.AIM_LOCK) {
      const v = (d.zoom ? this.ZOOM_SPEED : this.AIM_SPEED) * (d.tiro ? 0.4 : 1);
      d.mira.x = U.clamp(d.mira.x + G.input.x * v * dt, F.x0, F.x1);
      d.mira.y = U.clamp(d.mira.y + G.input.y * v * dt, this.WALL_Y - 20, this.START_Y + 40);
      if (G.input.aPressed && !d.tiro && d.recarga <= 0) this.travar(g);
    }
    if (d.tiro) { d.tiro.t -= dt; if (d.tiro.t <= 0) this.disparar(g); }
    G.x = d.mira.x; G.y = d.mira.y;

    // ---- fugitivos ----
    // (movePlayer prende em bounds.y + p.r: a borda fica 40 antes do muro para dar para cruzá-lo)
    const bounds = { x: F.x0, y: this.WALL_Y - 40, w: F.x1 - F.x0, h: this.START_Y + 40 - (this.WALL_Y - 40) };
    for (const p of this.ativos(g)) {
      const pd = p.data;
      pd.mergulho -= dt;
      if (p.input.bPressed && pd.mergulho <= 0) { pd.mergulho = this.MERGULHO; g.sfx('whoosh'); }
      pd.agachado = pd.mergulho > 0 || !!p.input.b;
      const ox = p.x, oy = p.y;
      if (pd.agachado) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, bounds); p.input = save; }
      else g.movePlayer(p, this.RUN_SPEED, dt, bounds);
      // não atravessa a pegada das coberturas
      for (const cv of d.covers) {
        const r = { x: cv.x - cv.w / 2, y: cv.y - cv.d / 2, w: cv.w, h: cv.d };
        if (U.circleRect(p, r, 6)) {
          if (!U.circleRect({ x: ox, y: p.y }, r, 6)) p.x = ox;
          else if (!U.circleRect({ x: p.x, y: oy }, r, 6)) p.y = oy;
          else { p.x = ox; p.y = oy; }
        }
      }
      if (p.y <= this.WALL_Y) {
        pd.out = true; pd.escapou = true; d.escapou = true;
        g.addScore(p, 1);
        if (!d.firstOut) { d.firstOut = true; g.addScore(p, 1, { popup: false }); g.popup('PRIMEIRO! +2', p.x, p.y + 30, '#ff0'); }
        g.sfx('coin'); g.particles(p.x, p.y, p.color, 16, 160);
      }
    }
    U.separate(this.ativos(g));
    if (this.ativos(g).length === 0 || g.time >= this.MAX_TIME) { this.endRound(g); g.finish(1.5); }
  },

  // ---------- bots ----------
  bot(g, p, dt) {
    return p.id === g.data.guardaId ? this.guardaBot(g, p, dt) : this.fugitivoBot(g, p, dt);
  },

  // mira no fugitivo mais exposto (nunca em quem está agachado atrás de cobertura), com erro e mirando
  // um pouco à frente de quem corre (o laser dura 0,5 s), e trava com um atraso de 0,3 a 0,8 s quando a
  // mira chega perto; não usa o zoom (a mira com zoom é mais lenta que o fugitivo)
  guardaBot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, out = { x: 0, y: 0, a: false, b: false };
    pd.bT = (pd.bT || 0) - dt;
    let t = pd.bAlvo ? g.players.find((q) => q.id === pd.bAlvo) : null;
    if (!t || !t.alive || t.data.out || this.protegido(g, t) || pd.bT <= 0) {
      const lista = this.ativos(g).filter((q) => !this.protegido(g, q)).sort((a, b) => a.y - b.y);
      t = lista[0] || null; pd.bAlvo = t ? t.id : null;
      pd.bErro = { x: U.rand(-14, 14), y: U.rand(-14, 14) }; pd.bT = U.rand(0.6, 1.2);
      if (pd.bAtraso === undefined) pd.bAtraso = U.rand(0.3, 0.8);
    }
    if (!t) return out;
    // mira 15 px à frente de quem corre: durante o laser a mira segue a 40 % e fica mais ou menos esse tanto atrás
    const tx = t.x + pd.bErro.x, ty = t.y + pd.bErro.y - (t.data.agachado ? 0 : 15);
    const dx = tx - d.mira.x, dy = ty - d.mira.y, dd = Math.hypot(dx, dy);
    out.x = U.clamp(dx / 12, -1, 1); out.y = U.clamp(dy / 12, -1, 1);   // ganho alto: a mira (300 px/s) acompanha quem corre (150 px/s)
    if (d.zoom && !pd.bPrevB) out.b = true;   // se entrou com zoom (jogador humano que virou bot), desliga
    pd.bPrevB = out.b;
    // só trava em quem está no aberto (atrás de cobertura o fugitivo mergulha e some)
    if (dd < 18 && !d.tiro && d.recarga <= 0 && !this.emCobertura(g, t)) {
      pd.bAtraso -= dt;
      if (pd.bAtraso <= 0 && !pd.bPrevA) { out.a = true; pd.bAtraso = U.rand(0.3, 0.8); }
    }
    pd.bPrevA = out.a;
    return out;
  },

  // corre de cobertura em cobertura até o muro; com o laser a menos de 40 px, mergulha se há cobertura
  // perto, senão muda de direção
  fugitivoBot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, F = this.FIELD;
    if (!p.alive || pd.out) return { x: 0, y: 0 };
    pd.bEspera = (pd.bEspera || 0) - dt;
    if (d.tiro && U.dist(d.mira.x, d.mira.y, p.x, p.y) < 40 && !(pd.bDesvio && pd.bDesvio.t > 0)) {
      if (this.emCobertura(g, p)) { pd.bEspera = U.rand(0.6, 1.2); return { x: 0, y: 0, b: true }; }
      pd.bDesvio = { x: p.x > 480 ? -1 : 1, t: 0.4 };
    }
    if (pd.bDesvio && pd.bDesvio.t > 0) { pd.bDesvio.t -= dt; return { x: pd.bDesvio.x, y: -0.3, b: false }; }
    if (pd.bEspera > 0) return { x: 0, y: 0, b: true };
    if (!pd.bAlvo) {
      const prox = d.covers.filter((cv) => cv.y < p.y - 40 && Math.abs(cv.x - p.x) < 220);
      if (prox.length && U.chance(0.85)) {
        const cv = U.pick(prox);
        pd.bAlvo = { x: cv.x + U.rand(-cv.w * 0.3, cv.w * 0.3), y: cv.y - 22, cx: cv.x, cw: cv.w, cy: cv.y };
      } else pd.bAlvo = { x: U.clamp(p.x + U.rand(-80, 80), F.x0 + 20, F.x1 - 20), y: this.WALL_Y - 5 };
      pd.bAlvoT = 0;
    }
    const a = pd.bAlvo;
    pd.bAlvoT += dt;
    if (pd.bAlvoT > 5) { pd.bAlvo = null; return { x: 0, y: -1 }; }   // não chegou em 5 s: desiste
    let tx = a.x, ty = a.y;
    // a cobertura fica entre o bot e o ponto escolhido: contorna pela lateral mais perto
    if (a.cx !== undefined && p.y > a.cy - 8 && Math.abs(p.x - a.cx) < a.cw / 2 + 18) { tx = a.cx + (p.x >= a.cx ? 1 : -1) * (a.cw / 2 + 24); ty = a.cy - 10; }
    const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
    if (tx === a.x && dd < 14) {
      const tinhaCobertura = a.cx !== undefined;
      pd.bAlvo = null;
      if (tinhaCobertura) pd.bEspera = U.rand(0.3, 1.2);
      return { x: 0, y: 0, b: tinhaCobertura };
    }
    if (!pd.bZig || U.chance(0.03)) pd.bZig = U.rand(-0.5, 0.5);
    const n = U.norm(dx, dy);
    return { x: n.x + (dd > 60 && a.cx === undefined ? pd.bZig : 0), y: n.y, b: false };
  },

  // ---------- duas vistas ----------
  // em cima (45 %) a câmera do guarda na torre (com luneta: fecha o fov e segue a mira); embaixo (55 %)
  // a câmera baixa atrás da largada, pelas costas dos fugitivos, olhando para o muro
  viewports(g) {
    const d = g.data;
    return [
      // sem zoom o enquadramento vai da largada (y 720, onde a mira ainda alcança 760) ao muro (y 80)
      { rect: [0, 34, 960, 228], camera: { pos: [480, 260, 980], target: d.zoom ? [d.mira.x, 0, d.mira.y] : [480, 0, 590], fov: d.zoom ? 14 : 36 } },
      { rect: [0, 262, 960, 278], camera: { pos: [480, 110, 950], target: [480, 20, 250], fov: 44 } },
    ];
  },
  camera: { pos: [480, 110, 950], target: [480, 20, 250], fov: 44 },
  env: { bg: '#05060a', fog: [1300, 2800], ambient: 0.38, sun: 0.7, sunDir: [0.3, 1, 0.5], sunColor: '#9fb4ff', hemiSky: '#55648c', hemiGround: '#1a140c' },

  draw3d(g, r) {
    const d = g.data, F = this.FIELD, SY = this.START_Y, WY = this.WALL_Y;
    // pátio à noite: chão de cimento, muro alto com arame ao fundo, largada atrás
    r.yard(F.x0 - 400, WY - 260, F.x1 + 400, SY + 500, { quadra: false, holofote: false, postes: 0, guarita: false });
    r.box(480, 0, WY - 30, 1400, 160, 40, '#5a5a56', { rough: 0.95, tex: 'concreto' });
    for (let x = -200; x <= 1160; x += 170) r.cyl(x, 160, WY - 30, 2, 26, '#3a3d40', { metal: 0.6 });
    for (const hy of [172, 182]) r.beam(-200, hy, WY - 30, 1160, hy, WY - 30, 1.2, '#8a8f96', { metal: 0.7, shadow: false });
    r.plane(480, 0.5, WY, F.x1 - F.x0 + 80, 6, '#4dff7a', { glow: true, opacity: 0.5 });
    r.plane(480, 0.5, SY, F.x1 - F.x0 + 80, 6, '#d8d8d8', { opacity: 0.6 });
    // holofotes nos cantos do muro
    for (const x of [F.x0 - 60, F.x1 + 60]) { r.box(x, 150, WY - 6, 16, 10, 12, '#2a2d30', { metal: 0.5 }); r.box(x, 148, WY, 12, 4, 2, '#ffe2b0', { glow: true }); }
    r.light(F.x0 - 40, 150, WY + 40, '#ffd9a8', 1.0, 700);
    r.light(F.x1 + 40, 150, WY + 40, '#ffd9a8', 1.0, 700);
    // torre atrás da largada (atrás das duas câmeras): o guarda em cima, e o facho do holofote dela varrendo o pátio
    const TX = 480, TZ = SY + 280;
    for (const [ox, oz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) r.beam(TX + ox * 2, 0, TZ + oz * 2, TX + ox, 240, TZ + oz, 6, '#5a4128');
    r.box(TX, 240, TZ, 60, 6, 60, '#6b4d2e');
    const G = this.guarda(g);
    r.character({ id: 'guarda', x: TX, y: TZ, alive: true, color: G ? G.color : '#999', label: false }, { key: 'guarda', y: 246, dir: -Math.PI / 2, pose: d.tiro ? 'aim' : 'gun', label: false });
    const ang = Math.sin(g.time * 0.5) * 0.35;
    r.plane(TX + Math.sin(ang) * 450, 0.8, TZ - 450, 60, 900, '#fff2c0', { glow: true, opacity: 0.1, rotY: -ang });
    r.light(TX + Math.sin(ang) * 500, 60, TZ - 500, '#fff2c0', 0.9, 420);
    for (const cv of d.covers) this.drawCobertura3d(r, cv);
    // ponto do laser (visível para todos) só enquanto o tiro está travado; o feixe não aparece (ninguém vê a torre)
    if (d.tiro) {
      r.sphere(d.mira.x, 2, d.mira.y, 4, '#ff2020', { glow: true });
      r.ring(d.mira.x, 1, d.mira.y, 10, 13, '#ff2020', { glow: true, opacity: Math.round((0.5 + 0.5 * Math.sin(g.time * 40)) * 10) / 10 });
      r.light(d.mira.x, 20, d.mira.y, '#ff2020', 0.8, 160);
    }
    for (const p of this.fugitivos(g)) {
      if (p.data.out && !p.data.baleado) continue;   // quem escapou já passou do muro
      r.character(p, { pose: !p.alive ? 'dead' : g.time - p.data.baleadoT < 0.4 ? 'hit' : p.data.agachado ? 'crouch' : 'auto' });
    }
  },

  drawCobertura3d(r, cv) {
    if (cv.kind === 'caixote') {
      r.box(cv.x, 0, cv.y, cv.w, cv.h / 2, cv.d, '#8a6438', { rough: 0.9, tex: 'madeira' });
      r.box(cv.x + 4, cv.h / 2, cv.y - 2, cv.w * 0.8, cv.h / 2, cv.d * 0.8, '#94703f', { rough: 0.9, tex: 'madeira', rotY: 0.2 });
      for (const sx of [-1, 1]) r.box(cv.x + sx * cv.w * 0.3, 0, cv.y, 3, cv.h / 2 + 0.5, cv.d + 1, '#4a3420', { shadow: false });
    } else if (cv.kind === 'barril') {
      r.cyl(cv.x, 0, cv.y, cv.w / 2, cv.h, '#3b5a8a', { metal: 0.5, rough: 0.5 });
      for (const hy of [cv.h * 0.2, cv.h * 0.75]) r.cyl(cv.x, hy, cv.y, cv.w / 2 + 1, 3, '#2a2e35', { metal: 0.8 });
      r.cyl(cv.x + 10, cv.h, cv.y + 4, 4, 2, '#1a1d22', { metal: 0.8 });
    } else {
      r.cone(cv.x, 0, cv.y, cv.w / 2, cv.h, '#5a4330', { rough: 1 });
      r.cone(cv.x - cv.w * 0.22, 0, cv.y + 8, cv.w * 0.28, cv.h * 0.6, '#4e3a2a', { rough: 1 });
      r.cone(cv.x + cv.w * 0.25, 0, cv.y - 6, cv.w * 0.24, cv.h * 0.5, '#63493a', { rough: 1 });
    }
  },

  // ---------- HUD por cima das vistas ----------
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw, d = g.data, G = this.guarda(g);
    const vp = this.viewports(g), r0 = vp[0].rect;
    // faixa escura entre as vistas
    c.fillStyle = '#000'; c.fillRect(0, r0[1] + r0[3], g.W, 4);
    // vista do guarda: luneta e retículo
    const locked = g.time < this.AIM_LOCK;
    const s = d.zoom ? { x: r0[0] + r0[2] / 2, y: r0[1] + r0[3] / 2 } : TN.R3.project(d.mira.x, 0, d.mira.y, 0);
    c.save(); c.beginPath(); c.rect(r0[0], r0[1], r0[2], r0[3]); c.clip();
    if (d.zoom) {
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.rect(r0[0], r0[1], r0[2], r0[3]); c.arc(s.x, s.y, 95, 0, Math.PI * 2, true); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 4; c.beginPath(); c.arc(s.x, s.y, 95, 0, Math.PI * 2); c.stroke();
    }
    const R = d.zoom ? 12 : 20;
    c.strokeStyle = locked ? '#888' : d.tiro ? '#ff2020' : G.color; c.lineWidth = 2.5;
    c.beginPath(); c.arc(s.x, s.y, R, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(s.x + ax * (R - 7), s.y + ay * (R - 7)); c.lineTo(s.x + ax * (R + 8), s.y + ay * (R + 8)); }
    c.stroke();
    if (d.tiro) { c.strokeStyle = '#ff2020'; c.lineWidth = 3; c.beginPath(); c.arc(s.x, s.y, R + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - d.tiro.t / this.LASER)); c.stroke(); }
    c.fillStyle = '#f33'; c.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    c.restore();
    // painel do guarda
    D.panel(c, 10, r0[1] + r0[3] - 40, 290, 32, { stroke: G.color, fill: 'rgba(8,10,13,0.8)' });
    D.text(c, `GUARDA ${G.label}`, 22, r0[1] + r0[3] - 24, { size: 14, color: G.color });
    const st = locked ? `MIRA EM ${Math.ceil(this.AIM_LOCK - g.time)}` : d.tiro ? 'LASER' : d.recarga > 0 ? 'RECARGA' : d.zoom ? 'ZOOM' : 'PRONTO';
    D.text(c, st, 288, r0[1] + r0[3] - 24, { size: 12, color: d.recarga > 0 || locked ? '#f88' : '#ccc', align: 'right' });
    if (d.recarga > 0) D.bar(c, 170, r0[1] + r0[3] - 16, 118, 6, 1 - d.recarga / this.RECARGA, '#e8c35a');
    if (locked) D.text(c, 'FUGITIVOS, CORRAM!', g.W / 2, r0[1] + 24, { size: 20, color: '#ffd23f', align: 'center' });
    // vista dos fugitivos: dica e relógio
    D.text(c, 'EXTRA = MERGULHAR · CHEGUE AO MURO', 16, g.H - 14, { size: 11, color: '#9aa' });
    const left = Math.max(0, this.MAX_TIME - g.time);
    D.text(c, TN.util.formatTime(left), g.W - 16, g.H - 16, { size: 18, color: left < 8 ? '#f55' : '#ddd', align: 'right' });
  },

  // ---------- 2D (alternativa sem WebGL): o pátio de cima, muro em cima da tela ----------
  draw(g, c) {
    const D = TN.draw, d = g.data, F = this.FIELD, G = this.guarda(g);
    const y0 = this.WALL_Y - 20, y1 = this.START_Y + 40;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    c.save();
    c.translate(0, 34); c.scale(1, 506 / (y1 - y0)); c.translate(0, -y0);
    c.fillStyle = '#4a4638'; c.fillRect(F.x0 - 40, y0, F.x1 - F.x0 + 80, y1 - y0);
    c.fillStyle = '#5a5a56'; c.fillRect(F.x0 - 40, y0, F.x1 - F.x0 + 80, 30);           // muro
    c.fillStyle = 'rgba(80,255,120,0.25)'; c.fillRect(F.x0 - 40, this.WALL_Y - 2, F.x1 - F.x0 + 80, 4);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(F.x0 - 40, this.START_Y - 2, F.x1 - F.x0 + 80, 4);
    for (const cv of d.covers) {
      c.fillStyle = cv.kind === 'caixote' ? '#8a6438' : cv.kind === 'barril' ? '#3b5a8a' : '#5a4330';
      c.fillRect(cv.x - cv.w / 2, cv.y - cv.d / 2, cv.w, cv.d);
    }
    for (const p of this.fugitivos(g)) if (!(p.data.out && !p.data.baleado)) g.drawPlayer(c, p);
    if (d.tiro) { c.fillStyle = '#ff2020'; c.beginPath(); c.arc(d.mira.x, d.mira.y, 5, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = g.time < this.AIM_LOCK ? '#888' : G.color; c.lineWidth = 2;
    c.beginPath(); c.arc(d.mira.x, d.mira.y, 18, 0, Math.PI * 2); c.stroke();
    c.restore();
    D.panel(c, 10, g.H - 44, 290, 32, { stroke: G.color });
    D.text(c, `GUARDA ${G.label}`, 22, g.H - 28, { size: 14, color: G.color });
    const st = g.time < this.AIM_LOCK ? 'MIRA TRAVADA' : d.tiro ? 'LASER' : d.recarga > 0 ? 'RECARGA' : 'PRONTO';
    D.text(c, st, 288, g.H - 28, { size: 12, color: '#ccc', align: 'right' });
    D.text(c, TN.util.formatTime(Math.max(0, this.MAX_TIME - g.time)), g.W - 16, g.H - 20, { size: 18, color: '#ddd', align: 'right' });
  },
});
