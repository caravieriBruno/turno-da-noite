// HORA DO TREM — inspirado em "TUNNEL HAZARD" (train_race) de Machine Party.
// Túnel visto de frente: a câmera fica no fim do túnel e o trem vem do fundo, crescendo, até passar
// por baixo dela. Nichos nas duas paredes laterais. A cada ciclo a luz vermelha avisa, alguns nichos
// abrem (verdes) e o trem varre o túnel inteiro. Quem estiver no chão morre.
// A cada trem abre um nicho a menos. Nicho vermelho esmaga quem entra. AÇÃO empurra.
// Eixos da lógica: x = largura do túnel (travessia), y = eixo do túnel (y pequeno = fundo, longe).
TN.registerMinigame({
  id: 'hora_do_trem',
  title: 'HORA DO TREM',
  inspiredBy: 'Tunnel Hazard (train_race)',
  tagline: 'O TREM ESTÁ CHEGANDO.',
  brief: ['Nicho verde é seguro. Nicho vermelho esmaga.', 'Quando a luz piscar, corra para um nicho verde.', 'Cada trem abre menos nichos. Empurre quem disputar o seu.'],
  controls: { move: 'andar', a: 'empurrar' },
  icon: '⇶',
  color: '#ff5a3c',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (original: espera 3 s, nichos abrem 1 s após o aviso, 2 s de pausa,
  //      abertos = max(vivos+2-ciclos, 1); empurrão: 0,1 s de preparo, UM alvo, decaimento linear,
  //      quem empurra fica 0,5 s parado; distância reduzida para ~180 px e ~0,8 s sem controle) ----
  SPEED: 180, SHOVE: 400, SHOVE_DECAY: 444, TOMBO: 1.1, SHOVE_WIND: 0.1, SHOVE_LOCK: 0.5, SHOVE_RANGE: 72,
  FORA_DO_NICHO: 0.3,   // quem é empurrado para fora de um nicho fica este tempo sem contar como escondido
  NOOK_W: 54, NOOK_D: 50,
  Y0: -200, Y1: 540, HALF: 150,   // túnel em y (fundo → câmera) e meia largura do chão (paredes em 480 ± HALF)
  WAIT: 3, OPEN_AFTER: 1, TRAIN_ENTER: 3.4, TRAIN_V: 470, TRAIN_LEN: 560, CLOSE_TIME: 1.2,
  SAIDA_FIM: 1100,      // o comboio que já passou continua visível até a cauda passar daqui (atrás da câmera)

  init(g) {
    const d = g.data;
    d.floorL = 480 - this.HALF; d.floorR = 480 + this.HALF;
    d.nooks = [];
    const step = (this.Y1 - this.Y0 - 120) / 6;
    for (let i = 0; i < 6; i++) {
      d.nooks.push({ side: -1, cy: this.Y0 + 60 + step * (i + 0.5) - 18, w: this.NOOK_W, state: 'closed' });
      d.nooks.push({ side: 1, cy: this.Y0 + 60 + step * (i + 0.5) + 18, w: this.NOOK_W, state: 'closed' });
    }
    d.phase = 'wait'; d.phaseT = 0; d.cycles = 0;
    d.train = null;        // { front } quando o trem está no túnel (front em y, crescendo)
    d.saida = null;        // { front } do comboio que já passou (só visual)
    g.placeInCircle(480, 330, 90);
    for (const p of g.players) Object.assign(p.data, { lock: 0, wind: 0, shoveT: 0, noise: 0, noiseT: 0, foraT: 0 });
  },

  setPhase(g, ph) { g.data.phase = ph; g.data.phaseT = 0; },
  // área onde se anda: o chão mais o fundo dos nichos, ao longo do túnel inteiro
  bounds(g) { const d = g.data; return { x: d.floorL - this.NOOK_D, y: this.Y0, w: 2 * this.HALF + 2 * this.NOOK_D, h: this.Y1 - this.Y0 }; },

  // em qual nicho (coluna em y) o jogador está, e se está fundo o bastante para o trem não pegar
  nookOf(g, p) {
    const d = g.data;
    for (const n of d.nooks) {
      if (Math.abs(p.y - n.cy) > n.w / 2) continue;
      if (n.side < 0 && p.x < d.floorL + p.r - 2) return n;
      if (n.side > 0 && p.x > d.floorR - p.r + 2) return n;
    }
    return null;
  },
  isSafeIn(g, p, n) {
    const d = g.data;
    return n.side < 0 ? p.x + p.r <= d.floorL + 6 : p.x - p.r >= d.floorR - 6;
  },
  // escondido do trem: num nicho aberto, fundo o bastante, e sem ter acabado de ser expulso dele
  seguro(g, p) {
    const n = this.nookOf(g, p);
    return !!n && n.state !== 'closed' && this.isSafeIn(g, p, n) && !(p.data.foraT > 0);
  },

  update(g, dt) {
    const U = TN.util, d = g.data;
    d.phaseT += dt;
    // ---------- ciclo do trem ----------
    if (d.phase === 'wait' && d.phaseT >= this.WAIT) {
      this.setPhase(g, 'warn'); g.sfx('buzz'); g.message('TREM CHEGANDO!', 1.3, '#f44');
    } else if (d.phase === 'warn') {
      if (d.phaseT >= this.OPEN_AFTER && !d.opened) {
        d.opened = true;
        const count = Math.max(g.alive().length + 2 - d.cycles, 1);
        for (const n of TN.util.shuffle(d.nooks.slice()).slice(0, count)) n.state = 'open';
        g.sfx('confirm');
      }
      // o trem entra pelo fundo e chega a Y0 + 40 em TRAIN_ENTER
      if (d.phaseT >= this.TRAIN_ENTER - 240 / this.TRAIN_V && !d.train) { d.train = { front: this.Y0 - 200 }; g.sfx('whoosh'); }
      if (d.train) {
        d.train.front += this.TRAIN_V * dt;
        if (d.train.front - this.TRAIN_LEN > this.Y1 + 20) {
          d.saida = { front: d.train.front };
          d.train = null; d.opened = false; d.cycles++;
          for (const n of d.nooks) if (n.state === 'open') n.state = 'closing';
          this.setPhase(g, 'closing'); g.sfx('tick');
        }
      }
    } else if (d.phase === 'closing' && d.phaseT >= this.CLOSE_TIME) {
      // nichos fecham: quem ainda estiver dentro é cuspido de volta para o trilho
      for (const p of g.alive()) {
        const n = this.nookOf(g, p);
        if (n && n.state === 'closing') { p.x = n.side < 0 ? d.floorL + p.r + 2 : d.floorR - p.r - 2; p.vy = 0; p.vx = -n.side * 320; g.sfx('hit'); }
      }
      for (const n of d.nooks) n.state = 'closed';
      this.setPhase(g, 'wait');
    }
    // o comboio que passou segue até sair de trás da câmera
    if (d.saida) { d.saida.front += this.TRAIN_V * dt; if (d.saida.front - this.TRAIN_LEN > this.SAIDA_FIM) d.saida = null; }

    // ---------- jogadores ----------
    const bounds = this.bounds(g);
    for (const p of g.alive()) {
      const b = p.data;
      b.lock -= dt;
      const stunned = p.tombo > 0;   // derrubado (g.derrubar): sem controle até levantar
      if (!stunned) b.foraT = Math.max(0, b.foraT - dt);   // a janela sem reentrar conta depois do atordoamento
      const shoving = b.lock > 0;   // preparo + volta do braço: parado
      if (stunned || shoving) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, bounds); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt, bounds);
      g.decayPushLinear(p, dt, this.SHOVE_DECAY);
      // empurrão: 0,1 s de preparo e depois o impulso na direção em que está olhando
      if (p.input.aPressed && !shoving && !stunned) { b.lock = this.SHOVE_LOCK; b.wind = this.SHOVE_WIND; }
      if (b.wind > 0) {
        b.wind -= dt;
        if (b.wind <= 0) this.shove(g, p);
      }
    }
    U.separate(g.alive());
    for (const p of g.alive()) this.resolveWalls(g, p, dt);
    this.umPorNicho(g);

    // ---------- mortes ----------
    for (const p of g.alive()) {
      const n = this.nookOf(g, p);
      // entrar num nicho fechado = esmagado
      if (n && n.state === 'closed' && (n.side < 0 ? p.x < d.floorL - 2 : p.x > d.floorR + 2)) {
        g.eliminate(p, { sound: 'boom', msg: 'ESMAGADO!' });
        g.particles(p.x, p.y, '#a00', 26, 200); n.crush = 0.4;
        continue;
      }
      // o trem pega quem está no chão (ou mal escondido)
      const t = d.train;
      if (t && p.y + p.r > t.front - this.TRAIN_LEN && p.y - p.r < t.front) {
        if (!this.seguro(g, p)) {
          g.eliminate(p, { sound: 'boom', msg: 'ATROPELADO!' });
          for (let i = 0; i < 3; i++) g.particles(p.x, p.y + 20, i ? '#a00' : p.color, 14, 380);
        }
      }
    }
    for (const n of d.nooks) if (n.crush > 0) n.crush -= dt;
  },

  shove(g, p) {
    const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
    g.sfx('whoosh');
    // como no original, pega um só: o mais próximo dentro do cone
    let alvo = null, melhor = Infinity;
    for (const o of g.alive()) {
      if (o === p) continue;
      const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
      if (dist < this.SHOVE_RANGE && (dx * fx + dy * fy) / (dist || 1) > 0.2 && dist < melhor) { alvo = o; melhor = dist; }
    }
    if (!alvo) return;
    const o = alvo, dx = o.x - p.x, dy = o.y - p.y;
    // o empurrado cai (g.derrubar: a velocidade é substituída, não acumula). Quem está num nicho sai reto para o trilho
    // (a parede do nicho segurava o impulso lateral) e fica um instante sem poder se reesconder.
    const n = this.nookOf(g, o);
    const caiu = n ? g.derrubar(o, -n.side * this.SHOVE, 0, this.TOMBO) : g.derrubar(o, (dx / melhor) * this.SHOVE, (dy / melhor) * this.SHOVE, this.TOMBO);
    if (!caiu) return;   // já estava no chão
    if (n) o.data.foraT = this.FORA_DO_NICHO;
    g.sfx('hit'); g.particles((o.x + p.x) / 2, (o.y + p.y) / 2, '#fff', 6, 140);
  },

  // Nicho aberto cabe um só (como no original). Quem já está dentro fica; quem chega depois bate na
  // parede como se o nicho estivesse cheio. Sem isso, dois cabiam pela diagonal e, com um nicho só,
  // a rodada podia acabar sem vencedor.
  umPorNicho(g) {
    const d = g.data;
    for (const n of d.nooks) {
      if (n.state === 'closed') { n.dono = null; continue; }
      const dentro = g.alive().filter((p) => this.nookOf(g, p) === n);
      if (!dentro.some((p) => p.id === n.dono)) {
        // o mais fundo vira o dono
        dentro.sort((a, b) => n.side * (b.x - a.x));
        n.dono = dentro.length ? dentro[0].id : null;
      }
      for (const p of dentro) {
        if (p.id === n.dono) continue;
        const wallX = n.side < 0 ? d.floorL : d.floorR;
        p.x = wallX - n.side * p.r; if (n.side * p.vx > 0) p.vx = 0;
      }
    }
  },

  // Paredes laterais: só dá para atravessar a linha da parede dentro da coluna (em y) de um nicho.
  resolveWalls(g, p, dt) {
    const d = g.data;
    for (const side of [-1, 1]) {
      const wallX = side < 0 ? d.floorL : d.floorR;
      const pen = side < 0 ? wallX + p.r - p.x : p.x - (wallX - p.r);
      // funil: empurrando contra a parede perto de um nicho, desliza para o centro dele
      const pushing = side < 0 ? p.input.x < -0.3 : p.input.x > 0.3;
      if (pen > -6 && pushing) {
        const n = d.nooks.find((k) => k.side === side && Math.abs(p.y - k.cy) < k.w / 2 + 12);
        if (n) p.y = TN.util.approach(p.y, n.cy, 140 * dt);
      }
      if (pen <= 0) continue;
      const half = this.NOOK_W / 2 - p.r;
      const n = d.nooks.find((k) => k.side === side && Math.abs(p.y - k.cy) < half + 5);
      if (!n) { p.x = side < 0 ? wallX + p.r : wallX - p.r; if (side * p.vx > 0) p.vx = 0; continue; }
      p.y = TN.util.clamp(p.y, n.cy - half, n.cy + half);
    }
  },

  // Bot: espera no meio; quando os nichos abrem, corre para o nicho livre mais próximo que
  // consegue alcançar antes do trem, empurra quem disputar, e sai depois que o trem passa.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (p.tombo > 0) return {};
    const midX = 480;
    const cur = this.nookOf(g, p);
    const t = d.train;
    const trainPassed = t && t.front - this.TRAIN_LEN > p.y + 30;
    const opened = d.nooks.some((n) => n.state === 'open');
    b.noiseT -= dt;
    if (b.noiseT <= 0) { b.noiseT = U.rand(0.5, 1.4); b.noise = { x: U.rand(-1, 1), y: U.rand(-0.6, 0.6) }; }
    // continua um empurrão já decidido (fica virado para o alvo durante o preparo)
    if (b.shoveT > 0) { b.shoveT -= dt; const n = U.norm(b.shoveDx, b.shoveDy); return { x: n.x, y: n.y, a: true }; }

    if (opened && !trainPassed) {
      // já está seguro num nicho aberto: só afunda
      if (cur && cur.state === 'open') {
        // alguém tentando entrar/disputar? empurra para fora
        const rival = g.alive().find((o) => o !== p && Math.abs(o.y - cur.cy) < 34 && Math.abs(o.x - p.x) < 50);
        if (rival && U.chance(0.06)) return this.startShove(b, rival.x - p.x, rival.y - p.y);
        return { x: cur.side, y: (cur.cy - p.y) / 10 };
      }
      const n = this.pickNook(g, p);
      if (n) {
        const mouthX = n.side < 0 ? d.floorL + p.r + 6 : d.floorR - p.r - 6;
        const deepX = n.side < 0 ? d.floorL - this.NOOK_D : d.floorR + this.NOOK_D;
        // rival perto disputando o mesmo nicho: empurra
        const rival = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 52 && U.dist(o.x, o.y, mouthX, n.cy) < 90);
        if (rival && b.lock <= 0 && U.chance(0.12)) return this.startShove(b, rival.x - p.x, rival.y - p.y);
        const ty = n.cy, tx = Math.abs(p.y - n.cy) > 9 ? mouthX : deepX;
        const v = U.norm(tx - p.x, ty - p.y);
        return { x: v.x, y: v.y };
      }
      // sem nicho possível: foge do trem (que vem do fundo) o máximo que puder, para perto da câmera
      return { x: (midX - p.x) / 100, y: 1 };
    }
    // fora de perigo: sai do nicho e espera perto do meio do túnel
    const tx = midX + b.noise.y * 70, ty = 260 + b.noise.x * 180;
    if (cur) return { x: -cur.side, y: 0 };
    const v = U.norm(tx - p.x, ty - p.y), far = U.dist(p.x, p.y, tx, ty) > 25;
    let out = { x: far ? v.x : 0, y: far ? v.y : 0 };
    // de vez em quando empurra alguém que está do lado
    const near = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 48);
    if (near && d.phase === 'warn' && b.lock <= 0 && U.chance(0.03)) out = this.startShove(b, near.x - p.x, near.y - p.y);
    return out;
  },

  startShove(b, dx, dy) {
    b.shoveT = 0.12; b.shoveDx = dx; b.shoveDy = dy;
    const n = TN.util.norm(dx, dy);
    return { x: n.x, y: n.y, a: true };
  },

  // escolhe o nicho aberto mais promissor: perto, livre e alcançável antes do trem
  pickNook(g, p) {
    const d = g.data;
    let best = null, bestScore = 1e9;
    for (const n of d.nooks) {
      if (n.state !== 'open') continue;
      const mouthX = n.side < 0 ? d.floorL : d.floorR;
      const dist = Math.abs(p.y - n.cy) + Math.abs(p.x - mouthX);
      const myT = dist / this.SPEED + 0.3;
      if (d.train) { const trainT = (n.cy - d.train.front) / this.TRAIN_V; if (trainT < myT) continue; }
      else { const trainT = this.TRAIN_ENTER - d.phaseT + (n.cy - this.Y0) / this.TRAIN_V; if (trainT < myT) continue; }
      let score = dist;
      for (const o of g.alive()) {
        if (o === p) continue;
        const on = this.nookOf(g, o);
        if (on === n) score += 1000;                                  // ocupado
        else if (Math.abs(o.y - n.cy) + Math.abs(o.x - mouthX) < dist - 15) score += 220;  // alguém chega antes
      }
      if (p.data.goal === n) score -= 40;                             // mantém a decisão
      if (score < bestScore) { bestScore = score; best = n; }
    }
    p.data.goal = best;
    return best;
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Túnel de frente: a câmera no fim do túnel, baixa; paredes laterais de tijolo com os nichos, dois
  // trilhos em perspectiva, boca escura ao fundo de onde o trem sai (os faróis iluminam o túnel antes)
  // e o trem crescendo até passar por baixo da câmera.
  camera: { pos: [480, 160, 800], target: [480, 40, 80], fov: 50 },
  env: { bg: '#07080a', fog: [1300, 2600], ambient: 0.65, sun: 1.2, sunDir: [-0.2, 1, 0.6], sunColor: '#ffdcb0', hemiSky: '#8a8f99', hemiGround: '#2a2420' },
  WALL_H: 160,

  draw3d(g, r) {
    const d = g.data, U = TN.util, Y0 = this.Y0, Y1 = this.Y1, fl = d.floorL, fr = d.floorR, H = this.WALL_H;
    const Z0 = Y0 - 700, Z1 = 1200, LEN = Z1 - Z0, MZ = (Z0 + Z1) / 2;
    const lights = [];
    // ---- chão de cascalho e trilhos (ao longo de y) ----
    r.plane(480, -1, MZ, 1400, LEN, '#0a0b0d');
    r.plane(480, 0, MZ, fr - fl, LEN, '#2a2d31', { rough: 1 });
    for (const tx of [480 - 55, 480 + 55]) {
      for (let z = Y0 - 400; z < Z1; z += 34) r.box(tx, 0, z, 68, 3, 12, '#4a3a2c', { rough: 1, shadow: false });
      for (const dx of [-21.5, 21.5]) r.beam(tx + dx, 5, Z0, tx + dx, 5, Z1, 4, '#9aa3ab', { metal: 0.85, rough: 0.3, shadow: false });
    }
    // faixas de segurança na beira das paredes
    r.plane(fl + 2, 0.4, MZ, 4, LEN, '#f5c400', { glow: true, opacity: 0.55 });
    r.plane(fr - 2, 0.4, MZ, 4, LEN, '#f5c400', { glow: true, opacity: 0.55 });
    // ---- paredes laterais (com recortes nos nichos) ----
    const brick = '#4d3329', bo = { rough: 0.95, tex: 'tijolo' };
    for (const side of [-1, 1]) {
      const wall = side < 0 ? fl : fr, back = wall + side * this.NOOK_D;
      // parte de trás (fundo dos nichos), contínua
      r.box(back + side * 30, 0, MZ, 60, H, LEN, brick, bo);
      // segmentos entre os nichos
      const ns = d.nooks.filter((n) => n.side === side).sort((n1, n2) => n1.cy - n2.cy);
      let z = Z0;
      for (const n of [...ns, { cy: Z1 + this.NOOK_W / 2, w: this.NOOK_W }]) {
        const z2 = n.cy - n.w / 2;
        if (z2 > z) r.box((wall + back) / 2, 0, (z + z2) / 2, this.NOOK_D, H, z2 - z, brick, bo);
        z = n.cy + n.w / 2;
      }
      // vergas sobre os nichos (o nicho vira uma porta baixa) e cano ao longo da parede
      for (const n of ns) r.box((wall + back) / 2, 84, n.cy, this.NOOK_D, H - 84, n.w, brick, bo);
      r.beam(wall - side * 5, 104, Z0, wall - side * 5, 104, Z1, 9, '#4d5560', { metal: 0.7, rough: 0.4 });
      r.beam(wall - side * 4, 119, Z0, wall - side * 4, 119, Z1, 5, '#6b3a22', { metal: 0.6, rough: 0.5 });
    }
    // teto escuro e boca do túnel ao fundo
    r.box(480, H, MZ, fr - fl + 2 * this.NOOK_D + 120, 6, LEN, '#121314', { rough: 1 });
    r.box(480, 0, Y0 - 460, 1400, H + 40, 20, '#050506');
    // ---- aviso: lâmpadas vermelhas piscando nas paredes (entre os nichos) ----
    const warnOn = d.phase === 'warn' && Math.sin(g.time * 14) > 0;
    const wcol = warnOn ? '#ff2a2a' : '#3a0c0c';
    for (const side of [-1, 1]) {
      const wall = side < 0 ? fl : fr;
      const zs = d.nooks.filter((n) => n.side === side).map((n) => n.cy).sort((p1, p2) => p1 - p2);
      for (let i = 0; i < zs.length - 1; i++) {
        const z = (zs[i] + zs[i + 1]) / 2;
        r.box(wall, 62, z, 4, 14, 14, '#1a1a1a'); r.sphere(wall - side * 3, 69, z, 5, wcol, { glow: true });
      }
    }
    if (d.phase === 'warn') {
      const k = warnOn ? 1.4 : 0.25;
      lights.push([fl + 20, 140, 100, '#ff2a2a', k, 520], [fr - 20, 140, 400, '#ff2a2a', k, 520]);
    }
    // ---- nichos ----
    for (const n of d.nooks) this.drawNook3d(g, r, n);
    // ---- trem chegando: os faróis iluminam o fundo do túnel antes de ele aparecer ----
    const warning = d.phase === 'warn' && (!d.train || d.train.front < Y0 + 40);
    if (warning) {
      const k = U.clamp(d.phaseT / this.TRAIN_ENTER, 0, 1);
      lights.unshift([480, 50, d.train ? d.train.front + 30 : Y0 - 100 + 300 * k, '#fff2b0', 0.6 + 2.2 * k, 600]);
      r.sphere(480, 30, Y0 - 420, 10 + 30 * k, '#fff6c8', { glow: true, opacity: 0.6 });
    }
    // ---- trem (o que está no túnel e o que já passou) ----
    if (d.train) this.drawTrain3d(g, r, d.train.front, lights);
    if (d.saida) this.drawTrain3d(g, r, d.saida.front, lights);
    // luzes de serviço quentes ao longo das paredes (a câmera está no fim do túnel: as mais perto dela pesam mais)
    lights.push([fl + 30, 150, 520, '#ffd9a8', 1.1, 620], [fr - 30, 150, 300, '#ffd9a8', 1.0, 620], [fl + 30, 150, 60, '#ffd9a8', 0.9, 620], [fr - 30, 150, -160, '#ffd9a8', 0.8, 620]);
    for (const l of lights.slice(0, 6)) r.light(...l);
    // ---- jogadores ----
    for (const p of g.players) {
      if (!p.alive) { r.character(p); continue; }
      const busy = p.data.wind > 0;
      r.character(p, { pose: busy ? 'work' : 'auto', flash: p.tombo > 0 || busy });
    }
  },

  drawNook3d(g, r, n) {
    const d = g.data, wall = n.side < 0 ? d.floorL : d.floorR;
    const back = wall + n.side * this.NOOK_D, mid = (wall + back) / 2;
    const blink = n.state === 'closing' && Math.sin(g.time * 18) > 0;
    const col = n.state === 'open' ? '#2fdc5a' : n.state === 'closing' ? (blink ? '#ffd23f' : '#6a5a10') : '#d0302a';
    // piso do nicho (brilho fraco da cor do estado) e soleira acesa
    r.plane(mid, 0.3, n.cy, this.NOOK_D, n.w, '#121416');
    r.plane(mid, 0.5, n.cy, this.NOOK_D - 4, n.w - 4, col, { glow: true, opacity: n.state === 'closed' ? 0.14 : 0.22 });
    r.plane(wall, 0.7, n.cy, 3, n.w, col, { glow: true });
    // lâmpada do batente e dois marcadores altos na boca, na cor do estado (visíveis de frente, de longe)
    r.box(wall - n.side * 1.5, 86, n.cy, 3, 10, 24, '#1a1a1a'); r.box(wall - n.side * 3.2, 88, n.cy, 1, 6, 20, col, { glow: true });
    for (const sz of [-1, 1]) r.box(wall - n.side * 2.5, 0, n.cy + sz * (n.w / 2 + 4), 4, 90, 6, col, { glow: true, opacity: n.state === 'closed' ? 0.6 : 1 });
    // prensa dentada (nicho fechado): parede de dentes no fundo; avança quando esmaga
    if (n.state === 'closed') {
      const slam = n.crush > 0 ? n.crush / 0.4 : 0;
      const px = back - n.side * (6 + slam * (this.NOOK_D - 14));
      r.box(px, 0, n.cy, 10, 70, n.w - 4, n.crush > 0 ? '#e8e8e8' : '#6f757c', { metal: 0.8, rough: 0.35 });
      for (let k = 0; k < 4; k++) for (const hy of [14, 44]) {
        r.cone(px - n.side * 5, hy, n.cy - (n.w - 14) / 2 + k * (n.w - 14) / 3, 5, 12, '#9aa1a8', { rotZ: n.side < 0 ? -Math.PI / 2 : Math.PI / 2, metal: 0.9, rough: 0.3 });
      }
    }
  },

  // comboio de dois trens lado a lado vindo do fundo (y crescendo): cabine na frente (y maior)
  drawTrain3d(g, r, front, lights) {
    const L = this.TRAIN_LEN, W = 130;
    for (const k of [-1, 1]) {
      const xc = 480 + k * 72;
      // vagões (com vãos entre eles)
      for (let z = front - L; z < front - 90; z += 125) {
        const z2 = Math.min(z + 118, front - 90);
        r.box(xc, 8, (z + z2) / 2, W, 64, z2 - z, '#5a6470', { metal: 0.5, rough: 0.45 });
        r.box(xc + k * (W / 2 + 0.5), 40, (z + z2) / 2, 1, 14, z2 - z - 16, '#ffe8a8', { glow: true, opacity: 0.85 });   // janelas acesas
        r.box(xc, 72, (z + z2) / 2, W - 20, 6, z2 - z - 20, '#434c55', { metal: 0.6 });
      }
      // cabine amarela com para-brisa virado para a câmera e faróis
      r.box(xc, 8, front - 46, W, 74, 88, '#c9a227', { metal: 0.4, rough: 0.4 });
      r.box(xc, 48, front - 3, W - 22, 22, 6, '#1d2a33', { metal: 0.8, rough: 0.15 });
      for (let s = 0; s < 6; s++) r.box(xc - W / 2 + 12 + s * 21, 8, front + 0.6, 10, 20, 1, s % 2 ? '#141414' : '#f5c400', { shadow: false });
      for (const s of [-1, 1]) r.sphere(xc + s * (W / 2 - 12), 28, front + 1, 7, '#fff6c8', { glow: true });
      // facho de luz à frente
      r.plane(xc, 0.9, front + 70, W - 10, 140, '#fff2b0', { glow: true, opacity: 0.18 });
      for (const wx of [-1, 1]) r.cyl(xc + wx * (W / 2 - 6), 0, front - 60, 10, 6, '#111', { rotZ: Math.PI / 2 });
    }
    lights.unshift([480, 40, front + 60, '#fff2c0', 2.4, 420]);
  },

  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const d = g.data, D = TN.draw;
    const warning = d.phase === 'warn' && (!d.train || d.train.front < this.Y0 + 40);
    if (warning && Math.sin(g.time * 14) > 0) {
      const s = TN.R3.project(480, 0, this.Y0 + 60);
      D.text(c, '▼ TREM', s.x, s.y, { size: 28, color: '#ff4040', align: 'center' });
    }
    const open = d.nooks.filter((n) => n.state === 'open').length;
    let txt = null, col = '#aaa';
    if (d.phase === 'wait') txt = `PRÓXIMO TREM: ${Math.max(0, this.WAIT - d.phaseT).toFixed(1)} s`;
    else if (open) { txt = `NICHOS ABERTOS: ${open}`; col = '#4f4'; }
    if (txt) { D.panel(c, g.W / 2 - 120, g.H - 34, 240, 24, { fill: 'rgba(8,10,12,0.75)', stroke: col }); D.text(c, txt, g.W / 2, g.H - 22, { size: 15, color: col, align: 'center' }); }
  },

  // ---------------- 2D (alternativa sem WebGL): túnel de cima, trem de cima para baixo da tela ----------------
  draw(g, c) {
    const d = g.data, D = TN.draw, U = TN.util, Y0 = this.Y0, Y1 = this.Y1, fl = d.floorL, fr = d.floorR;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    const k = 506 / (Y1 - Y0);
    c.save();
    c.translate(480 - 480 * k, 34); c.scale(k, k); c.translate(0, -Y0);   // y do mundo → tela, escala uniforme centrada em x
    // paredes de tijolo
    for (const [x0, w] of [[fl - this.NOOK_D - 58, 58], [fr + this.NOOK_D, 58]]) {
      c.fillStyle = '#3a3330'; c.fillRect(x0, Y0, w, Y1 - Y0);
      c.strokeStyle = '#2a2422'; c.lineWidth = 2;
      for (let col = 0; col * 14 < w; col++) {
        c.beginPath(); c.moveTo(x0 + col * 14, Y0); c.lineTo(x0 + col * 14, Y1); c.stroke();
        for (let y = Y0 + (col % 2) * 20; y < Y1; y += 40) { c.beginPath(); c.moveTo(x0 + col * 14, y); c.lineTo(x0 + Math.min(w, col * 14 + 14), y); c.stroke(); }
      }
    }
    // faixa dos nichos (fundo escuro) e chão de cascalho + dois trilhos
    c.fillStyle = '#1a1c1f'; c.fillRect(fl - this.NOOK_D, Y0, this.NOOK_D, Y1 - Y0); c.fillRect(fr, Y0, this.NOOK_D, Y1 - Y0);
    c.fillStyle = '#25282c'; c.fillRect(fl, Y0, fr - fl, Y1 - Y0);
    for (const tx of [480 - 55, 480 + 55]) {
      c.fillStyle = '#4a3a2c';
      for (let y = Y0 + 6; y < Y1; y += 26) c.fillRect(tx - 34, y, 68, 12);
      c.fillStyle = '#9aa3ab'; c.fillRect(tx - 24, Y0, 5, Y1 - Y0); c.fillRect(tx + 19, Y0, 5, Y1 - Y0);
    }
    c.fillStyle = 'rgba(245,196,0,0.5)'; c.fillRect(fl, Y0, 3, Y1 - Y0); c.fillRect(fr - 3, Y0, 3, Y1 - Y0);
    // aviso: lâmpadas vermelhas nas paredes piscando; farol do trem vindo do fundo (de cima)
    const warning = d.phase === 'warn' && (!d.train || d.train.front < Y0 + 40);
    if (d.phase === 'warn') {
      const on = Math.sin(g.time * 14) > 0;
      for (let y = Y0 + 30; y < Y1; y += 110) {
        for (const x of [fl - this.NOOK_D - 8, fr + this.NOOK_D + 8]) {
          c.fillStyle = on ? '#ff2a2a' : '#4a0d0d'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
        }
      }
      if (warning) {
        const k = U.clamp(d.phaseT / this.TRAIN_ENTER, 0, 1);
        const gr = c.createLinearGradient(0, Y0, 0, Y0 + 260 * k + 40);
        gr.addColorStop(0, `rgba(255,240,160,${0.45 * k})`); gr.addColorStop(1, 'rgba(255,240,160,0)');
        c.fillStyle = gr; c.fillRect(fl, Y0, fr - fl, 300);
        if (on) D.text(c, '▼ TREM', 480, Y0 + 40, { size: 26, color: '#ff4040', align: 'center' });
      }
    }
    // nichos
    for (const n of d.nooks) this.drawNook(g, c, n);
    // jogadores mortos (embaixo do trem), vivos
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.alive()) g.drawPlayer(c, p, { flash: Math.hypot(p.vx, p.vy) > 40 || p.data.wind > 0 });
    // trem (dois comboios lado a lado)
    if (d.train) this.drawTrain(g, c, d.train.front);
    if (d.saida) this.drawTrain(g, c, d.saida.front);
    c.restore();
    // contagem de nichos abertos
    const open = d.nooks.filter((n) => n.state === 'open').length;
    if (d.phase === 'wait') D.text(c, `PRÓXIMO TREM: ${Math.max(0, this.WAIT - d.phaseT).toFixed(1)} s`, g.W / 2, g.H - 18, { size: 16, color: '#aaa', align: 'center' });
    else if (open) D.text(c, `NICHOS ABERTOS: ${open}`, g.W / 2, g.H - 18, { size: 16, color: '#4f4', align: 'center' });
  },

  drawNook(g, c, n) {
    const d = g.data, w = n.w;
    const y = n.cy - w / 2, x = n.side < 0 ? d.floorL - this.NOOK_D : d.floorR;
    const blink = n.state === 'closing' && Math.sin(g.time * 18) > 0;
    const col = n.state === 'open' ? '#2fdc5a' : n.state === 'closing' ? (blink ? '#ffd23f' : '#6a5a10') : '#d0302a';
    c.fillStyle = '#121416'; c.fillRect(x, y, this.NOOK_D, w);
    c.fillStyle = n.state === 'open' ? 'rgba(47,220,90,0.22)' : n.state === 'closed' ? 'rgba(208,48,42,0.18)' : 'rgba(255,210,63,0.15)';
    c.fillRect(x, y, this.NOOK_D, w);
    if (n.state === 'closed') {
      // prensa: dentes no fundo do nicho
      const back = n.side < 0 ? x : x + this.NOOK_D;
      c.fillStyle = n.crush > 0 ? '#fff' : '#777';
      for (let k = 0; k < 5; k++) {
        const ty = y + 3 + k * (w - 6) / 5;
        c.beginPath(); c.moveTo(back, ty); c.lineTo(back - n.side * 12, ty + (w - 6) / 10); c.lineTo(back, ty + (w - 6) / 5); c.fill();
      }
    }
    c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, this.NOOK_D - 3, w - 3);
    // lâmpada no batente
    const lx = n.side < 0 ? x + this.NOOK_D - 6 : x + 6;
    c.fillStyle = col; c.beginPath(); c.arc(lx, n.cy, 4, 0, Math.PI * 2); c.fill();
  },

  drawTrain(g, c, front) {
    const d = g.data, L = this.TRAIN_LEN;
    c.save();
    c.beginPath(); c.rect(d.floorL - 4, this.Y0 - 400, d.floorR - d.floorL + 8, 2000); c.clip();
    const half = (d.floorR - d.floorL) / 2;
    for (let k = 0; k < 2; k++) {
      const x = d.floorL + k * half + 3, w = half - 6;
      c.fillStyle = '#5a6470'; c.strokeStyle = '#1a1d20'; c.lineWidth = 3;
      c.beginPath(); c.roundRect(x, front - L, w, L, 10); c.fill(); c.stroke();
      c.fillStyle = '#c9a227'; c.beginPath(); c.roundRect(x + 4, front - 70, w - 8, 66, 12); c.fill();   // cabine
      c.fillStyle = '#1d2a33'; c.fillRect(x + 14, front - 28, w - 28, 14);                              // para-brisa
      c.fillStyle = '#434c55';
      for (let y = front - L + 20; y < front - 90; y += 70) c.fillRect(x + 14, y, w - 28, 48);         // vagões
      // farol
      const gr = c.createLinearGradient(0, front, 0, front + 120);
      gr.addColorStop(0, 'rgba(255,245,180,0.55)'); gr.addColorStop(1, 'rgba(255,245,180,0)');
      c.fillStyle = gr; c.fillRect(x + 6, front, w - 12, 120);
    }
    c.restore();
  },
});
