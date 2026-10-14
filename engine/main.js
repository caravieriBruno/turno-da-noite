// Inicialização: carrega os minigames listados no manifesto e roda o loop a 60 Hz fixos.
(function () {
  const canvas = document.getElementById('game');
  const c = canvas.getContext('2d');
  const params = new URLSearchParams(location.search);
  const SPEED = Number(params.get('speed')) || 1;   // ?speed=3 acelera (útil para testar)
  const STEP = 1 / 60;
  TN.force2d = params.get('2d') === '1';             // ?2d=1 força os gráficos 2D antigos
  const canvas3d = document.getElementById('game3d');
  if (canvas3d && !TN.force2d) TN.R3.init(canvas3d);

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.min(window.innerWidth / TN.W, window.innerHeight / TN.H);
    const w = Math.floor(TN.W * s), h = Math.floor(TN.H * s);
    const stage = document.getElementById('stage');
    if (stage) { stage.style.width = w + 'px'; stage.style.height = h + 'px'; }
    for (const cv of [canvas, canvas3d]) { if (!cv) continue; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    TN._scale = (w / TN.W) * dpr;
    if (TN.R3.available) TN.R3.resize(w, h, Math.min(dpr, 2));
  }
  window.addEventListener('resize', resize);
  resize();

  // Carrega cada arquivo de minigame com <script> (funciona até abrindo o HTML direto, via file://)
  function loadMinigames(files) {
    return files.reduce((p, f) => p.then(() => new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'minigames/' + f + '?v=' + Date.now();
      s.onload = res;
      s.onerror = () => { console.error('Falha ao carregar minigame', f); TN.loadErrors.push(f); res(); };
      document.body.appendChild(s);
    })), Promise.resolve());
  }
  TN.loadErrors = [];
  window.addEventListener('error', (e) => { TN.lastError = e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno; });

  let acc = 0, last = performance.now();
  function frame() {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000) * SPEED; last = now;
    let steps = 0;
    while (acc >= STEP && steps < 8 * SPEED) {
      TN.input.update();
      try { TN.scene.update(STEP); } catch (e) { console.error(e); TN.lastError = String(e && e.stack || e); }
      TN.scene.t = (TN.scene.t || 0) + STEP;
      try { TN.net.tick(); } catch (e) { console.error(e); TN.lastError = 'rede: ' + e.message; }
      acc -= STEP; steps++;
    }
    c.setTransform(TN._scale, 0, 0, TN._scale, 0, 0);
    c.clearRect(0, 0, TN.W, TN.H);
    TN.R3.used = false;
    try { TN.scene.draw(c); } catch (e) { console.error(e); TN.lastError = String(e && e.stack || e); }
    TN.R3.setVisible && TN.R3.setVisible(TN.R3.used);   // a camada 3D só aparece quando uma rodada 3D foi desenhada
    if (TN.net.mode === 'host') TN.net.drawToast(c);
    if (TN.lastError) {
      c.fillStyle = 'rgba(120,0,0,0.85)'; c.fillRect(0, TN.H - 60, TN.W, 60);
      TN.draw.lines(c, 'ERRO: ' + TN.lastError.split('\n').slice(0, 2).join('\n'), 10, TN.H - 44, { size: 12, color: '#fff', maxWidth: TN.W - 20 });
    }
    requestAnimationFrame(frame);
  }

  // ?extra=<id> carrega minigames/<id>.js mesmo fora do manifesto (útil para testar um jogo novo)
  const files = (TN.MINIGAME_FILES || []).slice();
  for (const id of params.getAll('extra')) if (!files.includes(id + '.js')) files.push(id + '.js');

  loadMinigames(files).then(() => {
    TN.bootScene();
    // atalhos de rede: ?rede=host (cria sala ao abrir) · ?rede=entrar[&sala=ABCD] (entra na primeira sala/na sala indicada)
    const rede = params.get('rede');
    if (rede === 'host') {
      const keep = TN.scene;
      TN.net.host().then(() => { if (!params.get('game')) TN.go(new TN.LobbyScene({})); else TN.scene = keep; })
        .catch(() => TN.go(new TN.NetScenes.HostCreate()));
    } else if (rede === 'entrar') {
      TN.go(new TN.NetScenes.JoinList({ auto: (params.get('sala') || '*').toUpperCase() }));
    }
    // ?t=8 → avança 8 s de jogo instantaneamente (para screenshots/depuração)
    const ff = Number(params.get('t')) || 0;
    for (let i = 0; i < ff * 60; i++) {
      TN.input.update();
      try { TN.scene.update(STEP); } catch (e) { console.error(e); TN.lastError = String(e && e.stack || e); break; }
      TN.scene.t = (TN.scene.t || 0) + STEP;
    }
    requestAnimationFrame(frame);
  });
})();
