// CAMINHO DA MEMÓRIA — inspirado em "MEMORIZE PATH" (memorize_path), minigame inacabado de Machine Party.
// Várias paredes separam o início da saída; cada parede tem portas e só UMA é segura.
// As luzes mostram verde/vermelho por alguns instantes e apagam. Atravesse de memória antes do tempo.
// Porta errada tira 1 de 2 vidas (a segunda explode depois de 2 s). A cada travessia o labirinto cresce.
TN.registerMinigame({
  id: 'caminho_da_memoria',
  title: 'CAMINHO DA MEMÓRIA',
  inspiredBy: 'Memorize Path (memorize_path, não lançado)',
  tagline: 'LEMBRE-SE. OU EXPLODA.',
  brief: ['Decore as portas verdes enquanto as luzes estão acesas.', 'Atravesse até a saída antes do tempo acabar.', 'Porta errada custa uma vida. São só duas.'],
  controls: { move: 'andar' },
  icon: '⌗',
  color: '#3fe0c5',
  rounds: 2,
  scoring: 'survival',

  // ---- constantes (original: luzes rows×0,5 s; tempo (rows+1)×5 s; 3×3 → máx. 7 fileiras × 6 portas) ----
  SPEED: 165, R: 13, LIVES: 2, FUSE: 2, ZONE_W: 84, WALL_T: 14, MAX_ROWS: 7, MAX_DOORS: 6, MAX_SUBS: 8,
  BOT_RECALL: 0.8,

  // cores das portas: verde/vermelho (como sempre), mas em painéis grandes com ✓/✗ e o chão pintado na prévia,
  // porque as esferas minúsculas confundiam
  COR_SEGURA: '#46e27b', COR_ERRADA: '#ff3b3b', COR_EXPLODIDA: '#444',

  init(g) {
    const d = g.data;
    d.rows = 3; d.doors = 3; d.sub = 0; d.leftToRight = false;
    d.batches = []; d.banner = null;
    for (const p of g.players) Object.assign(p.data, { lives: this.LIVES, fuse: 0, arrived: false, passed: [], mem: [] });
    for (const p of g.players) p.r = this.R;
    this.newSub(g);
  },

  // Monta o labirinto da travessia atual e posiciona os vivos na zona de início.
  newSub(g) {
    const d = g.data, a = g.arena, U = TN.util;
    d.sub++;
    d.leftToRight = !d.leftToRight;   // início e saída trocam de lado a cada travessia
    const zw = this.ZONE_W;
    d.startZone = d.leftToRight ? { x: a.x, y: a.y, w: zw, h: a.h } : { x: a.x + a.w - zw, y: a.y, w: zw, h: a.h };
    d.endZone = d.leftToRight ? { x: a.x + a.w - zw, y: a.y, w: zw, h: a.h } : { x: a.x, y: a.y, w: zw, h: a.h };
    // paredes igualmente espaçadas entre as zonas, na ordem em que serão atravessadas
    const x0 = a.x + zw, x1 = a.x + a.w - zw, gap = Math.min(a.h / d.doors * 0.62, 58);
    d.walls = [];
    for (let i = 0; i < d.rows; i++) {
      const k = d.leftToRight ? i : d.rows - 1 - i;
      const doors = [];
      for (let j = 0; j < d.doors; j++) {
        const cy = a.y + (j + 0.5) * a.h / d.doors;
        doors.push({ y0: cy - gap / 2, y1: cy + gap / 2, cy, red: false, flash: 0, flashOk: false });
      }
      d.walls[i] = { x: x0 + (k + 1) * (x1 - x0) / (d.rows + 1), safe: U.randInt(0, d.doors - 1), doors };
    }
    d.phase = 'preview';
    d.previewT = Math.max(2, d.rows * 0.5);
    d.timer = (d.rows + 1) * 5;
    const al = g.alive();
    al.forEach((p, i) => {
      p.x = d.startZone.x + zw / 2; p.y = a.y + (i + 0.5) * a.h / al.length;
      p.dir = d.leftToRight ? 0 : Math.PI; p.vx = p.vy = 0;
      p.data.arrived = false; p.data.passed = d.walls.map(() => false);
      // memória do bot: lembra cada porta segura com ~80 % de chance; senão chuta
      p.data.mem = d.walls.map((w) => (U.chance(this.BOT_RECALL) ? w.safe : U.randInt(0, d.doors - 1)));
    });
    g.message(`TRAVESSIA ${d.sub}: ${d.rows} × ${d.doors}`, 1.4, '#3fe0c5');
    g.sfx('select');
  },

  // A parede w bloqueia o círculo (x, y)? Só passa quem estiver inteiro dentro de uma porta.
  blocked(g, w, x, y, r) {
    if (Math.abs(x - w.x) >= this.WALL_T / 2 + r) return false;
    return !w.doors.some((dr) => y - r >= dr.y0 && y + r <= dr.y1);
  },

  addBatch(g, list, msg, sound = 'boom') {
    if (!list.length) return;
    g.data.batches.push(list.map((p) => p.id));
    for (const p of list) g.eliminate(p, { sound, msg });
  },

  update(g, dt) {
    const U = TN.util, d = g.data, a = g.arena;
    for (const w of d.walls) for (const dr of w.doors) dr.flash = Math.max(0, dr.flash - dt);
    if (d.phase === 'preview') {
      d.previewT -= dt;
      if (d.previewT <= 0) { d.phase = 'walk'; g.sfx('go'); }
      return;
    }
    if (d.phase !== 'walk') { for (const p of g.alive()) this.tickFuse(g, p, dt); return; }
    d.timer -= dt;
    if (d.timer <= 3 && d.timer > 0 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt)) g.sfx('tick');

    // move todos, separa os robôs e só então resolve as paredes (assim ninguém é empurrado através delas)
    const al0 = g.alive(), old = al0.map((p) => ({ x: p.x, y: p.y }));
    for (const p of al0) g.movePlayer(p, this.SPEED, dt);
    U.separate(al0);
    al0.forEach((p, n) => {
      const pd = p.data, ox = old[n].x, oy = old[n].y;
      // colisão com as paredes (desfaz o eixo que entrou na parede)
      for (const w of d.walls) {
        if (!this.blocked(g, w, p.x, p.y, p.r)) continue;
        if (!this.blocked(g, w, ox, p.y, p.r)) p.x = ox;
        else if (!this.blocked(g, w, p.x, oy, p.r)) p.y = oy;
        else { p.x = ox; p.y = oy; }
      }
      // passou de uma parede no sentido da saída? (pela posição, para nunca perder uma travessia)
      d.walls.forEach((w, i) => {
        if (pd.passed[i]) return;
        const crossed = d.leftToRight ? p.x >= w.x : p.x <= w.x;
        if (!crossed) return;
        pd.passed[i] = true;
        const k = w.doors.findIndex((dr) => p.y >= dr.y0 && p.y <= dr.y1);
        const dr = w.doors[Math.max(0, k)];
        if (k === w.safe) { dr.flash = 0.5; dr.flashOk = true; g.sfx('blip'); }
        else {
          dr.red = true; dr.flash = 0.5; dr.flashOk = false;
          pd.lives--;
          g.flash('#f33', 0.12); g.shake(5);
          g.particles(p.x, p.y, '#f55', 14, 200);
          if (pd.lives > 0) { g.sfx('hurt'); g.popup('−1 VIDA', p.x, p.y - 30, '#f55'); }
          else if (pd.fuse <= 0) { pd.fuse = this.FUSE; g.sfx('buzz'); g.popup('PAVIO!', p.x, p.y - 30, '#f55'); }
        }
      });
      if (!pd.arrived && U.inRect(p.x, p.y, d.endZone)) { pd.arrived = true; g.sfx('coin'); }
      this.tickFuse(g, p, dt);
    });
    // terminou a travessia: todos chegaram ou o tempo acabou
    const al = g.alive();
    if (d.timer <= 0 || (al.length && al.every((p) => p.data.arrived && p.data.fuse <= 0))) this.endSub(g);
  },

  tickFuse(g, p, dt) {
    const pd = p.data;
    if (pd.fuse <= 0) return;
    pd.fuse -= dt;
    if (pd.fuse <= 0) { pd.fuse = 0; this.addBatch(g, [p], 'BUM!'); g.particles(p.x, p.y, '#ffb02e', 40, 320); g.shake(12); }
  },

  endSub(g) {
    const d = g.data;
    d.phase = 'judge';
    const late = g.alive().filter((p) => !p.data.arrived);
    if (late.length) { g.sfx('buzz'); this.addBatch(g, late, 'TEMPO!'); }
    d.banner = late.length ? { text: 'O TEMPO ACABOU PARA ' + late.map((p) => p.label).join(', '), color: '#f55' } : { text: 'TRAVESSIA CONCLUÍDA', color: '#3fe0c5' };
    g.after(1.6, () => {
      d.banner = null;
      if (g.alive().length <= 1) return;            // o motor encerra a rodada
      if (d.sub >= this.MAX_SUBS) { d.banner = { text: 'FIM DO TESTE: SOBREVIVENTES APROVADOS', color: '#9f9' }; g.finish(1.5); return; }
      // o labirinto cresce: alterna +1 fileira / +1 porta
      if (d.sub % 2 === 1 && d.rows < this.MAX_ROWS) d.rows++;
      else if (d.doors < this.MAX_DOORS) d.doors++;
      else if (d.rows < this.MAX_ROWS) d.rows++;
      this.newSub(g);
    });
  },

  // Quem sai junto empata (pontos = nº de eliminados antes do grupo); sobrevivente = nº de jogadores.
  results(g, pts) {
    let before = 0;
    for (const p of g.players) pts[p.id] = p.alive ? g.playerCount : 0;
    for (const batch of g.data.batches) { for (const id of batch) pts[id] = before; before += batch.length; }
  },

  // Bot: vai de porta em porta seguindo a memória (evita portas já marcadas de vermelho).
  bot(g, p, dt) {
    const U = TN.util, d = g.data, pd = p.data;
    if (d.phase !== 'walk' || pd.arrived) return {};
    const sx = d.leftToRight ? 1 : -1;
    const i = pd.passed.findIndex((v) => !v);
    let tx, ty;
    if (i < 0) { tx = d.endZone.x + d.endZone.w / 2; ty = U.clamp(p.y, d.endZone.y + 30, d.endZone.y + d.endZone.h - 30); }
    else {
      const w = d.walls[i];
      let k = pd.mem[i];
      if (w.doors[k].red) {   // a escolhida explodiu alguém: chuta outra que não esteja marcada
        const ok = w.doors.map((dr, j) => j).filter((j) => !w.doors[j].red);
        k = pd.mem[i] = ok.length ? U.pick(ok) : k;
      }
      const dr = w.doors[k];
      ty = dr.cy;
      // primeiro alinha na frente da porta, depois atravessa
      const before = w.x - sx * 24;
      const aligned = Math.abs(p.y - ty) < (dr.y1 - dr.y0) / 2 - p.r - 1;
      tx = aligned && (p.x - before) * sx > -14 ? w.x + sx * 30 : before;
    }
    // preso (empurrado por outro robô contra a parede)? dá uma desviada
    const st = pd.bstuck || (pd.bstuck = { x: p.x, y: p.y, t: 0, jig: 0, jx: 0, jy: 0 });
    st.t = U.dist(p.x, p.y, st.x, st.y) < 0.5 ? st.t + dt : 0; st.x = p.x; st.y = p.y;
    if (st.t > 0.5) { st.t = 0; st.jig = 0.35; st.jx = -sx; st.jy = U.pick([-1, 1]); }
    if (st.jig > 0) { st.jig -= dt; return { x: st.jx, y: st.jy }; }
    const n = U.norm(tx - p.x, ty - p.y);
    return { x: n.x, y: n.y };
  },

  // ---------- desenho 3D ----------
  camera: { pos: [480, 560, 840], target: [480, 0, 272], fov: 41 },
  env: { bg: '#07090c', ambient: 0.55, sun: 1.8, sunDir: [-0.2, 1, 0.5] },

  draw3d(g, r) {
    const a = g.arena, d = g.data, preview = d.phase === 'preview', T = this.WALL_T, WH = 44;
    r.room(a.x - 90, a.y - 70, a.x + a.w + 90, a.y + a.h + 60);   // corredor de celas
    const tile = 41;
    for (let x = a.x; x < a.x + a.w; x += tile) for (let z = a.y; z < a.y + a.h; z += tile) {
      r.plane(x + tile / 2, 0, z + tile / 2, tile - 1.5, tile - 1.5, ((x - a.x) / tile + (z - a.y) / tile) % 2 ? '#2b3138' : '#272c33');
    }
    // zonas de início e saída (pisos que brilham)
    r.plane(d.startZone.x + d.startZone.w / 2, 0.6, d.startZone.y + d.startZone.h / 2, d.startZone.w, d.startZone.h, '#1a4f80', { glow: true, opacity: 0.55 });
    r.plane(d.endZone.x + d.endZone.w / 2, 0.6, d.endZone.y + d.endZone.h / 2, d.endZone.w, d.endZone.h, '#1d7a3c', { glow: true, opacity: 0.55 });
    // muro externo baixo
    r.box(a.x + a.w / 2, 0, a.y - 8, a.w + 16, 30, 16, '#3c444d');
    r.box(a.x - 8, 0, a.y + a.h / 2, 16, 30, a.h, '#3c444d');
    r.box(a.x + a.w + 8, 0, a.y + a.h / 2, 16, 30, a.h, '#3c444d');
    // paredes de cela (meia-parede pintada) com portas; cada porta tem o portão de grade aberto, correndo
    // por fora da parede para o lado que tiver mais parede livre (não cobre outra porta)
    let lights = 0;
    for (const w of d.walls) {
      let y = a.y;
      const seg = (z0, z1) => {
        if (z1 - z0 <= 0.5) return;
        r.box(w.x, 0, (z0 + z1) / 2, T, 18, z1 - z0, '#35574a', { tex: 'tinta' });
        r.box(w.x, 18, (z0 + z1) / 2, T, WH - 18, z1 - z0, '#a59c86', { tex: 'tinta' });
      };
      for (const dr of w.doors) { seg(y, dr.y0); y = dr.y1; }
      seg(y, a.y + a.h);
      w.doors.forEach((dr, j) => {
        const len = dr.y1 - dr.y0, antes = dr.y0 - (j ? w.doors[j - 1].y1 : a.y), depois = (j < w.doors.length - 1 ? w.doors[j + 1].y0 : a.y + a.h) - dr.y1;
        const gl = Math.min(len, Math.max(antes, depois) - 2);
        if (gl > 12) r.prop('grade', w.x + T / 2 + 3, depois >= antes ? dr.y1 + gl / 2 : dr.y0 - gl / 2, { w: gl, h: WH - 8, rotY: Math.PI / 2 });
        let col = null, segura = j === w.safe;
        if (preview) col = segura ? this.COR_SEGURA : this.COR_ERRADA;
        else if (dr.flash > 0) { col = dr.flashOk ? this.COR_SEGURA : this.COR_ERRADA; segura = dr.flashOk; }
        else if (dr.red) { col = this.COR_EXPLODIDA; segura = false; }
        r.box(w.x, WH - 6, dr.cy, T + 2, 6, dr.y1 - dr.y0, '#3a4048');                  // verga da porta
        // painel sobre a porta com ✓ ou ✗ (apagado quando não há nada a mostrar)
        r.box(w.x, WH + 14, dr.cy, T + 2, 26, 26, col || '#222', { glow: !!col && col !== this.COR_EXPLODIDA });
        if (col) r.label(w.x, WH + 14, dr.cy, segura ? '✓' : '✗', col === this.COR_EXPLODIDA ? '#999' : '#fff', 22);
        if (preview) r.plane(w.x, 0.5, dr.cy, T + 10, dr.y1 - dr.y0, col, { glow: true, opacity: 0.35 });   // chão da porta pintado
        if (col && dr.flash > 0 && lights < 6) { r.light(w.x, WH + 20, dr.cy, col, 0.8, 160); lights++; }
        if (dr.red && !preview) r.disc(w.x, 0.8, dr.cy, 16, '#000', { opacity: 0.5 });     // fuligem da explosão
      });
    }
    if (preview) r.light(480, 260, 290, '#ffffff', 0.6, 900);
    for (const p of g.players) r.character(p, { flash: p.alive && p.data.fuse > 0 && Math.sin(g.time * 30) > 0 });
  },

  drawOverlay(g, c) {
    if (!TN.R3.available || !g.uses3d()) return;
    const D = TN.draw, d = g.data, a = g.arena, U = TN.util;
    for (const p of g.alive()) {
      const pd = p.data, q = TN.R3.project(p.x, 0, p.y + 22);
      for (let k = 0; k < this.LIVES; k++) { c.fillStyle = k < pd.lives ? '#ff4d5e' : '#333'; c.beginPath(); c.arc(q.x - 5 + k * 10, q.y, 3.5, 0, Math.PI * 2); c.fill(); }
      if (pd.fuse > 0) D.text(c, pd.fuse.toFixed(1), q.x, q.y + 14, { size: 13, color: '#ffb02e', align: 'center' });
    }
    D.text(c, `TRAVESSIA ${d.sub}  ·  ${d.rows}×${d.doors}`, 16, 52, { size: 15, color: '#3fe0c5' });
    if (d.phase === 'preview') D.text(c, `MEMORIZE! ${d.previewT.toFixed(1)}`, g.W / 2, 56, { size: 24, color: '#ffd23f', align: 'center' });
    else D.text(c, U.formatTime(d.timer), g.W / 2, 56, { size: 26, color: d.timer < 5 && d.phase === 'walk' ? '#f55' : '#fff', align: 'center' });
    D.text(c, d.leftToRight ? 'SAÍDA →' : '← SAÍDA', g.W - 16, 52, { size: 15, color: '#46e27b', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, 250, 500, 48, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, 274, { size: 18, color: d.banner.color, align: 'center', maxWidth: 480 });
    }
  },

  // ---------- desenho 2D (alternativa) ----------
  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 41, a: '#1a1f24', b: '#1d2329' });
    // zonas de início e saída
    for (const [z, col, txt] of [[d.startZone, '#3fa9ff', 'INÍCIO'], [d.endZone, '#46e27b', 'SAÍDA']]) {
      c.globalAlpha = 0.14; c.fillStyle = col; c.fillRect(z.x, z.y, z.w, z.h); c.globalAlpha = 1;
      c.save(); c.translate(z.x + z.w / 2, z.y + z.h / 2); c.rotate(-Math.PI / 2);
      D.text(c, txt, 0, 0, { size: 26, color: col, align: 'center' });
      c.restore();
    }
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    // paredes com portas e lâmpadas
    const preview = d.phase === 'preview', T = this.WALL_T;
    for (const w of d.walls) {
      let y = a.y;
      c.fillStyle = '#5a636d';
      for (const dr of w.doors) { c.fillRect(w.x - T / 2, y, T, dr.y0 - y); y = dr.y1; }
      c.fillRect(w.x - T / 2, y, T, a.y + a.h - y);
      w.doors.forEach((dr, j) => {
        // estado da lâmpada: acesa no preview, marcada de vermelho se já explodiu, piscando ao atravessar
        let col = '#222', segura = j === w.safe;
        if (preview) col = segura ? this.COR_SEGURA : this.COR_ERRADA;
        else if (dr.flash > 0) { col = dr.flashOk ? this.COR_SEGURA : this.COR_ERRADA; segura = dr.flashOk; }
        else if (dr.red) { col = this.COR_EXPLODIDA; segura = false; }
        c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(w.x - T / 2, dr.y0, T, dr.y1 - dr.y0);
        if (col !== '#222') {   // porta pintada com o símbolo no meio
          c.globalAlpha = preview ? 0.35 : 0.2; c.fillStyle = col; c.fillRect(w.x - T / 2 - 4, dr.y0, T + 8, dr.y1 - dr.y0); c.globalAlpha = 1;
          TN.draw.text(c, segura ? '✓' : '✗', w.x, dr.cy, { size: 18, color: col === this.COR_EXPLODIDA ? '#999' : col, align: 'center' });
        }
        for (const ly of [dr.y0, dr.y1]) {
          c.fillStyle = '#333'; c.fillRect(w.x - T / 2 - 2, ly - 3, T + 4, 6);
          c.fillStyle = col; c.beginPath(); c.arc(w.x, ly, 4.5, 0, Math.PI * 2); c.fill();
          if (col !== '#222') { c.globalAlpha = 0.25; c.beginPath(); c.arc(w.x, ly, 11, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
        }
        if (dr.red && !preview) {   // fuligem da explosão
          c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(w.x, dr.cy, 12, 0, Math.PI * 2); c.fill();
        }
      });
    }
    // jogadores, vidas e pavio
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.alive()) {
      const pd = p.data, burning = pd.fuse > 0;
      g.drawPlayer(c, p, { flash: burning && Math.sin(g.time * 30) > 0 });
      for (let k = 0; k < this.LIVES; k++) {
        c.fillStyle = k < pd.lives ? '#ff4d5e' : '#333';
        c.beginPath(); c.arc(p.x - 5 + k * 10, p.y + p.r + 8, 3.5, 0, Math.PI * 2); c.fill();
      }
      if (burning) D.text(c, pd.fuse.toFixed(1), p.x, p.y + p.r + 22, { size: 13, color: '#ffb02e', align: 'center' });
      if (pd.arrived) D.text(c, '✓', p.x + p.r + 6, p.y - p.r, { size: 14, color: '#46e27b' });
    }
    // faixa de status
    D.text(c, `TRAVESSIA ${d.sub}  ·  ${d.rows}×${d.doors}`, a.x, 52, { size: 15, color: '#3fe0c5' });
    if (preview) D.text(c, `MEMORIZE! ${d.previewT.toFixed(1)}`, g.W / 2, 52, { size: 22, color: '#ffd23f', align: 'center' });
    else D.text(c, U.formatTime(d.timer), g.W / 2, 52, { size: 24, color: d.timer < 5 && d.phase === 'walk' ? '#f55' : '#fff', align: 'center' });
    D.text(c, d.leftToRight ? 'SAÍDA →' : '← SAÍDA', a.x + a.w, 52, { size: 15, color: '#46e27b', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 250, a.y + a.h / 2 - 24, 500, 48, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, a.y + a.h / 2, { size: 18, color: d.banner.color, align: 'center', maxWidth: 480 });
    }
  },
});
