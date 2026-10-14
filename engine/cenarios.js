// CENÁRIOS DE CADEIA: peças prontas de cenário para o draw3d.
//   r.room(x1, z1, x2, z2, o)  ambientes internos (a frente fica aberta para a câmera)
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

  TN.cenarios = { room };
})();
