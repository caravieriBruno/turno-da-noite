// MODELO DE MINIGAME — copie este arquivo para minigames/<id>.js, troque o id e escreva as regras.
// Este arquivo NÃO está no manifesto (é só exemplo). Teste com: node tools/simular.js _modelo
//
// Exemplo: "COLETA" — moedas aparecem pela sala; quem pegar mais em 20 s vence.
TN.registerMinigame({
  id: '_modelo',                       // igual ao nome do arquivo, sem .js
  title: 'COLETA',                     // nome em MAIÚSCULAS
  tagline: 'PEGUE TUDO. NÃO PARE.',    // frase de efeito (aparece na roleta e no início da rodada)
  brief: ['Moedas aparecem pela sala.', 'Pegue o máximo que puder.', 'Quem tiver mais vence.'],
  controls: { move: 'andar', a: 'dar um tranco (corre mais rápido por 0,3 s)' },
  icon: '$',                           // 1 caractere/emoji para o cartão da roleta
  color: '#ffd23f',                    // cor de destaque do minigame
  rounds: 2,                           // rodadas padrão
  timeLimit: 20,                       // segundos (0/omitido = sem limite; acaba quando você chamar g.finish())
  scoring: 'rank',                     // 'survival' | 'rank' | 'points'  (ver docs/COMO_CRIAR_MINIGAME.md)

  // Chamado no começo de CADA rodada. Guarde o estado em g.data e p.data.
  init(g) {
    g.data.coins = [];
    g.data.nextCoin = 0;
    g.placeInCircle(g.W / 2, g.H / 2 + 20, 140);
    for (const p of g.players) p.data.dash = 0;
  },

  // Lógica, 60x por segundo. dt = 1/60.
  update(g, dt) {
    const U = TN.util, a = g.arena;
    if (g.time >= g.data.nextCoin) {
      g.data.coins.push({ x: U.rand(a.x + 20, a.x + a.w - 20), y: U.rand(a.y + 20, a.y + a.h - 20), r: 10 });
      g.data.nextCoin = g.time + 0.5;
    }
    for (const p of g.alive()) {
      p.data.dash -= dt;
      if (p.input.aPressed && p.data.dash < -1) { p.data.dash = 0.3; g.sfx('whoosh'); }
      g.movePlayer(p, p.data.dash > 0 ? 420 : 200, dt);
      for (const coin of g.data.coins) {
        if (!coin.taken && U.circles(p, coin)) { coin.taken = true; g.addScore(p, 1); g.sfx('coin'); g.particles(coin.x, coin.y, '#ffd23f', 8); }
      }
    }
    g.data.coins = g.data.coins.filter((c) => !c.taken);
    U.separate(g.alive());
  },

  // Inteligência dos bots: devolve o "controle" {x, y, a, b} (x/y entre -1 e 1).
  bot(g, p) {
    const U = TN.util;
    let best = null, bd = 1e9;
    for (const c of g.data.coins) { const d = U.dist(p.x, p.y, c.x, c.y); if (d < bd) { bd = d; best = c; } }
    if (!best) return { x: 0, y: 0 };
    const n = U.norm(best.x - p.x, best.y - p.y);
    return { x: n.x, y: n.y, a: bd > 200 && U.chance(0.05) };
  },

  // Desenho 3D com câmera fixa (principal). O HUD (título, tempo, placar) é desenhado pelo motor por cima.
  // Coordenadas: X = p.x, Z = p.y (a lógica 2D vira o chão), Y = altura.
  camera: { pos: [480, 600, 820], target: [480, 0, 290], fov: 40 },
  draw3d(g, r) {
    const a = g.arena;
    r.plane(480, -1, 290, 1600, 1100, '#121519');                       // entorno
    r.plane(a.x + a.w / 2, 0, a.y + a.h / 2, a.w, a.h, '#3a4048');       // piso da arena
    for (const coin of g.data.coins) {
      r.cyl(coin.x, 6, coin.y, coin.r, 3, '#ffd23f', { metal: 0.4, rough: 0.3, emissive: '#5a3c00', rotX: Math.PI / 2, rotY: g.time * 3 });
      r.disc(coin.x, 0.5, coin.y, coin.r * 0.8, '#000', { opacity: 0.35 });   // sombra falsa
    }
    for (const p of g.players) r.character(p, { flash: p.data.dash > 0 });
  },

  // Alternativa 2D (opcional — usada sem WebGL ou com ?2d=1).
  draw(g, c) {
    const a = g.arena, D = TN.draw;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h);
    for (const coin of g.data.coins) {
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#a80'; c.lineWidth = 2; c.stroke();
    }
    for (const p of g.players) g.drawPlayer(c, p, { flash: p.data.dash > 0 });
  },
});
