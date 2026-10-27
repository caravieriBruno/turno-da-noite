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
  // Layout do original (train_race), na escala 1 m = 25: chão de 12 m de largura (paredes em 480 ± 150),
  // nichos de 2 m de fundo, 4 de cada lado, simétricos, a cada 4 m (z = -6, -2, 2, 6 m), e a área de
  // jogo de z = -10 m (portão do fundo) até perto da câmera.
  NOOK_W: 54, NOOK_D: 50, NOOKS_POR_LADO: 4, NOOK_PASSO: 100,
  MEIO: 200,                      // y do meio do túnel (z = 0 do original)
  Y0: -50, Y1: 420, HALF: 150,    // túnel em y (portão do fundo → câmera) e meia largura do chão
  WAIT: 3, OPEN_AFTER: 1, TRAIN_ENTER: 3.4, TRAIN_V: 470, TRAIN_LEN: 560, CLOSE_TIME: 1.2,
  SAIDA_FIM: 1100,      // o comboio que já passou continua visível até a cauda passar daqui (atrás da câmera)

  init(g) {
    const d = g.data;
    d.floorL = 480 - this.HALF; d.floorR = 480 + this.HALF;
    d.nooks = [];
    for (let i = 0; i < this.NOOKS_POR_LADO; i++) {
      const cy = this.MEIO + (i - (this.NOOKS_POR_LADO - 1) / 2) * this.NOOK_PASSO;
      d.nooks.push({ side: -1, cy, w: this.NOOK_W, state: 'closed' });
      d.nooks.push({ side: 1, cy, w: this.NOOK_W, state: 'closed' });
    }
    d.phase = 'wait'; d.phaseT = 0; d.cycles = 0;
    d.train = null;        // { front } quando o trem está no túnel (front em y, crescendo)
    d.saida = null;        // { front } do comboio que já passou (só visual)
    // nascimentos do original: (±4 m, ±4 m) em volta do meio do túnel, olhando para o fundo
    const sp = [[-100, -100], [100, 100], [-100, 100], [100, -100]];
    g.players.forEach((p, i) => { p.x = 480 + sp[i % 4][0]; p.y = this.MEIO + sp[i % 4][1]; p.dir = -Math.PI / 2; });
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
    const tx = midX + b.noise.y * 70, ty = this.MEIO + 20 + b.noise.x * 120;
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
  // Como no original (Tunnel Hazard): túnel de serviço estreito e alto, de chapas de aço enferrujadas,
  // visto do alto e de trás, olhando para o fundo. No fundo, o portão de enrolar iluminado por trás:
  // quando o trem vem, ele sobe e o vagão de transporte de presos entra por ali. Quatro nichos em cada
  // parede, com uma prensa no alto (desce quando o nicho fecha e esmaga quem entra), lâmpada redonda no
  // chão na cor do estado e faixas zebradas nas quinas.
  camera: { pos: [480, 262, 545], target: [480, 0, 150], fov: 72 },
  env: { bg: '#060708', fog: [900, 2600], ambient: 1.0, sun: 1.2, sunDir: [-0.2, 1, 0.6], sunColor: '#e9e0cf', hemiSky: '#8a8f99', hemiGround: '#2a2420' },
  WALL_H: 340, GRADE_H: 150, PORTA_W: 262, PORTA_H: 270, PRENSA_Y: 200,

  // quanto o portão do fundo está aberto (0 fechado, 1 aberto): sobe enquanto o trem vem, desce depois
  portao(g) {
    const d = g.data;
    if (d.train) return 1;
    if (d.phase === 'warn') return TN.util.clamp(d.phaseT / (this.TRAIN_ENTER - 240 / this.TRAIN_V), 0, 1);
    if (d.phase === 'closing') return TN.util.clamp(1 - d.phaseT / this.CLOSE_TIME, 0, 1);
    return 0;
  },

  draw3d(g, r) {
    const d = g.data, U = TN.util, Y0 = this.Y0, fl = d.floorL, fr = d.floorR, H = this.WALL_H, ND = this.NOOK_D;
    const ZF = Y0 - 12, Z1 = 760, LEN = Z1 - ZF, MZ = (ZF + Z1) / 2;   // da parede do portão até atrás da câmera
    const lights = [];
    // ---- chão de concreto sujo e um trilho no meio ----
    r.plane(480, 0, MZ, fr - fl + 2 * ND + 4, LEN, '#3a3b37', { rough: 1, tex: 'piso' });
    for (let z = ZF + 14; z < Z1; z += 30) r.box(480, 0, z, 150, 3, 11, '#3a3027', { rough: 1, shadow: false });
    for (const dx of [-46, 46]) r.beam(480 + dx, 5, ZF, 480 + dx, 5, Z1, 5, '#8d959c', { metal: 0.85, rough: 0.3, shadow: false });
    r.plane(480, 0.3, MZ, 64, LEN, '#22231f', { tex: false, opacity: 0.5 });   // marca de óleo entre os trilhos
    // ---- paredes laterais de chapa: fundo contínuo, pilares entre os nichos e verga sobre cada nicho ----
    const chapa = '#7d7f79', co = { rough: 0.8, metal: 0.3, tex: 'metal' };
    for (const side of [-1, 1]) {
      const wall = side < 0 ? fl : fr, back = wall + side * ND;
      r.box(back + side * 30, 0, MZ, 60, H, LEN, chapa, co);
      const ns = d.nooks.filter((n) => n.side === side).sort((n1, n2) => n1.cy - n2.cy);
      let z = ZF;
      for (const n of [...ns, { cy: Z1 + this.NOOK_W / 2, w: this.NOOK_W }]) {
        const z2 = n.cy - n.w / 2;
        if (z2 > z) {
          // pilar: chapa maciça em cima; embaixo, grade (dá para ver quem está escondido no nicho ao lado)
          r.box((wall + back) / 2, this.GRADE_H, (z + z2) / 2, ND, H - this.GRADE_H, z2 - z, chapa, co);
          for (let bz = z + 6; bz < z2 - 2; bz += 13) r.tube(wall, 0, bz, wall, this.GRADE_H, bz, 1.8, '#34373a', { metal: 0.7, rough: 0.4 });
          r.box(wall, 0, (z + z2) / 2, 5, 6, z2 - z, '#2b2d2f', { metal: 0.6 });
        }
        z = n.cy + n.w / 2;
      }
      for (const n of ns) r.box((wall + back) / 2, this.PRENSA_Y + 34, n.cy, ND, H - this.PRENSA_Y - 34, n.w, '#4e504f', co);
      // canos e cabos ao longo da parede, no alto
      r.tube(wall - side * 8, 290, ZF, wall - side * 8, 290, Z1, 8, '#6b4a33', { metal: 0.6, rough: 0.5 });
      r.tube(wall - side * 6, 268, ZF, wall - side * 6, 268, Z1, 4, '#c9c4b8', { rough: 0.7 });
      // escorrido de ferrugem nas chapas
      for (let k = 0; k < 4; k++) r.box(wall - side * 0.6, 120 + (k % 2) * 40, ns[k] ? ns[k].cy + 50 : 0, 1, 180, 10, '#6e4127', { tex: false, shadow: false, opacity: 0.7 });
    }
    // quadro de força na parede da esquerda (fusebox do original) e cano vertical na direita
    r.box(fl + 6, 186, this.MEIO + 100, 12, 58, 36, '#7d7f7c', { metal: 0.6, rough: 0.5 });
    r.box(fl + 12.5, 190, this.MEIO + 100, 1, 50, 30, '#5f615e', { metal: 0.6 });
    r.tube(fr - 18, 0, this.MEIO - 95, fr - 18, H, this.MEIO - 95, 9, '#8a6a46', { metal: 0.5, rough: 0.6 });
    // teto escuro
    r.box(480, H, MZ, fr - fl + 2 * ND + 120, 8, LEN, '#141515', { rough: 1 });
    // ---- parede do fundo com o portão de enrolar ----
    const PW = this.PORTA_W, PH = this.PORTA_H, larg = fr - fl + 2 * ND + 120, lado = (larg - PW) / 2;
    for (const s of [-1, 1]) r.box(480 + s * (PW / 2 + lado / 2), 0, ZF - 10, lado, H, 20, chapa, co);
    r.box(480, PH, ZF - 10, PW, H - PH, 20, '#4e504f', co);
    for (let k = 0; k < 14; k++) r.box(480 - PW / 2 + (k + 0.5) * PW / 14, PH - 12, ZF + 0.5, PW / 14, 12, 2, k % 2 ? '#141414' : '#d9a800', { tex: false });   // zebrado na verga
    const ab = this.portao(g), sobe = ab * (PH - 10);
    // túnel além do portão (escuro, comprido) e a luz branca lá dentro
    r.box(480 - PW / 2 - 10, 0, ZF - 620, 20, PH, 1200, '#2a2b2a', co);
    r.box(480 + PW / 2 + 10, 0, ZF - 620, 20, PH, 1200, '#2a2b2a', co);
    r.box(480, PH, ZF - 620, PW + 40, 10, 1200, '#1a1b1b', co);
    r.plane(480, 0.2, ZF - 620, PW, 1200, '#2c2d2a', { tex: 'piso' });
    r.box(480, 0, ZF - 1200, PW, PH, 10, '#e9e6dd', { glow: true });
    // a folha do portão: chapa clara, iluminada por trás (a "boca" acesa do original); sobe ao abrir
    r.box(480, sobe, ZF - 2, PW - 4, PH - sobe, 4, '#c9c6bc', { emissive: '#8f8b80', emissiveIntensity: 0.5, tex: 'metal', metal: 0.3, rough: 0.7 });
    for (let y = sobe + 18; y < PH - 4; y += 18) r.box(480, y, ZF + 0.6, PW - 8, 2, 1, '#8c897f', { tex: false, shadow: false });
    // pisca-piscas sobre o portão (blinker frame do original)
    const warnOn = d.phase === 'warn' && Math.sin(g.time * 14) > 0;
    r.box(480, PH + 18, ZF + 2, 90, 40, 8, '#2b2c2b', { metal: 0.6 });
    for (const s of [-1, 1]) r.sphere(480 + s * 22, PH + 38, ZF + 7, 9, warnOn === (s < 0) && d.phase === 'warn' ? '#ff2a2a' : '#3a0c0c', { glow: true });
    // ---- aviso: lâmpadas vermelhas nos pilares, entre os nichos ----
    const wcol = warnOn ? '#ff2a2a' : '#3a0c0c';
    for (const side of [-1, 1]) {
      const wall = side < 0 ? fl : fr;
      const zs = d.nooks.filter((n) => n.side === side).map((n) => n.cy).sort((p1, p2) => p1 - p2);
      for (let i = 0; i < zs.length - 1; i++) {
        const z = (zs[i] + zs[i + 1]) / 2;
        r.box(wall, 172, z, 4, 16, 16, '#1a1a1a'); r.sphere(wall - side * 3, 180, z, 6, wcol, { glow: true });
      }
    }
    if (d.phase === 'warn') {
      const k = warnOn ? 1.4 : 0.25;
      lights.push([fl + 20, 180, this.MEIO - 60, '#ff2a2a', k, 520], [fr - 20, 180, this.MEIO + 100, '#ff2a2a', k, 520]);
    }
    // ---- nichos ----
    for (const n of d.nooks) this.drawNook3d(g, r, n);
    // ---- trem chegando: os faróis acendem o túnel do outro lado do portão antes de ele aparecer ----
    const warning = d.phase === 'warn' && (!d.train || d.train.front < Y0 + 40);
    if (warning) {
      const k = U.clamp(d.phaseT / this.TRAIN_ENTER, 0, 1);
      lights.unshift([480, 80, d.train ? d.train.front + 30 : ZF - 400 + 360 * k, '#fff2b0', 0.6 + 2.2 * k, 700]);
      if (ab > 0.2) r.sphere(480, 70, ZF - 700 + 400 * k, 14 + 26 * k, '#fff6c8', { glow: true, opacity: 0.7 });
    }
    // ---- trem (o que está no túnel e o que já passou) ----
    if (d.train) this.drawTrain3d(g, r, d.train.front, lights);
    if (d.saida) this.drawTrain3d(g, r, d.saida.front, lights);
    // as duas luminárias do teto do túnel (as OmniLights do original) e a luz atrás do portão
    lights.push([480, 300, this.MEIO - 84, '#f3ead8', 1.7, 800], [480, 300, this.MEIO + 182, '#f3ead8', 1.6, 800], [480, 120, ZF - 60, '#fffaf0', 0.8 + 0.8 * ab, 420]);
    for (const z of [this.MEIO - 84, this.MEIO + 182]) { r.box(480, H - 30, z, 120, 6, 26, '#2a2b2a', { metal: 0.6 }); r.box(480, H - 32, z, 110, 2, 18, '#fff4dc', { glow: true }); }
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
    r.plane(mid, 0.3, n.cy, this.NOOK_D, n.w, '#1a1b1a');
    r.plane(mid, 0.5, n.cy, this.NOOK_D - 4, n.w - 4, col, { glow: true, opacity: n.state === 'closed' ? 0.14 : 0.22 });
    r.plane(wall, 0.7, n.cy, 3, n.w, col, { glow: true });
    // lâmpada redonda no chão, na frente do nicho (a OmniLight a 1 m da parede no original)
    r.cyl(wall - n.side * 26, 0, n.cy, 11, 3, '#2a2b2a', { metal: 0.6 });
    r.disc(wall - n.side * 26, 3.2, n.cy, 8, col, { glow: true });
    // faixas zebradas nas duas quinas e marcadores altos na boca, na cor do estado (visíveis de longe)
    for (const sz of [-1, 1]) {
      const zq = n.cy + sz * (n.w / 2 + 6);
      for (let k = 0; k < 4; k++) r.plane(wall - n.side * 7, 0.6, zq + (k - 1.5) * 4 * sz, 12, 3, k % 2 ? '#141414' : '#e0b400', { tex: false });
      r.box(wall - n.side * 2.5, 0, n.cy + sz * (n.w / 2 + 3), 4, 96, 5, col, { glow: true, opacity: n.state === 'closed' ? 0.6 : 1 });
    }
    // prensa no alto do nicho: aberta fica recolhida em cima; fechada desce até a altura do peito
    // (ninguém cabe); ao esmagar, bate no chão
    const alvo = n.state === 'open' ? this.PRENSA_Y : n.state === 'closing' ? this.PRENSA_Y - 40 : 64;
    const y = n.crush > 0 ? 64 * (1 - n.crush / 0.4) : alvo;
    r.box(mid, y, n.cy, this.NOOK_D - 4, 34, n.w - 6, n.crush > 0 ? '#e8e8e8' : '#6f757c', { metal: 0.8, rough: 0.35 });
    for (let k = 0; k < 4; k++) r.cone(mid, y - 9, n.cy - (n.w - 18) / 2 + k * (n.w - 18) / 3, 5, 10, '#9aa1a8', { rotX: Math.PI, metal: 0.9, rough: 0.3 });
    r.tube(mid, y + 34, n.cy, mid, this.WALL_H, n.cy, 7, '#3f4347', { metal: 0.8 });   // haste da prensa
  },

  // vagão de transporte de presos (um comboio só, da largura do trilho, como o trem do original),
  // vindo do fundo (y crescendo): cabine na frente (y maior)
  drawTrain3d(g, r, front, lights) {
    const L = this.TRAIN_LEN, W = 250, H = 210, xc = 480;
    // vagões (com vãos entre eles)
    for (let z = front - L; z < front - 120; z += 150) {
      const z2 = Math.min(z + 142, front - 120);
      r.box(xc, 6, (z + z2) / 2, W, H - 10, z2 - z, '#4f5b66', { metal: 0.5, rough: 0.45 });
      r.box(xc, H - 4, (z + z2) / 2, W - 24, 8, z2 - z - 16, '#3b444c', { metal: 0.6 });
      for (const s of [-1, 1]) {   // janelinhas gradeadas acesas nas laterais
        for (let k = 0; k < 2; k++) {
          const wz = z + (k + 0.5) * (z2 - z) / 2;
          r.box(xc + s * (W / 2 + 0.5), 110, wz, 1, 34, 40, '#ffe8a8', { glow: true, opacity: 0.85 });
          for (let b = -1; b <= 1; b++) r.box(xc + s * (W / 2 + 1.5), 110, wz + b * 12, 1, 34, 3, '#1b1f22', { tex: false });
        }
        r.box(xc + s * (W / 2 + 0.5), 60, (z + z2) / 2, 1, 16, z2 - z - 20, '#d9a800', { tex: false });   // faixa amarela
      }
    }
    // cabine com faixas zebradas e para-brisa virado para a câmera, faróis acesos
    r.box(xc, 6, front - 60, W, H, 120, '#c9a227', { metal: 0.4, rough: 0.4 });
    r.box(xc, 120, front - 3, W - 50, 58, 6, '#1d2a33', { metal: 0.8, rough: 0.15 });
    for (let s = 0; s < 10; s++) r.box(xc - W / 2 + 12.5 + s * 25, 10, front + 0.6, 12, 40, 1, s % 2 ? '#141414' : '#f5c400', { shadow: false });
    for (const s of [-1, 1]) r.sphere(xc + s * (W / 2 - 26), 72, front + 1, 11, '#fff6c8', { glow: true });
    r.plane(xc, 0.9, front + 90, W - 20, 180, '#fff2b0', { glow: true, opacity: 0.16 });   // facho de luz à frente
    lights.unshift([480, 60, front + 70, '#fff2c0', 2.4, 460]);
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
    // faixa dos nichos (fundo escuro) e chão de concreto + o trilho do meio
    c.fillStyle = '#1a1c1f'; c.fillRect(fl - this.NOOK_D, Y0, this.NOOK_D, Y1 - Y0); c.fillRect(fr, Y0, this.NOOK_D, Y1 - Y0);
    c.fillStyle = '#25282c'; c.fillRect(fl, Y0, fr - fl, Y1 - Y0);
    c.fillStyle = '#4a3a2c';
    for (let y = Y0 + 6; y < Y1; y += 30) c.fillRect(480 - 75, y, 150, 11);
    c.fillStyle = '#9aa3ab'; c.fillRect(480 - 48, Y0, 5, Y1 - Y0); c.fillRect(480 + 43, Y0, 5, Y1 - Y0);
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
    {   // um comboio só, da largura do trilho (como no 3D)
      const x = 480 - 125, w = 250;
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
