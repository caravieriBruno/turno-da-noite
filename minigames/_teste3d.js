// Cena de depuração do personagem 3D (não está no manifesto). Abra: index.html?game=_teste3d&extra=_teste3d&humans=0&t=4
TN.registerMinigame({
  id: '_teste3d', title: 'TESTE 3D', rounds: 1, timeLimit: 30, scoring: 'points',
  camera: { pos: [480, 200, 720], target: [480, 30, 330], fov: 46 },
  init(g) { g.players.forEach((p, i) => { p.x = 380 + i * 65; p.y = 270; p.dir = Math.PI / 2; }); },
  update() {},
  bot() { return { x: 0, y: 0 }; },
  draw3d(g, r) {
    r.plane(480, 0, 270, 1000, 700, '#3a4048');
    r.light(480, 260, 400, '#ffffff', 2.2, 1200);
    r.light(200, 200, 300, '#ffe8c0', 1.0, 700);
    r.light(760, 200, 300, '#ffe8c0', 1.0, 700);
    // todas as poses, em duas fileiras
    const poses = ['idle', 'walk', 'dead', 'sit', 'crouch', 'fall', 'arms', 'aim', 'hold', 'work', 'pull', 'statue', 'dance', 'swing', 'gun', 'shoot', 'drive', 'hit', 'jump', 'land', 'lie'];
    poses.forEach((pose, i) => {
      const x = 215 + (i % 11) * 54, z = i < 11 ? 360 : 440;
      r.character({ id: 'dbg' + i, x, y: z, dir: pose === 'walk' ? 0 : Math.PI / 2, color: TN.PLAYER_COLORS[i % 4], label: pose }, { pose });
    });
    g.players.forEach((p) => r.character(p, { dir: 0 }));
  },
});
