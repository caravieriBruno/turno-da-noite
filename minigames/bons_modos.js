// BONS MODOS — inspirado em "TABLE MANNERS" (green_pea) de Machine Party.
// Jantar visto de lado. O Anfitrião lê o jornal no meio da mesa. AÇÃO espeta uma ervilha no
// garfo, EXTRA come o que estiver no garfo. Se o Anfitrião baixar o jornal e pegar alguém
// mexendo (mesmo sem efeito), atira. Coma todas as ervilhas sem ser visto.
TN.registerMinigame({
  id: 'bons_modos',
  title: 'BONS MODOS',
  inspiredBy: 'Table Manners (green_pea)',
  tagline: 'O JANTAR ESTÁ SERVIDO.',
  brief: ['Seja um bom convidado.', 'Não coma na frente do Anfitrião.', 'Termine o seu prato.'],
  controls: { a: 'espetar ervilha', b: 'comer o garfo' },
  icon: '●',
  color: '#7bd84a',
  rounds: 2,
  scoring: 'points',          // +1 metade, +1 terminar, +1 primeiro a terminar
  endWhenOneLeft: false,
  timeLimit: 90,              // segurança: quem não terminou fica com o que já ganhou

  // ---- constantes (original: 100 ervilhas, máx. 15 no garfo, comer 0,23 s + 0,67 s travado,
  //      lê 3–6 s, 20% de finta, 0,4 s de reação, olha 1–4 s). Aqui 60 ervilhas e 9 no garfo. ----
  GOAL: 60, FORK_MAX: 9, EAT_ANIM: 0.23, EAT_LOCK: 0.67, STAB_ANIM: 0.1,
  READ_MIN: 3, READ_MAX: 6, FAKE_CHANCE: 0.2, LOWER: 0.35, GRACE: 0.4, WATCH_MIN: 1, WATCH_MAX: 4, RAISE: 0.35,
  AIM: 0.4, SHOT_FREEZE: 1.4,
  SEATS: [130, 290, 670, 830], TABLE_Y: 384,

  init(g) {
    const U = TN.util, d = g.data;
    d.host = { state: 'read', t: 0, dur: U.rand(this.READ_MIN, this.READ_MAX), k: 0, shake: 0 };
    d.shot = null; d.queue = []; d.firstDone = false; d.flashT = 0;
    g.players.forEach((p, i) => {
      p.x = this.SEATS[i]; p.y = this.TABLE_Y; p.dir = p.x < g.W / 2 ? 0 : Math.PI;
      Object.assign(p.data, { eaten: 0, fork: 0, stabT: 0, eatT: 0, lock: 0, done: false, half: false,
        botT: U.rand(0.3, 0.8), botPress: null, forkTarget: U.randInt(4, 9), stopAt: -1, resumeAt: 0, lastHost: 'read' });
    });
  },

  // muda o estado do Anfitrião
  setHost(g, state, dur) { const h = g.data.host; h.state = state; h.t = 0; h.dur = dur; },

  shoot(g, p) {
    const d = g.data;
    if (d.queue.includes(p.id) || (d.shot && d.shot.id === p.id)) return;
    d.queue.push(p.id);
  },

  update(g, dt) {
    const U = TN.util, d = g.data, h = d.host;
    d.flashT -= dt;
    // ---------- sequência de tiro: congela todo mundo ----------
    if (!d.shot && d.queue.length) { d.shot = { id: d.queue.shift(), t: 0, fired: false }; g.sfx('cough'); }
    if (d.shot) {
      const s = d.shot, p = g.players[s.id];
      s.t += dt;
      if (!s.fired && s.t >= this.AIM) {
        s.fired = true; d.flashT = 0.12;
        g.eliminate(p, { sound: 'shoot', particles: false, msg: 'MAL-EDUCADO!' });
        g.particles(p.x, p.y - 50, '#a00', 26, 220); g.flash('#fff', 0.1);
      }
      if (s.t >= this.SHOT_FREEZE) d.shot = null;
      this.checkEnd(g);
      return;
    }
    // ---------- Anfitrião ----------
    h.t += dt;
    if (h.state === 'read' && h.t >= h.dur) {
      if (U.chance(this.FAKE_CHANCE)) { this.setHost(g, 'fake', 0.6); g.sfx('step'); }
      else { this.setHost(g, 'lower', this.LOWER); g.sfx('whoosh'); }
    } else if (h.state === 'fake' && h.t >= h.dur) this.setHost(g, 'read', U.rand(1.5, 3.5));
    else if (h.state === 'lower' && h.t >= h.dur) this.setHost(g, 'grace', this.GRACE);
    else if (h.state === 'grace' && h.t >= h.dur) { this.setHost(g, 'watch', U.rand(this.WATCH_MIN, this.WATCH_MAX)); g.sfx('tick'); }
    else if (h.state === 'watch' && h.t >= h.dur) this.setHost(g, 'raise', this.RAISE);
    else if (h.state === 'raise' && h.t >= h.dur) this.setHost(g, 'read', U.rand(this.READ_MIN, this.READ_MAX));
    // posição do jornal (0 = cobrindo o rosto, 1 = abaixado)
    const tk = h.state === 'lower' ? h.t / this.LOWER : h.state === 'raise' ? 1 - h.t / this.RAISE
      : (h.state === 'grace' || h.state === 'watch') ? 1 : h.state === 'fake' ? Math.sin((h.t / 0.6) * Math.PI) * 0.22 : 0;
    h.k = U.clamp(tk, 0, 1);

    // ---------- convidados ----------
    for (const p of g.alive()) {
      const b = p.data;
      b.stabT -= dt; b.lock -= dt;
      if (b.eatT > 0) {
        b.eatT -= dt;
        if (b.eatT <= 0) this.swallow(g, p);
      }
      if (b.done) continue;
      const acted = p.input.aPressed || p.input.bPressed;
      if (!acted) continue;
      // qualquer gesto com o Anfitrião olhando = tiro (mesmo sem efeito)
      if (h.state === 'watch') { this.shoot(g, p); continue; }
      if (b.lock > 0 || b.eatT > 0) continue;
      if (p.input.aPressed && b.fork < this.FORK_MAX && b.eaten + b.fork < this.GOAL) { b.fork++; b.stabT = this.STAB_ANIM; g.sfx('blip'); }
      else if (p.input.bPressed && b.fork > 0) { b.eatT = this.EAT_ANIM; b.lock = this.EAT_ANIM + this.EAT_LOCK; g.sfx('pickup'); }
    }
    this.checkEnd(g);
  },

  // engole o que está no garfo e confere metade / fim do prato
  swallow(g, p) {
    const b = p.data, d = g.data;
    b.eaten = Math.min(this.GOAL, b.eaten + b.fork); b.fork = 0;
    if (!b.half && b.eaten >= this.GOAL / 2) { b.half = true; g.addScore(p, 1); }
    if (!b.done && b.eaten >= this.GOAL) {
      b.done = true; g.sfx('win');
      g.after(0.3, () => g.addScore(p, 1));
      if (!d.firstDone) { d.firstDone = true; g.after(0.6, () => g.addScore(p, 1)); g.message(`${p.label} LIMPOU O PRATO!`, 1.5, p.color); }
    }
  },

  checkEnd(g) {
    if (g.players.every((p) => !p.alive || p.data.done)) g.finish(1.8);
  },

  // Bot: espeta/come num ritmo aleatório enquanto o jornal está levantado; para quando o
  // jornal se mexe (com tempo de reação — às vezes tarde demais) e volta depois que ele sobe.
  bot(g, p, dt) {
    const U = TN.util, d = g.data, h = d.host, b = p.data;
    if (b.done || d.shot) return {};
    // reage às mudanças do Anfitrião
    if (h.state !== b.lastHost) {
      if (b.lastHost === 'read' && h.state !== 'read') b.stopAt = g.time + (U.chance(0.07) ? U.rand(0.8, 1.3) : U.rand(0.05, 0.3));
      if (h.state === 'read') { b.stopAt = -1; b.resumeAt = g.time + U.rand(0.2, 0.6); }
      b.lastHost = h.state;
    }
    const calm = h.state === 'read' ? g.time >= b.resumeAt : (b.stopAt > 0 && g.time < b.stopAt);
    if (!calm) return {};
    // um aperto dura um quadro; depois solta e espera o próximo
    if (b.botPress) { b.botPress = null; return {}; }
    b.botT -= dt;
    if (b.botT > 0 || b.lock > 0) return {};
    b.botT = U.rand(0.1, 0.26);
    const full = b.fork >= b.forkTarget || b.eaten + b.fork >= this.GOAL;
    if (full) { b.forkTarget = U.randInt(4, this.FORK_MAX); b.botPress = 'b'; return { b: true }; }
    b.botPress = 'a';
    return { a: true };
  },

  draw(g, c) {
    const d = g.data, D = TN.draw, h = d.host, TY = this.TABLE_Y;
    // sala de jantar
    c.fillStyle = '#2a1c22'; c.fillRect(0, 0, g.W, g.H);
    for (let x = 0; x < g.W; x += 48) { c.fillStyle = (x / 48) % 2 ? '#2f2027' : '#33232b'; c.fillRect(x, 34, 24, TY - 34); }
    c.fillStyle = '#1d1318'; c.fillRect(0, TY - 120, g.W, 8);   // rodameio
    // quadro e lustre
    c.fillStyle = '#5a4630'; c.fillRect(g.W / 2 - 300, 70, 120, 84); c.fillStyle = '#1e2a33'; c.fillRect(g.W / 2 - 292, 78, 104, 68);
    c.fillStyle = '#5a4630'; c.fillRect(g.W / 2 + 180, 70, 120, 84); c.fillStyle = '#332a1e'; c.fillRect(g.W / 2 + 188, 78, 104, 68);
    c.strokeStyle = '#a08850'; c.lineWidth = 2; c.beginPath(); c.moveTo(g.W / 2, 34); c.lineTo(g.W / 2, 64); c.stroke();
    c.fillStyle = '#c9a74a'; c.beginPath(); c.ellipse(g.W / 2, 70, 40, 9, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,230,150,0.08)'; c.beginPath(); c.moveTo(g.W / 2 - 40, 72); c.lineTo(g.W / 2 + 40, 72); c.lineTo(g.W / 2 + 260, TY); c.lineTo(g.W / 2 - 260, TY); c.fill();

    this.drawHost(g, c);
    // convidados (atrás da mesa)
    for (const p of g.players) this.drawGuest(g, c, p);
    // mesa: tampo e toalha
    c.fillStyle = '#6b4a2e'; c.fillRect(30, TY, g.W - 60, 26);
    c.fillStyle = '#e9e4d8'; c.fillRect(30, TY + 26, g.W - 60, g.H - TY - 26);
    c.fillStyle = '#d6d0c2'; for (let x = 30; x < g.W - 30; x += 40) c.fillRect(x, TY + 26, 20, g.H - TY - 26);
    // pratos, garfos e placar de ervilhas
    for (const p of g.players) this.drawPlate(g, c, p);
    if (d.flashT > 0 && d.shot) {
      const tgt = g.players[d.shot.id];
      c.strokeStyle = '#fff6a0'; c.lineWidth = 3; c.beginPath(); c.moveTo(g.W / 2 + (tgt.x < g.W / 2 ? -70 : 70), 260); c.lineTo(tgt.x, tgt.y - 55); c.stroke();
    }
    // aviso sutil do estado
    if (h.state === 'watch') D.text(c, 'ELE ESTÁ OLHANDO', g.W / 2, 50, { size: 14, color: '#f55', align: 'center' });
  },

  drawHost(g, c) {
    const d = g.data, h = d.host, x = g.W / 2, TY = this.TABLE_Y;
    const watching = h.state === 'watch' || (d.shot && true);
    // corpo de terno
    c.fillStyle = '#16181c'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - 70, TY - 150, 140, 160, 24); c.fill(); c.stroke();
    c.fillStyle = '#eee'; c.beginPath(); c.moveTo(x - 16, TY - 150); c.lineTo(x + 16, TY - 150); c.lineTo(x, TY - 110); c.fill();
    c.fillStyle = '#a01818'; c.beginPath(); c.moveTo(x - 8, TY - 146); c.lineTo(x + 8, TY - 146); c.lineTo(x, TY - 120); c.fill();
    // cabeça
    c.fillStyle = '#8a8f99'; c.beginPath(); c.roundRect(x - 44, TY - 232, 88, 78, 16); c.fill(); c.stroke();
    c.fillStyle = '#111'; c.fillRect(x - 46, TY - 246, 92, 18); c.fillRect(x - 30, TY - 290, 60, 48);   // cartola
    c.fillStyle = '#a01818'; c.fillRect(x - 30, TY - 256, 60, 8);
    // olhos (vermelhos quando está vigiando)
    c.fillStyle = watching ? '#ff2a2a' : '#7ff';
    c.fillRect(x - 28, TY - 205, 18, 10); c.fillRect(x + 10, TY - 205, 18, 10);
    if (watching) { c.fillStyle = 'rgba(255,40,40,0.25)'; c.beginPath(); c.arc(x - 19, TY - 200, 16, 0, Math.PI * 2); c.arc(x + 19, TY - 200, 16, 0, Math.PI * 2); c.fill(); }
    // revólver apontando no tiro
    if (d.shot) {
      const tgt = g.players[d.shot.id];
      const side = tgt.x < x ? -1 : 1;
      const ang = Math.atan2(tgt.y - 55 - (TY - 120), tgt.x - (x + side * 60));
      c.save(); c.translate(x + side * 60, TY - 120); c.rotate(ang);
      c.fillStyle = '#16181c'; c.fillRect(-10, -8, 40, 16);
      c.fillStyle = '#555'; c.fillRect(28, -6, 26, 9); c.fillRect(28, 2, 10, 12);
      if (d.flashT > 0) { c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(60, -2, 14, 0, Math.PI * 2); c.fill(); }
      c.restore();
    }
    // jornal: sobe/desce conforme h.k (com tremida na finta)
    const k = d.shot ? 1 : h.k;
    const shake = h.state === 'fake' ? Math.sin(g.time * 60) * 3 : 0;
    const py = TY - 270 + k * 170 + shake;
    c.fillStyle = '#e8e2cf'; c.strokeStyle = '#555'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x - 110, py); c.lineTo(x + 110, py); c.lineTo(x + 104, py + 130); c.lineTo(x - 104, py + 130); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#999'; c.beginPath(); c.moveTo(x, py); c.lineTo(x, py + 130); c.stroke();
    TN.draw.text(c, 'DIÁRIO DA', x - 54, py + 18, { size: 11, color: '#222', align: 'center', shadow: false });
    TN.draw.text(c, 'NOITE', x - 54, py + 34, { size: 16, color: '#222', align: 'center', shadow: false });
    c.fillStyle = '#bbb';
    for (let i = 0; i < 6; i++) { c.fillRect(x - 96, py + 50 + i * 12, 82, 4); c.fillRect(x + 12, py + 14 + i * 16, 84, 5); }
    c.fillStyle = '#888'; c.fillRect(x - 96, py + 50 + 6 * 12, 40, 4);
    // mãos segurando o jornal
    c.fillStyle = '#8a8f99'; c.beginPath(); c.arc(x - 108, py + 60, 10, 0, Math.PI * 2); c.arc(x + 108, py + 60, 10, 0, Math.PI * 2); c.fill();
  },

  drawGuest(g, c, p) {
    const b = p.data, TY = this.TABLE_Y, facing = p.x < g.W / 2 ? 1 : -1;
    if (!p.alive) {
      // caído de cara no prato
      c.save(); c.translate(p.x, TY + 4); c.rotate(facing * 1.1);
      TN.draw.robotSide(c, 0, 0, 52, 74, p.color, { facing, dead: true });
      c.restore();
      TN.draw.text(c, p.label, p.x, TY - 70, { size: 12, color: '#888', align: 'center' });
      return;
    }
    const bob = b.eatT > 0 ? -4 : 0;
    TN.draw.robotSide(c, p.x, TY + 6 + bob, 52, 80, p.color, { facing, label: p.label });
    if (b.done) TN.draw.text(c, 'SATISFEITO', p.x, TY - 112, { size: 11, color: '#7bd84a', align: 'center' });
  },

  drawPlate(g, c, p) {
    const b = p.data, TY = this.TABLE_Y, D = TN.draw, facing = p.x < g.W / 2 ? 1 : -1;
    const px = p.x + facing * 26;
    // prato com as ervilhas que sobraram
    c.fillStyle = '#f4f4f4'; c.strokeStyle = '#999'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(px, TY + 8, 40, 10, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    const left = this.GOAL - b.eaten - b.fork;
    const n = Math.ceil((left / this.GOAL) * 26);
    c.fillStyle = '#5cbf2a';
    for (let i = 0; i < n; i++) {
      const ax = ((i * 37) % 54) - 27, ay = ((i * 13) % 9) - 4;   // espalhadas de forma fixa
      c.beginPath(); c.arc(px + ax, TY + 6 + ay * 0.8, 3.2, 0, Math.PI * 2); c.fill();
    }
    // garfo: desce ao espetar, sobe até a boca ao comer
    if (p.alive && !b.done) {
      let fx = p.x + facing * 30, fy = TY - 16;
      if (b.stabT > 0) fy += 18;
      if (b.eatT > 0) { fx = p.x + facing * 18; fy = TY - 50; }
      c.strokeStyle = '#ccc'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(p.x + facing * 10, TY - 24); c.lineTo(fx, fy); c.lineTo(fx, fy + 22); c.stroke();
      c.lineWidth = 1.5;
      for (const o of [-3, 0, 3]) { c.beginPath(); c.moveTo(fx + o, fy + 22); c.lineTo(fx + o, fy + 30); c.stroke(); }
      c.fillStyle = '#5cbf2a';
      for (let i = 0; i < b.fork; i++) { c.beginPath(); c.arc(fx + ((i % 2) ? 3 : -3), fy + 20 - i * 4.2, 3, 0, Math.PI * 2); c.fill(); }
    }
    // placar de ervilhas na toalha
    const done = b.eaten / this.GOAL;
    D.text(c, `${b.eaten}/${this.GOAL}`, p.x, TY + 58, { size: 16, color: p.alive ? '#333' : '#999', align: 'center', shadow: false });
    D.bar(c, p.x - 50, TY + 74, 100, 10, done, p.alive ? p.color : '#777', '#bbb');
    c.fillStyle = '#333'; c.fillRect(p.x - 1, TY + 72, 2, 14);   // marca da metade
    D.text(c, `garfo ${b.fork}`, p.x, TY + 100, { size: 12, color: '#666', align: 'center', shadow: false });
  },
});
