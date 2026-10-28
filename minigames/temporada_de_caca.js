// TEMPORADA DE CAÇA — inspirado em "DUCK HUNT" (duck_hunt) de Machine Party.
// Todos os jogadores são FUGITIVOS: correm pela vala de escoamento comprida, da largada (o buraco no muro
// da cadeia) até a boca do bueiro no fundo, se escondendo atrás de caixotes, barris e montes de terra.
// O ATIRADOR é um NPC da casa, na torre em cima do bueiro: a mira a laser fica sempre acesa, segue os
// alvos com atraso e erro, troca de alvo e hesita. Para atirar ele precisa manter o laser em cima do
// alvo por um instante (travar); aí o tiro é instantâneo. Cada fugitivo aguenta 2 tiros (o ferido fica
// mais lento), como no original. Câmera pelas costas do grupo, acompanhando a fuga.
// Eixos da lógica: x = largura da vala, y = avanço (START_Y na largada → WALL_Y na saída, perto da torre).
TN.registerMinigame({
  id: 'temporada_de_caca',
  title: 'TEMPORADA DE CAÇA',
  inspiredBy: 'Duck Hunt (duck_hunt)',
  tagline: 'A torre está com a mira acesa. Ela não pisca.',
  brief: [
    'Corra pela vala até o bueiro no fundo. Quem sai primeiro ganha bônus.',
    'O laser vermelho é a mira do atirador: se ele parar em você, vem o tiro.',
    'Mude de direção, mergulhe (EXTRA) ou segure EXTRA atrás de algo para sumir.',
    'Dois tiros e acabou. Ferido, você corre mais devagar.',
  ],
  controls: { move: 'correr', b: 'mergulhar / segurar: abaixar' },
  icon: '⌖',
  color: '#ff8c3a',
  rounds: 2,                 // rodadas longas (~1 min); número fixo
  fixedRounds: true,
  scoring: 'points',
  endWhenOneLeft: false,

  // ---- constantes ----
  // vala estreita e comprida (≈ 25 × 135 m como a trincheira do original): agora 1800 de corrida
  FIELD: { x0: 180, x1: 780 }, START_Y: 1880, WALL_Y: 80,
  RAIL_Y: 1000,              // trilho do vagão de presos atravessando a vala (só cenário, rente ao chão)
  RUN_SPEED: 150, FERIDO: 0.75, AGACHADO: 0.35, VIDA: 2,
  MERGULHO: 0.4, MERGULHO_V: 300, MERGULHO_CD: 1.1,
  MAX_TIME: 75,
  ESCAPOU: 2, PRIMEIRO: 1,   // pontos: escapar dá 2, o primeiro a sair ganha +1; morrer não dá nada
  // atirador (NPC): começa a mirar depois de INICIO s; laser anda até MIRA_V px/s, enxerga o alvo com
  // atraso LAG (s) e compensa só uma parte (LEAD) da velocidade; precisa de TRAVA s em cima do alvo
  // calibrado com 4 bots fugitivos: ~50 % escapam em média (medido em 300 rodadas)
  INICIO: 2, MIRA_V: 270, LAG: 0.2, LEAD: 0.3, ERRO: 10,
  TRAVA: [0.4, 0.65], RECARGA: 1.1, ESPALHA: 7,
  ALVO_PE: { w: 32, h: 44 }, ALVO_AGACHADO: { w: 24, h: 24 },   // caixa do alvo no chão (x × y), centrada no fugitivo
  COBERTURAS: { caixote: { w: 70, d: 40, h: 60 }, barril: { w: 44, d: 44, h: 50 }, terra: { w: 96, d: 50, h: 36 } },
  TORRE: { x: 480, z: -40, h: 300 },   // a torre fica atrás da cabeceira do bueiro, no fundo

  fugitivos(g) { return g.players; },
  ativos(g) { return g.players.filter((p) => p.alive && !p.data.out); },

  init(g) {
    const U = TN.util, d = g.data, F = this.FIELD;
    d.escapou = 0; d.firstOut = false; d.over = false; d.sangue = [];
    // coberturas: fileiras a cada ~150 ao longo da vala, 2 ou 3 por fileira, x sorteado com distância mínima
    d.covers = [];
    for (let y = this.START_Y - 170, k = 0; y > this.WALL_Y + 120; y -= 150, k++) {
      if (Math.abs(y - this.RAIL_Y) < 50) continue;   // o trilho fica livre
      const n = k % 3 === 2 ? 3 : 2, xs = [];
      for (let tries = 0; xs.length < n && tries < 60; tries++) {
        const x = U.rand(F.x0 + 60, F.x1 - 60);
        if (xs.every((o) => Math.abs(o - x) >= 150)) xs.push(x);
      }
      for (const x of xs) {
        const kind = U.pick(['caixote', 'barril', 'terra']), c = this.COBERTURAS[kind];
        d.covers.push({ kind, x, y: y + U.rand(-20, 20), w: c.w, d: c.d, h: c.h });
      }
    }
    g.players.forEach((p, i) => {
      p.x = 480 + (i - (g.players.length - 1) / 2) * 130; p.y = this.START_Y; p.dir = -Math.PI / 2;
      p.data = { out: false, baleado: false, escapou: false, vida: this.VIDA, feridoT: -9, mergulho: 0, mergCd: 0, md: { x: 0, y: -1 }, agachado: false, vx: 0, vy: 0 };
    });
    // atirador: mira (x, y) no chão, alvo (id), o que ele "enxerga" (vis), erro, trava, recarga, hesitação
    d.at = { x: 480, y: this.START_Y - 120, alvo: null, troca: 0, vis: { x: 480, y: this.START_Y }, erro: { x: 0, y: 0 }, erroAlvo: { x: 0, y: 0 }, erroT: 0, trava: 0, travaMax: U.rand(...this.TRAVA), recarga: 0, hesita: 0, escondidoT: 0, flash: null, tiros: 0 };
    d.cam = this.START_Y - 120;
  },

  // ---------- regras ----------
  // atrás de uma cobertura (do lado da largada, com ela entre o fugitivo e a torre): abaixado ali some do tiro
  emCobertura(g, p) { return g.data.covers.some((cv) => Math.abs(p.x - cv.x) <= cv.w / 2 + 6 && p.y > cv.y && p.y < cv.y + cv.d / 2 + 30); },
  protegido(g, p) { return !!p.data.agachado && this.emCobertura(g, p); },
  // o fugitivo q tem o ponto (x, y) dentro da caixa?
  naCaixa(p, x, y) { const b = p.data.agachado ? this.ALVO_AGACHADO : this.ALVO_PE; return Math.abs(x - p.x) <= b.w / 2 && Math.abs(y - p.y) <= b.h / 2; },
  // quem levaria o tiro com a mira em (x, y): o fugitivo exposto cuja caixa contém o ponto (o mais perto da torre), ou null
  alvoNoPonto(g, x, y) {
    const cand = this.ativos(g).filter((p) => !this.protegido(g, p) && this.naCaixa(p, x, y));
    cand.sort((a, b) => a.y - b.y);
    return cand[0] || null;
  },
  alvoNaMira(g) { return this.alvoNoPonto(g, g.data.at.x, g.data.at.y); },
  alvoAtual(g) { const id = g.data.at.alvo; return id === null ? null : g.players.find((p) => p.id === id) || null; },

  // tiro instantâneo (hitscan) no ponto do laser, com um pequeno espalhamento
  disparar(g) {
    const U = TN.util, d = g.data, at = d.at;
    const sx = at.x + U.rand(-this.ESPALHA, this.ESPALHA), sy = at.y + U.rand(-this.ESPALHA, this.ESPALHA);
    const alvo = this.alvoNoPonto(g, sx, sy);
    g.sfx('shoot'); g.shake(3);
    at.flash = { x: sx, y: sy, t: 0.15 }; at.tiros++;
    if (alvo) this.ferir(g, alvo);
    else g.particles(sx, sy, '#9a8a6a', 8, 110);
    at.recarga = this.RECARGA; at.trava = 0; at.travaMax = U.rand(...this.TRAVA);
    if (U.chance(0.5)) at.troca = 0;   // às vezes procura outro depois do tiro
  },
  ferir(g, p) {
    const d = g.data, pd = p.data;
    pd.vida--; pd.feridoT = g.time;
    d.sangue.push({ x: Math.round(p.x), y: Math.round(p.y) });
    if (d.sangue.length > 24) d.sangue.shift();
    g.particles(p.x, p.y, '#c22', pd.vida > 0 ? 12 : 26, 220);
    if (pd.vida > 0) { g.sfx('hurt'); g.popup('FERIDO!', p.x, p.y - 30, '#ff6060'); }
    else { pd.out = true; pd.baleado = true; g.eliminate(p, { sound: 'boom', msg: 'BALEADO!' }); }
  },
  escapar(g, p) {
    const d = g.data, pd = p.data;
    pd.out = true; pd.escapou = true; d.escapou++;
    g.addScore(p, this.ESCAPOU);
    if (!d.firstOut) { d.firstOut = true; g.addScore(p, this.PRIMEIRO, { popup: false }); g.popup('PRIMEIRO! +' + (this.ESCAPOU + this.PRIMEIRO), p.x - 60, p.y + 40, '#ff0'); }
    g.sfx('coin'); g.particles(p.x, p.y, p.color, 16, 160);
  },

  update(g, dt) {
    const U = TN.util, d = g.data, F = this.FIELD;
    if (d.over) return;
    // ---- fugitivos ----
    // (movePlayer prende em bounds.y + p.r: a borda fica 40 antes da saída para dar para cruzá-la)
    const bounds = { x: F.x0, y: this.WALL_Y - 40, w: F.x1 - F.x0, h: this.START_Y + 40 - (this.WALL_Y - 40) };
    for (const p of this.ativos(g)) {
      const pd = p.data, ox = p.x, oy = p.y;
      pd.mergulho -= dt; pd.mergCd -= dt;
      if (p.input.bPressed && pd.mergCd <= 0) {
        const l = Math.hypot(p.input.x, p.input.y);
        pd.md = l > 0.2 ? { x: p.input.x / l, y: p.input.y / l } : { x: 0, y: -1 };
        pd.mergulho = this.MERGULHO; pd.mergCd = this.MERGULHO_CD; g.sfx('whoosh');
        if (d.at.alvo === p.id) d.at.trava = 0;   // o mergulho tira o alvo da mira
      }
      pd.agachado = pd.mergulho > 0 || !!p.input.b;
      const v = this.RUN_SPEED * (pd.vida < this.VIDA ? this.FERIDO : 1);
      if (pd.mergulho > 0) { const save = p.input; p.input = { x: pd.md.x, y: pd.md.y }; g.movePlayer(p, this.MERGULHO_V * (pd.vida < this.VIDA ? this.FERIDO : 1), dt, bounds); p.input = save; }
      else g.movePlayer(p, pd.agachado ? v * this.AGACHADO : v, dt, bounds);
      this.foraDasCoberturas(g, p, ox, oy);
      if (p.y <= this.WALL_Y) this.escapar(g, p);
    }
    U.separate(this.ativos(g));
    for (const p of this.ativos(g)) this.foraDasCoberturas(g, p);   // o separate não pode empurrar ninguém para dentro de uma caixa
    // velocidade (suavizada) de cada um: o atirador usa para adiantar a mira
    for (const p of g.players) {
      const pd = p.data;
      if (pd.px !== undefined) { const k = Math.min(1, dt * 8); pd.vx += ((p.x - pd.px) / dt - pd.vx) * k; pd.vy += ((p.y - pd.py) / dt - pd.vy) * k; }
      pd.px = p.x; pd.py = p.y;
    }
    // ---- atirador ----
    this.atirador(g, dt);
    if (d.at.flash) { d.at.flash.t -= dt; if (d.at.flash.t <= 0) d.at.flash = null; }
    // ---- câmera: acompanha o grupo (sem deixar o último para trás) ----
    const at = this.ativos(g);
    if (at.length) {
      let tras = -Infinity, frente = Infinity;
      for (const p of at) { tras = Math.max(tras, p.y); frente = Math.min(frente, p.y); }
      const alvo = U.clamp(Math.max((tras + frente) / 2, tras - 180), this.WALL_Y + 220, this.START_Y - 120);
      d.cam += (alvo - d.cam) * Math.min(1, dt * 1.6);
    }
    if (at.length === 0 || g.time >= this.MAX_TIME) { d.over = true; g.finish(1.5); }
  },

  // o atirador da torre: escolhe um alvo, segue com atraso e erro, trava e atira
  atirador(g, dt) {
    const U = TN.util, d = g.data, at = d.at;
    at.recarga -= dt; at.hesita -= dt; at.troca -= dt; at.erroT -= dt;
    // erro que deriva devagar (mão do atirador)
    if (at.erroT <= 0) { at.erroAlvo = { x: U.rand(-this.ERRO, this.ERRO), y: U.rand(-this.ERRO, this.ERRO) }; at.erroT = U.rand(0.5, 1.2); }
    const ke = Math.min(1, dt * 3);
    at.erro.x += (at.erroAlvo.x - at.erro.x) * ke; at.erro.y += (at.erroAlvo.y - at.erro.y) * ke;
    let mx, my;
    if (g.time < this.INICIO) {
      // ainda acordando: o laser varre a largada à toa
      mx = 480 + Math.sin(g.time * 1.4) * 220; my = this.START_Y - 140 + Math.cos(g.time * 0.9) * 60;
      at.trava = 0;
    } else {
      let t = this.alvoAtual(g);
      if (t && (!t.alive || t.data.out)) t = null;
      at.escondidoT = t && this.protegido(g, t) ? at.escondidoT + dt : 0;
      if (!t || at.troca <= 0 || at.escondidoT > 0.7) {
        // prefere quem está exposto e mais adiantado, com um pouco de acaso
        let melhor = null, nota = -Infinity;
        for (const q of this.ativos(g)) {
          const n = (this.START_Y - q.y) / 600 + U.rand(0, 0.8) - (this.protegido(g, q) ? 2 : 0) - (t && q.id === t.id ? 0.3 : 0) + (q.data.vida < this.VIDA ? 0.2 : 0);
          if (n > nota) { nota = n; melhor = q; }
        }
        if (melhor && (!t || melhor.id !== t.id)) { at.hesita = U.rand(0.25, 0.7); at.trava = 0; at.vis = { x: at.x, y: at.y }; }
        t = melhor; at.alvo = t ? t.id : null; at.troca = U.rand(2.5, 5); at.escondidoT = 0;
      }
      if (!t) { mx = at.x; my = at.y; }
      else {
        // o que ele enxerga chega com atraso; adianta só uma parte do movimento
        const k = 1 - Math.exp(-dt / this.LAG);
        at.vis.x += (t.x - at.vis.x) * k; at.vis.y += (t.y - at.vis.y) * k;
        mx = at.vis.x + t.data.vx * this.LEAD + at.erro.x; my = at.vis.y + t.data.vy * this.LEAD + at.erro.y;
      }
      // trava: o laser em cima do alvo exposto; sai de cima e a trava escorre
      if (t && !this.protegido(g, t) && this.naCaixa(t, at.x, at.y)) at.trava += dt;
      else at.trava = Math.max(0, at.trava - dt * 2);
      if (at.trava >= at.travaMax && at.recarga <= 0 && at.hesita <= 0) this.disparar(g);
    }
    // o laser anda suave até o ponto desejado (parado enquanto hesita)
    if (at.hesita <= 0 || g.time < this.INICIO) {
      const dx = mx - at.x, dy = my - at.y, dd = Math.hypot(dx, dy), passo = this.MIRA_V * dt;
      if (dd <= passo) { at.x = mx; at.y = my; } else { at.x += dx / dd * passo; at.y += dy / dd * passo; }
    }
    at.x = U.clamp(at.x, this.FIELD.x0 - 20, this.FIELD.x1 + 20);
    at.y = U.clamp(at.y, this.WALL_Y - 20, this.START_Y + 60);
  },

  // não atravessa a pegada das coberturas: volta para a posição anterior (ox, oy) no eixo que entrou;
  // sem posição anterior (depois do separate), sai pelo lado mais perto
  foraDasCoberturas(g, p, ox, oy) {
    const U = TN.util, R = 12;
    for (const cv of g.data.covers) {
      const r = { x: cv.x - cv.w / 2, y: cv.y - cv.d / 2, w: cv.w, h: cv.d };
      if (!U.circleRect(p, r, R)) continue;
      if (ox !== undefined) {
        if (!U.circleRect({ x: ox, y: p.y }, r, R)) { p.x = ox; continue; }
        if (!U.circleRect({ x: p.x, y: oy }, r, R)) { p.y = oy; continue; }
        p.x = ox; p.y = oy; continue;
      }
      const dl = p.x - (r.x - R), dr = (r.x + r.w + R) - p.x, dt = p.y - (r.y - R), db = (r.y + r.h + R) - p.y, m = Math.min(dl, dr, dt, db);
      if (m === dl) p.x = r.x - R; else if (m === dr) p.x = r.x + r.w + R; else if (m === dt) p.y = r.y - R; else p.y = r.y + r.h + R;
    }
  },

  // ---------- bot (fugitivo) ----------
  // corre de cobertura em cobertura até a saída; quando o laser para em cima dele e a trava avança, reage
  // (nem sempre a tempo): se esconde se há cobertura logo à frente, mergulha de lado ou muda de direção
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, F = this.FIELD, at = d.at;
    if (!p.alive || pd.out) return { x: 0, y: 0 };
    if (pd.bReacao === undefined) { pd.bReacao = U.rand(0.25, 0.65); pd.bFalha = U.rand(0.15, 0.35); }
    pd.bEspera = (pd.bEspera || 0) - dt;
    const mirado = g.time >= this.INICIO && at.alvo === p.id && U.dist(at.x, at.y, p.x, p.y) < 40;
    const frac = at.trava / at.travaMax;
    if (!mirado || frac < 0.1) pd.bDecidiu = false;
    // escondido atrás de uma cobertura: espera (mais, se a mira está em cima)
    // (a paciência acaba: depois de 2 a 4 s escondido ele sai mesmo com a mira por perto)
    if (pd.bEspera > 0) {
      pd.bEscondido = (pd.bEscondido || 0) + dt;
      if (mirado && this.protegido(g, p) && pd.bEscondido < (pd.bPaciencia || 3)) pd.bEspera = Math.max(pd.bEspera, 0.3);
      return { x: 0, y: 0, b: true };
    }
    if (pd.bEscondido) { pd.bEscondido = 0; pd.bPaciencia = U.rand(2, 4); }
    // perigo: decide uma vez por travada
    if (mirado && frac > pd.bReacao && !pd.bDecidiu) {
      pd.bDecidiu = true;
      if (!U.chance(pd.bFalha)) {
        const perto = d.covers.find((cv) => cv.y < p.y && p.y - cv.y < 90 && Math.abs(cv.x - p.x) < cv.w / 2 + 30);
        const lado = p.x > (F.x0 + F.x1) / 2 ? -1 : 1;
        if (perto) pd.bAlvo = { x: U.clamp(p.x, perto.x - perto.w * 0.3, perto.x + perto.w * 0.3), y: perto.y + perto.d / 2 + 14, cv: true };
        else if (pd.mergCd <= 0 && U.chance(0.6)) return { x: lado * (U.chance(0.75) ? 1 : -1), y: -0.4, b: true };
        else pd.bDesvio = { x: lado * (U.chance(0.7) ? 1 : -1), t: U.rand(0.3, 0.55) };
      }
    }
    if (pd.bDesvio && pd.bDesvio.t > 0) { pd.bDesvio.t -= dt; return { x: pd.bDesvio.x, y: -0.35, b: false }; }
    if (!pd.bAlvo) {
      const prox = d.covers.filter((cv) => cv.y < p.y - 60 && cv.y > p.y - 360 && Math.abs(cv.x - p.x) < 240);
      if (prox.length && U.chance(0.8)) {
        const cv = U.pick(prox);
        pd.bAlvo = { x: cv.x + U.rand(-cv.w * 0.3, cv.w * 0.3), y: cv.y + cv.d / 2 + 14, cv: true };
      } else pd.bAlvo = { x: U.clamp(p.x + U.rand(-120, 120), F.x0 + 20, F.x1 - 20), y: Math.max(this.WALL_Y - 5, p.y - U.rand(150, 300)) };
      pd.bAlvoT = 0;
    }
    const a = pd.bAlvo;
    pd.bAlvoT += dt;
    if (pd.bAlvoT > 4) { pd.bAlvo = null; return { x: 0, y: -1 }; }   // não chegou em 4 s: desiste
    let tx = a.x, ty = a.y;
    // uma cobertura no caminho (logo à frente): contorna pela lateral mais perto
    const bloq = d.covers.find((cv) => cv.y < p.y && p.y - cv.y < cv.d / 2 + 40 && Math.abs(p.x - cv.x) < cv.w / 2 + 16 && ty < cv.y - 10);
    if (bloq) { tx = bloq.x + (p.x >= bloq.x ? 1 : -1) * (bloq.w / 2 + 26); ty = p.y - 10; }
    const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
    if (!bloq && dd < 14) {
      pd.bAlvo = null;
      if (a.cv) { pd.bEspera = U.rand(0.3, 1.3); return { x: 0, y: 0, b: true }; }
      return { x: 0, y: -1 };
    }
    // zigue-zague leve no aberto
    if (!pd.bZig || U.chance(0.04)) pd.bZig = U.rand(-0.6, 0.6);
    const n = U.norm(dx, dy);
    return { x: n.x + (dd > 60 && !a.cv ? pd.bZig : 0), y: n.y, b: false };
  },

  // ---------- câmera que acompanha o grupo ----------
  cameraDe(g) {
    const z = g.data.cam === undefined ? this.START_Y - 120 : g.data.cam;
    return { pos: [480, 340, z + 560], target: [480, 0, z - 300], fov: 46 };
  },
  camera: { pos: [480, 340, 2320], target: [480, 0, 1460], fov: 46 },
  env: { bg: '#05060a', fog: [1500, 3400], ambient: 0.42, sun: 0.7, sunDir: [0.3, 1, 0.5], sunColor: '#9fb4ff', hemiSky: '#55648c', hemiGround: '#1a140c' },

  // ruído determinístico para o cenário (o draw não pode sortear)
  hash(i) { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); },

  // vala de escoamento atrás do muro da cadeia (a trincheira do Duck Hunt): fundo de terra com mato e
  // valeta d'água, paredões de pedra em degraus dos dois lados, cerca e holofotes na borda, o trilho do
  // vagão de presos cruzando no meio, manilhas caídas e pilares quebrados pelo caminho, o buraco no muro
  // da cadeia na largada e a cabeceira de concreto do bueiro no fundo (a saída), com a torre atrás
  drawVala3d(g, r) {
    const F = this.FIELD, SY = this.START_Y, WY = this.WALL_Y, H = (i) => this.hash(i), RY = this.RAIL_Y;
    const z0 = WY - 80, z1 = SY + 260, cx = (F.x0 + F.x1) / 2, cam = g.data.cam === undefined ? SY : g.data.cam;
    r.plane(cx, -1.5, (z0 + z1) / 2, 2000, z1 - z0 + 1400, '#262c1f', { tex: 'concreto' });
    r.plane(cx, -0.6, (WY + SY) / 2 + 60, F.x1 - F.x0 + 60, SY - WY + 360, '#323a26', { tex: 'concreto' });
    r.plane(cx + 70, -0.3, (WY + SY) / 2 + 100, 26, SY - WY + 420, '#0f1719', { tex: false, metal: 0.4, rough: 0.2 });   // valeta
    // mato e pedrinhas (enfeite, rente ao chão)
    for (let i = 0; i < 180; i++) {
      const x = F.x0 - 20 + H(i) * (F.x1 - F.x0 + 40), z = WY + 20 + H(i + 300) * (SY - WY + 200);
      if (Math.abs(z - RY) < 30) continue;
      if (i % 3) r.cone(x, 0, z, 4 + H(i + 50) * 4, 8 + H(i + 90) * 12, i % 2 ? '#5d6838' : '#76733f', { tex: false, shadow: false });
      else r.box(x, 0, z, 7 + H(i + 7) * 8, 4, 6 + H(i + 8) * 6, '#77766d', { rotY: H(i + 9) * 3 });
    }
    // paredões de pedra em três degraus (deixam um corte para o trilho passar)
    const PEDRA = ['#4a4741', '#3d3a35', '#45403a'];
    for (const s of [-1, 1]) {
      const edge = s < 0 ? F.x0 - 34 : F.x1 + 34;
      for (let k = 0, z = z0; z < z1; k++, z += 92) {
        if (Math.abs(z - RY) < 70) continue;
        for (let t = 0; t < 3; t++) {
          const h = H(k * 7 + t + (s > 0 ? 500 : 0));
          r.box(edge + s * (30 + t * 58 + h * 12), 0, z, 72, 80 + t * 85 + h * 45, 100, PEDRA[t], { rotY: (h - 0.5) * 0.35, tex: 'concreto', rough: 1 });
        }
        if (k % 2 === 0) r.cone(edge + s * 32, 0, z + 30, 10, 26, '#5d6838', { tex: false, shadow: false });
      }
      // cerca de arame na borda de cima e holofotes de vapor de sódio virados para a vala
      const fx = edge + s * 190, fy = 250;
      for (let z = z0; z < z1; z += 120) r.box(fx, fy, z, 4, 70, 4, '#3a3b38', { metal: 0.5 });
      for (const hy of [fy + 30, fy + 64]) r.beam(fx, hy, z0, fx, hy, z1, 1.2, '#6c6f72', { metal: 0.7, shadow: false });
      for (let z = 250; z < SY; z += 360) {
        r.box(fx - s * 6, fy, z, 6, 90, 6, '#33342f', { metal: 0.5 });
        r.box(fx - s * 14, fy + 86, z, 18, 12, 22, '#2a2d30', { metal: 0.5 });
        r.box(fx - s * 24, fy + 88, z, 2, 8, 16, '#ffe2b0', { glow: true });
      }
    }
    // luz dos holofotes da borda: só os dois mais perto da câmera acendem (luzes de cenário)
    for (let z = 250; z < SY; z += 360) if (Math.abs(z - (cam + 80)) < 300) r.light(z % 720 < 360 ? F.x0 + 40 : F.x1 - 40, 180, z, '#ffd9a8', 0.8, 600, { fundo: true });
    // trilho atravessando (dormentes e dois trilhos) e os vagões de presos parados nos cortes
    for (let x = F.x0 - 300; x <= F.x1 + 300; x += 34) r.box(x, 0, RY, 12, 3, 64, '#3b2d22', { tex: 'madeira' });
    for (const dz of [-18, 18]) r.beam(F.x0 - 320, 5, RY + dz, F.x1 + 320, 5, RY + dz, 4, '#6e6a64', { metal: 0.8, shadow: false });
    for (const s of [-1, 1]) {
      const wx = s < 0 ? F.x0 - 170 : F.x1 + 170;
      r.box(wx, 14, RY, 230, 12, 76, '#3a3330', { metal: 0.5 });
      for (const dx of [-80, 80]) for (const dz of [-24, 24]) r.tube(wx + dx, 12, RY + dz - 4, wx + dx, 12, RY + dz + 4, 12, '#222', { metal: 0.6 });
      if (s < 0) for (const [dx, dy, w] of [[40, 26, 36], [76, 26, 36], [58, 58, 30]]) r.box(wx + dx, dy, RY + (dy > 30 ? 0 : 6), w, 32, 34, '#5d6266', { metal: 0.5 });
      else for (const dz of [-20, 0, 20]) r.tube(wx - 100, 36 + (dz === 0 ? 18 : 0), RY + dz, wx + 60, 36 + (dz === 0 ? 18 : 0), RY + dz, 10, '#6f6b63', { metal: 0.3 });
    }
    // manilhas de concreto caídas e pilares quebrados nas margens, ao longo da vala
    for (const [lado, z] of [[-1, SY - 120], [1, SY - 560], [-1, 1250], [1, 700], [-1, 420]]) {
      const x = lado < 0 ? F.x0 - 46 : F.x1 + 46;
      r.tube(x - lado * 0, 32, z - 56, x + lado * 24, 32, z + 56, 32, '#6f6d66', { tex: 'concreto' });
      r.tube(x + lado * 21, 32, z + 50, x + lado * 25, 32, z + 58, 25, '#141413', { tex: false });
    }
    for (const [lado, z] of [[1, SY - 70], [-1, SY - 900], [1, 360]]) {
      for (let i = 0; i < 4; i++) r.box((lado < 0 ? F.x0 - 44 : F.x1 + 44) + (i % 2) * 4, i * 46, z, 52 - i * 4, 46, 52 - i * 4, i % 2 ? '#4c4a44' : '#55524b', { rotY: 0.15 * i, tex: 'concreto' });
    }
    // largada: o que sobrou do muro da cadeia, derrubado (baixo, para não tapar a câmera)
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) r.box(cx + s * (150 + i * 90), 0, SY + 90 + H(i + (s > 0 ? 860 : 870)) * 20, 92, 26 + H(i + 880 + s) * 40, 36, '#5b5852', { tex: 'tijolo', rotY: (H(i + 890) - 0.5) * 0.3 });
    for (let i = 0; i < 6; i++) r.box(cx - 100 + i * 40 + H(i + 800) * 12, 0, SY + 60 + H(i + 810) * 30, 22 + H(i + 820) * 14, 10 + H(i + 830) * 10, 18, '#6a665e', { rotY: H(i + 840) * 3 });
    // cabeceira do bueiro no fundo: muro de concreto com pilastras, boca gradeada (a saída) e seta pintada
    const BW = F.x1 - F.x0 + 520;
    r.box(cx, 0, WY - 46, BW, 210, 52, '#66655f', { tex: 'concreto', rough: 0.95 });
    r.box(cx, 210, WY - 46, BW + 10, 12, 60, '#55544e', { tex: 'concreto' });
    for (const dx of [-1, 1]) for (const k of [90, 240]) r.box(cx + dx * k, 0, WY - 16, 26, 222, 14, '#5c5b55', { tex: 'concreto' });
    r.box(cx, 0, WY - 19, 150, 104, 4, '#040505', { tex: false });
    r.box(cx, 104, WY - 16, 170, 12, 10, '#55544e', { tex: 'concreto' });
    for (let i = 0; i < 7; i++) {
      const bx = cx - 66 + i * 22;
      if (i === 3 || i === 4) r.tube(bx, 104, WY - 15, bx + (i === 3 ? -14 : 14), 30, WY + 6, 2.2, '#4a4844', { metal: 0.6 });   // barras arrancadas
      else r.tube(bx, 0, WY - 15, bx, 104, WY - 15, 2.2, '#4a4844', { metal: 0.6 });
    }
    r.box(cx, 140, WY - 19, 44, 30, 4, '#0b0d0e', { tex: false });   // janelinha
    r.box(cx, 178, WY - 18, 6, 20, 2, '#d8d4c4', { tex: false });   // seta pintada para baixo
    for (const s of [-1, 1]) r.box(cx + s * 5, 172, WY - 18, 14, 4, 2, '#d8d4c4', { tex: false, rotZ: s * 0.8 });
    for (let i = 0; i < 9; i++) r.cone(cx - 520 + i * 130 + H(i + 40) * 40, 0, WY - 260 - H(i + 60) * 120, 50, 260 + H(i + 70) * 120, '#121811', { tex: false, shadow: false });
  },

  draw3d(g, r) {
    const d = g.data, F = this.FIELD, SY = this.START_Y, WY = this.WALL_Y, at = d.at, T = this.TORRE;
    const cam = this.cameraDe(g); r.camera(cam.pos, cam.target, cam.fov);
    this.drawVala3d(g, r);
    r.plane(480, 0.5, WY, F.x1 - F.x0 + 80, 6, '#4dff7a', { glow: true, opacity: 0.5 });
    r.plane(480, 0.5, SY, F.x1 - F.x0 + 80, 6, '#d8d8d8', { opacity: 0.6 });
    // holofotes em cima da cabeceira
    for (const x of [F.x0 + 10, F.x1 - 10]) { r.box(x, 222, WY - 30, 16, 10, 12, '#2a2d30', { metal: 0.5 }); r.box(x, 220, WY - 23, 12, 4, 2, '#ffe2b0', { glow: true }); }
    r.light(480, 200, WY + 60, '#ffd9a8', 1.0, 700);
    // a torre atrás do bueiro, com o atirador da casa lá em cima
    for (const [ox, oz] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) r.beam(T.x + ox * 2, 0, T.z + oz * 2, T.x + ox, T.h, T.z + oz, 6, '#5a4128');
    r.box(T.x, T.h, T.z, 70, 6, 70, '#6b4d2e');
    r.box(T.x, T.h + 70, T.z, 80, 8, 80, '#3d2e1e');                                           // telhadinho
    for (const [ox, oz] of [[-34, -34], [34, -34], [-34, 34], [34, 34]]) r.box(T.x + ox, T.h, T.z + oz, 4, 70, 4, '#3d2e1e');
    r.box(T.x, T.h + 6, T.z + 34, 70, 24, 3, '#4a3826');                                       // parapeito
    const mira = Math.atan2(at.y - T.z, at.x - T.x);
    r.character({ id: 'atirador', x: T.x, y: T.z, alive: true, color: '#3b4a5c', label: false }, { key: 'atirador', y: T.h + 6, dir: mira, pose: 'aim', label: false, number: 0 });
    for (const cv of d.covers) this.drawCobertura3d(r, cv);
    for (const s of d.sangue) r.disc(s.x, 0.7, s.y, 9, '#5a0c0c', { opacity: 0.8 });
    // laser contínuo: feixe vermelho da luneta até o chão, ponto e anel da trava
    const bx = T.x + Math.cos(mira) * 20, bz = T.z + Math.sin(mira) * 20, by = T.h + 52;
    r.beam(bx, by, bz, at.x, 2, at.y, 2.5, '#ff2020', { glow: true, opacity: 0.55 });
    r.sphere(at.x, 2, at.y, 4, '#ff2020', { glow: true });
    const frac = Math.min(1, at.trava / at.travaMax);
    if (frac > 0.05) r.ring(at.x, 1, at.y, 14, 18, '#ff2020', { glow: true, arc: Math.round(frac * 20) / 20 });
    r.light(at.x, 20, at.y, '#ff2020', 0.8, 160);
    if (at.flash) {
      r.beam(bx, by, bz, at.flash.x, 4, at.flash.y, 3.5, '#ffc8a0', { glow: true });
      r.light(bx, by, bz, '#ffe0a0', 2, 500);
    }
    for (const p of g.players) {
      if (p.data.escapou) continue;   // quem escapou já entrou no bueiro
      const pd = p.data;
      r.character(p, { pose: !p.alive ? 'dead' : g.time - pd.feridoT < 0.4 ? 'hit' : pd.agachado ? 'crouch' : 'auto', lean: pd.vida < this.VIDA && p.alive ? -0.15 : 0 });
    }
  },

  drawCobertura3d(r, cv) {
    if (cv.kind === 'caixote') {
      r.box(cv.x, 0, cv.y, cv.w, cv.h / 2, cv.d, '#8a6438', { rough: 0.9, tex: 'madeira' });
      r.box(cv.x + 4, cv.h / 2, cv.y + 2, cv.w * 0.8, cv.h / 2, cv.d * 0.8, '#94703f', { rough: 0.9, tex: 'madeira', rotY: 0.2 });
      for (const sx of [-1, 1]) r.box(cv.x + sx * cv.w * 0.3, 0, cv.y, 3, cv.h / 2 + 0.5, cv.d + 1, '#4a3420', { shadow: false });
    } else if (cv.kind === 'barril') {
      r.cyl(cv.x, 0, cv.y, cv.w / 2, cv.h, '#3b5a8a', { metal: 0.5, rough: 0.5 });
      for (const hy of [cv.h * 0.2, cv.h * 0.75]) r.cyl(cv.x, hy, cv.y, cv.w / 2 + 1, 3, '#2a2e35', { metal: 0.8 });
      r.cyl(cv.x + 10, cv.h, cv.y + 4, 4, 2, '#1a1d22', { metal: 0.8 });
    } else {
      r.cone(cv.x, 0, cv.y, cv.w / 2, cv.h, '#5a4330', { rough: 1 });
      r.cone(cv.x - cv.w * 0.22, 0, cv.y - 8, cv.w * 0.28, cv.h * 0.6, '#4e3a2a', { rough: 1 });
      r.cone(cv.x + cv.w * 0.25, 0, cv.y + 6, cv.w * 0.24, cv.h * 0.5, '#63493a', { rough: 1 });
      // sacos de areia na crista (as trincheiras de sacos do original)
      for (let i = 0; i < 3; i++) r.box(cv.x + (i - 1) * 26, cv.h * 0.45, cv.y - 10, 26, 12, 18, '#7d7056', { tex: 'tecido', rotY: (i - 1) * 0.15 });
    }
  },

  // ---------- HUD por cima ----------
  // régua da fuga: largada à esquerda, bueiro à direita; um ponto por fugitivo e o laser
  drawRegua(g, c, x0, x1, y) {
    const D = TN.draw, d = g.data, L = this.START_Y - this.WALL_Y, X = (wy) => x0 + (this.START_Y - wy) / L * (x1 - x0);
    c.fillStyle = 'rgba(8,10,13,0.75)'; c.fillRect(x0 - 70, y - 14, x1 - x0 + 150, 28);
    c.fillStyle = '#556'; c.fillRect(x0, y - 1, x1 - x0, 3);
    c.fillStyle = '#4dff7a'; c.fillRect(x1 - 2, y - 8, 4, 16);
    D.text(c, 'LARGADA', x0 - 10, y + 4, { size: 10, color: '#9aa', align: 'right' });
    D.text(c, 'SAÍDA', x1 + 10, y + 4, { size: 10, color: '#4dff7a' });
    c.fillStyle = '#ff2020'; c.fillRect(X(TN.util.clamp(d.at.y, this.WALL_Y, this.START_Y)) - 1, y - 9, 2, 18);
    for (const p of g.players) {
      const px = p.data.escapou ? x1 : X(TN.util.clamp(p.y, this.WALL_Y, this.START_Y));
      c.fillStyle = p.alive ? p.color : '#444'; c.beginPath(); c.arc(px, y, 5, 0, Math.PI * 2); c.fill();
    }
  },
  // vida de cada um: corações na faixa de baixo
  drawVidas(g, c, y) {
    const D = TN.draw;
    g.players.forEach((p, i) => {
      const pd = p.data, x = 20 + i * 150;
      const st = pd.escapou ? 'FORA!' : !p.alive ? 'BALEADO' : '♥'.repeat(pd.vida) + '♡'.repeat(this.VIDA - pd.vida);
      D.text(c, `${p.label}`, x, y, { size: 12, color: p.color, maxWidth: 80 });
      D.text(c, st, x + 84, y, { size: 12, color: pd.escapou ? '#4dff7a' : !p.alive ? '#888' : '#ff5a5a' });
    });
  },
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw;
    // régua no alto (embaixo ficam os fugitivos de trás), vidas e dica rentes ao pé da tela
    this.drawRegua(g, c, 150, 730, 54);
    this.drawVidas(g, c, g.H - 10);
    if (g.time < this.INICIO) D.text(c, 'CORRAM! A TORRE ESTÁ ACORDANDO', g.W / 2, 96, { size: 20, color: '#ffd23f', align: 'center' });
    else D.text(c, 'EXTRA = MERGULHAR · SEGURAR ATRÁS DE ALGO = SUMIR', g.W / 2, 84, { size: 11, color: '#9aa', align: 'center' });
    const left = Math.max(0, this.MAX_TIME - g.time);
    D.text(c, TN.util.formatTime(left), g.W - 16, 60, { size: 18, color: left < 10 ? '#f55' : '#ddd', align: 'right' });
  },

  // ---------- 2D (alternativa sem WebGL): a vala vista de cima, deitada (largada à esquerda) ----------
  draw(g, c) {
    const d = g.data, F = this.FIELD, at = d.at;
    const y0 = this.WALL_Y - 40, y1 = this.START_Y + 60, k = 880 / (y1 - y0);
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    c.save();
    // mundo (x, y) → tela (40 + (y1 - y)·k, 250 + (x - 480)·k)
    c.transform(0, k, -k, 0, 40 + y1 * k, 250 - 480 * k);
    c.fillStyle = '#4a4638'; c.fillRect(F.x0 - 40, y0, F.x1 - F.x0 + 80, y1 - y0);
    c.fillStyle = '#5a5a56'; c.fillRect(F.x0 - 40, y0, F.x1 - F.x0 + 80, 30);           // cabeceira do bueiro
    c.fillStyle = 'rgba(80,255,120,0.35)'; c.fillRect(F.x0 - 40, this.WALL_Y - 3, F.x1 - F.x0 + 80, 6);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(F.x0 - 40, this.START_Y - 3, F.x1 - F.x0 + 80, 6);
    for (const cv of d.covers) {
      c.fillStyle = cv.kind === 'caixote' ? '#8a6438' : cv.kind === 'barril' ? '#3b5a8a' : '#5a4330';
      c.fillRect(cv.x - cv.w / 2, cv.y - cv.d / 2, cv.w, cv.d);
    }
    for (const p of g.players) if (!p.data.escapou) g.drawPlayer(c, p);
    c.strokeStyle = 'rgba(255,32,32,0.6)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(this.TORRE.x, this.TORRE.z); c.lineTo(at.x, at.y); c.stroke();
    c.fillStyle = '#ff2020'; c.beginPath(); c.arc(at.x, at.y, 7, 0, Math.PI * 2); c.fill();
    c.restore();
    this.drawVidas(g, c, g.H - 20);
    TN.draw.text(c, 'ATIRADOR NA TORRE →', g.W - 20, 70, { size: 12, color: '#f66', align: 'right' });
    TN.draw.text(c, TN.util.formatTime(Math.max(0, this.MAX_TIME - g.time)), g.W - 16, g.H - 44, { size: 18, color: '#ddd', align: 'right' });
  },
});
