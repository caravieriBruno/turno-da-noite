// Cena de depuração do personagem 3D (não está no manifesto). Abra: index.html?game=_teste3d&extra=_teste3d&humans=0&t=4
TN.registerMinigame({
  id: '_teste3d', title: 'TESTE 3D', rounds: 1, timeLimit: 30, scoring: 'points',
  camera: { pos: [480, 160, 520], target: [480, 30, 270], fov: 40 },
  init(g) { g.players.forEach((p, i) => { p.x = 380 + i * 65; p.y = 270; p.dir = Math.PI / 2; }); },
  update() {},
  bot() { return { x: 0, y: 0 }; },
  draw3d(g, r) {
    r.plane(480, 0, 270, 800, 600, '#3a4048');
    const poses = ['idle', 'walk', 'dead', 'sit', 'crouch', 'fall', 'arms'];
    poses.forEach((pose, i) => {
      const x = 300 + i * 60;
      r.character({ id: 'dbg' + i, x, y: 330, dir: i === 1 ? 0 : Math.PI / 2, color: TN.PLAYER_COLORS[i % 4], label: pose }, { pose });
    });
    g.players.forEach((p) => r.character(p, { dir: 0 }));
  },
});
