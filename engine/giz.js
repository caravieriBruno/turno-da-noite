// GIZ: kit de desenho dos menus no tema "mapa de fuga a giz" (a parede da cela vira lousa).
// Tudo é determinístico: o tremor e o grão vêm de uma semente do próprio texto ou das coordenadas,
// nunca de Math.random(). Assim o giz não "ferve" e o host e os clientes de rede desenham igual.
// Só a seleção anima, pelo tempo da cena. Spec: docs/superpowers/specs/2026-10-15-menus-fuga-design.md
(function () {
  const U = TN.util;
  const FONTE = '"Chalkboard SE", "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
  const CORES = {
    giz: '#e8e4d8', destaque: '#f2d65a', perigo: '#e0574a', lapis: '#2b2a26', parede: '#1d2321',
    apagado: 'rgba(232,228,216,0.16)', apagadoForte: 'rgba(232,228,216,0.55)',
  };
  // semente FNV-1a + gerador mulberry32 (o mesmo texto dá sempre o mesmo tremor)
  function semente(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const alfa = (c) => (typeof c.globalAlpha === 'number' ? c.globalAlpha : 1);   // respeita um globalAlpha de fora
  const fonte = (size) => `bold ${size}px ${FONTE}`;
  function largura(c, str, size) { c.font = fonte(size); return c.measureText(String(str)).width; }
  // cor do jogador como giz colorido: um pouco puxada para o branco do giz
  function desbotar(cor, k = 0.22) {
    const m = /^#?([0-9a-f]{6})$/i.exec(cor || '');
    if (!m) return cor;
    const n = parseInt(m[1], 16), mix = (v, w) => Math.round(v + (w - v) * k);
    return `rgb(${mix(n >> 16, 232)},${mix((n >> 8) & 255, 228)},${mix(n & 255, 216)})`;
  }

  // letra à mão: 3 passadas levemente deslocadas e um grão que apaga pedacinhos do traço.
  // Abaixo de 14 px (rodapés, rótulos) uma passada só e sem grão, para continuar legível.
  // papel: texto de lápis num bilhete (2 passadas fracas, sem grão).
  function texto(c, str, x, y, { size = 20, color = CORES.giz, align = 'left', baseline = 'middle', maxWidth, papel = false } = {}) {
    str = String(str);
    const r = rng(semente(str + '|' + size)), fino = size < 14, a0 = alfa(c);
    const passadas = fino ? 1 : papel ? 2 : 3, amp = fino ? 0 : papel ? 0.4 : Math.max(0.6, size * 0.035);
    c.save();
    c.font = fonte(size); c.textAlign = align; c.textBaseline = baseline; c.fillStyle = color;
    for (let i = 0; i < passadas; i++) {
      c.globalAlpha = a0 * (i === 0 ? 0.95 : 0.35);
      c.fillText(str, x + (r() - 0.5) * amp * 2, y + (r() - 0.5) * amp * 2, maxWidth);
    }
    if (!fino && !papel) {
      const w = Math.min(c.measureText(str).width, maxWidth || Infinity), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      c.globalAlpha = a0 * 0.6; c.fillStyle = CORES.parede;
      for (let i = 0, n = Math.round((w * size) / 60); i < n; i++) c.fillRect(x0 + r() * w, y - size / 2 + r() * size, 1 + r() * 0.8, 1 + r() * 0.8);
    }
    c.restore();
  }
  function linhas(c, str, x, y, opts = {}) {
    const size = opts.size || 20, lh = opts.lineHeight || size * 1.35;
    String(str).split('\n').forEach((ln, i) => texto(c, ln, x, y + i * lh, opts));
  }
  // traço de giz: curva levemente torta, com uma segunda passada mais fraca
  function linha(c, x1, y1, x2, y2, { color = CORES.giz, lw = 2, alpha = 0.9 } = {}) {
    const r = rng(semente([x1, y1, x2, y2].map(Math.round).join(','))), a0 = alfa(c);
    c.save(); c.strokeStyle = color; c.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const j = () => (r() - 0.5) * lw * 1.6;
      c.globalAlpha = a0 * alpha * (i ? 0.45 : 1); c.lineWidth = lw * (i ? 0.7 : 1);
      c.beginPath(); c.moveTo(x1 + j(), y1 + j());
      c.quadraticCurveTo((x1 + x2) / 2 + j() * 2, (y1 + y2) / 2 + j() * 2, x2 + j(), y2 + j()); c.stroke();
    }
    c.restore();
  }
  function retangulo(c, x, y, w, h, { color, lw, alpha, fill } = {}) {
    if (fill) { c.save(); c.fillStyle = fill; c.fillRect(x, y, w, h); c.restore(); }
    const o = { color, lw, alpha };
    linha(c, x, y, x + w, y, o); linha(c, x + w, y, x + w, y + h, o); linha(c, x + w, y + h, x, y + h, o); linha(c, x, y + h, x, y, o);
  }
  // elipse à mão que passa um pouco do ponto de partida; progresso 0..1 desenha só parte dela
  function circulo(c, x, y, rx, ry, { color = CORES.destaque, lw = 2.5, progresso = 1, alpha = 0.95 } = {}) {
    const r = rng(semente(`${Math.round(x)},${Math.round(y)},${Math.round(rx)},${Math.round(ry)}`));
    const a0 = -2.2 + r() * 0.6, total = (Math.PI * 2 + 0.35) * U.clamp(progresso, 0, 1), fase = r() * 6, onda = (r() - 0.5) * 0.08;
    if (total <= 0) return;
    c.save(); c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.globalAlpha = alfa(c) * alpha;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = a0 + (total * i) / 40, k = 1 + onda * Math.sin(a * 3 + fase) + 0.04 * (i / 40);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke(); c.restore();
  }
  // seleção: circula o texto `str` (desenhado em x, y com esse alinhamento) em ~0,25 s, mais uma setinha
  function selecao(c, str, x, y, size, t, align = 'center') {
    const w = largura(c, str, size), cx = align === 'center' ? x : align === 'right' ? x - w / 2 : x + w / 2;
    circulo(c, cx, y, w / 2 + 16, size * 0.5 + 9, { progresso: t / 0.25 });
    texto(c, '→', cx - w / 2 - 30, y, { size, color: CORES.destaque, align: 'center' });
  }
  function titulo(c, str, x, y, size = 36, color = CORES.giz) {
    texto(c, str, x, y, { size, color, align: 'center' });
    const w = largura(c, str, size), yy = y + size * 0.62;
    linha(c, x - w / 2, yy, x + w / 2, yy, { color, lw: 2.5 });
    linha(c, x - w / 2 + 12, yy + 6, x + w / 2 - 20, yy + 6, { color, lw: 1.5, alpha: 0.6 });
  }
  // roda de letras do lobby: o nome letra a letra, a do cursor em destaque com setas ↑↓ pulsando, e o ✓ no fim
  // (circulado quando o cursor está nele). `t` é o tempo da cena, só para o pulso.
  function rodaDeLetras(c, x, y, nome, cursor, t) {
    const passo = 16, total = nome.length + 1, x0 = x - ((total - 1) * passo) / 2, pulso = 2 + Math.sin(t * 8) * 1.5;
    for (let i = 0; i < nome.length; i++) {
      const on = i === cursor, cx = x0 + i * passo;
      texto(c, nome[i] === ' ' ? '␣' : nome[i], cx, y, { size: on ? 22 : 18, color: on ? CORES.destaque : CORES.giz, align: 'center' });
      if (on) { texto(c, '▲', cx, y - 16 - pulso, { size: 9, color: CORES.destaque, align: 'center' }); texto(c, '▼', cx, y + 16 + pulso, { size: 9, color: CORES.destaque, align: 'center' }); }
    }
    const cx = x0 + nome.length * passo, noOk = cursor >= nome.length;
    texto(c, '✓', cx, y, { size: 20, color: noOk ? CORES.destaque : CORES.apagadoForte, align: 'center' });
    if (noOk) circulo(c, cx, y, 12, 12, { color: CORES.destaque, lw: 2 });
  }
  // bilhete de papel preso com fita (o texto em cima usa { papel: true, color: CORES.lapis })
  function bilhete(c, x, y, w, h, { rot = 0, fita = true } = {}) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rot);
    c.fillStyle = '#d9cfb4'; c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(-w / 2, h / 2 - 6, w, 6);
    if (fita) { c.fillStyle = 'rgba(235,230,200,0.55)'; c.fillRect(-22, -h / 2 - 8, 44, 16); }
    c.restore();
  }
  // detento de giz: cabeça, uniforme listrado na cor do jogador, braços e pernas
  function detento(c, x, y, tam, cor, { caido = false, comemorando = false, dir = 0 } = {}) {
    const k = desbotar(cor), o = { color: k, lw: Math.max(1.5, tam * 0.12) };
    const h = tam * 1.3, cab = tam * 0.32, ombro = -h + cab * 2 + 2, quadril = h * 0.35, lt = tam * 0.42, by = ombro + 3;
    c.save(); c.translate(x, y);
    if (caido) c.rotate(Math.PI / 2);
    circulo(c, 0, -h + cab, cab, cab, { color: k, lw: o.lw, alpha: 0.9 });
    retangulo(c, -lt, ombro, lt * 2, quadril - ombro, o);
    for (let yy = ombro + 5; yy < quadril - 2; yy += Math.max(4, tam * 0.22)) linha(c, -lt + 2, yy, lt - 2, yy, { ...o, lw: o.lw * 0.6, alpha: 0.6 });
    if (comemorando) { linha(c, -lt, by, -lt - tam * 0.5, by - tam * 0.9, o); linha(c, lt, by, lt + tam * 0.5, by - tam * 0.9, o); }
    else { linha(c, -lt, by, -lt - tam * 0.3, by + tam * 0.8, o); linha(c, lt, by, lt + tam * 0.3, by + tam * 0.8, o); }
    linha(c, -lt * 0.5, quadril, -lt * 0.7, h, o); linha(c, lt * 0.5, quadril, lt * 0.7, h, o);
    const ox = Math.cos(dir) * cab * 0.35;   // os olhos olham para o lado de dir
    c.fillStyle = k; c.fillRect(ox - cab * 0.35, -h + cab - 1, 2, 2); c.fillRect(ox + cab * 0.25, -h + cab - 1, 2, 2);
    c.restore();
  }

  // ---- a lousa: concreto escuro, giz apagado, planta da prisão e contagem de dias (gerada uma vez) ----
  function planta(g) {
    const o = { color: CORES.apagado, lw: 2 };
    retangulo(g, 30, 30, TN.W - 60, TN.H - 60, o);                                    // muro
    for (let i = 0; i < 5; i++) retangulo(g, 60 + i * 70, 60, 70, 90, o);            // celas
    linha(g, 60, 190, 410, 190, o);                                                   // corredor
    retangulo(g, 600, 300, 300, 180, o);                                              // pátio
    texto(g, 'PÁTIO', 750, 390, { size: 22, color: CORES.apagado, align: 'center' });
    texto(g, 'X', 340, 105, { size: 26, color: 'rgba(224,87,74,0.35)', align: 'center' });   // a nossa cela
    for (let k = 0; k < 12; k++) linha(g, 350 + k * 44, 160 + k * 28, 372 + k * 44, 174 + k * 28, o);   // o túnel
    linha(g, 880, 500, 858, 500, o); linha(g, 880, 500, 872, 482, o);
    for (let k = 0; k < 4; k++) {                                                     // contagem de dias
      for (let i = 0; i < 4; i++) linha(g, 806 + k * 32 + i * 5, 44, 804 + k * 32 + i * 5, 70, o);
      linha(g, 801 + k * 32, 64, 828 + k * 32, 50, o);
    }
  }
  let fundo = null;
  function gerarFundo() {
    const cv = document.createElement('canvas'); cv.width = TN.W; cv.height = TN.H;
    const g = cv.getContext('2d'), r = rng(171);
    g.fillStyle = CORES.parede; g.fillRect(0, 0, TN.W, TN.H);
    for (let i = 0; i < 26; i++) {                                                    // manchas de giz apagado
      const x = r() * TN.W, y = r() * TN.H, rr = 40 + r() * 140, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(220,215,200,${(0.03 + r() * 0.05).toFixed(3)})`); gr.addColorStop(1, 'rgba(220,215,200,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.035)'; g.fillRect(r() * TN.W, r() * TN.H, 1 + r() * 1.5, 1 + r() * 1.5); }
    planta(g);
    return cv;
  }
  function parede(c) {
    if (!fundo && typeof document !== 'undefined' && document.createElement) fundo = gerarFundo();
    if (fundo) c.drawImage(fundo, 0, 0); else { c.fillStyle = CORES.parede; c.fillRect(0, 0, TN.W, TN.H); }
    const v = c.createRadialGradient(TN.W / 2, TN.H / 2, TN.H * 0.4, TN.W / 2, TN.H / 2, TN.W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, TN.W, TN.H);
  }

  TN.giz = { CORES, FONTE, texto, linhas, titulo, linha, retangulo, circulo, selecao, bilhete, detento, parede, desbotar, rodaDeLetras };
})();
