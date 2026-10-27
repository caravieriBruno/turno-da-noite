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
    'Errou a seta? Você perde 70% da velocidade (menos nos primeiros segundos).',
    'A escada desce na velocidade do mais rápido. Não fique para trás.',
    'Só a chegada conta: 4, 3, 2, 1. Cair é 0.',
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
  BUFFER: 0.3,                // folga depois de cada tecla antes de o fator de ritmo começar a cair (original)
  START: 0.45,                // posição inicial (0 = buraco, 1 = saída)
  CONSOLACAO: 1,              // pontos do último que sobra na escada (sobreviver nunca vale mais que chegar)
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
    g.data.chegaram = 0;      // quantos já chegaram ao topo (define os pontos do próximo: 4, 3, 2, 1)
    g.data.over = false;
    g.players.forEach((p, i) => {
      p.data = {
        lane: i, s: this.START, speed: 0, last: 0, arrow: TN.util.pick(this.DIRS),
        state: 'on',          // 'on' | 'top' | 'fell'
        wrong: 0, good: 0, fallT: 0,
        fx: null,             // aviso curto sobre o boneco ({ text, color, t }), desenhado pelo próprio jogo
        bot: { next: TN.util.rand(0.2, 0.5), hold: 0, dir: null },
      };
      const q = this.pos(i, p.data.s); p.x = q.x; p.y = q.y - 30;
    });
  },

  active(g) { return g.players.filter((p) => p.data.state === 'on'); },
  // pontos do próximo a chegar ao topo: 4/3/2/1 com 4 jogadores (n, n-1, ... com menos)
  pontosChegada(g) { return Math.max(1, g.playerCount - g.data.chegaram); },

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
          const tf = U.clamp(1 - Math.max(0, since - this.BUFFER), 0.5, 1);
          s.speed = Math.min(s.speed + this.STEP * tf, this.MAX_SPEED);
          s.arrow = this.newArrow(s.arrow);
          s.good = 0.15;
          g.sfx('step');
        } else {
          // como no original, o perdão do erro depende do tempo de jogo (só vale nos primeiros 5 s)
          s.speed *= 0.3 + 0.3 * (1 - Math.min(g.time, 5) / 5);
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
        const pts = this.pontosChegada(g);
        d.chegaram++;
        const q = this.pos(s.lane, 1);
        p.x = q.x; p.y = q.y - 40;
        // o "+n" e o "CAIU!" ficam com o jogo (sobre o boneco em 3D e em 2D): p.x/p.y são da vista 2D
        g.addScore(p, pts, { popup: false }); g.sfx('coin'); s.fx = { text: '+' + pts, color: '#ff0', t: 1.2 };
      } else if (s.s <= 0) {
        s.state = 'fell'; s.s = 0;
        const q = this.pos(s.lane, 0);
        p.x = q.x; p.y = q.y - 20;
        g.eliminate(p, { sound: 'boom', particles: false });
        s.fx = { text: 'CAIU!', color: '#f55', t: 1.2 };
      }
    }
    this.animate(g, dt);
    // fim: sobrou no máximo 1 na escada
    const left = this.active(g);
    if (left.length <= 1) {
      d.over = true;
      if (left.length === 1) { g.addScore(left[0], this.CONSOLACAO, { popup: false }); left[0].data.fx = { text: 'ÚLTIMO NA ESCADA +' + this.CONSOLACAO, color: '#4dd2ff', t: 1.8 }; }
      g.finish(2);
    }
  },

  animate(g, dt) {
    const d = g.data;
    d.stepAnim = (d.stepAnim + d.esc * dt * 40) % 24;
    for (const p of g.players) {
      const s = p.data;
      s.wrong = Math.max(0, s.wrong - dt); s.good = Math.max(0, s.good - dt);
      if (s.fx) { s.fx.t -= dt; if (s.fx.t <= 0) s.fx = null; }
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
  // Como no original (Wrong Way, escalator_pit), na escala 1 m = 30: quatro escadas rolantes paralelas,
  // uma por jogador (a 6,4 m uma da outra), descem 27 m e 15 m de desnível rumo ao fosso do triturador,
  // perto da câmera. A câmera fica alta, atrás do fosso e um pouco à direita, olhando escada acima. As
  // paredes são de rocha escavada, com vergalhões espetados. Em cima, uma treliça com quatro monitores
  // de tubo (um por escada) mostra a seta pedida. Tema: o poço de acesso à solitária, no subsolo.
  // Mundo: escada i em x = laneX(i); sobe de z = Z0 (fosso, y = 0) até z = Z1 (patamar, y = TOP).
  TOP: 462, Z0: 600, Z1: -210, LANE_W: 104,
  laneX(i) { return 480 + (i - 1.5) * 192; },
  world(i, s) {
    if (s > 1) return { x: this.laneX(i), y: this.TOP, z: this.Z1 - (s - 1) * 900 };
    return { x: this.laneX(i), y: s * this.TOP, z: TN.util.lerp(this.Z0, this.Z1, s) };
  },
  camera: { pos: [745, 570, 880], target: [445, 200, 325], fov: 66 },
  // onde cada jogador está no mundo 3D (usado pelo motor para rótulos)
  worldPos(g, p) { const w = this.world(p.data.lane, Math.min(p.data.s, 1.08)); return { x: w.x, y: w.y, z: w.z }; },
  env: { bg: '#0a0806', fog: [1100, 2600], ambient: 0.85, sun: 1.0, sunDir: [-0.3, 1, 0.7], sunColor: '#ffe2bf', hemiSky: '#9a8e7c', hemiGround: '#2a2018' },
  draw3d(g, r) {
    const d = g.data, TOP = this.TOP, Z0 = this.Z0, Z1 = this.Z1, LW = this.LANE_W;
    const ang = Math.atan2(TOP, Z0 - Z1), L = Math.hypot(TOP, Z0 - Z1), zm = (Z0 + Z1) / 2;
    const xa = this.laneX(0) - 96, xb = this.laneX(3) + 96;   // largura do bloco das escadas
    // ---- poço de rocha: paredes laterais altas e irregulares, com vergalhões espetados ----
    const rocha = '#8a7258', ro = { rough: 1, tex: 'concreto' };
    for (const s of [-1, 1]) {
      const wx = s < 0 ? xa - 40 : xb + 40;
      r.box(wx + s * 140, -300, 150, 280, 1300, 1700, rocha, ro);
      for (let k = 0; k < 7; k++) {   // blocos salientes de rocha
        const z = -260 + k * 150, y = -200 + (k % 3) * 210;
        r.box(wx + s * (10 + (k % 2) * 20), y, z, 60 + (k % 3) * 30, 260 + (k % 2) * 120, 120 + (k % 4) * 30, k % 2 ? '#62513e' : '#77634b', { ...ro, rotY: 0.2 * s * ((k % 3) - 1) });
      }
      for (let k = 0; k < 6; k++) {   // vergalhões
        const z = -150 + k * 170, y = 120 + (k % 3) * 150;
        r.beam(wx - s * 10, y, z, wx - s * 70, y + 60, z + 40, 5, '#2a2c2e', { metal: 0.7, rough: 0.5 });
      }
    }
    r.box(480, -300, Z1 - 420, xb - xa + 600, 1300, 60, rocha, ro);                      // rocha do fundo
    // ---- patamar de cima, porta de saída e o túnel de volta para a galeria ----
    r.box(480, 0, Z1 - 120, xb - xa, TOP, 240, '#4a4038', { tex: 'concreto' });
    r.box(480, TOP, Z1 - 120, xb - xa, 4, 240, '#8d8f8a', { metal: 0.5, tex: 'metal' });
    r.box(480, TOP, Z1 - 250, xb - xa, 220, 20, '#3b3631', { tex: 'concreto' });
    for (let i = 0; i < 4; i++) {
      const x = this.laneX(i);
      r.box(x, TOP, Z1 - 238, 70, 110, 4, '#0b1f14', { emissive: '#1f7a42', emissiveIntensity: 0.9 });
      r.box(x, TOP + 120, Z1 - 236, 60, 14, 3, '#46e27b', { glow: true });
    }
    // ---- treliça com os monitores de tubo (a seta de cada um) ----
    const zt = 150, yt = 490;
    r.beam(xa - 120, yt, zt, xb + 120, yt, zt, 14, '#26282a', { metal: 0.7 });
    r.beam(xa - 120, yt + 26, zt - 10, xb + 120, yt + 26, zt - 10, 8, '#26282a', { metal: 0.7 });
    for (let i = 0; i < 4; i++) this.drawMonitor3d(g, r, i, this.laneX(i), yt, zt);
    // ---- escadas ----
    for (let i = 0; i < 4; i++) {
      const x = this.laneX(i), owner = g.players[i];
      // caixa da escada (inclinada) e degraus descendo junto com ela
      r.box(x, TOP / 2 - 40, zm, LW + 16, 30, L, '#2b2f33', { rotX: ang, metal: 0.4 });
      for (let t = d.stepAnim - 24; t < Z0 - Z1; t += 24) {
        const z = Z1 + t;
        if (z < Z1 || z > Z0) continue;
        const y = TOP * (Z0 - z) / (Z0 - Z1);
        r.box(x, y - 10, z, LW, 10, 25, '#59626b', { metal: 0.6, rough: 0.4, shadow: false });
      }
      // balaustradas dos dois lados e corrimão com a cor do dono
      for (const side of [-1, 1]) {
        const bx = x + side * (LW / 2 + 6);
        r.beam(bx, 8, Z0, bx, TOP + 8, Z1, 12, '#3c4248', { metal: 0.5 });
        r.beam(bx, 44, Z0, bx, TOP + 44, Z1, 6, '#141414', { rough: 0.5 });
        r.beam(bx, 48, Z0, bx, TOP + 48, Z1, 2, owner ? owner.color : '#888', { glow: true });
        r.tube(bx, 44, Z0, bx, 22, Z0 + 18, 3, '#141414');   // curva do corrimão embaixo
      }
    }
    // divisórias entre as escadas (chapa enferrujada) e os balizadores vermelhos lá embaixo
    for (let k = 0; k < 5; k++) {
      const x = k === 0 ? xa + 18 : k === 4 ? xb - 18 : (this.laneX(k - 1) + this.laneX(k)) / 2, w = k === 0 || k === 4 ? 36 : 192 - LW - 28;
      r.box(x, TOP / 2 - 30, zm, w, 22, L, '#5a3d2a', { rotX: ang, tex: 'metal', metal: 0.3, rough: 0.8 });
      if (k > 0 && k < 4) r.cyl(x, 24, Z0 - 60, 10, 38, '#ff2a1a', { glow: true });
    }
    // ---- fosso do triturador perto da câmera ----
    r.box(480, -260, Z0 + 105, xb - xa, 10, 210, '#140b09');
    for (const zr of [Z0 + 60, Z0 + 150]) {
      const rot = g.time * (zr > Z0 + 100 ? -3 : 3);
      r.tube(xa, -110, zr, xb, -110, zr, 38, '#4d4a46', { metal: 0.8, rough: 0.4 });
      for (let k = 0; k < 16; k++) {   // dentes girando
        const a = rot + k * 0.9, x = xa + 20 + k * (xb - xa - 40) / 15;
        r.box(x, -110 + Math.sin(a) * 38, zr + Math.cos(a) * 38, 10, 22, 10, '#8f2016', { metal: 0.6, rotX: -a });
      }
    }
    for (const s of [-1, 1]) r.box(s < 0 ? xa - 10 : xb + 10, -260, Z0 + 105, 20, 260, 210, '#2e2219');
    r.plane(480, 0.6, Z0 + 6, xb - xa, 10, '#f5c400');                                   // borda zebrada
    for (let k = 0; k < 18; k++) r.box(xa + (k + 0.5) * (xb - xa) / 18, 0, Z0 + 6, (xb - xa) / 36, 2, 10, '#141414', { tex: false, shadow: false });
    r.light(480, -40, Z0 + 100, '#ff2a2a', 0.8 + 0.3 * Math.sin(g.time * 6), 380);
    // plataforma de observação, enferrujada, do lado da câmera
    r.box(480, -20, Z0 + 330, xb - xa + 200, 20, 240, '#6b3f24', { tex: 'metal', metal: 0.4, rough: 0.8 });
    // luzes de serviço: no patamar e penduradas sobre as escadas
    r.light(480, TOP + 200, Z1 - 40, '#ffe7c4', 1.2, 900);
    r.light(330, 420, 280, '#ffd9a8', 1.3, 900);
    r.light(650, 330, 520, '#ffd9a8', 1.0, 800);
    // ---- corredores ----
    for (const p of g.players) {
      const s = p.data;
      if (s.state === 'fell') {
        if (s.fallT > 2) continue;
        const w = this.world(s.lane, 0);
        r.character({ ...p, x: w.x, y: w.z + 50 + s.fallT * 40 }, { key: p.id, pose: 'fall', y: -s.fallT * s.fallT * 160, dir: -Math.PI / 2, label: false });
        continue;
      }
      const w = this.world(s.lane, Math.min(s.s, 1.08));
      const running = s.state === 'top' || s.speed > 0.05;
      r.character({ ...p, x: w.x, y: w.z }, { key: p.id, y: w.y, dir: -Math.PI / 2, pose: running ? 'walk' : 'idle', flash: s.wrong > 0.2, label: false });
    }
  },

  // monitor de tubo pendurado na treliça, sobre a escada i: mostra a seta pedida (vermelha no erro)
  drawMonitor3d(g, r, i, x, yt, zt) {
    const p = g.players[i], s = p ? p.data : null, z = zt + 34;
    r.beam(x - 30, yt, zt, x - 30, yt - 30, zt + 10, 4, '#26282a', { metal: 0.7 });
    r.beam(x + 30, yt, zt, x + 30, yt - 30, zt + 10, 4, '#26282a', { metal: 0.7 });
    r.box(x, yt - 110, zt + 10, 104, 86, 56, '#1c1e20', { metal: 0.5, rough: 0.6 });
    for (const lx of [x + 34, x + 42]) r.sphere(lx, yt - 104, z + 4, 2.5, '#ff2a1a', { glow: true });
    const fundo = !s ? '#050607' : s.state === 'fell' ? '#2a0606' : s.wrong > 0 ? '#5a1010' : s.good > 0 ? '#12361f' : '#06100c';
    r.box(x, yt - 100, z + 1, 86, 68, 1, fundo, { glow: true });
    if (!s) return;
    const cy = yt - 66, col = s.state === 'top' ? '#46e27b' : s.wrong > 0 ? '#ff8080' : '#ffffff';
    if (s.state === 'fell') {
      r.beam(x - 20, cy - 20, z + 2, x + 20, cy + 20, z + 2, 6, '#ff3b3b', { glow: true });
      r.beam(x - 20, cy + 20, z + 2, x + 20, cy - 20, z + 2, 6, '#ff3b3b', { glow: true });
      return;
    }
    const dir = s.state === 'top' ? 'up' : s.arrow, v = this.VEC[dir], ax = v[0], ay = -v[1], k = 22;
    r.beam(x - ax * k, cy - ay * k, z + 2, x + ax * k * 0.6, cy + ay * k * 0.6, z + 2, 7, col, { glow: true });
    // ponta da seta: duas barras a 45° a partir da ponta
    const tx = x + ax * k, ty = cy + ay * k, px = -ay, py = ax;
    r.beam(tx, ty, z + 2, tx - ax * 15 + px * 15, ty - ay * 15 + py * 15, z + 2, 7, col, { glow: true });
    r.beam(tx, ty, z + 2, tx - ax * 15 - px * 15, ty - ay * 15 - py * 15, z + 2, 7, col, { glow: true });
  },

  // HUD 2D por cima do 3D: velocidade da escada + painel fixo com a seta de cada jogador
  drawOverlay(g, c) {
    if (!TN.R3.available || !g.uses3d()) return;
    const D = TN.draw, d = g.data;
    D.panel(c, 14, 44, 250, 50, { fill: 'rgba(8,12,16,0.8)', stroke: '#4dd2ff' });
    D.text(c, 'VELOCIDADE DA ESCADA', 26, 58, { size: 12, color: '#9fb3c8' });
    D.bar(c, 26, 70, 170, 12, d.esc / this.ESC_MAX, d.esc > 0.95 ? '#ff6b6b' : '#4dd2ff', '#1b2229');
    D.text(c, `${d.esc.toFixed(2)} ▼`, 206, 76, { size: 12, color: '#cde' });
    g.players.forEach((p, i) => {
      const s = p.data, L = 52;
      // marcador pequeno sobre o boneco, só para achar quem é quem
      if (s.state !== 'fell') {
        const w = this.world(s.lane, Math.min(s.s, 1.08)), q = TN.R3.project(w.x, w.y + 78, w.z);
        c.fillStyle = p.color; c.beginPath(); c.moveTo(q.x, q.y + 6); c.lineTo(q.x - 6, q.y - 5); c.lineTo(q.x + 6, q.y - 5); c.fill();
        D.text(c, p.label, q.x, q.y - 16, { size: 12, color: p.color, align: 'center' });
      }
      if (s.fx) {   // "+n" / "CAIU!" subindo sobre o boneco
        const w = this.world(s.lane, s.state === 'fell' ? 0.15 : Math.min(s.s, 1.08));
        const q = TN.R3.project(w.x, w.y + 110 + (1.2 - Math.min(1.2, s.fx.t)) * 40, w.z);
        c.globalAlpha = Math.min(1, s.fx.t * 2);
        D.text(c, s.fx.text, q.x, q.y, { size: 20, color: s.fx.color, align: 'center' });
        c.globalAlpha = 1;
      }
      // painel na borda de baixo, embaixo da própria escada
      const b = TN.R3.project(this.laneX(s.lane), 0, this.Z0 - 40);
      const px = TN.util.clamp(b.x, 60, TN.W - 80), py = TN.H - 44;
      D.panel(c, px - L / 2, py - L / 2, L, L, { fill: s.state === 'fell' ? 'rgba(20,10,10,0.8)' : s.wrong > 0 ? '#5a1010' : s.good > 0 ? '#1d4a2c' : 'rgba(10,14,18,0.9)', stroke: s.state === 'on' ? p.color : '#444', radius: 8, lw: 3 });
      D.text(c, p.label, px - L / 2, py - L / 2 - 9, { size: 12, color: p.color });
      if (s.state === 'top') D.text(c, '✔', px, py, { size: 28, color: '#46e27b', align: 'center' });
      else if (s.state === 'fell') D.text(c, '✖', px, py, { size: 28, color: '#ff3b3b', align: 'center' });
      else this.drawArrow(c, px, py, 36, s.arrow, s.wrong > 0 ? '#ff8080' : '#fff');
      if (s.state === 'on') {   // medidor de ritmo ao lado: a sua velocidade contra a da escada
        const mx = px + L / 2 + 6, my = py - L / 2, mh = L, t = s.speed / this.MAX_SPEED;
        c.fillStyle = '#1b2229'; c.fillRect(mx, my, 7, mh);
        c.fillStyle = s.speed >= d.esc - 0.001 ? '#46e27b' : '#ff6b6b'; c.fillRect(mx, my + mh * (1 - t), 7, mh * t);
        const ey = my + mh * (1 - d.esc / this.MAX_SPEED);
        c.fillStyle = '#fff'; c.fillRect(mx - 3, ey - 1, 13, 2);
      }
    });
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
    const q = this.pos(s.lane, s.state === 'fell' ? 0 : Math.min(s.s, 1.08));
    const bx = q.x - 52, by = q.y - 46;
    if (s.fx) { c.globalAlpha = Math.min(1, s.fx.t * 2); D.text(c, s.fx.text, q.x, q.y - 76 - (1.2 - Math.min(1.2, s.fx.t)) * 30, { size: 16, color: s.fx.color, align: 'center' }); c.globalAlpha = 1; }
    if (s.state === 'fell') return;
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
