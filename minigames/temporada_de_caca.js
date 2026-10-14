// TEMPORADA DE CAÇA — inspirado em "DUCK HUNT" (duck_hunt) de Machine Party.
// Assimétrico: a cada rodada um jogador é o CAÇADOR (mira com as direções e atira) e os outros são os PATOS,
// que atravessam o campo da esquerda para a saída à direita, se escondendo atrás de fardos, arbustos e caixas.
// Tiro na cabeça mata na hora; no corpo fere (2 de vida, ferido fica mais lento).
TN.registerMinigame({
  id: 'temporada_de_caca',
  title: 'TEMPORADA DE CAÇA',
  inspiredBy: 'Duck Hunt (duck_hunt)',
  tagline: 'TEM UMA BALA COM SEU NOME.',
  brief: ['Patos: cheguem à saída à direita.', 'Caçador: mire e atire.', 'Tiro no corpo dá para aguentar.', 'Tiro na cabeça, não.'],
  controls: { move: 'andar / mirar', a: 'atirar (caçador)', b: 'agachar (pato) / zoom (caçador)' },
  icon: '⌖',
  color: '#ff8c3a',
  rounds: 4,                 // cada rodada tem um caçador diferente
  fixedRounds: true,         // ignora o ajuste "rodadas por jogo" do lobby
  MAX_TIME: 45,              // segurança: depois disso a rodada acaba (patos que não saíram não pontuam)
  scoring: 'points',
  endWhenOneLeft: false,

  // ---- constantes (originais: vel. 4, agachado −25%, ferido ×0,75, pente {1:7,2:8,3:10}, ferrolho ~0,9 s, recarga 2,85 s) ----
  RUN_SPEED: 108, CROUCH_MULT: 0.75, HURT_MULT: 0.75, HP: 2,
  AIM_SPEED: 430, ZOOM_SPEED: 165, SPREAD: 9, ZOOM_SPREAD: 2,
  BOLT: 0.9, RELOAD: 2.85, AIM_LOCK: 3, MAG: { 1: 7, 2: 8, 3: 10 },
  FIELD: { x0: 50, x1: 920, y0: 215, y1: 505 }, EXIT_X: 892, HORIZON: 178,

  // o caçador é guardado pelo id (estado serializável); cada rodada é a vez de um jogador
  hunterOf(g) { return g.players[(g.round - 1) % g.playerCount]; },
  hunter(g) { return g.players.find((p) => p.id === g.data.hunterId); },
  runners(g) { return g.players.filter((p) => p.id !== g.data.hunterId); },
  active(g) { return this.runners(g).filter((p) => p.alive && !p.data.out); },

  init(g) {
    const U = TN.util, d = g.data, F = this.FIELD;
    d.hunterId = this.hunterOf(g).id;
    const hunter = this.hunter(g);
    const runners = this.runners(g);
    d.mag = this.MAG[Math.min(3, Math.max(1, runners.length))];
    d.ammo = d.mag; d.bolt = 0; d.reload = 0;
    d.cross = { x: g.W / 2, y: 330 }; d.zoom = false;
    d.firstOut = false; d.over = false;
    d.impacts = [];
    // coberturas: 6 colunas com 2 coberturas cada, posições sorteadas
    d.covers = [];
    for (let col = 0; col < 6; col++) {
      const x = 205 + col * 122 + U.rand(-22, 22);
      for (const [y0, y1] of [[262, 352], [400, 492]]) {
        const tall = U.chance(0.25);
        const kind = tall ? 'caixas' : U.pick(['feno', 'arbusto', 'feno', 'tronco']);
        d.covers.push({ kind, x: x + U.rand(-14, 14), y: U.rand(y0, y1), w: tall ? 52 : kind === 'tronco' ? 84 : 72, h: tall ? 88 : kind === 'tronco' ? 48 : 52, seed: Math.random() * 10 });
      }
    }
    // patos na largada (esquerda), caçador = posição da mira (para os "+1" aparecerem lá)
    runners.forEach((p, i) => {
      p.x = 78; p.y = F.y0 + 30 + ((F.y1 - F.y0 - 60) * (i + 0.5)) / runners.length; p.dir = 0;
      p.data = { hp: this.HP, crouch: false, out: false, shot: false, step: 0 };
    });
    hunter.data = { hunter: true };
    hunter.x = d.cross.x; hunter.y = d.cross.y;
  },

  // ---------- geometria ----------
  scale(y) { return 0.78 + 0.34 * (y - this.FIELD.y0) / (this.FIELD.y1 - this.FIELD.y0); },
  // corpo e cabeça do pato (pés em p.x, p.y)
  geom(p) {
    const s = this.scale(p.y), bh = (p.data.crouch ? 15 : 32) * s, bw = 22 * s, hr = 8 * s;
    return { s, bx: p.x - bw / 2, by: p.y - bh, bw, bh, hx: p.x, hy: p.y - bh - hr * 0.8, hr };
  },
  coverRect(cv) { return { x: cv.x - cv.w / 2, y: cv.y - cv.h, w: cv.w, h: cv.h }; },
  // o que o tiro acerta no ponto (qx, qy): testa da frente (y maior) para trás
  hitTest(g, qx, qy) {
    const U = TN.util;
    const things = [...g.data.covers.map((cv) => ({ cv, y: cv.y })), ...this.active(g).map((p) => ({ p, y: p.y }))].sort((a, b) => b.y - a.y);
    for (const t of things) {
      if (t.cv) { if (U.inRect(qx, qy, this.coverRect(t.cv))) return { cover: t.cv }; continue; }
      const gm = this.geom(t.p);
      if (U.dist(qx, qy, gm.hx, gm.hy) <= gm.hr + 1.5) return { p: t.p, head: true };
      if (U.inRect(qx, qy, { x: gm.bx, y: gm.by, w: gm.bw, h: gm.bh })) return { p: t.p, head: false };
    }
    return null;
  },

  fire(g) {
    const U = TN.util, d = g.data, h = this.hunter(g);
    const sp = d.zoom ? this.ZOOM_SPREAD : this.SPREAD, an = U.rand(0, Math.PI * 2), rr = U.rand(0, sp);
    const qx = d.cross.x + Math.cos(an) * rr, qy = d.cross.y + Math.sin(an) * rr;
    d.ammo--; d.bolt = this.BOLT;
    g.sfx('shoot'); g.shake(3);
    const hit = this.hitTest(g, qx, qy);
    d.impacts.push({ x: qx, y: qy, t: 0.35, hit: !!(hit && hit.p) });
    if (hit && hit.p) {
      const p = hit.p;
      p.data.shot = true;
      if (hit.head || p.data.hp <= 1) {
        g.eliminate(p, { sound: 'boom', msg: hit.head ? 'NA CABEÇA!' : 'ABATIDO!' });
        g.particles(qx, qy, '#c22', 26, 240);
        g.addScore(h, 1);
      } else {
        p.data.hp--; g.sfx('hurt');
        g.particles(qx, qy, '#c22', 12, 160);
        g.popup('FERIDO!', p.x, p.y - 70, '#f88');
      }
    } else if (hit && hit.cover) {
      g.particles(qx, qy, hit.cover.kind === 'caixas' ? '#c9a46a' : '#d9c46a', 10, 140); g.sfx('hit');
    } else {
      g.particles(qx, qy, '#9a8a6a', 6, 90);
    }
    if (d.ammo <= 0) { d.reload = this.RELOAD; g.after(0.3, () => g.sfx('step')); }
  },

  endRound(g) {
    const d = g.data;
    if (d.over) return;
    d.over = true;
    const rs = this.runners(g);
    if (rs.length && rs.every((p) => p.data.shot)) { g.addScore(this.hunter(g), 1); g.message('TODOS BALEADOS! +1 CAÇADOR', 1.8, '#ff8c3a'); }
  },

  update(g, dt) {
    const U = TN.util, d = g.data, F = this.FIELD;
    if (d.over) return;
    if (g.time >= this.MAX_TIME) { this.endRound(g); g.message('FIM DA TEMPORADA', 1.5, '#ff8c3a'); g.finish(1.2); return; }
    // ---- caçador ----
    const h = this.hunter(g);
    d.bolt -= dt;
    if (d.reload > 0) { d.reload -= dt; if (d.reload <= 0) { d.ammo = d.mag; g.sfx('pickup'); } }
    if (h.input.bPressed) { d.zoom = !d.zoom; g.sfx('select'); }
    if (g.time >= this.AIM_LOCK) {
      const sp = d.zoom ? this.ZOOM_SPEED : this.AIM_SPEED;
      d.cross.x = U.clamp(d.cross.x + h.input.x * sp * dt, 10, g.W - 10);
      d.cross.y = U.clamp(d.cross.y + h.input.y * sp * dt, 44, g.H - 10);
      if (h.input.aPressed && d.bolt <= 0 && d.reload <= 0 && d.ammo > 0) this.fire(g);
    }
    h.x = d.cross.x; h.y = d.cross.y;
    for (const im of d.impacts) im.t -= dt;
    d.impacts = d.impacts.filter((im) => im.t > 0);

    // ---- patos ----
    for (const p of this.active(g)) {
      const pd = p.data;
      pd.crouch = !!p.input.b;
      const speed = this.RUN_SPEED * (pd.crouch ? this.CROUCH_MULT : 1) * (pd.hp < this.HP ? this.HURT_MULT : 1);
      const ox = p.x, oy = p.y;
      g.movePlayer(p, speed, dt, { x: F.x0 - 16, y: F.y0 - 16, w: F.x1 - F.x0 + 32 + 40, h: F.y1 - F.y0 + 32 });
      // não atravessa a base das coberturas
      for (const cv of d.covers) {
        const r = { x: cv.x - cv.w / 2, y: cv.y - 10, w: cv.w, h: 10 };
        if (U.circleRect(p, r, 6)) {
          if (!U.circleRect({ x: ox, y: p.y }, r, 6)) p.x = ox;
          else if (!U.circleRect({ x: p.x, y: oy }, r, 6)) p.y = oy;
          else { p.x = ox; p.y = oy; }
        }
      }
      pd.step += Math.hypot(p.x - ox, p.y - oy) * 0.12;
      if (p.x >= this.EXIT_X) {
        pd.out = true;
        g.addScore(p, 1);
        if (!d.firstOut) { d.firstOut = true; g.addScore(p, 1, { popup: false }); g.popup('PRIMEIRO! +2', p.x - 40, p.y - 80, '#ff0'); }
        g.sfx('coin'); g.particles(p.x, p.y - 20, p.color, 16, 160);
      }
    }
    if (this.active(g).length === 0) { this.endRound(g); g.finish(1.6); }
  },

  // ---------- bots ----------
  bot(g, p, dt) {
    return p.id === g.data.hunterId ? this.hunterBot(g, p, dt) : this.runnerBot(g, p, dt);
  },

  hunterBot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, cr = d.cross;
    const out = { x: 0, y: 0, a: false, b: false };
    // escolhe um pato ativo aleatório de tempos em tempos
    pd.bPick = (pd.bPick || 0) - dt;
    let t = pd.bTarget;
    if (!t || !t.alive || t.data.out || pd.bPick <= 0) {
      const list = this.active(g);
      t = pd.bTarget = list.length ? U.pick(list) : null;
      pd.bPick = U.rand(1.8, 3.5);
    }
    if (!t) return out;
    // memória atrasada da posição do alvo (tempo de reação) + tremida da mão
    pd.bHist = pd.bHist || [];
    const gm = this.geom(t);
    const headVis = (() => { const hit = this.hitTest(g, gm.hx, gm.hy); return hit && hit.p === t && hit.head; })();
    const bodyVis = (() => { const hit = this.hitTest(g, gm.hx, gm.by + gm.bh * 0.5); return hit && hit.p === t; })();
    const aim = headVis || !bodyVis ? { x: gm.hx, y: gm.hy } : { x: gm.hx, y: gm.by + gm.bh * 0.5 };
    pd.bHist.push({ x: aim.x, y: aim.y });
    if (pd.bHist.length > 14) pd.bHist.shift();   // ~0,23 s de atraso
    const seen = pd.bHist[0];
    if (!pd.bJit || U.chance(0.04)) pd.bJit = { x: U.rand(-7, 7), y: U.rand(-7, 7) };
    const tx = seen.x + pd.bJit.x * (d.zoom ? 0.4 : 1), ty = seen.y + pd.bJit.y * (d.zoom ? 0.4 : 1);
    const dx = tx - cr.x, dy = ty - cr.y, dd = Math.hypot(dx, dy);
    out.x = U.clamp(dx / 30, -1, 1); out.y = U.clamp(dy / 30, -1, 1);
    // zoom perto do alvo; tira o zoom para atravessar o campo
    const wantZoom = dd < 40;
    const toggle = wantZoom !== d.zoom && !pd.bPrevB && (pd.bZoomCd = (pd.bZoomCd || 0) - dt) <= 0;
    if (toggle) pd.bZoomCd = 0.4;
    out.b = toggle; pd.bPrevB = toggle;
    // atira quando a mira está em cima de algo visível do alvo
    const ok = (headVis || bodyVis) && dd < (d.zoom ? 5 : 8) && d.bolt <= 0 && d.reload <= 0 && U.chance(0.25);
    out.a = ok && !pd.bPrevA; pd.bPrevA = out.a;
    return out;
  },

  runnerBot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data, F = this.FIELD;
    if (!p.alive || pd.out) return { x: 0, y: 0 };
    pd.bWait = (pd.bWait || 0) - dt;
    // caçador recarregando ou mira travada: corre direto para a saída
    const sprint = d.reload > 0.6 || g.time < this.AIM_LOCK - 0.3;
    if (pd.bWait > 0 && !sprint) return { x: 0, y: 0, b: true };   // escondido
    // escolhe a próxima cobertura à frente
    pd.bGoalT = (pd.bGoalT || 0) + dt;
    if (pd.bGoal && pd.bGoalT > 4) pd.bGoal.done = true;   // não chegou em 4 s: desiste dessa cobertura
    if (!pd.bGoal || pd.bGoal.done) {
      pd.bGoalT = 0;
      const ahead = d.covers.filter((cv) => cv.x > p.x + 50 && cv.x < p.x + 300);
      if (ahead.length && U.chance(0.85)) {
        const cv = U.pick(ahead);
        pd.bGoal = { x: cv.x + U.rand(-cv.w * 0.3, cv.w * 0.3), y: cv.y - 17, cover: cv };
      } else pd.bGoal = { x: F.x1 + 30, y: U.clamp(p.y + U.rand(-80, 80), F.y0, F.y1), cover: null };
    }
    const goal = pd.bGoal;
    // preso numa base de cobertura? desvia para cima/baixo por um instante
    pd.bStuckT = (pd.bStuckT || 0) + dt;
    if (pd.bStuckT > 0.5) {
      if (U.dist(p.x, p.y, pd.bLastX ?? -99, pd.bLastY ?? -99) < 6) pd.bDetour = { x: U.rand(-1, 1), y: U.chance(0.5) ? -1 : 1, t: 0.45 };
      pd.bLastX = p.x; pd.bLastY = p.y; pd.bStuckT = 0;
    }
    if (pd.bDetour && pd.bDetour.t > 0) { pd.bDetour.t -= dt; return { x: pd.bDetour.x, y: pd.bDetour.y, b: false }; }
    // alvo atrás de uma cobertura e o pato está na frente dela: contorna pela lateral esquerda
    let tx = goal.x, ty = goal.y;
    const cv = goal.cover;
    if (cv && p.y > cv.y - 12 && Math.abs(p.x - cv.x) < cv.w / 2 + 10) { tx = cv.x - cv.w / 2 - 16; ty = cv.y - 20; }
    else if (cv && p.y > cv.y - 12 && p.x < cv.x) { tx = Math.min(goal.x, cv.x - cv.w / 2 - 16); ty = cv.y - 20; }
    // desvio local: se o próximo passo bate na base de outra cobertura, contorna pela lateral mais próxima
    {
      const n0 = U.norm(tx - p.x, ty - p.y);
      const qx = p.x + n0.x * 14, qy = p.y + n0.y * 14;
      const blk = d.covers.find((o) => o !== cv && U.circleRect({ x: qx, y: qy }, { x: o.x - o.w / 2, y: o.y - 10, w: o.w, h: 10 }, 9));
      if (blk) {
        if (Math.abs(n0.y) > Math.abs(n0.x)) { tx = p.x < blk.x ? blk.x - blk.w / 2 - 16 : blk.x + blk.w / 2 + 16; ty = p.y; }
        else { tx = p.x + 20; ty = p.y < blk.y - 5 ? blk.y - 24 : blk.y + 14; }
      }
    }
    const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
    if (tx !== goal.x && dd < 10) return { x: 1, y: -0.2, b: false };
    if (dd < 8) {
      goal.done = true;
      // perto da mira? espera mais
      const crossNear = U.dist(d.cross.x, d.cross.y, p.x, p.y - 30) < 150;
      pd.bWait = U.rand(0.3, 1.4) + (crossNear ? U.rand(0.6, 1.6) : 0);
      return { x: 0, y: 0, b: true };
    }
    // zigue-zague ao correr em campo aberto
    if (!pd.bZig || U.chance(0.03)) pd.bZig = U.rand(-0.6, 0.6);
    const n = U.norm(dx, dy);
    return { x: n.x, y: n.y + (dd > 60 ? pd.bZig : 0), b: false };
  },

  // ---------- desenho 3D ----------
  // A mira e os acertos são calculados em coordenadas de TELA (como o 2D). Por isso cada boneco e
  // cada cobertura é colocado no chão 3D exatamente sob o seu ponto de tela (r.unproject) e escalado
  // para ocupar na tela o mesmo tamanho da sua caixa de colisão.
  screenSpace: true,
  camera: { pos: [480, 260, 1000], target: [480, 168.6, 0], fov: 30 },
  env: { bg: '#3a2a36', fog: [1500, 3600], ambient: 0.75, sun: 2.0, sunDir: [0.8, 0.35, -0.6], sunColor: '#ffb27a', hemiSky: '#c98a6a', hemiGround: '#2a3320' },

  // ponto no chão sob (sx, sy) e quantas unidades do mundo cabem em 1 px de tela ali
  anchor(r, sx, sy) {
    const P = r.unproject(sx, sy, 0);
    const a = r.project(P.x, 0, P.z), b = r.project(P.x, 100, P.z);
    return { ...P, upp: 100 / Math.max(1, a.y - b.y) };
  },

  draw3d(g, r) {
    const d = g.data, F = this.FIELD;
    // pátio visto da guarita: chão de cimento, muro com arame farpado ao fundo e sol poente
    // (só cenário; a câmera e os pontos de tela não mudam, então mira e acertos continuam iguais)
    r.yard(-3000, -1750, 4000, 900, { quadra: false, guarita: false, postes: 0, floor: '#55513f' });
    r.sphere(1500, 230, -3000, 140, '#ffd9a0', { glow: true });
    // linhas de largada e de saída (seguem a perspectiva: ligam o ponto de tela de perto ao de longe)
    const line = (sx, col, glow) => {
      const a = r.unproject(sx, F.y0 - 20), b = r.unproject(sx, F.y1 + 20);
      r.beam(a.x, 1, a.z, b.x, 1, b.z, 6, col, { glow });
      for (let k = 0; k <= 4; k++) { const t = k / 4; r.cyl(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t, 3, 26, col, { glow }); }
    };
    line(108, '#d8d8d8', false);
    line(this.EXIT_X, '#4dff7a', true);
    // torre do caçador ao fundo, à direita
    const h = this.hunter(g), T = this.anchor(r, 930, F.y0 - 6);
    for (const [ox, oz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) r.beam(T.x + ox * 2, 0, T.z + oz * 2, T.x + ox, 120, T.z + oz, 5, '#5a4128');
    r.box(T.x, 120, T.z, 44, 6, 44, '#6b4d2e');
    if (h) r.character({ ...h, x: T.x, y: T.z }, { key: 'hunter', y: 126, dir: Math.PI, pose: 'arms', label: false });
    // coberturas e patos (o motor cuida da profundidade)
    for (const cv of d.covers) this.cover3d(r, cv);
    for (const p of this.runners(g)) {
      if (p.data.out) continue;
      const A = this.anchor(r, p.x, p.y), gm = this.geom(p);
      const standPx = (32 + 8 * 0.8 + 8) * gm.s;
      const hurtBlink = p.alive && p.data.hp < this.HP && Math.floor(g.time * 5) % 2;
      r.character({ ...p, x: A.x, y: A.z }, { key: p.id, scale: (standPx * A.upp) / 60, dir: 0, flash: hurtBlink,
        pose: !p.alive ? 'dead' : p.data.crouch ? 'crouch' : undefined, label: p.label });
    }
  },

  cover3d(r, cv) {
    const A = this.anchor(r, cv.x, cv.y), w = cv.w * A.upp, hgt = cv.h * A.upp, dep = w * 0.6, z = A.z - dep / 2;
    if (cv.kind === 'feno') {   // pilha de colchões amarrada (mesma caixa do fardo de feno)
      for (let k = 0; k < 4; k++) r.box(A.x + (k % 2 ? 1 : -1) * w * 0.02, k * hgt / 4, z, w * 0.96, hgt / 4 - 0.5, dep, k % 2 ? '#8a8468' : '#7a7660', { tex: 'tecido', rough: 1 });
      r.box(A.x - w * 0.22, 0, z, w * 0.06, hgt * 1.01, dep * 1.02, '#3d3a30');
      r.box(A.x + w * 0.22, 0, z, w * 0.06, hgt * 1.01, dep * 1.02, '#3d3a30');
    } else if (cv.kind === 'arbusto') {
      for (let k = 0; k < 4; k++) r.sphere(A.x - w * 0.33 + k * w * 0.22, hgt * (0.42 + 0.1 * Math.sin(k * 1.7 + cv.seed)), z, hgt * 0.5, k % 2 ? '#2d6a32' : '#3c8442', { rough: 1 });
    } else if (cv.kind === 'tronco') {
      r.cyl(A.x - w / 2, hgt / 2, z, hgt / 2, w, '#8a867a', { rotZ: -Math.PI / 2, rough: 1, tex: 'concreto' });   // manilha de concreto
    } else {
      r.box(A.x, 0, z, w, hgt / 2, dep, '#8a6438', { rough: 0.9 });
      r.box(A.x, hgt / 2, z, w * 0.85, hgt / 2, dep * 0.85, '#94703f', { rough: 0.9 });
    }
  },

  drawOverlay(g, c) { if (TN.R3.available && g.uses3d()) this.drawHunterUi(g, c); },

  // ---------- desenho 2D (alternativa) ----------
  drawCover(c, cv) {
    const { x, y, w, h } = cv, l = x - w / 2;
    c.save(); c.strokeStyle = '#1a140c'; c.lineWidth = 2;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x, y, w * 0.55, 7, 0, 0, Math.PI * 2); c.fill();
    if (cv.kind === 'feno') {
      c.fillStyle = '#c9a43a'; c.beginPath(); c.roundRect(l, y - h, w, h, 6); c.fill(); c.stroke();
      c.strokeStyle = '#9c7c22'; c.lineWidth = 1.5;
      for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(l + 3, y - h + k * h / 5); c.lineTo(l + w - 3, y - h + k * h / 5 + ((k % 2) ? 2 : -2)); c.stroke(); }
      c.fillStyle = '#6b4a1a'; c.fillRect(l + w * 0.25, y - h, 4, h); c.fillRect(l + w * 0.7, y - h, 4, h);
    } else if (cv.kind === 'arbusto') {
      c.fillStyle = '#2d6a32';
      for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(l + w * (0.15 + k * 0.175), y - h * 0.45 - Math.sin(k * 1.7 + cv.seed) * 6, h * 0.42, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#3c8442';
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(l + w * (0.22 + k * 0.19), y - h * 0.6 - Math.cos(k * 2.1 + cv.seed) * 5, h * 0.28, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#2d6a32'; c.fillRect(l + 2, y - h * 0.45, w - 4, h * 0.45);
    } else if (cv.kind === 'tronco') {
      c.fillStyle = '#6b4526'; c.beginPath(); c.roundRect(l, y - h, w, h, h / 2); c.fill(); c.stroke();
      c.fillStyle = '#b48a5a'; c.beginPath(); c.ellipse(l + w - h * 0.25, y - h / 2, h * 0.25, h / 2 - 2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.strokeStyle = '#4a2f18'; c.beginPath(); c.moveTo(l + 10, y - h * 0.35); c.lineTo(l + w * 0.6, y - h * 0.35); c.stroke();
    } else { // caixas empilhadas (cobertura alta)
      c.fillStyle = '#8a6438';
      c.fillRect(l, y - h / 2, w, h / 2); c.strokeRect(l, y - h / 2, w, h / 2);
      c.fillRect(l + 4, y - h, w - 8, h / 2); c.strokeRect(l + 4, y - h, w - 8, h / 2);
      c.strokeStyle = '#5e4222';
      for (const [yy, ww, xo] of [[y - h / 2, w, l], [y - h, w - 8, l + 4]]) { c.beginPath(); c.moveTo(xo, yy); c.lineTo(xo + ww, yy + h / 2); c.moveTo(xo + ww, yy); c.lineTo(xo, yy + h / 2); c.stroke(); }
    }
    c.restore();
  },

  drawRunner(g, c, p) {
    const gm = this.geom(p), pd = p.data, s = gm.s;
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(p.x, p.y, 13 * s, 4 * s, 0, 0, Math.PI * 2); c.fill();
    if (!p.alive) { // caído
      c.fillStyle = '#555'; c.strokeStyle = '#111'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(p.x - 18 * s, p.y - 10 * s, 30 * s, 10 * s, 4); c.fill(); c.stroke();
      c.beginPath(); c.arc(p.x + 18 * s, p.y - 6 * s, 7 * s, 0, Math.PI * 2); c.fill(); c.stroke();
      return;
    }
    const legs = pd.crouch ? 0 : Math.sin(pd.step) * 4 * s;
    c.strokeStyle = '#222'; c.lineWidth = 3 * s;
    c.beginPath(); c.moveTo(p.x - 5 * s, gm.by + gm.bh - 2); c.lineTo(p.x - 5 * s + legs, p.y);
    c.moveTo(p.x + 5 * s, gm.by + gm.bh - 2); c.lineTo(p.x + 5 * s - legs, p.y); c.stroke();
    const col = pd.hp < this.HP && Math.floor(g.time * 5) % 2 ? '#fff' : p.color;
    c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(gm.bx, gm.by, gm.bw, gm.bh - 3 * s, 5 * s); c.fill(); c.stroke();
    c.beginPath(); c.arc(gm.hx, gm.hy, gm.hr, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#111'; c.fillRect(gm.hx, gm.hy - gm.hr * 0.45, gm.hr * 0.95, gm.hr * 0.8);   // visor olhando para a direita
    c.fillStyle = '#7ff'; c.fillRect(gm.hx + gm.hr * 0.45, gm.hy - gm.hr * 0.3, gm.hr * 0.3, gm.hr * 0.3);
    if (pd.hp < this.HP) { c.fillStyle = '#c22'; c.fillRect(gm.bx + gm.bw * 0.3, gm.by + gm.bh * 0.3, gm.bw * 0.35, 4 * s); }
    TN.draw.text(c, p.label, p.x, gm.hy - gm.hr - 10, { size: 11, color: p.color, align: 'center' });
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, F = this.FIELD, HZ = this.HORIZON;
    // céu de fim de tarde
    const sky = c.createLinearGradient(0, 34, 0, HZ);
    sky.addColorStop(0, '#1d2340'); sky.addColorStop(1, '#a8573a');
    c.fillStyle = sky; c.fillRect(0, 0, g.W, HZ);
    c.fillStyle = '#f2d39a'; c.beginPath(); c.arc(760, 120, 26, 0, Math.PI * 2); c.fill();
    // linha de árvores ao fundo
    c.fillStyle = '#16231c';
    for (let x = -10; x < g.W + 20; x += 26) { const hh = 26 + ((x * 37) % 23); c.beginPath(); c.moveTo(x, HZ); c.lineTo(x + 14, HZ - hh); c.lineTo(x + 28, HZ); c.fill(); }
    // chão
    const gr = c.createLinearGradient(0, HZ, 0, g.H);
    gr.addColorStop(0, '#3a5a2a'); gr.addColorStop(1, '#5a7f34');
    c.fillStyle = gr; c.fillRect(0, HZ, g.W, g.H - HZ);
    c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 1;
    for (let y = HZ + 12; y < g.H; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(g.W, y); c.stroke(); }
    // largada e saída
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, F.y0 - 20, 108, F.y1 - F.y0 + 40);
    D.text(c, 'LARGADA', 54, F.y0 - 30, { size: 12, color: '#ddd', align: 'center' });
    c.fillStyle = 'rgba(80,255,120,0.18)'; c.fillRect(this.EXIT_X, F.y0 - 20, g.W - this.EXIT_X, F.y1 - F.y0 + 40);
    D.hazardStripes(c, this.EXIT_X - 4, F.y0 - 20, 6, F.y1 - F.y0 + 40, 6);
    D.text(c, 'SAÍDA ▶', 926, F.y0 - 30, { size: 13, color: '#6f6', align: 'center' });
    // coberturas e patos em ordem de profundidade
    const things = [...d.covers.map((cv) => ({ cv, y: cv.y })), ...this.runners(g).filter((p) => !p.data.out).map((p) => ({ p, y: p.y }))].sort((a, b) => a.y - b.y);
    for (const t of things) t.cv ? this.drawCover(c, t.cv) : this.drawRunner(g, c, t.p);
    this.drawHunterUi(g, c);
  },

  // mira, impactos e painel do caçador (coordenadas de tela) — usado no 2D e por cima do 3D
  drawHunterUi(g, c) {
    const D = TN.draw, d = g.data;
    // impactos
    for (const im of d.impacts) {
      c.strokeStyle = im.hit ? '#f33' : '#ffd';
      c.lineWidth = 2; c.beginPath(); c.arc(im.x, im.y, (0.35 - im.t) * 40 + 3, 0, Math.PI * 2); c.stroke();
    }
    // mira do caçador
    const h = this.hunter(g), cr = d.cross, locked = g.time < this.AIM_LOCK;
    if (d.zoom) { // vinheta de luneta
      c.save(); c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.rect(0, 34, g.W, g.H - 34);
      c.arc(cr.x, cr.y, 95, 0, Math.PI * 2, true); c.fill(); c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 4; c.beginPath(); c.arc(cr.x, cr.y, 95, 0, Math.PI * 2); c.stroke();
    }
    const R = d.zoom ? 12 : 22;
    c.strokeStyle = locked ? '#888' : h.color; c.lineWidth = 2.5;
    c.beginPath(); c.arc(cr.x, cr.y, R, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c.moveTo(cr.x + ax * (R - 7), cr.y + ay * (R - 7)); c.lineTo(cr.x + ax * (R + 8), cr.y + ay * (R + 8)); }
    c.stroke();
    c.fillStyle = '#f33'; c.fillRect(cr.x - 1.5, cr.y - 1.5, 3, 3);
    D.text(c, h.label, cr.x + R + 6, cr.y - R, { size: 11, color: h.color });
    // painel do caçador
    D.panel(c, 10, g.H - 52, 300, 44, { stroke: h.color });
    D.text(c, `CAÇADOR ${h.label}`, 22, g.H - 38, { size: 14, color: h.color });
    for (let i = 0; i < d.mag; i++) {
      c.fillStyle = i < d.ammo ? '#e8c35a' : '#333';
      c.fillRect(22 + i * 13, g.H - 26, 8, 13);
      c.fillStyle = i < d.ammo ? '#b07a30' : '#222'; c.fillRect(22 + i * 13, g.H - 26, 8, 4);
    }
    const st = locked ? `MIRA EM ${Math.ceil(this.AIM_LOCK - g.time)}` : d.reload > 0 ? 'RECARREGANDO' : d.bolt > 0 ? 'FERROLHO...' : d.zoom ? 'ZOOM' : 'PRONTO';
    D.text(c, st, 298, g.H - 38, { size: 12, color: d.reload > 0 || locked ? '#f88' : '#ccc', align: 'right' });
    if (d.reload > 0) D.bar(c, 170, g.H - 25, 128, 10, 1 - d.reload / this.RELOAD, '#e8c35a');
    if (locked) D.text(c, 'PATOS, CORRAM!', g.W / 2, 70, { size: 22, color: '#ffd23f', align: 'center' });
    const left = Math.max(0, this.MAX_TIME - g.time);   // relógio discreto (o do HUD ficaria por cima do placar)
    D.text(c, TN.util.formatTime(left), g.W - 16, g.H - 20, { size: 18, color: left < 8 ? '#f55' : '#ddd', align: 'right' });
  },
});
