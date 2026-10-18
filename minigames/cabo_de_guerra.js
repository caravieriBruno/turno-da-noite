// CABO DE GUERRA — brincadeira de criança, revisada pelo Departamento de Segurança (que foi demitido).
// Visão lateral: dois times puxam um cabo por cima da fornalha. A força vem de ALTERNAR AÇÃO e EXTRA
// no ritmo certo; apertar rápido demais gasta a "pegada" e a mão escorrega. De vez em quando o
// Supervisor anuncia um TRANCO!: quem apertar AÇÃO na hora dá um puxão enorme.
// Quando a fita vermelha cruza o limite, o time perdedor é arrastado para o fogo.
// Tempo esgotado: perde o lado para onde a fita pende. Exatamente no meio? Os dois perdem.
TN.registerMinigame({
  id: 'cabo_de_guerra',
  title: 'CABO DE GUERRA',
  inspiredBy: 'brincadeira: cabo de guerra',
  tagline: 'A FORNALHA NÃO TORCE PARA NINGUÉM.',
  brief: [
    'Alterne AÇÃO e EXTRA, uns 4 toques por segundo. Martelar escorrega.',
    'O anel embaixo de você pulsa no ritmo certo: verde = bom, vermelho = afobado.',
    'No TRANCO!, aperte AÇÃO na hora certa.',
    'Quem for arrastado até o fogo vira cinza.',
  ],
  controls: { a: 'puxar (alterne com EXTRA)', b: 'puxar (alterne com AÇÃO)' },
  icon: '⇆',
  color: '#ff8a1e',
  rounds: 3,
  timeLimit: 30,
  scoring: 'points',          // vencedores +2 cada; quem mais puxou na rodada +1 (mesmo morto)
  endWhenOneLeft: false,

  // ---- cenário (visão lateral) ----
  GROUND: 400, PIT_L: 390, PIT_R: 570, CENTER: 480,
  FRONT_L: 280, FRONT_R: 680, SPACING: 80, LIMIT: 110,
  // ---- ritmo e força ----
  FAST: 0.20,        // intervalo menor que isso = afobado (gasta pegada); a janela boa é 0,20–0,32 s (3 a 5 toques/s)
  SLOW: 0.32,        // intervalo maior que isso = puxão preguiçoso
  IMP_GOOD: 1, IMP_FAST: 0.3, IMP_SLOW: 0.7, IMP_SAME: 0.2,
  RITMO_HZ: 4,       // cadência ideal mostrada no HUD (centro da janela)
  DECAY: 2.5,        // a força de cada puxão se esvai (por segundo)
  K: 18,             // px/s de cabo por unidade de diferença de força
  GRIP_COST: 0.18, GRIP_REGEN: 0.25, SLIP_TIME: 1.0,
  SOLO_BONUS: 1.6,
  // ---- tranco ----
  WARN: 0.9, WINDOW: 0.45, BURST: 3.4,

  init(g) {
    const U = TN.util, d = g.data;
    d.rope = 0; d.ropeV = 0; d.phase = 'pull'; d.loser = null; d.endT = 0;
    d.tranco = { state: 'idle', t: 0, next: U.rand(5, 7), id: 0 };
    // sorteia os times da rodada
    const order = U.shuffle(g.players.slice());
    const n = order.length;
    let L, R;
    if (n === 3) { L = [order[0]]; R = order.slice(1); if (U.chance(0.5)) [L, R] = [R, L]; }
    else { const h = Math.max(1, Math.floor(n / 2)); L = order.slice(0, h); R = order.slice(h); }
    d.teams = { L, R };
    // com 1 jogador só, o adversário é um manequim de testes (força constante)
    d.phantom = R.length === 0 ? { force: 2.1 } : null;
    for (const [side, team, other] of [['L', L, R], ['R', R, L]]) {
      team.forEach((p, i) => {
        p.data = {
          team: side, slot: i,
          base: side === 'L' ? this.FRONT_L - i * this.SPACING : this.FRONT_R + i * this.SPACING,
          power: 0, grip: 1, last: null, lastT: -1, slip: 0, total: 0, kick: 0,
          trancoDone: true, fall: null, won: false,
          bonus: team.length === 1 && other.length >= 2 ? this.SOLO_BONUS : 1,
        };
        p.x = p.data.base; p.y = this.GROUND; p.dir = side === 'L' ? 0 : Math.PI;
      });
    }
  },

  // força efetiva de um puxão: pegada fraca = mão escorregando
  mult(p) { return (0.35 + 0.65 * p.data.grip) * p.data.bonus; },

  teamForce(g, side) {
    const team = g.data.teams[side];
    if (!team.length && g.data.phantom) return g.data.phantom.force;
    let f = 0;
    for (const p of team) if (p.alive && p.data.slip <= 0) f += p.data.power * this.mult(p);
    return f;
  },

  update(g, dt) {
    const d = g.data;
    if (!d.started) { d.started = true; g.message('PUXEM.', 1.2, this.color); }
    if (d.phase === 'pull') {
      this.updateTranco(g, dt);
      for (const p of g.alive()) this.handlePulls(g, p, dt);
      const fl = this.teamForce(g, 'L'), fr = this.teamForce(g, 'R');
      d.tension = Math.min(1, (fl + fr) / 7);
      const target = (fr - fl) * this.K * (1 + 0.8 * g.time / 30);   // positivo = cabo vai para a direita; o aço esquenta e escorrega mais com o tempo
      d.ropeV += (target - d.ropeV) * Math.min(1, 6 * dt);
      d.rope += d.ropeV * dt;
      for (const p of g.players) p.x = p.data.base + d.rope;
      if (d.rope >= this.LIMIT) this.resolve(g, 'L');
      else if (d.rope <= -this.LIMIT) this.resolve(g, 'R');
    } else {
      this.updateFall(g, dt);
    }
  },

  updateTranco(g, dt) {
    const U = TN.util, t = g.data.tranco;
    t.t += dt;
    if (t.state === 'idle' && g.time >= t.next) {
      t.state = 'warn'; t.t = 0; t.beeps = 0;
    } else if (t.state === 'warn') {
      if (t.t >= t.beeps * 0.3) { t.beeps++; TN.audio.beep(660, 0.06, 'square'); }
      if (t.t >= this.WARN) {
        t.state = 'go'; t.t = 0; t.id++;
        for (const p of g.players) p.data.trancoDone = false;
        g.sfx('go'); g.flash(this.color, 0.12);
      }
    } else if (t.state === 'go' && t.t >= this.WINDOW) {
      t.state = 'idle'; t.next = g.time + U.rand(4.5, 7.5);
      for (const p of g.players) p.data.trancoDone = true;
    }
  },

  handlePulls(g, p, dt) {
    const q = p.data, tr = g.data.tranco;
    q.power *= Math.max(0, 1 - this.DECAY * dt);
    q.grip = Math.min(1, q.grip + this.GRIP_REGEN * dt);
    q.kick = Math.max(0, q.kick - dt * 5);
    if (q.slip > 0) { q.slip -= dt; q.power = 0; return; }
    const presses = [];
    if (p.input.aPressed) presses.push('a');
    if (p.input.bPressed) presses.push('b');
    for (const btn of presses) {
      const gap = g.time - q.lastT;
      const fast = q.lastT >= 0 && gap < this.FAST;
      let imp;
      if (q.last === btn) imp = this.IMP_SAME;          // repetir o mesmo botão: quase nada
      else if (fast) imp = this.IMP_FAST;
      else if (gap > this.SLOW) imp = this.IMP_SLOW;
      else imp = this.IMP_GOOD;                          // alternou no ritmo: puxão cheio
      if (fast) q.grip -= this.GRIP_COST;
      // qualidade do toque, para o medidor de cadência do HUD (antes o jogador não via o ritmo, só o resultado)
      const qual = q.last === btn ? 'mesmo' : fast ? 'afobado' : gap > this.SLOW ? 'devagar' : 'bom';
      const ehTranco = tr.state === 'go' && !q.trancoDone;   // o TRANCO é um evento à parte: não entra na cadência
      if (qual !== q.qualidade && !ehTranco) {
        q.qualidade = qual; q.qualidadeT = 0;
        if (qual === 'afobado') g.popup('AFOBADO', p.x, p.y - 80, '#f55');
        else if (qual === 'devagar' && q.lastT >= 0) g.popup('DEVAGAR', p.x, p.y - 80, '#aaa');
      }
      const m = this.mult(p);
      // TRANCO: só o primeiro botão depois do aviso conta
      if (tr.state === 'go' && !q.trancoDone) {
        q.trancoDone = true;
        if (btn === 'a') {
          const burst = this.BURST * (1 - 0.5 * tr.t / this.WINDOW);
          q.power += burst; q.total += burst * m;
          g.popup('TRANCO!', p.x, p.y - 80, '#ffd23f');
          g.sfx('hit'); g.shake(4);
          g.particles(p.x, p.y - 30, '#ffd23f', 8, 160);
        } else {
          g.popup('ERROU', p.x, p.y - 80, '#f55');
        }
      }
      q.power += imp; q.total += imp * m;
      q.last = btn; q.lastT = g.time; q.kick = 1;
      if (q.grip <= 0) {
        q.grip = 0; q.slip = this.SLIP_TIME; q.power = 0;
        g.popup('ESCORREGOU!', p.x, p.y - 80, '#f55');
        g.sfx('whoosh');
        break;
      }
    }
  },

  // Decide quem vai para o fogo. side: 'L', 'R' ou 'both'.
  resolve(g, side) {
    const d = g.data;
    if (d.phase !== 'pull') return;
    d.phase = 'fall'; d.loser = side; d.endT = 0;
    const losers = side === 'both' ? g.players.slice() : d.teams[side];
    const winners = side === 'both' ? [] : d.teams[side === 'L' ? 'R' : 'L'];
    for (const p of losers) {
      // o time da esquerda é arrastado para a direita, e vice-versa
      const toRight = p.data.team === 'L';
      p.data.fall = { vx: (toRight ? 1 : -1) * TN.util.rand(240, 290), vy: 0, rot: 0, falling: false, done: false };
      p.data.slip = 0;
    }
    for (const p of winners) {
      p.data.won = true;
      g.addScore(p, 2, { popup: false });
      g.popup('+2', p.x, p.y - 84, '#ff0');
    }
    // quem mais puxou leva +1 (prêmio póstumo é permitido)
    const best = Math.max(...g.players.map((p) => p.data.total));
    if (best > 0) {
      for (const p of g.players) if (p.data.total >= best - 1e-6) {
        g.addScore(p, 1, { popup: false });
        g.popup('+1 MVP', p.x, p.y - 104, '#7ff');
      }
    }
    if (side === 'both') g.message('EMPATE. AMBOS DESCARTADOS.', 2.2, '#f55');
    else if (!losers.length) g.message('O MANEQUIM FOI INCINERADO.', 2, this.color);
    else g.message(losers.map((p) => p.label).join(' + ') + ': INCINERADOS', 2, '#f55');
    g.sfx('whoosh'); g.shake(8);
    g.finish(2.6);
  },

  updateFall(g, dt) {
    const d = g.data;
    d.endT += dt;
    // a fita corre para o lado de quem venceu
    if (d.loser === 'L') d.rope += 160 * dt;
    else if (d.loser === 'R') d.rope -= 160 * dt;
    for (const p of g.players) {
      const f = p.data.fall;
      if (!f || f.done) continue;
      if (!f.falling) {
        p.x += f.vx * dt;
        if (p.x > this.PIT_L + 10 && p.x < this.PIT_R - 10) { f.falling = true; f.vy = -140; g.sfx('jump'); }
      } else {
        f.vx *= Math.max(0, 1 - 2 * dt);
        p.x += f.vx * dt;
        p.x = TN.util.clamp(p.x, this.PIT_L + 12, this.PIT_R - 12);
        f.vy += 1000 * dt; p.y += f.vy * dt;
        f.rot += (f.vx > 0 ? 5 : -5) * dt;
        if (p.y > 515) {
          f.done = true; p.y = 515;
          g.eliminate(p, { sound: 'boom', particles: false, msg: 'CINZAS' });
          g.particles(p.x, 500, '#ff8a1e', 30, 300);
          g.particles(p.x, 500, '#ffd23f', 18, 220);
          g.particles(p.x, 500, '#333', 14, 120, 1.2, 5);
          g.shake(12);
        }
      }
    }
  },

  onTimeUp(g) {
    const d = g.data;
    if (d.phase !== 'pull') return;
    g.message('TEMPO!', 1, '#fff');
    if (Math.abs(d.rope) < 2) this.resolve(g, 'both');
    else this.resolve(g, d.rope > 0 ? 'L' : 'R');
  },

  // Bot: alterna os botões numa cadência perto do ideal (com ruído e erros), alivia quando a pegada
  // está baixa e reage ao TRANCO! com um tempo de reação humano (às vezes tarde demais ou no botão errado).
  bot(g, p) {
    const U = TN.util, q = p.data, d = g.data, tr = d.tranco;
    const b = q.bot || (q.bot = {
      // cadência dentro da janela boa (0,20–0,32 s); com o ±0,03 o bot nunca fica afobado
      cad: U.rand(0.23, 0.30), err: U.rand(0.03, 0.1), next: U.rand(0.05, 0.4), trId: 0, trAt: 0, trBtn: 'a',
    });
    if (d.phase !== 'pull' || q.slip > 0) { b.next = g.time + U.rand(0.05, 0.25); return {}; }
    // TRANCO: agenda a reação
    if (tr.state === 'go' && b.trId !== tr.id) {
      b.trId = tr.id;
      b.trAt = g.time + (U.chance(0.12) ? U.rand(0.45, 0.6) : U.rand(0.12, 0.38));
      b.trBtn = U.chance(0.88) ? 'a' : 'b';
    }
    let btn = null;
    if (tr.state === 'go' && !q.trancoDone && b.trId === tr.id) {
      if (g.time >= b.trAt && g.time - q.lastT > 0.03) btn = b.trBtn;
    } else if (g.time >= b.next) {
      btn = q.last === 'a' ? 'b' : 'a';
      if (q.last && U.chance(b.err)) btn = q.last;          // tropeço de ritmo
    }
    if (!btn) return {};
    let gap = b.cad + U.rand(-0.03, 0.03);
    if (q.grip < 0.45) gap += 0.09;                           // poupa a pegada
    b.next = g.time + gap;
    return { a: btn === 'a', b: btn === 'b' };
  },

  // ---------------- desenho ----------------
  handPoint(p) {
    const q = p.data, f = q.team === 'L' ? 1 : -1;
    const lean = this.leanOf(p);
    const lx = f * 13, ly = -24;
    return { x: p.x + lx * Math.cos(lean) - ly * Math.sin(lean), y: p.y + lx * Math.sin(lean) + ly * Math.cos(lean) };
  },

  leanOf(p) {
    const q = p.data, back = q.team === 'L' ? -1 : 1;
    if (q.fall) return q.fall.falling ? q.fall.rot : -back * 0.35;     // tombando para a frente
    if (q.won) return back * 1.15;                                     // caiu sentado (de alívio)
    if (q.slip > 0) return -back * 0.2;
    return back * (0.18 + 0.22 * Math.min(1, q.power / 3) + 0.05 * q.kick);
  },

  // ---------------- 3D (câmera fixa) ----------------
  // Palco de frente: X = p.x, Y = altura (queda no fosso = p.y abaixo do chão), Z = linha do cabo.
  camera: { pos: [480, 300, 1130], target: [480, 76, 400], fov: 37 },
  env: { bg: '#080606', fog: [1000, 2500], ambient: 0.45, sun: 1.0, sunDir: [-0.3, 1, 0.75], sunColor: '#ffdcb8' },
  S3: 1.45, PZ3: 400, PIT_D: 140,

  // posição 3D do jogador — usada pelos rótulos do motor
  worldPos(g, p) { return { x: p.x, y: -(p.y - this.GROUND), z: this.PZ3 }; },

  // inclinação 3D (rad, positivo = para trás) a partir da inclinação 2D
  lean3(p) { return (p.data.team === 'L' ? -1 : 1) * this.leanOf(p); },

  // ponto das mãos no cabo (mundo 3D)
  hand3(p) {
    const q = p.data, S = this.S3, dir = q.team === 'L' ? 0.3 : Math.PI - 0.3;
    const y0 = -(p.y - this.GROUND);
    let lx, ly, a = this.lean3(p);
    if (q.won && !q.fall) { lx = 9; ly = 20; a = 0; return { x: p.x + lx * S * Math.cos(dir), y: y0 - 20 * S + ly * S, z: this.PZ3 + lx * S * Math.sin(dir) }; }
    lx = 19; ly = 41;
    const x2 = lx * Math.cos(a) - ly * Math.sin(a), y2 = lx * Math.sin(a) + ly * Math.cos(a);
    return { x: p.x + x2 * S * Math.cos(dir), y: y0 + y2 * S, z: this.PZ3 + x2 * S * Math.sin(dir) };
  },

  draw3d(g, r) {
    const d = g.data, t = g.time, S = this.S3, PZ = this.PZ3, PL = this.PIT_L, PR = this.PIT_R, CX = this.CENTER, PD = this.PIT_D;
    const Z0 = 260, Z1 = 540;   // fundo e frente das plataformas
    // ---- caldeira do subsolo: parede de concreto úmido com pilares e canos ----
    r.box(480, -300, Z0 - 40, 2000, 900, 20, '#2d302f', { tex: 'concreto' });
    for (let x = -480; x < 1500; x += 240) r.box(x, -300, Z0 - 26, 30, 900, 10, '#262928', { tex: 'concreto' });
    r.tube(-520, 120, Z0 - 18, 1480, 120, Z0 - 18, 9, '#4d4038', { metal: 0.5 });
    r.tube(-520, 96, Z0 - 20, 1480, 96, Z0 - 20, 6, '#39443f', { metal: 0.5 });
    r.tube(-520, 300, Z0 - 20, 1480, 300, Z0 - 20, 7, '#4d4038', { metal: 0.5 });
    r.plane(480, -PD - 60, 600, 2600, 1400, '#060505');
    // ---- plataformas ----
    for (const [x0, x1] of [[-200, PL], [PR, 1160]]) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      r.box(cx, -PD - 60, (Z0 + Z1) / 2, w, PD + 60, Z1 - Z0, '#2a2e35', { metal: 0.3, rough: 0.7 });
      for (let x = x0 + 20; x < x1; x += 60) r.plane(x, 0.3, (Z0 + Z1) / 2, 2, Z1 - Z0, '#20242a', { shadow: false });
      for (let x = x0; x < x1; x += 30) r.box(x + 15, -3, Z1 + 0.5, 15, 3, 1, '#c9a100', { shadow: false });
    }
    // bordas do fosso com listras
    for (const ex of [PL - 5, PR + 5]) for (let k = 0; k < 14; k++) r.box(ex, -PD + k * 10, Z1 + 0.6, 10, 5, 1, '#c9a100', { shadow: false });
    // marcas de limite (onde a fita vermelha precisa chegar)
    for (const lx of [CX - this.LIMIT, CX + this.LIMIT]) r.plane(lx, 0.5, (Z0 + Z1) / 2, 3, Z1 - Z0, '#ff2a2a', { glow: true, opacity: 0.55 });
    // ---- fosso com fogo ----
    r.box(480, -PD - 60, Z0 - 10, PR - PL, PD + 60, 10, '#1a0703');
    r.plane(480, -PD, (Z0 + Z1) / 2, PR - PL, Z1 - Z0, Math.sin(t * 5) > 0 ? '#9a2a00' : '#8a2400', { glow: true });
    r.box(480, -PD - 60, Z1 - 4, PR - PL, 40, 8, '#2a1206', { metal: 0.4 });          // borda baixa da frente
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
      const fx = PL + 14 + i * ((PR - PL - 28) / 8), fz = Z0 + 50 + j * 90 + (i % 2) * 20;
      const h = 34 + Math.sin(t * 9 + i * 1.7 + j) * 14 + Math.sin(t * 4.3 + i + j * 2) * 8;
      r.cone(fx, -PD, fz, 11, h * 1.3, (i + j) % 2 ? '#e8901a' : '#d0400a', { glow: true, opacity: 0.8 });
    }
    for (let i = 0; i < 14; i++) {   // brasas subindo
      const ex = PL + ((i * 53 + t * 25) % (PR - PL)), ey = -PD + ((t * 70 + i * 41) % 260), ez = Z0 + 30 + ((i * 71) % (Z1 - Z0 - 60));
      r.box(ex, ey, ez, 3, 3, 3, i % 3 ? '#ffb030' : '#ff5020', { glow: true });
    }
    r.light(430, -40, 400, '#ff7a20', 3.2 + Math.sin(t * 11) * 0.4, 520);
    r.light(530, -40, 470, '#ff9a30', 3.0 + Math.sin(t * 7 + 1) * 0.4, 520);
    // ---- coifa e chaminé ----
    r.box(480, 170, 360, 240, 22, 140, '#23262c', { metal: 0.5, rough: 0.5 });
    r.box(480, 192, 340, 110, 50, 90, '#1d2026', { metal: 0.5 });
    r.cyl(480, 242, 330, 32, 300, '#1d2026', { metal: 0.5 });
    for (let x = PL + 10; x < PR - 6; x += 22) r.box(x, 168, 432, 12, 3, 2, '#ff7820', { glow: true, opacity: 0.6 });
    r.box(480, 194, 386, 200, 26, 2, '#1a1208', { emissive: '#1a0c00' });
    r.label(480, 213, 390, 'FORNALHA Nº 3 · 1400 °C', '#ffb35c', 13);
    // laser central
    r.beam(CX, 168, PZ, CX, -PD, PZ, 1.5, '#ff2a2a', { glow: true, opacity: 0.55 });
    // lâmpada do TRANCO na coifa
    const tr = d.tranco, on = d.phase === 'pull' && (tr.state === 'go' || (tr.state === 'warn' && Math.floor(tr.t * 6.6) % 2 === 0));
    const lc = d.phase === 'pull' && tr.state === 'go' ? '#ff3a1a' : on ? '#ffd23f' : '#3a2a10';
    r.sphere(480, 164, 432, 8, lc, { glow: true });
    if (on) r.light(480, 150, 470, lc, 2.2, 700);
    // luzes do teto sobre as plataformas
    r.light(200, 260, 460, '#ffd9a8', 1.4, 650);
    r.light(760, 260, 460, '#ffd9a8', 1.4, 650);
    // ---- cabo ----
    this.drawRope3d(g, r);
    // ---- manequim (só jogando sozinho) ----
    if (d.phantom) {
      const root = r.character({ id: 'manequim', x: this.FRONT_R + d.rope, y: PZ, alive: true, color: '#777', label: false }, { pose: 'pull', dir: Math.PI - 0.3, scale: S, key: 'manequim' });
      if (root && root.rotation) root.rotation.z = 0.25;
    }
    // ---- jogadores ----
    for (const p of g.players) {
      const q = p.data, dir = q.team === 'L' ? 0.3 : Math.PI - 0.3, y0 = -(p.y - this.GROUND);
      const wp = { ...p, y: PZ };
      if (!p.alive) {
        // virou cinza no fundo do fosso
        r.cone(p.x, -PD, PZ, 22, 12, '#1b1716', { rough: 1 });
        r.character(wp, { pose: 'dead', y: -PD + 4, dir, scale: S * 0.95, color: '#2a2422' });
        for (let k = 0; k < 3; k++) r.box(p.x - 12 + k * 12, -PD + 8 + ((t * 30 + k * 13) % 30), PZ + 6, 2.5, 2.5, 2.5, '#ff8a1e', { glow: true });
        continue;
      }
      let pose = 'pull', oy = y0, lean = this.lean3(p);
      if (q.fall) { pose = q.fall.falling ? 'fall' : 'walk'; }
      else if (q.won) { pose = 'sit'; oy = -20 * S; lean = 0; }
      else if (q.slip > 0) pose = 'fall';
      const root = r.character(wp, { pose, y: oy, dir, scale: S, flash: q.slip > 0 && Math.floor(t * 12) % 2 === 0, label: q.fall ? false : undefined });
      if (root && root.rotation) root.rotation.z = lean;
      if (q.bonus > 1 && !q.fall) r.label(p.x, 92 * S, PZ, 'SOLO ×' + q.bonus.toFixed(1), '#ffd23f', 11);
      // linhas de esforço
      if (q.kick > 0.4 && !q.fall) {
        const bk = q.team === 'L' ? -1 : 1;
        for (const k of [-1, 1]) r.beam(p.x + bk * 26, 58 * S + k * 6, PZ, p.x + bk * 38, 60 * S + k * 11, PZ, 1.6, '#ffffff', { glow: true, opacity: 0.6 });
      }
    }
  },

  drawRope3d(g, r) {
    const d = g.data, PZ = this.PZ3, PD = this.PIT_D;
    const hands = [];
    for (const p of g.players) {
      if (p.alive) hands.push(this.hand3(p));
      else if (p.data.fall && p.data.fall.done) hands.push({ x: p.x, y: -PD + 10, z: PZ });
    }
    if (d.phantom) hands.push({ x: this.FRONT_R + d.rope - 18, y: 58, z: PZ });
    if (!hands.length) return;
    hands.sort((a, b) => a.x - b.x);
    const first = hands[0], last = hands[hands.length - 1];
    const pts = [...(first.y > 5 ? [{ x: first.x - 46, y: 2, z: PZ + 10 }] : []), ...hands, ...(last.y > 5 ? [{ x: last.x + 46, y: 2, z: PZ + 10 }] : [])];
    const sagOf = (a, b) => (a.x < this.CENTER && b.x > this.CENTER ? 6 + 22 * (1 - (d.tension || 0)) : 3);
    const col = '#b8915a';
    let mx = TN.util.clamp(this.CENTER + d.rope, pts[0].x + 1, pts[pts.length - 1].x - 1), my = 50, mz = PZ;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], sg = sagOf(a, b);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - sg, z: (a.z + b.z) / 2 };
      r.beam(a.x, a.y, a.z, m.x, m.y, m.z, 4.2, col, { rough: 0.9 });
      r.beam(m.x, m.y, m.z, b.x, b.y, b.z, 4.2, col, { rough: 0.9 });
      if (mx >= a.x && mx <= b.x) {
        const u = (mx - a.x) / ((b.x - a.x) || 1), w = u < 0.5 ? u * 2 : (u - 0.5) * 2;
        const p0 = u < 0.5 ? a : m, p1 = u < 0.5 ? m : b;
        my = p0.y + (p1.y - p0.y) * w; mz = p0.z + (p1.z - p0.z) * w;
      }
    }
    // fita vermelha presa no meio do cabo
    const sway = Math.sin(g.time * 6) * 0.25;
    r.box(mx, my - 2, mz, 8, 6, 6, '#900');
    r.box(mx, my - 24, mz, 7, 22, 1.5, '#ff2a2a', { rotZ: sway, emissive: '#5a0000' });
  },

  // avisos do TRANCO (versão do HUD 3D: a lâmpada já existe na coifa)
  drawTrancoText(g, c) {
    const D = TN.draw, tr = g.data.tranco, t = g.time;
    if (g.data.phase !== 'pull') return;
    const on = tr.state === 'go' || (tr.state === 'warn' && Math.floor(tr.t * 6.6) % 2 === 0);
    if (tr.state === 'warn') {
      D.panel(c, this.CENTER - 130, 88, 260, 28, { fill: 'rgba(10,10,10,0.85)', stroke: on ? '#ffd23f' : '#5a4a10', radius: 3 });
      D.text(c, 'PREPARAR TRANCO...', this.CENTER, 102, { size: 18, color: on ? '#ffd23f' : '#8a7020', align: 'center' });
    }
    if (tr.state === 'go') {
      const s = 34 + Math.sin(t * 40) * 2;
      D.panel(c, this.CENTER - 170, 84, 340, 42, { fill: 'rgba(30,6,0,0.9)', stroke: '#ff5a1a', radius: 3 });
      D.text(c, 'TRANCO! AÇÃO!', this.CENTER, 106, { size: s, color: '#ff5a1a', align: 'center' });
    }
  },

  // HUD 2D: medidor da fita, aviso de TRANCO e pegada/próximo botão de cada jogador
  drawOverlay(g, c) {
    if (!g.uses3d()) return;
    const D = TN.draw;
    this.drawGauge(g, c);
    this.drawTrancoText(g, c);
    if (g.time < 5) {   // metrônomo dos primeiros segundos: dois traços alternando no ritmo ideal
      const lado = Math.floor(g.time * this.RITMO_HZ) % 2;
      D.text(c, 'RITMO', g.W / 2, 158, { size: 12, color: '#9ab', align: 'center' });
      c.fillStyle = lado ? '#ff8a1e' : '#2a2f35'; c.fillRect(g.W / 2 - 30, 168, 24, 10);
      c.fillStyle = lado ? '#2a2f35' : '#3fa9ff'; c.fillRect(g.W / 2 + 6, 168, 24, 10);
    }
    for (const p of g.players) {
      const q = p.data;
      if (!p.alive || q.fall) continue;
      const s = TN.R3.project(p.x, 0, this.PZ3 + 70);
      // anel de cadência: pulsa no ritmo ideal, na cor do último toque (verde bom, vermelho afobado, cinza devagar)
      const pulso = 1 + 0.25 * Math.sin(g.time * Math.PI * 2 * this.RITMO_HZ);
      const corQ = q.qualidade === 'bom' ? '#46e27b' : q.qualidade === 'afobado' ? '#ff3b3b' : q.qualidade ? '#777' : '#bbb';
      c.strokeStyle = corQ; c.lineWidth = 3; c.beginPath(); c.ellipse(s.x, s.y - 14, 14 * pulso, 6 * pulso, 0, 0, Math.PI * 2); c.stroke();
      D.bar(c, s.x - 22, s.y, 60, 10, q.grip, q.grip > 0.5 ? '#3f6' : q.grip > 0.25 ? '#fc3' : '#f43');
      D.text(c, 'PEGADA', s.x + 8, s.y + 5, { size: 8, color: '#111', align: 'center', shadow: false });
      const next = q.last === 'a' ? 'b' : q.last === 'b' ? 'a' : null;
      [['a', 'AÇÃO', -19], ['b', 'EXTRA', 19]].forEach(([k, txt, ox]) => {
        const on = next === null || next === k;
        c.fillStyle = on ? (k === 'a' ? '#ff8a1e' : '#3fa9ff') : '#1c1f24';
        c.fillRect(s.x + ox - 17, s.y + 10, 34, 15);
        D.text(c, txt, s.x + ox, s.y + 18, { size: 9, color: on ? '#111' : '#555', align: 'center', shadow: false });
      });
    }
  },

  draw(g, c) {
    const D = TN.draw, d = g.data, t = g.time, W = g.W;
    const G = this.GROUND, PL = this.PIT_L, PR = this.PIT_R, CX = this.CENTER;
    // parede da fábrica
    c.fillStyle = '#0c0d10'; c.fillRect(0, 0, W, g.H);
    for (let x = 0; x < W; x += 120) { c.fillStyle = (x / 120) % 2 ? '#14171b' : '#171a1f'; c.fillRect(x, 34, 120, G - 34); }
    c.fillStyle = '#22262c'; c.fillRect(0, 120, W, 10); c.fillRect(0, 300, W, 6);
    c.fillStyle = '#2c3138'; for (let x = 30; x < W; x += 120) c.fillRect(x, 116, 14, 18);
    // brilho da fornalha
    const glow = c.createRadialGradient(CX, 520, 20, CX, 520, 360);
    glow.addColorStop(0, 'rgba(255,110,20,0.42)'); glow.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = glow; c.fillRect(0, 34, W, g.H - 34);
    // chaminé e coifa da fornalha
    c.fillStyle = '#1d2026'; c.fillRect(CX - 34, 34, 68, 170);
    c.fillStyle = '#262a31'; for (let y = 50; y < 200; y += 36) c.fillRect(CX - 38, y, 76, 6);
    c.fillStyle = '#23262c';
    c.beginPath(); c.moveTo(CX - 40, 200); c.lineTo(CX + 40, 200); c.lineTo(PR + 6, 262); c.lineTo(PL - 6, 262); c.fill();
    c.fillStyle = '#121418'; c.fillRect(PL - 6, 262, PR - PL + 12, 6);
    c.fillStyle = 'rgba(255,120,30,0.5)'; for (let x = PL + 14; x < PR - 10; x += 22) c.fillRect(x, 268, 12, 3);
    // placa
    D.panel(c, CX - 112, 160, 224, 28, { fill: '#1a1208', stroke: '#a85a14', radius: 3 });
    D.text(c, 'FORNALHA Nº 3 · 1400 °C', CX, 174, { size: 13, color: '#ffb35c', align: 'center' });
    // linha central (laser)
    c.strokeStyle = 'rgba(255,40,40,0.55)'; c.lineWidth = 2; c.setLineDash([6, 6]);
    c.beginPath(); c.moveTo(CX, 272); c.lineTo(CX, G); c.stroke(); c.setLineDash([]);
    // fosso com fogo
    const pit = c.createLinearGradient(0, G, 0, g.H);
    pit.addColorStop(0, '#1a0703'); pit.addColorStop(0.6, '#8a2200'); pit.addColorStop(1, '#ff6a00');
    c.fillStyle = pit; c.fillRect(PL, G, PR - PL, g.H - G);
    for (let i = 0; i < 10; i++) {
      const fx = PL + 9 + i * ((PR - PL - 18) / 9), h = 34 + Math.sin(t * 9 + i * 1.7) * 14 + Math.sin(t * 4.3 + i) * 8;
      c.fillStyle = i % 2 ? 'rgba(255,200,60,0.85)' : 'rgba(255,110,0,0.85)';
      c.beginPath(); c.moveTo(fx - 13, g.H); c.quadraticCurveTo(fx - 6, g.H - h * 0.6, fx + Math.sin(t * 7 + i) * 5, g.H - h); c.quadraticCurveTo(fx + 6, g.H - h * 0.6, fx + 13, g.H); c.fill();
    }
    for (let i = 0; i < 16; i++) {   // brasas subindo
      const ex = PL + ((i * 53 + t * 25) % (PR - PL)), ey = g.H - ((t * 70 + i * 41) % 260);
      c.globalAlpha = Math.max(0, (ey - (g.H - 260)) / 260);
      c.fillStyle = i % 3 ? '#ffb030' : '#ff5020'; c.fillRect(ex, ey, 3, 3);
    }
    c.globalAlpha = 1;
    // plataformas
    for (const [x0, x1] of [[0, PL], [PR, W]]) {
      c.fillStyle = '#2a2e35'; c.fillRect(x0, G, x1 - x0, g.H - G);
      c.fillStyle = '#3c424b'; c.fillRect(x0, G, x1 - x0, 5);
      c.fillStyle = '#23272d'; for (let x = x0 + 10; x < x1; x += 40) c.fillRect(x, G + 60, 26, 3);
    }
    D.hazardStripes(c, PL - 14, G, 14, g.H - G, 7);
    D.hazardStripes(c, PR, G, 14, g.H - G, 7);
    this.drawGauge(g, c);
    this.drawTranco(g, c);
    this.drawRope(g, c);
    // manequim (só existe jogando sozinho)
    if (d.phantom) {
      c.save(); c.translate(this.FRONT_R + d.rope, G); c.rotate(0.25);
      D.robotSide(c, 0, 0, 30, 44, '#777', { facing: -1 }); c.restore();
    }
    // jogadores
    for (const p of g.players) {
      if (!p.alive) continue;
      const q = p.data, f = q.team === 'L' ? 1 : -1;
      c.save(); c.translate(p.x, p.y); c.rotate(this.leanOf(p));
      D.robotSide(c, 0, 0, 30, 44, p.color, { facing: f, flash: q.slip > 0 && Math.floor(t * 12) % 2 === 0 });
      // braço até o cabo
      c.strokeStyle = '#111'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(0, -26); c.lineTo(f * 13, -24); c.stroke();
      c.restore();
      if (q.kick > 0.4 && !q.fall) {  // linhas de esforço
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2;
        for (const k of [-1, 1]) { c.beginPath(); c.moveTo(p.x - f * 22, p.y - 52 + k * 6); c.lineTo(p.x - f * 32, p.y - 56 + k * 10); c.stroke(); }
      }
      if (!q.fall) {
        D.text(c, p.label, p.x, p.y - 68, { size: 13, color: p.color, align: 'center' });
        if (q.bonus > 1) D.text(c, 'SOLO ×' + q.bonus.toFixed(1), p.x, p.y - 84, { size: 11, color: '#ffd23f', align: 'center' });
        // pegada + próximo botão
        D.bar(c, p.x - 22, G + 12, 44, 6, q.grip, q.grip > 0.5 ? '#3f6' : q.grip > 0.25 ? '#fc3' : '#f43');
        const next = q.last === 'a' ? 'b' : q.last === 'b' ? 'a' : null;
        [['a', 'AÇÃO', -19], ['b', 'EXTRA', 19]].forEach(([k, txt, ox]) => {
          const on = next === null || next === k;
          c.fillStyle = on ? (k === 'a' ? '#ff8a1e' : '#3fa9ff') : '#1c1f24';
          c.fillRect(p.x + ox - 17, G + 24, 34, 15);
          D.text(c, txt, p.x + ox, G + 32, { size: 9, color: on ? '#111' : '#555', align: 'center', shadow: false });
        });
      }
    }
  },

  drawGauge(g, c) {
    const D = TN.draw, d = g.data, x0 = 280, x1 = 680, y = 58;
    D.panel(c, x0 - 34, 42, x1 - x0 + 68, 34, { fill: 'rgba(10,12,16,0.9)', stroke: '#444', radius: 4 });
    c.fillStyle = '#5a1010'; c.fillRect(x0, y - 6, 26, 12); c.fillRect(x1 - 26, y - 6, 26, 12);
    c.fillStyle = '#2a2d33'; c.fillRect(x0 + 26, y - 3, x1 - x0 - 52, 6);
    c.fillStyle = '#f33'; c.fillRect((x0 + x1) / 2 - 1, y - 9, 2, 18);
    // quem está de cada lado
    const dots = (team, x, dir) => team.forEach((p, i) => { c.fillStyle = p.alive ? p.color : '#444'; c.fillRect(x + dir * i * 12 - 4, y - 6, 9, 12); });
    dots(d.teams.L, x0 - 16, -1); dots(d.teams.R, x1 + 8, 1);
    // fita
    const k = TN.util.clamp(d.rope / this.LIMIT, -1, 1);
    const mx = (x0 + x1) / 2 + k * ((x1 - x0) / 2 - 13);
    c.fillStyle = '#ff2a2a';
    c.beginPath(); c.moveTo(mx, y + 2); c.lineTo(mx - 7, y + 13); c.lineTo(mx + 7, y + 13); c.fill();
    c.beginPath(); c.moveTo(mx, y - 2); c.lineTo(mx - 7, y - 13); c.lineTo(mx + 7, y - 13); c.fill();
  },

  drawTranco(g, c) {
    const D = TN.draw, tr = g.data.tranco, t = g.time;
    if (g.data.phase !== 'pull') return;
    // lâmpada do Supervisor
    const on = tr.state === 'go' || (tr.state === 'warn' && Math.floor(tr.t * 6.6) % 2 === 0);
    c.fillStyle = '#222'; c.fillRect(this.CENTER - 16, 86, 32, 10);
    c.fillStyle = tr.state === 'go' ? '#ff3a1a' : on ? '#ffd23f' : '#3a2a10';
    c.beginPath(); c.arc(this.CENTER, 100, 9, 0, Math.PI * 2); c.fill();
    if (tr.state === 'warn') {
      D.panel(c, this.CENTER - 130, 114, 260, 28, { fill: 'rgba(10,10,10,0.85)', stroke: on ? '#ffd23f' : '#5a4a10', radius: 3 });
      D.text(c, 'PREPARAR TRANCO...', this.CENTER, 128, { size: 18, color: on ? '#ffd23f' : '#8a7020', align: 'center' });
    }
    if (tr.state === 'go') {
      const s = 34 + Math.sin(t * 40) * 2;
      D.panel(c, this.CENTER - 170, 108, 340, 42, { fill: 'rgba(30,6,0,0.9)', stroke: '#ff5a1a', radius: 3 });
      D.text(c, 'TRANCO! AÇÃO!', this.CENTER, 130, { size: s, color: '#ff5a1a', align: 'center' });
    }
  },

  drawRope(g, c) {
    const d = g.data, G = this.GROUND;
    const hands = [];
    for (const p of g.players) {
      if (p.alive || (p.data.fall && p.data.fall.done)) hands.push(p.alive ? this.handPoint(p) : { x: p.x, y: 520 });
    }
    if (d.phantom) hands.push({ x: this.FRONT_R + d.rope - 12, y: G - 26 });
    if (!hands.length) return;
    hands.sort((a, b) => a.x - b.x);
    const first = hands[0], last = hands[hands.length - 1];
    // pontas soltas no chão (só se a ponta ainda estiver na plataforma)
    const pts = [...(first.y < G - 5 ? [{ x: first.x - 46, y: G - 2 }] : []), ...hands, ...(last.y < G - 5 ? [{ x: last.x + 46, y: G - 2 }] : [])];
    const sagOf = (a, b) => (a.x < this.CENTER && b.x > this.CENTER ? 6 + 18 * (1 - (d.tension || 0)) : 4);
    const path = () => {
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        c.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sagOf(a, b), b.x, b.y);
      }
    };
    c.lineCap = 'round';
    c.strokeStyle = '#2a1c0e'; c.lineWidth = 8; path(); c.stroke();
    c.strokeStyle = '#b8915a'; c.lineWidth = 5; path(); c.stroke();
    c.lineCap = 'butt';
    // fita vermelha presa no meio do cabo
    const mx = TN.util.clamp(this.CENTER + d.rope, pts[0].x + 1, pts[pts.length - 1].x - 1);
    let my = G - 26;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (mx >= a.x && mx <= b.x) {
        const u = (mx - a.x) / ((b.x - a.x) || 1), yc = (a.y + b.y) / 2 + sagOf(a, b);
        my = (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * yc + u * u * b.y;
        break;
      }
    }
    const sway = Math.sin(g.time * 6) * 3;
    c.fillStyle = '#ff2a2a';
    c.beginPath(); c.moveTo(mx - 4, my); c.lineTo(mx + 4, my); c.lineTo(mx + 6 + sway, my + 26); c.lineTo(mx + sway, my + 20); c.lineTo(mx - 6 + sway, my + 26); c.fill();
    c.fillStyle = '#900'; c.fillRect(mx - 5, my - 3, 10, 6);
  },
});
