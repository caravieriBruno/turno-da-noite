// CENÁRIOS DE CADEIA: peças prontas de cenário para o draw3d.
//   r.room(x1, z1, x2, z2, o)  ambientes internos (a frente fica aberta para a câmera)
//   r.prop(nome, x, z, o)     objetos (beliche, vaso, banco, mesa, tambor, pneu, colchao, grade, poste, arquivo)
// Usam só as primitivas públicas da API do draw3d (box, tube, light...), então rodam igual no navegador
// e no validador do tools/simular.js. Regras:
//   - tudo que pisca ou se mexe depende só de r.time (fica igual no host e nos clientes);
//   - cada cenário acende no máximo 2 luzes pontuais, sempre com { fundo: true } (as luzes do
//     minigame têm prioridade nas 6 vagas do motor).
// (x1,z1) = canto do fundo à esquerda, (x2,z2) = canto da frente à direita (aceita em qualquer ordem).
(function () {
  const ESCURO = '#1b1d1c';
  // aceita os cantos em qualquer ordem e garante área mínima (evita paredes invertidas)
  function rect(x1, z1, x2, z2) {
    const ax = Math.min(x1, x2), bx = Math.max(x1, x2), az = Math.min(z1, z2), bz = Math.max(z1, z2);
    return { x1: ax, z1: az, x2: Math.max(bx, ax + 1), z2: Math.max(bz, az + 1) };
  }

  // Cela: chão, parede do fundo e laterais com pintura de meia-parede, janelas gradeadas, cano,
  // grade de cela na lateral esquerda e luminárias fluorescentes (a do meio pisca).
  // o: { h, paintH, paint, top, floor, windows, lamps (nº), lights (quantas acendem luz), bars }
  function room(r, x1, z1, x2, z2, o = {}) {
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 200, PH = o.paintH ?? H * 0.45, T = 16, w = x2 - x1, cx = (x1 + x2) / 2;
    const paint = o.paint ?? '#35574a', top = o.top ?? '#857d6b', floor = o.floor ?? '#3e3c38';
    const zFront = z2 + 500, sideD = zFront - z1, sideZ = (z1 + zFront) / 2;
    r.plane(cx, -1.5, sideZ, w + 1400, sideD + 900, floor);
    const wall = (x, z, ww, dd) => {
      r.box(x, 0, z, ww, PH, dd, paint, { tex: 'tinta' });
      r.box(x, PH, z, ww, H - PH, dd, top, { tex: 'tinta' });
      r.box(x, PH - 3, z, ww + 2, 6, dd + 2, ESCURO, { tex: 'tinta' });
      r.box(x, 0, z, ww + 2, 9, dd + 2, ESCURO);
    };
    wall(cx, z1 - T / 2, w + T * 2, T);
    wall(x1 - T / 2, sideZ, T, sideD);
    wall(x2 + T / 2, sideZ, T, sideD);
    const nWin = o.windows ?? Math.max(1, Math.round(w / 320));
    for (let i = 0; i < nWin; i++) {
      const wx = x1 + w * (i + 0.5) / nWin, wy = H * 0.55, ww = 74, wh = H * 0.28;
      r.box(wx, wy, z1 + 0.5, ww + 10, wh + 10, 3, '#3a3a36', { metal: 0.5 });
      r.box(wx, wy + 5, z1 + 1, ww, wh, 3, '#06080a', { tex: false });
      for (let b = 0; b < 7; b++) { const bx = wx - ww / 2 + (b + 0.5) * ww / 7; r.tube(bx, wy + 5, z1 + 4, bx, wy + 5 + wh, z1 + 4, 1.6, '#4a4844', { metal: 0.6 }); }
    }
    r.tube(x1, H - 22, z1 + 10, x2, H - 22, z1 + 10, 5, '#6b5846', { metal: 0.5 });
    if (o.bars !== false) {
      const bz = z1 + 60, bl = Math.min(220, sideD * 0.4);
      r.box(x1 + 1, 0, bz + bl / 2, 3, H * 0.7, bl, '#07090a', { tex: false });
      for (let z = bz; z <= bz + bl; z += 14) r.tube(x1 + 5, 0, z, x1 + 5, H * 0.7, z, 2, '#55534e', { metal: 0.6 });
      r.box(x1 + 5, H * 0.7, bz + bl / 2, 5, 6, bl + 4, '#55534e', { metal: 0.6 });
    }
    const nLamp = o.lamps ?? 3, t = r.time || 0, maxLuz = Math.min(2, o.lights ?? 2);
    let acesas = 0;
    for (let i = 0; i < nLamp; i++) {
      const lx = x1 + w * (i + 0.5) / nLamp;
      const pisca = i === Math.floor(nLamp / 2) && Math.sin(t * 17) + Math.sin(t * 5.3 + 1) > 1.25;
      r.box(lx, PH + 8, z1 + 6, 100, 9, 12, '#5d5f5c', { metal: 0.5 });
      r.box(lx, PH + 4, z1 + 9, 90, 4, 6, pisca ? '#3c403c' : '#eafff0', { glow: true });
      if (!pisca && acesas < maxLuz) { r.light(lx, PH + 10, z1 + 70, '#d9ffe6', 0.7, 700, { fundo: true }); acesas++; }
    }
  }

  // Desenha em coordenadas locais (lx, lz) em torno de (x, z), girado por o.rotY (mesmo sentido do
  // rotation.y do Three), escalado por o.scale e elevado por o.y.
  function montador(r, x, z, o) {
    const s = o.scale ?? 1, a = o.rotY || 0, c = Math.cos(a), sn = Math.sin(a), y0 = o.y || 0;
    const P = (lx, lz) => [x + s * (lx * c + lz * sn), z + s * (-lx * sn + lz * c)];
    return {
      box(lx, ly, lz, w, h, d, cor, op = {}) { const [wx, wz] = P(lx, lz); r.box(wx, y0 + ly * s, wz, w * s, h * s, d * s, cor, { ...op, rotY: a + (op.rotY || 0) }); },
      cyl(lx, ly, lz, rad, h, cor, op = {}) { const [wx, wz] = P(lx, lz); r.cyl(wx, y0 + ly * s, wz, rad * s, h * s, cor, op); },
      tube(ax, ay, az, bx, by, bz, rad, cor, op = {}) { const [px, pz] = P(ax, az), [qx, qz] = P(bx, bz); r.tube(px, y0 + ay * s, pz, qx, y0 + by * s, qz, rad * s, cor, op); },
      sphere(lx, ly, lz, rad, cor, op = {}) { const [wx, wz] = P(lx, lz); r.sphere(wx, y0 + ly * s, wz, rad * s, cor, op); },
      light(lx, ly, lz, cor, k, dist) { const [wx, wz] = P(lx, lz); r.light(wx, y0 + ly * s, wz, cor, k, dist * s, { fundo: true }); },
    };
  }

  const FERRO = '#4a4b47', INOX = '#9a9d9a', CIMENTO = '#6e6b63';
  const PROPS = {
    beliche(m) {
      for (const [px, pz] of [[-22, -48], [22, -48], [-22, 48], [22, 48]]) m.box(px, 0, pz, 4, 112, 4, FERRO, { metal: 0.6 });
      for (const y of [18, 72]) { m.box(0, y, 0, 46, 4, 100, FERRO, { metal: 0.6 }); m.box(0, y + 4, 0, 42, 9, 94, '#6d6a58', { tex: 'tecido' }); }
    },
    vaso(m) {
      m.cyl(0, 0, 0, 8, 16, INOX, { metal: 0.8, rough: 0.3 });
      m.cyl(0, 16, 0, 13, 6, INOX, { metal: 0.8, rough: 0.3 });
      m.cyl(0, 21.5, 0, 9, 1, '#2a3a3a', { tex: false });
      m.box(-14, 0, 0, 8, 34, 24, INOX, { metal: 0.8, rough: 0.3 });
    },
    banco(m) {
      m.box(-34, 0, 0, 10, 20, 22, CIMENTO); m.box(34, 0, 0, 10, 20, 22, CIMENTO);
      m.box(0, 20, 0, 92, 6, 26, CIMENTO);
    },
    mesa(m) {
      const tampo = '#7c7e79';
      m.box(0, 0, 0, 14, 32, 14, CIMENTO);
      m.box(0, 32, 0, 140, 5, 58, tampo, { metal: 0.6, rough: 0.4 });
      for (const pz of [-48, 48]) { m.box(0, 0, pz, 12, 18, 12, CIMENTO); m.box(0, 18, pz, 140, 4, 18, tampo, { metal: 0.6, rough: 0.4 }); }
    },
    tambor(m, o) {
      const cor = o.color ?? '#4f5e3a';
      m.cyl(0, 0, 0, 16, 44, cor, { metal: 0.5 });
      for (const y of [12, 30]) m.cyl(0, y, 0, 16.8, 2, cor, { metal: 0.5 });
      m.cyl(0, 44, 0, 15, 0.6, '#1d1f1c', { metal: 0.5 });
    },
    pneu(m) {
      m.cyl(0, 0, 0, 18, 10, '#1a1a1a', { rough: 0.95, tex: false });
      m.cyl(0, 0.2, 0, 9, 10.2, '#070707', { tex: false });
    },
    colchao(m, o) { m.box(0, 0, 0, 50, 8, 100, o.color ?? '#7a7660', { tex: 'tecido' }); },
    grade(m, o) {   // trecho de grade ao longo do eixo X local; o.w = largura, o.h = altura
      const w = o.w ?? 100, h = o.h ?? 140, ferro = '#55534e';
      for (let x = -w / 2; x <= w / 2 + 0.1; x += 12) m.tube(x, 0, 0, x, h, 0, 2, ferro, { metal: 0.6 });
      m.box(0, h, 0, w + 4, 5, 5, ferro, { metal: 0.6 });
      m.box(0, h * 0.5, 0, w + 4, 4, 4, ferro, { metal: 0.6 });
    },
    poste(m, o) {   // poste de vapor de sódio; o braço aponta para +X local; o.luz acende 1 luz de fundo
      const ferro = '#3d3e3b';
      m.tube(0, 0, 0, 0, 230, 0, 4, ferro, { metal: 0.5 });
      m.tube(0, 226, 0, 46, 236, 0, 2.5, ferro, { metal: 0.5 });
      m.box(52, 228, 0, 26, 8, 14, ferro, { metal: 0.5 });
      m.box(52, 226, 0, 20, 2, 10, '#ffb04a', { glow: true });
      if (o.luz) m.light(52, 200, 0, '#ffa040', 1, 700);
    },
    arquivo(m) {   // arquivo de aço; a frente (gavetas) olha para +X local
      const aco = '#6b6f6a';
      m.box(0, 0, 0, 30, 80, 36, aco, { metal: 0.55 });
      for (let i = 0; i < 4; i++) {
        m.box(15.5, 6 + i * 19, 0, 1, 1.2, 32, '#2a2c2a', { tex: false });
        m.box(16, 14 + i * 19, 0, 1.5, 2, 8, '#b9bcb6', { metal: 0.8 });
      }
    },
  };
  function prop(r, nome, x, z, o = {}) {
    const f = PROPS[nome];
    if (!f) throw new Error(`r.prop: objeto desconhecido "${nome}" (use: ${Object.keys(PROPS).join(', ')})`);
    f(montador(r, x, z, o), o);
  }

  TN.cenarios = { room, prop };
})();
