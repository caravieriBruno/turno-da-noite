// CENÁRIOS DE CADEIA: peças prontas de cenário para o draw3d.
//   r.room(x1, z1, x2, z2, o)  ambientes internos: o.estilo = cela | oficina | refeitorio | subsolo | escritorio
//   r.yard(x1, z1, x2, z2, o)  pátio externo à noite (muros, arame farpado, guarita com holofote, postes)
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

  // Estilos de ambiente interno. Paredes: meia-parede (paint, até paintH) + parte de cima (top).
  const ESTILOS = {
    cela:       { paint: '#35574a', top: '#857d6b', floor: '#3e3c38', texPaint: 'tinta',    texTop: 'tinta',    texFloor: 'piso',     lamp: 'fluor' },
    oficina:    { paint: '#6b3a2a', top: '#5e3426', floor: '#45413b', texPaint: 'tijolo',   texTop: 'tijolo',   texFloor: 'piso',     lamp: 'pendente' },
    refeitorio: { paint: '#cfccc2', top: '#8a8370', floor: '#7a3328', texPaint: 'azulejo',  texTop: 'tinta',    texFloor: 'caquinho', lamp: 'fluor' },
    subsolo:    { paint: '#3b3e3d', top: '#2d302f', floor: '#2b2c2b', texPaint: 'concreto', texTop: 'concreto', texFloor: 'piso',     lamp: 'emergencia' },
    escritorio: { paint: '#6e4f33', top: '#a39778', floor: '#5c4129', texPaint: 'madeira',  texTop: 'tinta',    texFloor: 'taco',     lamp: 'pendente' },
  };

  function janelas(r, b, o, persiana) {   // janelas altas no fundo: com grade (cela) ou persiana (escritório)
    const n = o.windows ?? Math.max(1, Math.round(b.w / 320));
    for (let i = 0; i < n; i++) {
      const wx = b.x1 + b.w * (i + 0.5) / n, wy = b.H * 0.55, ww = 74, wh = b.H * 0.28;
      r.box(wx, wy, b.z1 + 0.5, ww + 10, wh + 10, 3, '#3a3a36', { metal: 0.5 });
      r.box(wx, wy + 5, b.z1 + 1, ww, wh, 3, '#06080a', { tex: false });
      if (persiana) for (let k = 0; k < 8; k++) r.box(wx, wy + 8 + k * wh / 8, b.z1 + 3, ww, 2.5, 2, '#b9b39f', { tex: false });
      else for (let k = 0; k < 7; k++) { const bx = wx - ww / 2 + (k + 0.5) * ww / 7; r.tube(bx, wy + 5, b.z1 + 4, bx, wy + 5 + wh, b.z1 + 4, 1.6, '#4a4844', { metal: 0.6 }); }
    }
  }

  // detalhes de cada estilo (b = medidas já normalizadas do ambiente)
  const DETALHES = {
    cela(r, b, o) {
      janelas(r, b, o, false);
      r.tube(b.x1, b.H - 22, b.z1 + 10, b.x2, b.H - 22, b.z1 + 10, 5, '#6b5846', { metal: 0.5 });
      if (o.bars !== false) {   // grade de cela na lateral esquerda, com o fundo escuro da cela vizinha
        const bz = b.z1 + 60, bl = Math.min(220, b.sideD * 0.4);
        r.box(b.x1 + 1, 0, bz + bl / 2, 3, b.H * 0.7, bl, '#07090a', { tex: false });
        r.prop('grade', b.x1 + 5, bz + bl / 2, { w: bl, h: b.H * 0.7, rotY: Math.PI / 2 });
      }
    },
    oficina(r, b, o) {
      const n = Math.floor(b.w / 12);   // faixa zebrada na base da parede do fundo
      for (let i = 0; i < n; i++) r.box(b.x1 + 6 + i * 12, 9, b.z1 + 1, 12, 14, 2, i % 2 ? '#141414' : '#d9a800', { tex: false });
      if (o.props !== false) {
        r.box(b.x1 + 90, 0, b.z1 + 26, 140, 34, 40, '#5a4a38');   // bancada
        r.box(b.x1 + 90, 34, b.z1 + 26, 146, 4, 44, '#3d3b37', { metal: 0.5 });
        r.prop('tambor', b.x2 - 50, b.z1 + 30);
        r.prop('tambor', b.x2 - 86, b.z1 + 26, { color: '#6b2e22' });
      }
    },
    refeitorio(r, b) {
      const pw = Math.min(220, b.w * 0.3);   // passa-pratos gradeado com balcão de inox
      r.box(b.cx, b.PH + 10, b.z1 + 1, pw, 60, 3, '#0a0b0b', { tex: false });
      r.box(b.cx, b.PH + 4, b.z1 + 8, pw + 16, 6, 18, '#8b8d88', { metal: 0.6 });
      r.prop('grade', b.cx, b.z1 + 4, { w: pw, h: 60, y: b.PH + 10 });
    },
    subsolo(r, b) {
      r.tube(b.x1, b.H - 30, b.z1 + 14, b.x2, b.H - 30, b.z1 + 14, 9, '#4d4038', { metal: 0.5 });
      r.tube(b.x1, b.H - 52, b.z1 + 12, b.x2, b.H - 52, b.z1 + 12, 6, '#39443f', { metal: 0.5 });
      for (let i = 0; i < 3; i++) { const px = b.x1 + b.w * (0.2 + 0.3 * i); r.tube(px, 0, b.z1 + 12, px, b.H - 30, b.z1 + 12, 5, '#4d4038', { metal: 0.5 }); }
      r.disc(b.x1 + 60, 0.2, b.z1 + 40, 30, '#111312', { rough: 0.15, metal: 0.3, tex: false });   // poças
      r.disc(b.x2 - 80, 0.2, b.z1 + 36, 24, '#111312', { rough: 0.15, metal: 0.3, tex: false });
    },
    escritorio(r, b, o) {
      janelas(r, b, o, true);
      if (o.props !== false) { r.prop('arquivo', b.x1 + 40, b.z1 + 22, { rotY: -Math.PI / 2 }); r.prop('arquivo', b.x1 + 76, b.z1 + 22, { rotY: -Math.PI / 2 }); }
    },
  };

  // luminárias no fundo: fluorescente (a do meio pisca), pendente (lâmpada amarela) ou giroflex vermelho
  function luminarias(r, tipo, b, o) {
    const n = o.lamps ?? 3, t = r.time || 0, maxLuz = Math.min(2, n, o.lights ?? 2);
    // quais lâmpadas têm luz de verdade é decidido antes (espalhadas pela sala); a que pisca só escurece,
    // em vez de passar a luz para outra lâmpada
    const comLuz = new Set(Array.from({ length: maxLuz }, (_, k) => Math.round((k + 0.5) * n / maxLuz - 0.5)));
    for (let i = 0; i < n; i++) {
      const lx = b.x1 + b.w * (i + 0.5) / n;
      if (tipo === 'fluor') {
        const pisca = i === Math.floor(n / 2) && Math.sin(t * 17) + Math.sin(t * 5.3 + 1) > 1.25;
        r.box(lx, b.PH + 8, b.z1 + 6, 100, 9, 12, '#5d5f5c', { metal: 0.5 });
        r.box(lx, b.PH + 4, b.z1 + 9, 90, 4, 6, pisca ? '#3c403c' : '#eafff0', { glow: true });
        if (!pisca && comLuz.has(i)) r.light(lx, b.PH + 10, b.z1 + 70, '#d9ffe6', 0.7, 700, { fundo: true });
      } else if (tipo === 'pendente') {
        const ly = b.H - 60, lz = b.z1 + 80;
        r.beam(lx, b.H + 40, lz, lx, ly + 14, lz, 1.5, '#111111');
        r.cone(lx, ly + 2, lz, 16, 12, '#2f3a33', { metal: 0.5 });
        r.sphere(lx, ly + 2, lz, 5, '#ffd28a', { glow: true });
        if (comLuz.has(i)) r.light(lx, ly - 10, lz, '#ffc477', 0.8, 650, { fundo: true });
      } else {   // 'emergencia': giroflex
        const ang = t * 4 + i, k = 0.5 + 0.5 * Math.cos(ang);
        r.cyl(lx, b.PH + 20, b.z1 + 8, 7, 6, '#222222', { metal: 0.5 });
        r.sphere(lx, b.PH + 30, b.z1 + 8, 6, k > 0.5 ? '#ff2a1a' : '#5a0d08', { glow: true });
        if (comLuz.has(i)) r.light(lx + Math.cos(ang) * 60, b.PH + 30, b.z1 + 8 + Math.abs(Math.sin(ang)) * 60, '#ff3a22', 0.4 + 0.6 * k, 500, { fundo: true });
      }
    }
  }

  // Ambiente interno: chão, parede do fundo e laterais (a frente fica aberta para a câmera), detalhes do
  // estilo e luminárias. o: { estilo, h, paintH, paint, top, floor, windows, lamps, lights, bars, frente, props }
  // (floor: false = sem chão, para o jogo desenhar o próprio piso com poço ou buraco)
  function room(r, x1, z1, x2, z2, o = {}) {
    const nome = o.estilo || 'cela', est = ESTILOS[nome];
    if (!est) throw new Error(`r.room: estilo desconhecido "${o.estilo}" (use: ${Object.keys(ESTILOS).join(', ')})`);
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 200, PH = o.paintH ?? H * 0.45, T = 16, w = x2 - x1, cx = (x1 + x2) / 2;
    const paint = o.paint ?? est.paint, top = o.top ?? est.top, floor = o.floor ?? est.floor;
    const zFront = z2 + (o.frente ?? 500), sideD = zFront - z1, sideZ = (z1 + zFront) / 2;
    if (floor !== false) r.plane(cx, -1.5, sideZ, w + 1400, sideD + 900, floor, { tex: est.texFloor });
    const wall = (x, z, ww, dd) => {
      r.box(x, 0, z, ww, PH, dd, paint, { tex: est.texPaint });
      r.box(x, PH, z, ww, H - PH, dd, top, { tex: est.texTop });
      r.box(x, PH - 3, z, ww + 2, 6, dd + 2, ESCURO, { tex: 'tinta' });
      r.box(x, 0, z, ww + 2, 9, dd + 2, ESCURO);
    };
    wall(cx, z1 - T / 2, w + T * 2, T);
    wall(x1 - T / 2, sideZ, T, sideD);
    wall(x2 + T / 2, sideZ, T, sideD);
    const b = { x1, z1, x2, z2, w, cx, H, PH, sideD };
    DETALHES[nome](r, b, o);
    luminarias(r, est.lamp, b, o);
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

  // arame farpado no topo de um muro: hastes em V e três fios
  function arame(r, xa, za, xb, zb, H) {
    const len = Math.hypot(xb - xa, zb - za);
    if (len < 1) return;
    const n = Math.max(1, Math.round(len / 70)), ux = (xb - xa) / len, uz = (zb - za) / len;
    for (let i = 0; i <= n; i++) {
      const px = xa + ux * len * i / n, pz = za + uz * len * i / n;
      r.beam(px, H, pz, px - uz * 14, H + 30, pz + ux * 14, 2, '#2c2c2a');
      r.beam(px, H, pz, px + uz * 14, H + 30, pz - ux * 14, 2, '#2c2c2a');
    }
    for (const [off, hy] of [[-14, 30], [0, 18], [14, 30]]) r.beam(xa - uz * off, H + hy, za + ux * off, xb - uz * off, H + hy, zb + ux * off, 1.2, '#55534d');
  }

  // Pátio à noite: chão com linhas de quadra apagadas, muros com arame farpado no fundo e nas laterais,
  // postes de vapor de sódio e guarita com holofote que varre o pátio (só depende de r.time).
  // o: { h, floor, wall, quadra, guarita: true|false|'esquerda'|'direita', holofote, postes, frente }
  // (floor: false = sem chão nem linhas de quadra, para o jogo desenhar o próprio piso com abismo)
  function yard(r, x1, z1, x2, z2, o = {}) {
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 260, T = 24, w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, mz = (z1 + z2) / 2, t = r.time || 0;
    const zFront = z2 + (o.frente ?? 500), sideD = zFront - z1, sideZ = (z1 + zFront) / 2, muro = o.wall ?? '#5f5c55';
    if (o.floor !== false) r.plane(cx, -1.5, sideZ, w + 1600, sideD + 1000, o.floor ?? '#3b3934');
    if (o.floor !== false && o.quadra !== false && w > 120 && d > 120) {   // linhas de quadra apagadas
      const m = 40, lc = '#77735f', y = -1.2, L = { tex: false, opacity: 0.5 };
      const ix1 = x1 + m, ix2 = x2 - m, iz1 = z1 + m, iz2 = z2 - m;
      r.plane(cx, y, iz1, ix2 - ix1, 4, lc, L); r.plane(cx, y, iz2, ix2 - ix1, 4, lc, L);
      r.plane(ix1, y, mz, 4, iz2 - iz1, lc, L); r.plane(ix2, y, mz, 4, iz2 - iz1, lc, L);
      r.plane(cx, y, mz, 4, iz2 - iz1, lc, L);
      r.ring(cx, y, mz, 56, 60, lc, L);
    }
    r.box(cx, 0, z1 - T / 2, w + T * 2, H, T, muro);
    r.box(x1 - T / 2, 0, sideZ, T, H, sideD, muro);
    r.box(x2 + T / 2, 0, sideZ, T, H, sideD, muro);
    arame(r, x1 - T / 2, z1 - T / 2, x2 + T / 2, z1 - T / 2, H);
    arame(r, x1 - T / 2, z1 - T / 2, x1 - T / 2, zFront, H);
    arame(r, x2 + T / 2, z1 - T / 2, x2 + T / 2, zFront, H);
    // postes de vapor de sódio alternando os lados; só o primeiro acende luz de verdade
    const np = o.postes ?? 2;
    for (let i = 0; i < np; i++) {
      const esq = i % 2 === 0, fila = Math.floor(i / 2), filas = Math.ceil(np / 2);
      r.prop('poste', esq ? x1 + 20 : x2 - 20, z1 + d * (fila + 0.5) / filas, { rotY: esq ? 0 : Math.PI, luz: i === 0 });
    }
    if (o.guarita !== false) {
      const gx = o.guarita === 'esquerda' ? x1 + 30 : x2 - 30, gz = z1 + 30, gh = H + 40;
      for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) r.box(gx + dx, 0, gz + dz, 6, gh, 6, '#4a4843', { metal: 0.4 });
      r.box(gx, gh, gz, 70, 46, 70, '#6a675f');
      r.box(gx, gh + 16, gz + 35.5, 56, 20, 1, '#0b0d0e', { tex: false });
      r.box(gx, gh + 46, gz, 84, 6, 84, '#3a3936', { metal: 0.4 });
      if (o.holofote !== false) {
        const lx = gx + (gx > cx ? -36 : 36), ly = gh + 30, lz = gz + 36;
        const tx = cx + Math.sin(t * 0.5) * w * 0.38, tz = mz + Math.cos(t * 0.37) * d * 0.3;
        r.cyl(lx, ly - 6, lz, 7, 12, '#2a2a2a', { metal: 0.6 });
        r.sphere(lx, ly, lz, 6, '#fff6d8', { glow: true });
        // facho: cone com a base no chão e o vértice no holofote (rotZ inclina, rotY aponta)
        const dx = lx - tx, dy = ly, dz = lz - tz, len = Math.hypot(dx, dy, dz);
        r.cone(tx, 0, tz, 70, len, '#fff2c8', { glow: true, additive: true, opacity: 0.1, shadow: false, rotZ: Math.acos(dy / len), rotY: Math.atan2(dz, -dx) });
        r.disc(tx, 0.6, tz, 70, '#fff2c8', { glow: true, additive: true, opacity: 0.15 });
        r.light(tx, 60, tz, '#fff0d0', 1.2, 260, { fundo: true });
      }
    }
  }

  TN.cenarios = { room, prop, yard };
})();
