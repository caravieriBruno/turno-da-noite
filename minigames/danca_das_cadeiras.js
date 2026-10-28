// DANÇA DAS CADEIRAS — inspirado em "SCAVENGER CHAIRS" (scavenger_chairs), minigame inacabado de Machine Party.
// A cada turno o painel central mostra um item-alvo, e só existem (vivos − 1) cópias dele espalhadas pela sala.
// Quando o tempo acaba o chão se abre: quem não estiver numa plataforma segura SEGURANDO o alvo cai.
// Os turnos se repetem dentro da mesma rodada até sobrar um.
TN.registerMinigame({
  id: 'danca_das_cadeiras',
  title: 'DANÇA DAS CADEIRAS',
  inspiredBy: 'Scavenger Chairs (scavenger_chairs, não lançado)',
  tagline: 'SEMPRE FALTA UM.',
  brief: ['Pegue o item mostrado no painel: há uma cópia a menos que jogadores.', 'Fique numa plataforma verde segurando o item.', 'Empurre quem tem o item para ele cair da mão.'],
  controls: { move: 'andar', a: 'pegar item', b: 'soltar item / empurrar' },
  icon: '♜',
  color: '#c77dff',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes (original: 30 s por turno, empurrão 10 m/s com decaimento 20 m/s², ×1,5 pelas costas).
  //      Empurrão no padrão dos aspiradores: derruba (1,1 s no chão), 400 px/s com decaimento linear 444 e quem
  //      empurra fica 0,5 s parado. Pelas costas ×1,25 (×1,5 sobre 400 cruzaria a arena inteira) ----
  SPEED: 175, SUB_TIME: 18, GRAB: 30, SHOVE: 400, SHOVE_DECAY: 444, SHOVE_LOCK: 0.5, TOMBO: 1.1, BACK_BONUS: 1.25,
  // arena redonda do original (raio 13 m ≈ 230 px): plataforma segura quadrada no MEIO (8,2 m ≈ 124 px),
  // piso em íris de 16 lâminas que recolhem para a borda, seis bancos baixos encostados na parede com os
  // itens em cima (12 vagas) e dois armários altos no fundo
  ARENA_R: 230, PAD_W: 124, PAD_H: 124, BANCO_H: 30,
  // bancos e armários (centro relativo ao meio da arena; w = largura em x, d = profundidade em z)
  BANCOS: [{ dx: 149, dz: -99, w: 83, d: 27 }, { dx: 122, dz: 104, w: 27, d: 83 }, { dx: -3, dz: -190, w: 83, d: 27 },
    { dx: -159, dz: -89, w: 27, d: 83 }, { dx: -157, dz: 75, w: 83, d: 27 }, { dx: 3, dz: 160, w: 83, d: 27 }],
  ARMARIOS: [{ dx: -88, dz: -172, w: 60, d: 40, h: 78 }, { dx: 88, dz: -172, w: 60, d: 40, h: 78 }],
  ITEMS: ['CHAVE INGLESA', 'CANECA', 'LÂMPADA', 'PATINHO', 'CONE', 'DISQUETE'],

  init(g) {
    const d = g.data, a = g.arena;
    d.cx = a.x + a.w / 2; d.cy = a.y + a.h / 2;
    const pw = this.PAD_W, ph = this.PAD_H;
    d.pads = [{ x: d.cx - pw / 2, y: d.cy - ph / 2, w: pw, h: ph }];   // uma só, no meio (como a SafePlatform)
    // obstáculos sólidos (retângulos no chão) e vagas dos itens: duas em cima de cada banco
    d.solidos = this.BANCOS.concat(this.ARMARIOS).map((b) => ({ x: d.cx + b.dx - b.w / 2, y: d.cy + b.dz - b.d / 2, w: b.w, h: b.d }));
    d.vagas = [];
    for (const b of this.BANCOS) for (const s of [-1, 1]) d.vagas.push(b.w > b.d ? { x: d.cx + b.dx + s * 20, y: d.cy + b.dz } : { x: d.cx + b.dx, y: d.cy + b.dz + s * 20 });
    d.items = []; d.sub = 0; d.batches = []; d.banner = null; d.open = 0;
    g.placeInCircle(d.cx, d.cy, 95);
    for (const p of g.players) Object.assign(p.data, { hold: null, lock: 0, fall: 0 });
    this.newSub(g);
  },

  // Novo turno: sorteia o alvo, espalha (vivos − 1) cópias e alguns itens de distração.
  newSub(g) {
    const d = g.data, U = TN.util, a = g.arena;
    d.sub++;
    d.target = U.randInt(0, this.ITEMS.length - 1);
    d.timer = this.SUB_TIME; d.phase = 'play'; d.open = 0;
    d.items = [];
    for (const p of g.players) p.data.hold = null;
    const n = g.alive().length;
    d.copies = n - 1;
    const kinds = [];
    for (let i = 0; i < n - 1; i++) kinds.push(d.target);
    for (let i = 0; i < n + 2; i++) { let k; do k = U.randInt(0, this.ITEMS.length - 1); while (k === d.target); kinds.push(k); }
    // cada item vai para uma vaga sorteada em cima dos bancos (h = altura em que está apoiado)
    const vagas = U.shuffle(d.vagas.slice());
    kinds.forEach((kind, i) => {
      const v = vagas[i % vagas.length];
      d.items.push({ kind, x: v.x, y: v.y, h: this.BANCO_H, r: 14, holder: null, vx: 0, vy: 0, bob: U.rand(0, 6) });
    });
    g.message(`ALVO: ${this.ITEMS[d.target]}`, 1.6, '#c77dff');
    g.sfx('go');
  },

  // dentro da parede redonda e fora dos bancos e armários
  prender(g, p) {
    const d = g.data, U = TN.util, R = this.ARENA_R - p.r, dc = U.dist(p.x, p.y, d.cx, d.cy);
    if (dc > R) { p.x = d.cx + (p.x - d.cx) / dc * R; p.y = d.cy + (p.y - d.cy) / dc * R; }
    for (const b of d.solidos) {
      if (!U.circleRect(p, b, p.r)) continue;
      const dl = p.x - (b.x - p.r), dr = (b.x + b.w + p.r) - p.x, dt = p.y - (b.y - p.r), db = (b.y + b.h + p.r) - p.y, m = Math.min(dl, dr, dt, db);
      if (m === dl) p.x = b.x - p.r; else if (m === dr) p.x = b.x + b.w + p.r; else if (m === dt) p.y = b.y - p.r; else p.y = b.y + b.h + p.r;
    }
  },
  onPad(g, p) { return g.data.pads.some((pd) => TN.util.inRect(p.x, p.y, pd)); },
  drop(g, p, vx = 0, vy = 0) {
    const it = p.data.hold;
    if (!it) return;
    it.holder = null; it.x = p.x; it.y = p.y + 4; it.vx = vx; it.vy = vy; it.h = 0;
    p.data.hold = null;
  },

  update(g, dt) {
    const U = TN.util, d = g.data, a = g.arena;
    const playing = d.phase === 'play';
    if (playing) {
      d.timer -= dt;
      if (d.timer <= 3 && d.timer > 0 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt)) g.sfx('tick');
      if (d.timer <= 0) this.endSub(g);
    } else d.open = Math.min(1, d.open + dt * 3);

    for (const p of g.alive()) {
      const pd = p.data;
      pd.lock -= dt;
      const stunned = p.tombo > 0;   // derrubado (g.derrubar): sem controle até levantar
      const shoving = pd.lock > 0;   // quem empurra fica parado enquanto o braço volta
      // sem o retângulo da arena: quem prende é a parede redonda (prender)
      if (stunned || shoving || !playing) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, null); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt, null);
      g.decayPushLinear(p, dt, this.SHOVE_DECAY);
      this.prender(g, p);
      if (!playing || stunned || shoving) continue;
      // AÇÃO: pega o item mais próximo (mãos vazias)
      if (p.input.aPressed && !pd.hold) {
        let best = null, bd = this.GRAB + p.r;
        for (const it of d.items) {
          if (it.holder) continue;
          const dd = U.dist(p.x, p.y, it.x, it.y);
          if (dd < bd) { bd = dd; best = it; }
        }
        if (best) { best.holder = p; pd.hold = best; g.sfx('pickup'); }
      }
      // EXTRA: solta o item, ou empurra se estiver de mãos vazias
      if (p.input.bPressed && pd.lock <= 0) {
        if (pd.hold) { this.drop(g, p); g.sfx('step'); }
        else {
          pd.lock = this.SHOVE_LOCK; g.sfx('whoosh');
          const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
          for (const o of g.alive()) {
            if (o === p) continue;
            const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy) || 1;
            if (dist < 58 && (dx * fx + dy * fy) / dist > 0.2) {
              // pelas costas empurra mais forte
              const back = (Math.cos(o.dir) * dx + Math.sin(o.dir) * dy) / dist > 0.3 ? this.BACK_BONUS : 1;
              if (!g.derrubar(o, (dx / dist) * this.SHOVE * back, (dy / dist) * this.SHOVE * back, this.TOMBO)) continue;   // já no chão
              if (o.data.hold) { this.drop(g, o, (dx / dist) * 260, (dy / dist) * 260); g.popup('LARGOU!', o.x, o.y - 30, '#c77dff'); }
              g.sfx('hit'); g.shake(3);
            }
          }
        }
      }
    }
    U.separate(g.alive());
    for (const p of g.alive()) this.prender(g, p);
    // itens: seguem quem segura; soltos deslizam um pouco
    for (const it of d.items) {
      it.bob += dt * 4;
      if (it.holder) { it.x = it.holder.x + Math.cos(it.holder.dir) * 20; it.y = it.holder.y + Math.sin(it.holder.dir) * 20; continue; }
      it.x += it.vx * dt; it.y += it.vy * dt;
      const k = Math.max(0, 1 - 6 * dt); it.vx *= k; it.vy *= k;
      const dc = U.dist(it.x, it.y, d.cx, d.cy), md = this.ARENA_R - it.r;
      if (dc > md) { it.x = d.cx + (it.x - d.cx) / dc * md; it.y = d.cy + (it.y - d.cy) / dc * md; }
    }
    for (const p of g.players) if (!p.alive) p.data.fall += dt;
  },

  // Fim do turno: o chão se abre.
  endSub(g) {
    const d = g.data;
    d.phase = 'judge'; d.timer = 0;
    g.sfx('buzz'); g.shake(8);
    const losers = g.alive().filter((p) => !(this.onPad(g, p) && p.data.hold && p.data.hold.kind === d.target));
    g.after(0.5, () => {
      if (losers.length) {
        d.batches.push(losers.map((p) => p.id));
        for (const p of losers) {
          const why = !this.onPad(g, p) ? 'FORA DA PLATAFORMA!' : 'SEM O ALVO!';
          this.drop(g, p);
          g.eliminate(p, { sound: 'boom', particles: false, msg: why });
        }
      }
      d.banner = losers.length ? { text: `${losers.map((p) => p.label).join(', ')} CAÍ${losers.length > 1 ? 'RAM' : 'U'}!`, color: '#f55' } : { text: 'TODOS A SALVO', color: '#9f9' };
      g.after(1.8, () => {
        d.banner = null;
        if (g.alive().length > 1) this.newSub(g);   // senão o motor encerra a rodada
      });
    });
  },

  // Quem sai junto empata (pontos = nº de eliminados antes do grupo); sobrevivente = nº de jogadores.
  results(g, pts) {
    let before = 0;
    for (const p of g.players) pts[p.id] = p.alive ? g.playerCount : 0;
    for (const batch of g.data.batches) { for (const id of batch) pts[id] = before; before += batch.length; }
  },

  // Bot: pega a cópia mais próxima; se acabaram, persegue e empurra quem tem; depois corre para uma plataforma.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (d.phase !== 'play') return {};
    const b = pd.bt || (pd.bt = { noise: { x: 0, y: 0 }, react: 0 });
    if (U.chance(0.03)) b.noise = { x: U.rand(-0.3, 0.3), y: U.rand(-0.3, 0.3) };
    const go = (tx, ty, extra = {}) => {
      const n = U.norm(tx - p.x, ty - p.y), dist = U.dist(p.x, p.y, tx, ty);
      const k = dist < 8 ? 0 : 1;
      return { x: (n.x + b.noise.x * (dist > 40 ? 1 : 0)) * k, y: (n.y + b.noise.y * (dist > 40 ? 1 : 0)) * k, ...extra };
    };
    const hold = pd.hold;
    if (hold && hold.kind !== d.target) return { b: true };         // item errado: larga
    if (hold) {
      // vai para a plataforma mais próxima e fica no meio dela
      let best = null, bd = 1e9;
      for (const pad of d.pads) { const dd = U.dist(p.x, p.y, pad.x + pad.w / 2, pad.y + pad.h / 2); if (dd < bd) { bd = dd; best = pad; } }
      return go(best.x + best.w / 2, best.y + best.h / 2);
    }
    // cópia livre mais próxima
    let item = null, id = 1e9;
    for (const it of d.items) {
      if (it.holder || it.kind !== d.target) continue;
      const dd = U.dist(p.x, p.y, it.x, it.y);
      if (dd < id) { id = dd; item = it; }
    }
    if (item) return go(item.x, item.y, { a: id < this.GRAB + p.r - 4 && U.chance(0.5) });
    // nenhuma livre: caça quem está segurando o alvo
    let vic = null, vd = 1e9;
    for (const o of g.alive()) {
      if (o === p || !o.data.hold || o.data.hold.kind !== d.target) continue;
      const dd = U.dist(p.x, p.y, o.x, o.y);
      if (dd < vd) { vd = dd; vic = o; }
    }
    if (vic) return go(vic.x, vic.y, { b: vd < 50 && pd.lock <= 0 && U.chance(0.25) });
    return go(d.cx + 80, d.cy);
  },

  // ---------- desenho 3D (câmera fixa) ----------
  // Arena redonda no meio do refeitório, vista de cima e de frente (o original olha de lado, com a mesma
  // inclinação): parede circular de 16 lados com o degrau de fora, piso em íris, plataforma no meio,
  // bancos de concreto com os itens, armários no fundo e o painel do alvo pendurado sobre a plataforma.
  camera: { pos: [480, 560, 840], target: [480, 0, 262], fov: 40 },
  env: { bg: '#08070b', fog: [1100, 2600], ambient: 0.5, sun: 1.8, sunDir: [-0.3, 1, 0.55], sunColor: '#ffe6d0' },
  PIT: 420,

  // quanto o piso já afundou neste ponto (0 = no lugar); abre do centro para fora
  sink(g, x, z) {
    const d = g.data;
    if (d.open <= 0) return 0;
    const k = TN.util.clamp(d.open * 1.9 - TN.util.dist(x, z, d.cx, d.cy) / 650, 0, 1);
    return k * k * this.PIT;
  },

  // item low-poly: forma e cor diferentes por tipo; base em y, s = escala, rot = direção (rad)
  drawItem3d(r, kind, x, y, z, s, rot, o = {}) {
    const ca = Math.cos(rot), sa = Math.sin(rot), ry = -rot;
    const P = (fx, sx) => [x + (ca * fx - sa * sx) * s, z + (sa * fx + ca * sx) * s];
    const em = o.emissive;
    switch (kind) {
      case 0: { // chave inglesa
        r.box(x, y + 2 * s, z, 24 * s, 3 * s, 5 * s, '#b9c2cc', { rotY: ry, metal: 0.85, rough: 0.25, emissive: em });
        const [jx, jz] = P(13, 0); r.box(jx, y + 1 * s, jz, 7 * s, 5 * s, 13 * s, '#9aa3ad', { rotY: ry, metal: 0.85, rough: 0.25, emissive: em });
        const [cx2, cz2] = P(15, 0); r.box(cx2, y + 1.5 * s, cz2, 5 * s, 5.5 * s, 4 * s, '#2a2f36', { rotY: ry });
        break;
      }
      case 1: { // caneca
        r.cyl(x, y, z, 7 * s, 14 * s, '#e94f4f', { rough: 0.5, emissive: em });
        r.cyl(x, y + 14 * s, z, 5.6 * s, 0.6 * s, '#3a1d0e', {});
        const [hx, hz] = P(8.5, 0); r.box(hx, y + 3 * s, hz, 3 * s, 8 * s, 2.5 * s, '#e94f4f', { rotY: ry, emissive: em });
        break;
      }
      case 2: // lâmpada
        r.cyl(x, y, z, 4.2 * s, 6 * s, '#8d939a', { metal: 0.8, rough: 0.3 });
        r.sphere(x, y + 12 * s, z, 8 * s, '#ffe36b', { emissive: '#a07c00', rough: 0.2 });
        break;
      case 3: { // patinho
        r.sphere(x, y + 6 * s, z, 8 * s, '#ffd21f', { rough: 0.45, emissive: em });
        const [hx, hz] = P(4.5, 0); r.sphere(hx, y + 15 * s, hz, 5 * s, '#ffd21f', { rough: 0.45, emissive: em });
        const [bx, bz] = P(8.5, 0); r.cone(bx, y + 14 * s, bz, 2.4 * s, 5 * s, '#ff8a00', { rotY: ry, rotZ: -Math.PI / 2 });
        break;
      }
      case 4: // cone de sinalização
        r.box(x, y, z, 19 * s, 2.5 * s, 19 * s, '#ff7a1a', { rotY: ry, emissive: em });
        r.cone(x, y + 2.5 * s, z, 8.5 * s, 20 * s, '#ff7a1a', { rough: 0.5, emissive: em });
        r.cyl(x, y + 9 * s, z, 5.9 * s, 3 * s, '#f2f2f2', {});
        break;
      case 5: { // disquete
        r.box(x, y, z, 20 * s, 3 * s, 20 * s, '#3b6fd8', { rotY: ry, rough: 0.4, emissive: em });
        const [sx2, sz2] = P(-6, 0); r.box(sx2, y + 0.2 * s, sz2, 7 * s, 3.3 * s, 11 * s, '#c8ccd4', { rotY: ry, metal: 0.8, rough: 0.3 });
        const [lx, lz] = P(4, 0); r.box(lx, y + 0.2 * s, lz, 9 * s, 3.3 * s, 14 * s, '#eeeeee', { rotY: ry });
        break;
      }
    }
  },

  draw3d(g, r) {
    const d = g.data, t = g.time, PIT = this.PIT, R = this.ARENA_R, cx = d.cx, cz = d.cy;
    const warn = d.phase === 'play' && d.timer < 3 && Math.floor(t * 6) % 2 === 0;
    // refeitório em volta (sem chão do r.room: o piso de caquinho abaixo deixa o poço aberto)
    r.room(cx - 470, cz - R - 90, cx + 470, cz + R + 40, { estilo: 'refeitorio', floor: false });
    for (const [px, pz, pw, ph] of [[cx, cz - R - 600, 2400, 1000], [cx, cz + R + 600, 2400, 1000], [cx - R - 700, cz, 1200, 2 * R + 220], [cx + R + 700, cz, 1200, 2 * R + 220]]) r.plane(px, -1, pz, pw, ph, '#4e241d', { tex: 'caquinho', texWorld: true });
    // fundo do poço: triturador com rolos dentados e grade vermelha brilhando
    r.disc(cx, -PIT, cz, R + 10, '#1e1416', { rough: 0.9 });
    if (d.open > 0) {
      for (let k = -3; k <= 3; k++) r.plane(cx + k * 60, -PIT + 0.5, cz, 3, 2 * Math.sqrt(R * R - (k * 60) ** 2), '#ff2a2a', { glow: true, opacity: 0.6 });
      for (let k = 0; k < 4; k++) {
        const rz = cz - 165 + k * 110, half = Math.sqrt(R * R - (rz - cz) ** 2), ph = t * 6 * (k % 2 ? 1 : -1);
        r.cyl(cx - half, -PIT + 22, rz, 22, 2 * half, '#4a4d55', { rotZ: -Math.PI / 2, metal: 0.8, rough: 0.35, sides: 10 });
        for (let s = 0; s < 4; s++) r.box(cx - half + 40 + s * (2 * half - 80) / 3, -PIT + 22 + Math.sin(ph + s) * 22, rz + Math.cos(ph + s) * 22, 10, 8, 8, '#8a8f99', { metal: 0.9 });
      }
      r.light(cx, -PIT + 120, cz, '#ff2a2a', 2.5 * d.open, 900);
    }
    // frestas da íris: vermelho piscando nos 3 s finais
    if (d.open <= 0) r.disc(cx, -0.6, cz, R, warn ? '#ff2a2a' : '#050506', warn ? { glow: true } : {});
    // piso em íris: 16 lâminas que recolhem para baixo da parede (e afundam um pouco) quando o chão abre
    const N = 16, bw = 2 * R * Math.sin(Math.PI / N) + 4, ease = d.open * d.open;
    for (let i = 0; i < N; i++) {
      const an = (i + 0.5) / N * Math.PI * 2, rr = R / 2 + ease * (R + 10);
      r.box(cx + Math.cos(an) * rr, -6 - (i % 2) * 0.4 - ease * 30, cz + Math.sin(an) * rr, R, 6, bw, i % 2 ? '#2e2a36' : '#2a2631', { rotY: -an, rough: 0.85 });
    }
    // parede redonda (16 lados) que desce até o fundo do poço, com faixa de perigo e o degrau de fora
    const WR = R + 8, sl = 2 * WR * Math.tan(Math.PI / N) + 2;
    for (let i = 0; i < N; i++) {
      const an = i / N * Math.PI * 2, x = cx + Math.cos(an) * WR, z = cz + Math.sin(an) * WR;
      r.box(x, -PIT, z, 16, PIT + 46, sl, '#45404d', { rotY: -an, metal: 0.25 });
      r.box(cx + Math.cos(an) * (WR - 8.5), 30, cz + Math.sin(an) * (WR - 8.5), 1.5, 10, sl - 4, i % 2 ? '#111' : '#f5c400', { rotY: -an, shadow: false, tex: false });
      r.box(cx + Math.cos(an) * (WR + 40), 0, cz + Math.sin(an) * (WR + 40), 64, 16, 2 * (WR + 72) * Math.tan(Math.PI / N) + 2, '#3b3742', { rotY: -an, metal: 0.2 });
    }
    // luzes de emergência na parede (giram em vermelho nos 3 s finais / chão aberto)
    for (const an of [Math.PI, 0, -Math.PI / 2]) {
      const on = warn || d.open > 0;
      r.box(cx + Math.cos(an) * (WR - 10), 40, cz + Math.sin(an) * (WR - 10), 10, 10, 18, on ? '#ff2a2a' : '#3a1414', on ? { glow: true, rotY: -an } : { rotY: -an });
    }
    // bancos de concreto (os itens ficam em cima) e armários altos no fundo; descem até o fundo do poço
    for (const b of this.BANCOS) {
      r.box(cx + b.dx, -PIT, cz + b.dz, b.w, PIT + this.BANCO_H - 4, b.d, '#6e6b63', { tex: 'concreto' });
      r.box(cx + b.dx, this.BANCO_H - 4, cz + b.dz, b.w + 4, 4, b.d + 4, '#7c7e79', { metal: 0.5, rough: 0.4 });
    }
    for (const b of this.ARMARIOS) {
      r.box(cx + b.dx, -PIT, cz + b.dz, b.w, PIT + b.h, b.d, '#5d6a6c', { metal: 0.5 });
      r.box(cx + b.dx, 6, cz + b.dz + b.d / 2 + 0.5, 2, b.h - 12, 1, '#2a2e30', { tex: false });
      for (const s of [-1, 1]) r.box(cx + b.dx + s * 6, b.h * 0.5, cz + b.dz + b.d / 2 + 1, 2, 10, 2, '#b9bcb6', { metal: 0.8 });
    }
    // plataforma segura no meio: coluna que fica de pé quando a íris abre
    const padGlow = d.phase === 'play' && d.timer < 5 ? 0.6 + 0.4 * Math.sin(t * 10) : 0.85;
    for (const pd of d.pads) {
      const px = pd.x + pd.w / 2, pz = pd.y + pd.h / 2;
      r.box(px, -PIT, pz, pd.w, PIT + 3, pd.h, '#1d3325', { rough: 0.8 });
      r.plane(px, 3.1, pz, pd.w, pd.h, '#46e27b', { glow: true, opacity: padGlow });
      r.plane(px, 3.3, pz, pd.w - 9, pd.h - 9, '#16301f', { rough: 0.6, emissive: '#06200e' });
      for (let k = 14; k < pd.w - 6; k += 14) r.plane(pd.x + k, 3.5, pz, 1.5, pd.h - 14, '#46e27b', { glow: true, opacity: 0.35 });
    }
    // painel do alvo pendurado no fundo, sobre os armários (como o relógio pendurado do original)
    const PY = 100, PZ = cz - 140;
    for (const s of [-1, 1]) r.beam(cx + s * 40, PY + 60, PZ, cx + s * 40, 700, PZ, 1.5, '#1b1b1b');
    r.box(cx, PY, PZ, 110, 62, 14, '#2a2733', { metal: 0.5 });
    r.box(cx, PY + 5, PZ + 7.5, 98, 52, 1, '#1d1430', { glow: true });
    if (d.target !== undefined) this.drawItem3d(r, d.target, cx, PY + 14 + Math.sin(t * 2) * 2, PZ + 18, 1.5, t * 1.2, { emissive: '#3a1660' });
    const frac = d.phase === 'play' ? Math.max(0, d.timer / this.SUB_TIME) : 0;
    r.box(cx + 78, PY + 22, PZ, 44, 22, 12, '#2a2733', { metal: 0.5 });   // relógio do turno
    if (frac > 0) r.box(cx + 78 - 17 * (1 - frac), PY + 27, PZ + 6.5, 34 * frac, 12, 1, d.timer < 5 ? '#ff3030' : '#c77dff', { glow: true });
    r.light(cx, PY - 20, PZ + 40, '#c77dff', 0.9, 320);
    // lâmpadas do teto
    r.light(cx - 200, 300, cz - 80, '#ffd9a8', 0.8, 720);
    r.light(cx + 200, 300, cz + 80, '#ffd9a8', 0.8, 720);
    // itens soltos (em cima dos bancos, ou no chão afundando junto com a íris)
    for (const it of d.items) if (!it.holder) {
      const s = it.h ? 0 : this.sink(g, it.x, it.y);
      if (s >= PIT - 20) continue;
      const tgt = it.kind === d.target, y0 = (it.h || 0) + 1;
      if (tgt && !s) r.ring(it.x, y0 - 0.4, it.y, 16, 20, '#c77dff', { glow: true, opacity: 0.5 + 0.3 * Math.sin(it.bob) });
      this.drawItem3d(r, it.kind, it.x, y0 + Math.sin(it.bob) * 1.5 - s, it.y, 1.4, it.bob * 0.3, tgt ? { emissive: '#2a1040' } : {});
    }
    // jogadores: quem cai despenca no poço girando
    for (const p of g.players) {
      if (!p.alive) {
        const f = p.data.fall, y = -f * f * 520;
        if (y > -PIT + 30) r.character(p, { pose: 'fall', y, label: false });
        continue;
      }
      const it = p.data.hold;
      r.character(p, { pose: it ? 'hold' : 'auto', flash: p.tombo > 0 });
      if (it) this.drawItem3d(r, it.kind, it.x, 36, it.y, 0.95, p.dir, {});
    }
  },

  // faixa de status e aviso de quem caiu (fixos na tela)
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#c77dff' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 5 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, `ALVO: ${this.ITEMS[d.target]}  ·  CÓPIAS: ${d.copies}`, a.x + a.w, 52, { size: 13, color: '#bbb', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 220, a.y + a.h - 70, 440, 46, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, a.y + a.h - 47, { size: 20, color: d.banner.color, align: 'center' });
    }
  },

  // ---------- desenho 2D (alternativa sem WebGL) ----------
  drawIcon(c, kind, x, y, s = 1) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.lineWidth = 2; c.strokeStyle = '#111';
    switch (kind) {
      case 0: // chave inglesa
        c.rotate(-0.6); c.fillStyle = '#b9c2cc';
        c.fillRect(-3, -2, 6, 18); c.beginPath(); c.arc(0, -6, 8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#2a2f36'; c.fillRect(-3, -15, 6, 8);
        break;
      case 1: // caneca
        c.fillStyle = '#e94f4f'; c.beginPath(); c.roundRect(-9, -10, 16, 20, 3); c.fill(); c.stroke();
        c.strokeStyle = '#e94f4f'; c.lineWidth = 3; c.beginPath(); c.arc(8, 0, 5, -Math.PI / 2, Math.PI / 2); c.stroke();
        break;
      case 2: // lâmpada
        c.fillStyle = '#ffe36b'; c.beginPath(); c.arc(0, -4, 10, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#999'; c.fillRect(-5, 5, 10, 8); c.strokeRect(-5, 5, 10, 8);
        break;
      case 3: // patinho
        c.fillStyle = '#ffd21f'; c.beginPath(); c.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.arc(5, -6, 6, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = '#ff8a00'; c.beginPath(); c.moveTo(10, -6); c.lineTo(16, -4); c.lineTo(10, -2); c.fill();
        c.fillStyle = '#111'; c.fillRect(5, -8, 2, 2);
        break;
      case 4: // cone
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(-9, 10); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#fff'; c.fillRect(-5, -1, 10, 3);
        c.fillStyle = '#ff7a1a'; c.fillRect(-12, 10, 24, 4);
        break;
      case 5: // disquete
        c.fillStyle = '#3b6fd8'; c.fillRect(-11, -11, 22, 22); c.strokeRect(-11, -11, 22, 22);
        c.fillStyle = '#ccd'; c.fillRect(-6, -11, 12, 7);
        c.fillStyle = '#eee'; c.fillRect(-7, 2, 14, 9);
        break;
    }
    c.restore();
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    // arena redonda (um pouco menor na tela, para não encostar na faixa de status)
    const R = this.ARENA_R;
    c.save(); c.translate(d.cx, d.cy + 10); c.scale(0.9, 0.9); c.translate(-d.cx, -d.cy);
    c.fillStyle = '#26232d'; c.beginPath(); c.arc(d.cx, d.cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; c.beginPath(); c.moveTo(d.cx, d.cy); c.lineTo(d.cx + Math.cos(an) * R, d.cy + Math.sin(an) * R); c.stroke(); }
    // chão se abrindo (íris)
    if (d.open > 0) {
      c.save(); c.globalAlpha = d.open * 0.92; c.fillStyle = '#040405'; c.beginPath(); c.arc(d.cx, d.cy, R * d.open, 0, Math.PI * 2); c.fill(); c.restore();
    }
    c.strokeStyle = '#555'; c.lineWidth = 8; c.beginPath(); c.arc(d.cx, d.cy, R + 4, 0, Math.PI * 2); c.stroke();
    // bancos e armários
    for (const b of d.solidos) { c.fillStyle = '#6e6b63'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = '#3a3833'; c.lineWidth = 2; c.strokeRect(b.x, b.y, b.w, b.h); }
    // plataformas seguras
    for (const pad of d.pads) {
      c.fillStyle = '#16301f'; c.fillRect(pad.x, pad.y, pad.w, pad.h);
      c.strokeStyle = '#46e27b'; c.lineWidth = 3; c.strokeRect(pad.x + 2, pad.y + 2, pad.w - 4, pad.h - 4);
      c.strokeStyle = 'rgba(70,226,123,0.25)'; c.lineWidth = 1;
      for (let k = 10; k < pad.w; k += 10) { c.beginPath(); c.moveTo(pad.x + k, pad.y + 4); c.lineTo(pad.x + k, pad.y + pad.h - 4); c.stroke(); }
    }
    // itens soltos
    for (const it of d.items) if (!it.holder) {
      const glow = it.kind === d.target;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(it.x, it.y + 12, 12, 4, 0, 0, Math.PI * 2); c.fill();
      if (glow) { c.strokeStyle = `rgba(199,125,255,${0.4 + 0.3 * Math.sin(it.bob)})`; c.lineWidth = 2; c.beginPath(); c.arc(it.x, it.y, 19, 0, Math.PI * 2); c.stroke(); }
      this.drawIcon(c, it.kind, it.x, it.y + Math.sin(it.bob) * 1.5);
    }
    // jogadores (quem caiu encolhe e some no buraco)
    for (const p of g.players) {
      if (!p.alive) {
        const k = 1 - Math.min(1, p.data.fall / 0.7);
        if (k > 0) TN.draw.robot(c, p.x, p.y, p.r * k, p.color, { dir: p.dir, dead: true });
        continue;
      }
      g.drawPlayer(c, p, { flash: p.tombo > 0 });
      const it = p.data.hold;
      if (it) {
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(it.x, it.y, 15, 0, Math.PI * 2); c.fill();
        this.drawIcon(c, it.kind, it.x, it.y, 0.85);
      }
    }
    c.restore();
    // painel do alvo (pendurado sobre a plataforma no 3D; aqui num canto)
    c.fillStyle = '#1d1430'; c.strokeStyle = '#c77dff'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(a.x + 4, a.y + 4, 92, 80, 8); c.fill(); c.stroke();
    D.text(c, 'ALVO', a.x + 50, a.y + 18, { size: 11, color: '#c77dff', align: 'center' });
    if (d.target !== undefined) this.drawIcon(c, d.target, a.x + 50, a.y + 50, 1.5);
    // faixa de status
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#c77dff' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 5 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, `ALVO: ${this.ITEMS[d.target]}  ·  CÓPIAS: ${d.copies}`, a.x + a.w, 52, { size: 13, color: '#bbb', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 220, a.y + a.h - 70, 440, 46, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, a.y + a.h - 47, { size: 20, color: d.banner.color, align: 'center' });
    }
  },
});
