// CONTRAMÃO — inspirado em "WRONG WAY" (escalator_pit) de Machine Party.
// Quatro escadas rolantes descem rumo ao buraco. Cada robô sobe apertando a seta pedida.
// A escada anda na velocidade do jogador mais rápido (máx. 1,0): quem não acompanha escorrega.
// Chegar ao topo dá pontos; cair no buraco dá +1 a todos que ainda estão na escada.
TN.registerMinigame({
  id: 'contramao',
  title: 'CONTRAMÃO',
  inspiredBy: 'Wrong Way (escalator_pit)',
  tagline: 'SIGA AS SETAS. MANTENHA O RITMO.',
  brief: [
    'Aperte a direção que aparece na sua seta para subir.',
    'Errou a seta? Você perde quase metade da velocidade.',
    'A escada desce na velocidade do mais rápido. Não fique para trás.',
    'Topo: 2 pts (1º) ou 1. Cada queda dá +1 a quem ainda está na escada.',
  ],
  controls: { move: 'apertar a seta pedida' },
  icon: '↗',
  color: '#4dd2ff',
  rounds: 2,
  timeLimit: 60,              // segurança: a rodada sempre termina
  scoring: 'points',
  endWhenOneLeft: false,      // o fim é controlado aqui (último ativo na escada)

  // ---- constantes (originais: vel. máx. 2,0, escada máx. 1,0, decaimento 0,01/s, erro ×0,3–0,6) ----
  STEP: 0.1,                  // ganho por acerto (multiplicado pelo fator de ritmo)
  MAX_SPEED: 2, ESC_MAX: 1, DECAY: 0.01,
  K: 0.11,                   // fração da escada percorrida por segundo por unidade de velocidade relativa
  START: 0.45,                // posição inicial (0 = buraco, 1 = saída)
  DIRS: ['up', 'down', 'left', 'right'],
  VEC: { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] },

  // geometria de cada escada (vista lateral): sobe da esquerda-baixo para a direita-cima
  lane(i) { return { x0: 110, y0: 318 + i * 58, x1: 850, y1: 118 + i * 58 }; },
  pos(i, s) {
    const L = this.lane(i);
    if (s > 1) return { x: L.x1 + (s - 1) * 1000, y: L.y1 };   // já no patamar de saída
    return { x: TN.util.lerp(L.x0, L.x1, s), y: TN.util.lerp(L.y0, L.y1, s) };
  },

  init(g) {
    g.data.esc = 0;           // velocidade atual da escada
    g.data.stepAnim = 0;      // deslocamento animado dos degraus
    g.data.firstUp = false;
    g.data.over = false;
    g.players.forEach((p, i) => {
      p.data = {
        lane: i, s: this.START, speed: 0, last: 0, arrow: TN.util.pick(this.DIRS),
        state: 'on',          // 'on' | 'top' | 'fell'
        wrong: 0, good: 0, fallT: 0,
        bot: { next: TN.util.rand(0.2, 0.5), hold: 0, dir: null },
      };
      const q = this.pos(i, p.data.s); p.x = q.x; p.y = q.y - 30;
    });
  },

  active(g) { return g.players.filter((p) => p.data.state === 'on'); },

  newArrow(prev) { return TN.util.pick(this.DIRS.filter((d) => d !== prev)); },

  update(g, dt) {
    const U = TN.util, d = g.data;
    if (d.over) { this.animate(g, dt); return; }
    // entrada: cada seta apertada conta como uma tentativa
    for (const p of this.active(g)) {
      const s = p.data, inp = p.input;
      const pressed = inp.upPressed ? 'up' : inp.downPressed ? 'down' : inp.leftPressed ? 'left' : inp.rightPressed ? 'right' : null;
      if (pressed) {
        const since = g.time - s.last;
        s.last = g.time;
        if (pressed === s.arrow) {
          const tf = U.clamp(1 - since, 0.5, 1);
          s.speed = Math.min(s.speed + this.STEP * tf, this.MAX_SPEED);
          s.arrow = this.newArrow(s.arrow);
          s.good = 0.15;
          g.sfx('step');
        } else {
          s.speed *= 0.3 + 0.3 * (1 - Math.min(since, 5) / 5);
          s.wrong = 0.35;
          g.sfx('buzz');
        }
      }
      s.speed = Math.max(0, s.speed - this.DECAY * dt);
    }
    // velocidade da escada = maior velocidade entre quem ainda está nela (máx. 1,0)
    const act = this.active(g);
    d.esc = Math.min(this.ESC_MAX, Math.max(0, ...act.map((p) => p.data.speed)));
    // movimento relativo
    for (const p of act) {
      const s = p.data;
      s.s += (s.speed - d.esc) * this.K * dt;
      if (s.s >= 1) {
        s.state = 'top';
        const pts = d.firstUp ? 1 : 2;
        d.firstUp = true;
        const q = this.pos(s.lane, 1);
        p.x = q.x; p.y = q.y - 40;
        g.addScore(p, pts); g.sfx('coin'); g.particles(q.x, q.y - 20, '#46e27b', 18, 180);
      } else if (s.s <= 0) {
        s.state = 'fell'; s.s = 0;
        const q = this.pos(s.lane, 0);
        p.x = q.x; p.y = q.y - 20;
        g.eliminate(p, { sound: 'boom', msg: 'CAIU!' });
        g.particles(q.x, q.y, '#ff3b3b', 26, 220);
        for (const o of this.active(g)) g.addScore(o, 1);
      }
    }
    this.animate(g, dt);
    // fim: sobrou no máximo 1 na escada
    const left = this.active(g);
    if (left.length <= 1) {
      d.over = true;
      if (left.length === 1) { g.addScore(left[0], 1); g.popup('ÚLTIMO NA ESCADA', left[0].x, left[0].y - 60, '#4dd2ff'); }
      g.finish(2);
    }
  },

  animate(g, dt) {
    const d = g.data;
    d.stepAnim = (d.stepAnim + d.esc * dt * 40) % 24;
    for (const p of g.players) {
      const s = p.data;
      s.wrong = Math.max(0, s.wrong - dt); s.good = Math.max(0, s.good - dt);
      if (s.state === 'top') s.s = Math.min(s.s + dt * 0.15, 1.065);   // anda até a porta
      if (s.state === 'fell') s.fallT += dt;
      if (s.state !== 'fell') { const q = this.pos(s.lane, s.s); p.x = q.x; p.y = q.y - 30; }
    }
  },

  onTimeUp(g) { g.data.over = true; g.message('FIM DO EXPEDIENTE', 1.5, '#4dd2ff'); },

  // Bot: aperta a seta certa a cada 0,2–0,5 s, com ~10% de erro.
  bot(g, p, dt) {
    const U = TN.util, s = p.data, b = s.bot;
    if (s.state !== 'on' || g.data.over) return { x: 0, y: 0 };
    if (b.hold > 0) { b.hold--; const v = this.VEC[b.dir]; return { x: v[0], y: v[1] }; }
    b.next -= dt;
    if (b.next <= 0) {
      b.next = U.rand(0.2, 0.5);
      b.dir = U.chance(0.1) ? U.pick(this.DIRS.filter((x) => x !== s.arrow)) : s.arrow;
      b.hold = 3;
      const v = this.VEC[b.dir]; return { x: v[0], y: v[1] };
    }
    return { x: 0, y: 0 };
  },

  // ------------------------------------------------------------------ desenho 3D
  // Mundo: cada escada sobe ao longo de X (x0 → x1) e de Y (0 → TOP); as 4 escadas ficam lado a lado em Z.
  TOP: 190, X0: 130, X1: 790,
  laneZ(i) { return 150 + i * 78; },
  world(i, s) {
    if (s > 1) return { x: this.X1 + (s - 1) * 900, y: this.TOP, z: this.laneZ(i) };
    return { x: TN.util.lerp(this.X0, this.X1, s), y: s * this.TOP, z: this.laneZ(i) };
  },
  camera: { pos: [470, 330, 1080], target: [470, 105, 270], fov: 40 },
  // onde cada jogador está no mundo 3D (usado pelo motor para rótulos)
  worldPos(g, p) { const w = this.world(p.data.lane, Math.min(p.data.s, 1.08)); return { x: w.x, y: w.y, z: w.z }; },
  env: { bg: '#0b0f15', fog: [900, 2200], sunDir: [-0.5, 1, 0.8] },

  draw3d(g, r) {
    const d = g.data, len = this.X1 - this.X0, slope = this.TOP / len;
    // piso do shopping (com o buraco à esquerda das escadas) e parede do fundo
    r.plane(560, 0, 300, 900, 900, '#262b33');
    r.plane(-80, 0, 300, 300, 900, '#262b33');
    r.box(480, -260, 90, 1400, 700, 20, '#151a21');
    for (let k = 0; k < 6; k++) r.box(80 + k * 170, 230, 102, 120, 60, 4, '#1d2530', { emissive: '#0e1a28' }); // vitrines apagadas
    // buraco: paredes escuras, fundo com espinhos e brilho vermelho
    r.box(this.X0 - 60, -170, 290, 100, 170, 330, '#050505', { shadow: false });
    for (let k = 0; k < 10; k++) r.cone(this.X0 - 95 + (k % 5) * 18, -60, 150 + Math.floor(k / 5) * 160 + (k % 5) * 30, 6, 40, '#b8b8b8', { metal: 0.9, rough: 0.3 });
    r.plane(this.X0 - 60, 0.6, 128, 110, 8, '#f5c400');
    r.plane(this.X0 - 60, 0.6, 452, 110, 8, '#f5c400');
    r.light(this.X0 - 60, 40, 300, '#ff2a2a', 0.7 + 0.3 * Math.sin(g.time * 6), 260);
    // patamar de saída (alto, à direita) com porta verde
    r.box(this.X1 + 90, 0, 300, 180, this.TOP, 360, '#2b333c');
    r.box(this.X1 + 165, this.TOP, 300, 12, 70, 340, '#1a2027');
    for (let i = 0; i < 4; i++) {
      r.box(this.X1 + 158, this.TOP, this.laneZ(i), 4, 56, 40, '#0b1f14', { emissive: '#1f7a42', emissiveIntensity: 0.9 });
    }
    r.light(this.X1 + 120, this.TOP + 90, 300, '#7dffaa', 0.8, 380);
    r.light(420, 330, 300, '#ffd9a8', 1.0, 900);
    // escadas
    for (let i = 0; i < 4; i++) {
      const z = this.laneZ(i), owner = g.players[i];
      // treliça lateral (dos dois lados) e corrimão com a cor do dono
      for (const side of [-1, 1]) {
        r.beam(this.X0, -6, z + side * 30, this.X1, this.TOP - 6, z + side * 30, 14, '#2f3842', { metal: 0.5 });
        r.beam(this.X0, 34, z + side * 30, this.X1, this.TOP + 34, z + side * 30, 5, '#111', { rough: 0.5 });
        r.beam(this.X0, 37, z + side * 30, this.X1, this.TOP + 37, z + side * 30, 1.5, owner ? owner.color : '#888', { glow: true });
      }
      // degraus descendo junto com a escada
      for (let t = d.stepAnim - 24; t < len; t += 24) {
        const x = this.X1 - t, y = (x - this.X0) * slope;
        if (x < this.X0 || x > this.X1) continue;
        r.box(x, y - 8, z, 22, 8, 52, '#5b6672', { metal: 0.6, rough: 0.4 });
      }
    }
    // corredores
    for (const p of g.players) {
      const s = p.data;
      if (s.state === 'fell') {
        if (s.fallT > 2) continue;
        const w = this.world(s.lane, 0);
        r.character({ ...p, x: w.x - 45, y: w.z }, { key: p.id, pose: 'fall', y: -s.fallT * s.fallT * 140, dir: 0, label: false });
        continue;
      }
      const w = this.world(s.lane, Math.min(s.s, 1.08));
      const running = s.state === 'top' || s.speed > 0.05;
      r.character({ ...p, x: w.x, y: w.z }, { key: p.id, y: w.y, dir: 0, pose: running ? 'walk' : 'idle', flash: s.wrong > 0.2, label: false });
    }
  },

  // HUD 2D por cima do 3D: velocidade da escada + seta pedida de cada jogador presa acima da cabeça
  drawOverlay(g, c) {
    if (!TN.R3.available || !g.uses3d()) return;
    const D = TN.draw, d = g.data;
    D.panel(c, 14, 44, 250, 50, { fill: 'rgba(8,12,16,0.8)', stroke: '#4dd2ff' });
    D.text(c, 'VELOCIDADE DA ESCADA', 26, 58, { size: 12, color: '#9fb3c8' });
    D.bar(c, 26, 70, 170, 12, d.esc / this.ESC_MAX, d.esc > 0.95 ? '#ff6b6b' : '#4dd2ff', '#1b2229');
    D.text(c, `${d.esc.toFixed(2)} ▼`, 206, 76, { size: 12, color: '#cde' });
    for (const p of g.players) {
      const s = p.data;
      if (s.state === 'fell') continue;
      const w = this.world(s.lane, Math.min(s.s, 1.08));
      const q = TN.R3.project(w.x, w.y + 78, w.z);
      D.text(c, p.label, q.x, q.y - 26, { size: 12, color: p.color, align: 'center' });
      if (s.state === 'top') { D.text(c, '✔', q.x, q.y, { size: 20, color: '#46e27b', align: 'center' }); continue; }
      D.panel(c, q.x - 16, q.y - 16, 32, 32, { fill: s.wrong > 0 ? '#5a1010' : s.good > 0 ? '#1d4a2c' : 'rgba(10,14,18,0.9)', stroke: p.color, radius: 5 });
      this.drawArrow(c, q.x, q.y, 22, s.arrow, s.wrong > 0 ? '#ff8080' : '#fff');
      const mx = q.x + 20, my = q.y - 16, mh = 32, t = s.speed / this.MAX_SPEED;
      c.fillStyle = '#1b2229'; c.fillRect(mx, my, 5, mh);
      c.fillStyle = s.speed >= d.esc - 0.001 ? '#46e27b' : '#ff6b6b'; c.fillRect(mx, my + mh * (1 - t), 5, mh * t);
      const ey = my + mh * (1 - d.esc / this.MAX_SPEED);
      c.fillStyle = '#fff'; c.fillRect(mx - 2, ey - 1, 9, 2);
    }
  },

  // ------------------------------------------------------------------ desenho 2D (alternativa)
  drawArrow(c, x, y, size, dir, color) {
    const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    c.save(); c.translate(x, y); c.rotate(ang);
    c.fillStyle = color; c.strokeStyle = '#000'; c.lineWidth = 2;
    const k = size / 2;
    c.beginPath();
    c.moveTo(k, 0); c.lineTo(0, -k * 0.85); c.lineTo(0, -k * 0.35); c.lineTo(-k, -k * 0.35);
    c.lineTo(-k, k * 0.35); c.lineTo(0, k * 0.35); c.lineTo(0, k * 0.85); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  },

  draw(g, c) {
    const D = TN.draw, d = g.data;
    // fundo: shopping vazio à noite
    c.fillStyle = '#0d1117'; c.fillRect(0, 0, g.W, g.H);
    for (let x = 0; x < g.W; x += 80) { c.fillStyle = (x / 80) % 2 ? '#10151c' : '#121821'; c.fillRect(x, 34, 80, g.H); }
    // texto/legendas no triângulo vazio de cima-esquerda
    D.text(c, 'ESCADA', 40, 64, { size: 13, color: '#6c7a89' });
    D.bar(c, 40, 76, 150, 10, d.esc / this.ESC_MAX, d.esc > 0.95 ? '#ff6b6b' : '#4dd2ff', '#1b2229');
    D.text(c, `${d.esc.toFixed(2)} ▼`, 200, 81, { size: 12, color: '#9fb3c8' });
    D.lines(c, 'A escada desce na\nvelocidade do mais rápido.', 40, 112, { size: 12, color: '#6c7a89', lineHeight: 16 });

    // placa de saída (canto de baixo à direita, que fica vazio)
    D.panel(c, 800, 462, 140, 44, { fill: '#0f3d22', stroke: '#46e27b', radius: 4 });
    D.text(c, 'SAÍDA', 850, 484, { size: 18, color: '#7dffaa', align: 'center' });
    this.drawArrow(c, 908, 484, 26, 'up', '#46e27b');

    // escadas (de cima para baixo, para os robôs de baixo ficarem na frente)
    for (let i = 0; i < 4; i++) {
      this.drawLane(g, c, i);
      for (const p of g.players) if (p.data.lane === i) this.drawRunner(g, c, p);
    }
    // setas pedidas por cima de tudo
    for (const p of g.players) this.drawPrompt(g, c, p);
  },

  drawLane(g, c, i) {
    const L = this.lane(i), D = TN.draw, d = g.data;
    const dx = L.x1 - L.x0, dy = L.y1 - L.y0, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const owner = g.players[i];
    const quad = (h0, h1, fill) => {
      c.fillStyle = fill; c.beginPath();
      c.moveTo(L.x0, L.y0 + h0); c.lineTo(L.x1, L.y1 + h0); c.lineTo(L.x1, L.y1 + h1); c.lineTo(L.x0, L.y0 + h1);
      c.closePath(); c.fill();
    };
    // balaustrada de vidro + corrimão (presos à própria escada)
    quad(-30, 0, 'rgba(140,190,255,0.07)');
    c.strokeStyle = '#0a0a0a'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(L.x0, L.y0 - 30); c.lineTo(L.x1, L.y1 - 30); c.stroke();
    c.strokeStyle = owner.color; c.globalAlpha = 0.6; c.lineWidth = 2;
    c.beginPath(); c.moveTo(L.x0, L.y0 - 30); c.lineTo(L.x1, L.y1 - 30); c.stroke(); c.globalAlpha = 1;
    // treliça (lateral) e faixa dos degraus
    quad(0, 22, '#1f252d');
    quad(0, 10, '#4a5560');
    // degraus: frisos que descem junto com a escada
    c.save();
    c.beginPath(); c.moveTo(L.x0, L.y0); c.lineTo(L.x1, L.y1); c.lineTo(L.x1, L.y1 + 10); c.lineTo(L.x0, L.y0 + 10); c.closePath(); c.clip();
    c.fillStyle = '#262d35';
    for (let t = d.stepAnim - 24; t < len + 24; t += 24) {
      const x = L.x1 - ux * t, y = L.y1 - uy * t;   // conta a partir do topo → andam para baixo
      c.fillRect(x - 2, y - 2, 4, 14);
    }
    c.restore();
    c.strokeStyle = '#9aa8b6'; c.lineWidth = 2; c.beginPath(); c.moveTo(L.x0, L.y0); c.lineTo(L.x1, L.y1); c.stroke();
    // patamar e porta de saída
    c.fillStyle = '#2f6b45'; c.fillRect(L.x1, L.y1 - 1, g.W - L.x1, 8);
    c.fillStyle = '#0b1f14'; c.fillRect(928, L.y1 - 44, 24, 43);
    c.strokeStyle = '#46e27b'; c.lineWidth = 2; c.strokeRect(928, L.y1 - 44, 24, 43);
    // buraco
    c.fillStyle = '#050505'; c.fillRect(L.x0 - 70, L.y0 - 6, 70, 34);
    D.hazardStripes(c, L.x0 - 70, L.y0 - 10, 70, 6, 6);
    c.fillStyle = `rgba(255,40,40,${0.25 + 0.15 * Math.sin(g.time * 6 + i)})`; c.fillRect(L.x0 - 66, L.y0 + 2, 62, 24);
    c.fillStyle = '#ccc';
    for (let k = 0; k < 6; k++) { const x = L.x0 - 66 + k * 11; c.beginPath(); c.moveTo(x, L.y0 + 28); c.lineTo(x + 5, L.y0 + 14); c.lineTo(x + 10, L.y0 + 28); c.fill(); }
  },

  drawRunner(g, c, p) {
    const D = TN.draw, s = p.data;
    if (s.state === 'fell') {
      if (s.fallT > 1.2) return;
      const L = this.lane(s.lane);
      c.save(); c.globalAlpha = Math.max(0, 1 - s.fallT / 1.2);
      c.translate(L.x0 - 34, L.y0 - 10 + s.fallT * s.fallT * 160); c.rotate(-s.fallT * 6);
      D.robotSide(c, 0, 20, 28, 40, p.color, { dead: true });
      c.restore(); c.globalAlpha = 1;
      return;
    }
    const q = this.pos(s.lane, s.s);
    const bob = s.state === 'on' && s.speed > 0.05 ? Math.abs(Math.sin(g.time * (6 + s.speed * 6))) * 3 : 0;
    D.robotSide(c, q.x, q.y - bob, 28, 40, p.color, { facing: 1, flash: s.wrong > 0.2 });
  },

  drawPrompt(g, c, p) {
    const D = TN.draw, s = p.data;
    if (s.state === 'fell') return;
    const q = this.pos(s.lane, Math.min(s.s, 1.08));
    const bx = q.x - 52, by = q.y - 46;
    D.text(c, p.label, q.x, q.y - 54, { size: 11, color: p.color, align: 'center' });
    if (s.state === 'top') { D.text(c, '✔', bx + 16, by + 4, { size: 18, color: '#46e27b', align: 'center' }); return; }
    // caixa com a seta pedida
    D.panel(c, bx, by - 14, 32, 32, { fill: s.wrong > 0 ? '#5a1010' : s.good > 0 ? '#1d4a2c' : 'rgba(10,14,18,0.9)', stroke: p.color, radius: 5 });
    this.drawArrow(c, bx + 16, by + 2, 22, s.arrow, s.wrong > 0 ? '#ff8080' : '#fff');
    // medidor de velocidade (a marca é a velocidade da escada)
    const mx = bx - 9, my = by - 14, mh = 32;
    c.fillStyle = '#1b2229'; c.fillRect(mx, my, 5, mh);
    const t = s.speed / this.MAX_SPEED;
    c.fillStyle = s.speed >= g.data.esc - 0.001 ? '#46e27b' : '#ff6b6b';
    c.fillRect(mx, my + mh * (1 - t), 5, mh * t);
    const ey = my + mh * (1 - g.data.esc / this.MAX_SPEED);
    c.fillStyle = '#fff'; c.fillRect(mx - 2, ey - 1, 9, 2);
  },
});
