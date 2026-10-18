// Teste do render 3D no navegador. O tools/teste_render.sh abre tools/teste_render.html num Chrome headless.
// Para cada cena confere: desenha sem exceção, não fica em branco e é determinística (mesmo r.time =
// mesmos pixels, como host e clientes na rede). No fim mede o tempo médio de quadro de uma cena típica.
// O resultado vai para <pre id="resultado">, entre as linhas RESULTADO-INICIO e RESULTADO-FIM.
(async function () {
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
  const umBoneco = (o = {}) => TN.R3.renderRound({ def: { draw3d: (g, r) => r.character({ id: 0, x: 480, y: 280, dir: 0, color: '#c33', alive: true }, o) }, time: 1, _particles: [], _shake: 0 }, ctx);
  umBoneco();
  const antesDeCarregar = TN.R3._personagens()[0];

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
    ['oficina', (g, r) => r.room(40, 20, 920, 520, { estilo: 'oficina' })],
    ['refeitório', (g, r) => r.room(40, 20, 920, 520, { estilo: 'refeitorio' })],
    ['subsolo', (g, r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' })],
    ['escritório', (g, r) => r.room(40, 20, 920, 520, { estilo: 'escritorio' })],
    ['pátio (r.yard)', (g, r) => r.yard(40, 20, 920, 520)],
    ['objetos (r.prop)', (g, r) => {
      ['beliche', 'vaso', 'banco', 'mesa', 'tambor', 'pneu', 'colchao', 'grade', 'poste', 'arquivo']
        .forEach((n, i) => r.prop(n, 120 + (i % 5) * 180, 180 + Math.floor(i / 5) * 200, { rotY: i * 0.4 }));
    }],
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
  // texturas: todas existem, não são lisas, têm brilho de multiplicador (0.5..1) e são diferentes entre si
  try {
    const nomes = ['concreto', 'piso', 'metal', 'tinta', 'tecido', 'tijolo', 'azulejo', 'caquinho', 'madeira', 'taco'];
    const assinaturas = new Set();
    for (const n of nomes) {
      const d = TN.R3._textura(n).image.data;
      let soma = 0, soma2 = 0, h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] / 255; soma += v; soma2 += v * v; h = Math.imul(h ^ d[i], 16777619); }
      const qtd = d.length / 4, media = soma / qtd, desvio = Math.sqrt(Math.max(0, soma2 / qtd - media * media));
      ok(media > 0.5 && media < 0.98 && desvio > 0.02, `textura ${n}: média ${media.toFixed(2)}, desvio ${desvio.toFixed(3)}`);
      assinaturas.add(h >>> 0);
    }
    ok(assinaturas.size === nomes.length, 'as texturas são todas diferentes entre si');
    // cada textura de peças tem o seu padrão: as juntas (rejunte, frestas) são bem mais escuras que as peças
    const N = 128, val = (n) => { const d = TN.R3._textura(n).image.data; return (x, y) => d[(y * N + x) * 4]; };
    const juntaEscura = (n, eJunta) => {
      const v = val(n); let sj = 0, nj = 0, sp = 0, np = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { if (eJunta(x, y)) { sj += v(x, y); nj++; } else { sp += v(x, y); np++; } }
      return sj / nj < 0.75 * (sp / np);
    };
    ok(juntaEscura('tijolo', (x, y) => y % 16 < 2), 'tijolo: fiadas com junta escura a cada 16 px');
    ok(juntaEscura('azulejo', (x, y) => y % 32 < 2 || x % 32 < 2), 'azulejo: rejunte escuro a cada 32 px');
    ok(juntaEscura('madeira', (x) => x % 16 === 0), 'madeira: fresta entre tábuas a cada 16 px');
    ok(juntaEscura('taco', (x, y) => x % 32 === 0 || y % 32 === 0), 'taco: bordas escuras dos blocos de 32 px');
    { const v = val('caquinho'); let r = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (v(x, y) === 127) r++; ok(r / (N * N) > 0.04, 'caquinho: rejunte entre os cacos'); }
  } catch (e) { ok(false, 'texturas: exceção ' + e.message); }
  // luzes do minigame têm prioridade sobre as do cenário (o motor tem 6 vagas)
  try {
    desenhar((g, r) => { r.room(40, 20, 920, 520); for (let i = 0; i < 6; i++) r.light(100 + i * 150, 40, 300, '#f00', 1, 200); }, 1);
    const luzes = TN.R3.stats().luzes;
    ok(luzes.length === 6 && luzes.every((l) => Math.abs(l.y - 40) < 0.01), 'luzes do jogo têm prioridade sobre as do cenário');
    desenhar((g, r) => { r.room(40, 20, 920, 520); r.light(480, 40, 300, '#f00', 1, 200); }, 1);
    ok(TN.R3.stats().luzes.length === 3, 'sobrando vaga, as luzes do cenário acendem (1 do jogo + 2 do cenário)');
  } catch (e) { ok(false, 'prioridade de luz: exceção ' + e.message); }

  // personagem glTF: carrega sozinho (assíncrono), refaz o pool, mapeia poses; no visual antigo nem carrega
  const pronto = await TN.R3.detentoPronto;
  if (TN.R3.RETRO) {
    ok(pronto === true && TN.R3.estadoDetento() === 'pronto', 'modelo glTF carregou (estado: ' + TN.R3.estadoDetento() + ')');
    ok(!antesDeCarregar.gltf, 'antes de carregar, o personagem é o boneco de caixas');
    umBoneco();
    const c = TN.R3._personagens()[0];
    ok(!!c.gltf && TN.R3._personagens().length === 1, 'depois de carregar, o pool é refeito com o modelo glTF (sem sobra de caixas)');
    c.root.updateMatrixWorld(true);
    const bx = new THREE.Box3().setFromObject(c.root, true);
    ok(Math.abs(bx.max.y - bx.min.y - 60) < 6, 'altura na cena ~60 (deu ' + (bx.max.y - bx.min.y).toFixed(1) + ')');
    umBoneco({ pose: 'sit' }); ok(c.gltf.atual === 'Sitting_Idle_Loop', 'pose sit → Sitting_Idle_Loop');
    umBoneco({ pose: 'dead' }); ok(c.gltf.atual === 'Death01', 'pose dead → Death01');
    // a animação é estado da vaga do pool: cada personagem fica com a sua, mesmo mudando a ordem de desenho
    let raizes = [];
    const dois = (ordem) => TN.R3.renderRound({ def: { draw3d: (g, r) => { raizes = ordem.map((id) => r.character({ id, x: 300 + id * 200, y: 280, dir: 0, color: '#c33', alive: true })); } }, time: 1, _particles: [], _shake: 0 }, ctx);
    dois([0, 1]); const r0 = raizes[0], r1 = raizes[1];
    dois([1, 0]);
    ok(raizes[1] === r0 && raizes[0] === r1, 'cada personagem fica com a mesma vaga do pool, mesmo mudando a ordem de desenho');
    dois([1]);
    ok(r1.visible && !r0.visible, 'vaga não usada no quadro fica escondida');
    // teleporte (início de rodada, renascer) não vira corrida: o boneco continua parado
    const pular = (x) => TN.R3.renderRound({ def: { draw3d: (g, r) => r.character({ id: 7, x, y: 280, dir: 0, color: '#c33', alive: true }) }, time: 1, _particles: [], _shake: 0 }, ctx);
    pular(100); pular(100); pular(700);
    ok(TN.R3._personagens().find((v) => v.chave === 7).gltf.atual === 'Idle_Loop', 'teleporte não vira corrida (o boneco continua parado)');
    // andando com a posição mudando só a 30/s (rede) corre sem piscar; ao parar, volta ao idle logo (caixas: ~0,1 s)
    const espera = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };
    let px = 100;
    const andar = () => TN.R3.renderRound({ def: { draw3d: (g, r) => r.character({ id: 8, x: px, y: 280, dir: 0, color: '#c33', alive: true }) }, time: 1, _particles: [], _shake: 0 }, ctx);
    let trocas = 0, antes = null;
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) px += 6;   // ~180 px/s a 60 quadros/s, posição nova a cada 2 quadros
      andar(); espera(16);
      const atual = TN.R3._personagens().find((v) => v.chave === 8).gltf.atual;
      if (i > 10 && antes && atual !== antes) trocas++;
      antes = atual;
    }
    const vaga = TN.R3._personagens().find((v) => v.chave === 8);
    ok(vaga.gltf.atual === 'Jog_Fwd_Loop' && trocas === 0, 'andando a 30 posições/s, corre sem trocar de pose (trocas: ' + trocas + ')');
    const tParou = performance.now();
    while (vaga.gltf.atual !== 'Idle_Loop' && performance.now() - tParou < 2000) { andar(); espera(16); }
    const parou = performance.now() - tParou;
    ok(parou < 250, 'parou de andar → idle em menos de 0,25 s (levou ' + parou.toFixed(0) + ' ms)');
  } else {
    ok(pronto === false && TN.R3.estadoDetento() === 'desligado' && !TN.R3._personagens()[0].gltf, 'visual antigo: boneco de caixas, sem carregar o modelo');
  }

  // viewports: a mesma cena em duas vistas lado a lado; cada metade mostra outra coisa, é determinística e não custa mais que 1,5×
  try {
    const metade = (x0) => {   // FNV-1a só da faixa horizontal [x0, x0 + metade)
      const t = document.createElement('canvas'); t.width = c3.width; t.height = c3.height;
      const x = t.getContext('2d'); x.drawImage(c3, 0, 0);
      const w = Math.floor(t.width / 2), d = x.getImageData(x0 * w, 0, w, t.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    const cena = (g, r) => { r.room(40, 20, 920, 520); r.box(200, 0, 300, 60, 60, 60, '#ff2020', { glow: true }); r.box(760, 0, 300, 60, 60, 60, '#2020ff', { glow: true }); };
    const duas = () => [
      { rect: [0, 0, 480, 540], camera: { pos: [200, 300, 700], target: [200, 0, 300], fov: 40 } },
      { rect: [480, 0, 480, 540], camera: { pos: [760, 300, 700], target: [760, 0, 300], fov: 40 } },
    ];
    const rodadaV = (time) => ({ def: { draw3d: cena, viewports: duas }, time, _particles: [], _shake: 0 });
    TN.R3.renderRound(rodadaV(1), ctx); const e1 = metade(0), d1 = metade(1);
    TN.R3.renderRound(rodadaV(1), ctx); const e2 = metade(0), d2 = metade(1);
    ok(e1 !== d1, 'viewports: as duas metades mostram coisas diferentes');
    ok(e1 === e2 && d1 === d2, 'viewports: determinístico (mesmo time = mesmos pixels nas duas vistas)');
    const s = TN.R3.project(760, 0, 300, 1);
    ok(s.x >= 480 && s.x <= 960 && s.visible, `viewports: project(..., 1) cai dentro do rect da vista 1 (x ${s.x.toFixed(0)})`);
    const s0 = TN.R3.project(200, 0, 300, 0);
    ok(s0.x >= 0 && s0.x < 480, `viewports: project(..., 0) cai na vista 0 (x ${s0.x.toFixed(0)})`);
    const u = TN.R3.unproject(s.x, s.y, 0, 1);
    ok(Math.abs(u.x - 760) < 2 && Math.abs(u.z - 300) < 2, 'viewports: unproject desfaz o project na vista 1');
    // o conteúdo de cada vista é o certo: a caixa vermelha está no ponto projetado pela vista 0 e a azul no da vista 1
    // (com a vista 1 desenhada em tela cheia, como acontecia no rt retrô, a amostra da esquerda sai azul/escura)
    const pixel = (sx, sy) => {
      const t = document.createElement('canvas'); t.width = c3.width; t.height = c3.height;
      const x = t.getContext('2d'); x.drawImage(c3, 0, 0);
      const d = x.getImageData(Math.round(sx * c3.width / TN.W), Math.round(sy * c3.height / TN.H), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    };
    TN.R3.renderRound(rodadaV(1), ctx);
    const pv = pixel(s0.x, TN.R3.project(200, 30, 300, 0).y), pa = pixel(s.x, TN.R3.project(760, 30, 300, 1).y);
    ok(pv.r > pv.b + 60, `viewports: a vista 0 mostra a caixa vermelha no ponto projetado (rgb ${pv.r},${pv.g},${pv.b})`);
    ok(pa.b > pa.r + 60, `viewports: a vista 1 mostra a caixa azul no ponto projetado (rgb ${pa.r},${pa.g},${pa.b})`);
    // as faixas fora de qualquer vista são limpas a cada quadro (nada do quadro anterior sobra)
    const faixa = () => [
      { rect: [0, 100, 960, 440], camera: { pos: [480, 300, 700], target: [480, 0, 300], fov: 40 } },
    ];
    TN.R3.renderRound({ def: { draw3d: cena, viewports: faixa }, time: 1, _particles: [], _shake: 0 }, ctx);
    const pf = pixel(480, 50);
    ok(pf.r < 40 && pf.g < 40 && pf.b < 40, `viewports: fora das vistas fica limpo (rgb ${pf.r},${pf.g},${pf.b})`);
    const rodada1 = (time) => ({ def: { draw3d: cena, camera: duas()[0].camera }, time, _particles: [], _shake: 0 });
    for (let i = 0; i < 5; i++) { TN.R3.renderRound(rodada1(i / 60), ctx); TN.R3.renderRound(rodadaV(i / 60), ctx); }
    hash();
    let t0 = performance.now(); for (let i = 0; i < 30; i++) TN.R3.renderRound(rodada1(i / 60), ctx); hash(); const t1v = (performance.now() - t0) / 30;
    t0 = performance.now(); for (let i = 0; i < 30; i++) TN.R3.renderRound(rodadaV(i / 60), ctx); hash(); const t2v = (performance.now() - t0) / 30;
    ok(t2v <= t1v * 1.5 + 2, `viewports: duas vistas custam ${t2v.toFixed(1)} ms contra ${t1v.toFixed(1)} ms de uma (teto 1,5× + 2 ms)`);
    TN.R3.renderRound(rodada1(1), ctx);   // volta ao modo de uma vista para os blocos seguintes
  } catch (e) { ok(false, 'viewports: exceção ' + e.message); }

  // tempo médio de quadro: cela + piso em ladrilhos + 8 personagens andando (pior caso de um minigame real)
  const tipico = (g, r) => {
    r.room(40, 20, 920, 520);
    for (let x = 40; x < 920; x += 44) for (let z = 70; z < 480; z += 44) r.plane(x + 22, 0, z + 22, 42, 42, '#3a4048');
    for (let i = 0; i < 8; i++) r.character({ id: i, x: 120 + i * 100 + (g.time * 120) % 60, y: 200 + (i % 2) * 140, dir: 0, color: TN.PLAYER_COLORS[i % 4], alive: true });
  };
  for (let i = 0; i < 10; i++) desenhar(tipico, i / 60);
  hash();
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) desenhar(tipico, i / 60);
  hash();   // força a GPU a terminar antes de parar o relógio
  linhas.push('TEMPO_QUADRO_MS=' + ((performance.now() - t0) / 60).toFixed(2));
  // asset quebrado: avisa no console e volta ao boneco de caixas (sem exceção)
  if (TN.R3.RETRO) {
    const avisos = [], aviso = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    const r1 = await TN.R3._recarregarDetento('!!!');
    console.warn = aviso;
    umBoneco();
    ok(r1 === false && TN.R3.estadoDetento() === 'falhou' && !TN.R3._personagens()[0].gltf && avisos.some((a) => a.includes('boneco de caixas')), 'asset quebrado: avisa no console e volta ao boneco de caixas');
  }
  fim();
})().catch((e) => {
  const pre = document.createElement('pre'); pre.id = 'resultado';
  pre.textContent = 'RESULTADO-INICIO\n✗ exceção: ' + e.message + '\nRESULTADO-FIM';
  document.body.append(pre);
});
