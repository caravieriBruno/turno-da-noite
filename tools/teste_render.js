// Teste do render 3D no navegador. O tools/teste_render.sh abre tools/teste_render.html num Chrome headless.
// Para cada cena confere: desenha sem exceção, não fica em branco e é determinística (mesmo r.time =
// mesmos pixels, como host e clientes na rede). No fim mede o tempo médio de quadro de uma cena típica.
// O resultado vai para <pre id="resultado">, entre as linhas RESULTADO-INICIO e RESULTADO-FIM.
(function () {
  const linhas = [];
  const ok = (cond, msg) => linhas.push((cond ? '✓ ' : '✗ ') + msg);
  const fim = () => {
    const pre = document.createElement('pre'); pre.id = 'resultado';
    pre.textContent = ['RESULTADO-INICIO', ...linhas, 'RESULTADO-FIM'].join('\n');
    document.body.append(pre);
  };
  const c3 = document.createElement('canvas'), c2 = document.createElement('canvas');
  c2.width = TN.W; c2.height = TN.H;
  const ctx = c2.getContext('2d');
  document.body.append(c3);
  if (!TN.R3.init(c3)) { ok(false, 'WebGL indisponível'); fim(); return; }
  TN.R3.resize(TN.W, TN.H, 1);
  ok(true, 'visual ' + (TN.R3.RETRO ? 'novo (cadeia)' : 'antigo (liso)'));

  const rodada = (draw3d, time) => ({ def: { draw3d }, time, _particles: [], _shake: 0 });
  const desenhar = (draw3d, time) => TN.R3.renderRound(rodada(draw3d, time), ctx);
  function hash() {   // FNV-1a dos pixels do canvas 3D (preserveDrawingBuffer está ligado no motor)
    const t = document.createElement('canvas'); t.width = c3.width; t.height = c3.height;
    const x = t.getContext('2d'); x.drawImage(c3, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const quadro = (draw3d, time) => { desenhar(draw3d, time); return hash(); };

  // cenas de referência: as tarefas do kit de cenários acrescentam as suas aqui
  const CENAS = [
    ['cela (r.room padrão)', (g, r) => r.room(40, 20, 920, 520)],
  ];
  // ?ver=<trecho do nome>: só desenha essa cena (para olhar ou tirar screenshot) e não roda os testes
  const ver = new URLSearchParams(location.search).get('ver');
  if (ver) {
    const cena = CENAS.find(([n]) => n.includes(ver));
    if (cena) desenhar(cena[1], 2.5);
    c3.style.width = '960px'; c3.style.height = '540px'; c3.style.imageRendering = 'pixelated';
    ok(!!cena, 'cena "' + ver + '"');
    fim(); return;
  }
  const vazio = quadro(() => {}, 0);
  for (const [nome, draw] of CENAS) {
    try {
      const a = quadro(draw, 2.5); quadro(draw, 4.1); const b = quadro(draw, 2.5);
      ok(a !== vazio, nome + ': desenha algo');
      ok(a === b, nome + ': determinística (mesmo time = mesmos pixels)');
    } catch (e) { ok(false, nome + ': exceção ' + e.message); }
  }

  // TESTES EXTRAS (as tarefas seguintes acrescentam blocos aqui)

  // tempo médio de quadro: cela + piso em ladrilhos + 4 personagens (parecido com um minigame real)
  const tipico = (g, r) => {
    r.room(40, 20, 920, 520);
    for (let x = 40; x < 920; x += 44) for (let z = 70; z < 480; z += 44) r.plane(x + 22, 0, z + 22, 42, 42, '#3a4048');
    for (let i = 0; i < 4; i++) r.character({ id: i, x: 200 + i * 160, y: 280, dir: 0, color: TN.PLAYER_COLORS[i], alive: true });
  };
  for (let i = 0; i < 10; i++) desenhar(tipico, i / 60);
  hash();
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) desenhar(tipico, i / 60);
  hash();   // força a GPU a terminar antes de parar o relógio
  linhas.push('TEMPO_QUADRO_MS=' + ((performance.now() - t0) / 60).toFixed(2));
  fim();
})();
