// HORA DO TREM — inspirado em "TUNNEL HAZARD" (train_race) de Machine Party.
// Túnel visto de cima: trilhos no meio, nichos nas duas paredes. A cada ciclo a luz vermelha avisa,
// alguns nichos abrem (verdes) e o trem varre o túnel inteiro. Quem estiver no chão morre.
// A cada trem abre um nicho a menos. Nicho vermelho esmaga quem entra. AÇÃO empurra.
TN.registerMinigame({
  id: 'hora_do_trem',
  title: 'HORA DO TREM',
  inspiredBy: 'Tunnel Hazard (train_race)',
  tagline: 'O TREM ESTÁ CHEGANDO.',
  brief: ['Nicho verde é seguro. Nicho vermelho esmaga.', 'Quando a luz piscar, corra para um nicho verde.', 'Cada trem abre menos nichos. Empurre quem disputar o seu.'],
  controls: { move: 'andar', a: 'empurrar' },
  icon: '⇶',
  color: '#ff5a3c',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (original: espera 3 s, nichos abrem 1 s após o aviso, 2 s de pausa,
  //      abertos = max(vivos+2-ciclos, 1), empurrão 0,1 s de preparo, impulso 15 decaindo) ----
  SPEED: 180, SHOVE: 600, SHOVE_WIND: 0.1, SHOVE_LOCK: 0.5, SHOVE_RANGE: 60,
  WALL: 58, NOOK_W: 54, NOOK_D: 50,
  WAIT: 3, OPEN_AFTER: 1, TRAIN_ENTER: 3.4, TRAIN_V: 470, TRAIN_LEN: 560, CLOSE_TIME: 1.2,

  init(g) {
    const a = g.arena, d = g.data;
    d.floorTop = a.y + this.WALL; d.floorBot = a.y + a.h - this.WALL;
    d.nooks = [];
    const step = a.w / 6;
    for (let i = 0; i < 6; i++) {
      d.nooks.push({ side: -1, cx: a.x + step * (i + 0.5) - 18, w: this.NOOK_W, state: 'closed' });
      d.nooks.push({ side: 1, cx: a.x + step * (i + 0.5) + 18, w: this.NOOK_W, state: 'closed' });
    }
    d.phase = 'wait'; d.phaseT = 0; d.cycles = 0;
    d.train = null;        // { front } quando o trem está no túnel
    g.placeInCircle(a.x + a.w / 2, (d.floorTop + d.floorBot) / 2, 100);
    for (const p of g.players) Object.assign(p.data, { lock: 0, wind: 0, shoveT: 0, noise: 0, noiseT: 0 });
  },

  setPhase(g, ph) { g.data.phase = ph; g.data.phaseT = 0; },

  // em qual nicho (coluna) o jogador está, e se está fundo o bastante para o trem não pegar
  nookOf(g, p) {
    const d = g.data;
    for (const n of d.nooks) {
      if (Math.abs(p.x - n.cx) > n.w / 2) continue;
      if (n.side < 0 && p.y < d.floorTop + p.r - 2) return n;
      if (n.side > 0 && p.y > d.floorBot - p.r + 2) return n;
    }
    return null;
  },
  isSafeIn(g, p, n) {
    const d = g.data;
    return n.side < 0 ? p.y + p.r <= d.floorTop + 6 : p.y - p.r >= d.floorBot - 6;
  },

  update(g, dt) {
    const U = TN.util, a = g.arena, d = g.data;
    d.phaseT += dt;
    // ---------- ciclo do trem ----------
    if (d.phase === 'wait' && d.phaseT >= this.WAIT) {
      this.setPhase(g, 'warn'); g.sfx('buzz'); g.message('TREM CHEGANDO!', 1.3, '#f44');
    } else if (d.phase === 'warn') {
      if (d.phaseT >= this.OPEN_AFTER && !d.opened) {
        d.opened = true;
        const count = Math.max(g.alive().length + 2 - d.cycles, 1);
        for (const n of TN.util.shuffle(d.nooks.slice()).slice(0, count)) n.state = 'open';
        g.sfx('confirm');
      }
      if (d.phaseT >= this.TRAIN_ENTER - (a.x + 40 + 200) / this.TRAIN_V && !d.train) { d.train = { front: a.x - 200 }; g.sfx('whoosh'); }
      if (d.train) {
        d.train.front += this.TRAIN_V * dt;
        if (d.train.front - this.TRAIN_LEN > a.x + a.w + 20) {
          d.train = null; d.opened = false; d.cycles++;
          for (const n of d.nooks) if (n.state === 'open') n.state = 'closing';
          this.setPhase(g, 'closing'); g.sfx('tick');
        }
      }
    } else if (d.phase === 'closing' && d.phaseT >= this.CLOSE_TIME) {
      // nichos fecham: quem ainda estiver dentro é cuspido de volta para o trilho
      for (const p of g.alive()) {
        const n = this.nookOf(g, p);
        if (n && n.state === 'closing') { p.y = n.side < 0 ? d.floorTop + p.r + 2 : d.floorBot - p.r - 2; p.vx = 0; p.vy = -n.side * 320; g.sfx('hit'); }
      }
      for (const n of d.nooks) n.state = 'closed';
      this.setPhase(g, 'wait');
    }

    // ---------- jogadores ----------
    const bounds = { x: a.x, y: d.floorTop - this.NOOK_D, w: a.w, h: d.floorBot - d.floorTop + this.NOOK_D * 2 };
    for (const p of g.alive()) {
      const b = p.data;
      b.lock -= dt;
      const stunned = Math.hypot(p.vx, p.vy) > 40;
      if (stunned) { const save = p.input; p.input = { x: 0, y: 0 }; g.movePlayer(p, 0, dt, bounds); p.input = save; }
      else g.movePlayer(p, this.SPEED, dt, bounds);
      g.decayPush(p, dt, 6);
      // empurrão: 0,1 s de preparo e depois o impulso na direção em que está olhando
      if (p.input.aPressed && b.lock <= 0 && !stunned) { b.lock = this.SHOVE_LOCK; b.wind = this.SHOVE_WIND; }
      if (b.wind > 0) {
        b.wind -= dt;
        if (b.wind <= 0) this.shove(g, p);
      }
    }
    U.separate(g.alive());
    for (const p of g.alive()) this.resolveWalls(g, p, dt);

    // ---------- mortes ----------
    for (const p of g.alive()) {
      const n = this.nookOf(g, p);
      // entrar num nicho fechado = esmagado
      if (n && n.state === 'closed' && (n.side < 0 ? p.y < d.floorTop - 2 : p.y > d.floorBot + 2)) {
        g.eliminate(p, { sound: 'boom', msg: 'ESMAGADO!' });
        g.particles(p.x, p.y, '#a00', 26, 200); n.crush = 0.4;
        continue;
      }
      // o trem pega quem está no chão (ou mal escondido)
      const t = d.train;
      if (t && p.x + p.r > t.front - this.TRAIN_LEN && p.x - p.r < t.front) {
        const safe = n && n.state !== 'closed' && this.isSafeIn(g, p, n);
        if (!safe) {
          g.eliminate(p, { sound: 'boom', msg: 'ATROPELADO!' });
          for (let i = 0; i < 3; i++) g.particles(p.x + 20, p.y, i ? '#a00' : p.color, 14, 380);
        }
      }
    }
    for (const n of d.nooks) if (n.crush > 0) n.crush -= dt;
  },

  shove(g, p) {
    const fx = Math.cos(p.dir), fy = Math.sin(p.dir);
    g.sfx('whoosh');
    for (const o of g.alive()) {
      if (o === p) continue;
      const dx = o.x - p.x, dy = o.y - p.y, dist = Math.hypot(dx, dy);
      if (dist < this.SHOVE_RANGE && (dx * fx + dy * fy) / (dist || 1) > 0.2) {
        // empurrões não acumulam: a velocidade é substituída
        o.vx = (dx / dist) * this.SHOVE; o.vy = (dy / dist) * this.SHOVE;
        g.sfx('hit'); g.particles((o.x + p.x) / 2, (o.y + p.y) / 2, '#fff', 6, 140);
      }
    }
  },

  // Paredes: só dá para atravessar a linha da parede dentro da coluna de um nicho.
  resolveWalls(g, p, dt) {
    const d = g.data;
    for (const side of [-1, 1]) {
      const wallY = side < 0 ? d.floorTop : d.floorBot;
      const pen = side < 0 ? wallY + p.r - p.y : p.y - (wallY - p.r);
      // funil: empurrando contra a parede perto de um nicho, desliza para o centro dele
      const pushing = side < 0 ? p.input.y < -0.3 : p.input.y > 0.3;
      if (pen > -6 && pushing) {
        const n = d.nooks.find((k) => k.side === side && Math.abs(p.x - k.cx) < k.w / 2 + 12);
        if (n) p.x = TN.util.approach(p.x, n.cx, 140 * dt);
      }
      if (pen <= 0) continue;
      const half = this.NOOK_W / 2 - p.r;
      const n = d.nooks.find((k) => k.side === side && Math.abs(p.x - k.cx) < half + 5);
      if (!n) { p.y = side < 0 ? wallY + p.r : wallY - p.r; if (side * p.vy > 0) p.vy = 0; continue; }
      p.x = TN.util.clamp(p.x, n.cx - half, n.cx + half);
    }
  },

  // Bot: espera no meio; quando os nichos abrem, corre para o nicho livre mais próximo que
  // consegue alcançar antes do trem, empurra quem disputar, e sai depois que o trem passa.
  bot(g, p, dt) {
    const U = TN.util, a = g.arena, d = g.data, b = p.data;
    if (Math.hypot(p.vx, p.vy) > 40) return {};
    const midY = (d.floorTop + d.floorBot) / 2;
    const cur = this.nookOf(g, p);
    const t = d.train;
    const trainPassed = t && t.front - this.TRAIN_LEN > p.x + 30;
    const opened = d.nooks.some((n) => n.state === 'open');
    b.noiseT -= dt;
    if (b.noiseT <= 0) { b.noiseT = U.rand(0.5, 1.4); b.noise = { x: U.rand(-1, 1), y: U.rand(-0.6, 0.6) }; }
    // continua um empurrão já decidido (fica virado para o alvo durante o preparo)
    if (b.shoveT > 0) { b.shoveT -= dt; const n = U.norm(b.shoveDx, b.shoveDy); return { x: n.x, y: n.y, a: true }; }

    if (opened && !trainPassed) {
      // já está seguro num nicho aberto: só afunda
      if (cur && cur.state === 'open') {
        const deep = cur.side < 0 ? d.floorTop - this.NOOK_D : d.floorBot + this.NOOK_D;
        // alguém tentando entrar/disputar? empurra para fora
        const rival = g.alive().find((o) => o !== p && Math.abs(o.x - cur.cx) < 34 && Math.abs(o.y - p.y) < 50);
        if (rival && U.chance(0.06)) return this.startShove(b, rival.x - p.x, rival.y - p.y);
        return { x: (cur.cx - p.x) / 10, y: cur.side };
      }
      const n = this.pickNook(g, p);
      if (n) {
        const mouthY = n.side < 0 ? d.floorTop + p.r + 6 : d.floorBot - p.r - 6;
        const deepY = n.side < 0 ? d.floorTop - this.NOOK_D : d.floorBot + this.NOOK_D;
        // rival perto disputando o mesmo nicho: empurra
        const rival = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 52 && U.dist(o.x, o.y, n.cx, mouthY) < 90);
        if (rival && b.lock <= 0 && U.chance(0.12)) return this.startShove(b, rival.x - p.x, rival.y - p.y);
        const tx = n.cx, ty = Math.abs(p.x - n.cx) > 9 ? mouthY : deepY;
        const v = U.norm(tx - p.x, ty - p.y);
        return { x: v.x, y: v.y };
      }
      // sem nicho possível: fica longe do trem o máximo que puder (para a direita)
      return { x: 1, y: (midY - p.y) / 100 };
    }
    // fora de perigo: sai do nicho e espera perto do meio do túnel
    const tx = a.x + a.w / 2 + b.noise.x * 220, ty = midY + b.noise.y * 70;
    if (cur) return { x: 0, y: -cur.side };
    const v = U.norm(tx - p.x, ty - p.y), far = U.dist(p.x, p.y, tx, ty) > 25;
    let out = { x: far ? v.x : 0, y: far ? v.y : 0 };
    // de vez em quando empurra alguém que está do lado
    const near = g.alive().find((o) => o !== p && U.dist(o.x, o.y, p.x, p.y) < 48);
    if (near && d.phase === 'warn' && b.lock <= 0 && U.chance(0.03)) out = this.startShove(b, near.x - p.x, near.y - p.y);
    return out;
  },

  startShove(b, dx, dy) {
    b.shoveT = 0.12; b.shoveDx = dx; b.shoveDy = dy;
    const n = TN.util.norm(dx, dy);
    return { x: n.x, y: n.y, a: true };
  },

  // escolhe o nicho aberto mais promissor: perto, livre e alcançável antes do trem
  pickNook(g, p) {
    const U = TN.util, d = g.data;
    let best = null, bestScore = 1e9;
    for (const n of d.nooks) {
      if (n.state !== 'open') continue;
      const mouthY = n.side < 0 ? d.floorTop : d.floorBot;
      const dist = Math.abs(p.x - n.cx) + Math.abs(p.y - mouthY);
      const myT = dist / this.SPEED + 0.3;
      if (d.train) { const trainT = (n.cx - d.train.front) / this.TRAIN_V; if (trainT < myT) continue; }
      else { const trainT = this.TRAIN_ENTER - d.phaseT + (n.cx - g.arena.x) / this.TRAIN_V; if (trainT < myT) continue; }
      let score = dist;
      for (const o of g.alive()) {
        if (o === p) continue;
        const on = this.nookOf(g, o);
        if (on === n) score += 1000;                                  // ocupado
        else if (Math.abs(o.x - n.cx) + Math.abs(o.y - mouthY) < dist - 15) score += 220;  // alguém chega antes
      }
      if (p.data.goal === n) score -= 40;                             // mantém a decisão
      if (score < bestScore) { bestScore = score; best = n; }
    }
    p.data.goal = best;
    return best;
  },

  draw(g, c) {
    const a = g.arena, d = g.data, D = TN.draw, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    const ft = d.floorTop, fb = d.floorBot;
    // paredes de tijolo
    for (const [y0, h] of [[a.y, this.WALL], [fb, this.WALL]]) {
      c.fillStyle = '#3a3330'; c.fillRect(a.x, y0, a.w, h);
      c.strokeStyle = '#2a2422'; c.lineWidth = 2;
      for (let row = 0; row * 14 < h; row++) {
        c.beginPath(); c.moveTo(a.x, y0 + row * 14); c.lineTo(a.x + a.w, y0 + row * 14); c.stroke();
        for (let x = a.x + (row % 2) * 20; x < a.x + a.w; x += 40) { c.beginPath(); c.moveTo(x, y0 + row * 14); c.lineTo(x, y0 + Math.min(h, row * 14 + 14)); c.stroke(); }
      }
    }
    // chão de cascalho + dois trilhos
    c.fillStyle = '#25282c'; c.fillRect(a.x, ft, a.w, fb - ft);
    const tracks = [ft + (fb - ft) * 0.27, ft + (fb - ft) * 0.73];
    for (const ty of tracks) {
      c.fillStyle = '#4a3a2c';
      for (let x = a.x + 6; x < a.x + a.w; x += 26) c.fillRect(x, ty - 34, 12, 68);
      c.fillStyle = '#9aa3ab'; c.fillRect(a.x, ty - 24, a.w, 5); c.fillRect(a.x, ty + 19, a.w, 5);
    }
    // faixas de segurança na beira das paredes
    c.fillStyle = 'rgba(245,196,0,0.5)'; c.fillRect(a.x, ft, a.w, 3); c.fillRect(a.x, fb - 3, a.w, 3);
    // aviso: lâmpadas vermelhas nas paredes piscando
    const warning = d.phase === 'warn' && !d.train || (d.train && d.train.front < a.x + 40);
    if (d.phase === 'warn') {
      const on = Math.sin(g.time * 14) > 0;
      for (let x = a.x + 20; x < a.x + a.w; x += 110) {
        for (const y of [a.y + 8, a.y + a.h - 8]) {
          c.fillStyle = on ? '#ff2a2a' : '#4a0d0d'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
          if (on) { c.fillStyle = 'rgba(255,40,40,0.18)'; c.beginPath(); c.arc(x, y, 16, 0, Math.PI * 2); c.fill(); }
        }
      }
      if (warning) {
        // farol do trem se aproximando pela esquerda
        const k = U.clamp(d.phaseT / this.TRAIN_ENTER, 0, 1);
        const gr = c.createLinearGradient(a.x, 0, a.x + 260 * k + 40, 0);
        gr.addColorStop(0, `rgba(255,240,160,${0.45 * k})`); gr.addColorStop(1, 'rgba(255,240,160,0)');
        c.fillStyle = gr; c.fillRect(a.x, ft, 300, fb - ft);
        if (on) D.text(c, '▶▶ TREM', a.x + 14, (ft + fb) / 2, { size: 26, color: '#ff4040' });
      }
    }
    // nichos
    for (const n of d.nooks) this.drawNook(g, c, n);
    // jogadores mortos (embaixo do trem), vivos
    for (const p of g.players) if (!p.alive) g.drawPlayer(c, p);
    for (const p of g.alive()) g.drawPlayer(c, p, { flash: Math.hypot(p.vx, p.vy) > 40 || p.data.wind > 0 });
    // trem (dois vagões lado a lado ocupando o túnel)
    if (d.train) this.drawTrain(g, c, d.train.front);
    // contagem de nichos abertos
    const open = d.nooks.filter((n) => n.state === 'open').length;
    if (d.phase === 'wait') D.text(c, `PRÓXIMO TREM: ${Math.max(0, this.WAIT - d.phaseT).toFixed(1)} s`, g.W / 2, a.y + a.h + 26, { size: 16, color: '#aaa', align: 'center' });
    else if (open) D.text(c, `NICHOS ABERTOS: ${open}`, g.W / 2, a.y + a.h + 26, { size: 16, color: '#4f4', align: 'center' });
  },

  drawNook(g, c, n) {
    const d = g.data, w = n.w, D = TN.draw;
    const x = n.cx - w / 2, y = n.side < 0 ? d.floorTop - this.NOOK_D : d.floorBot;
    const blink = n.state === 'closing' && Math.sin(g.time * 18) > 0;
    const col = n.state === 'open' ? '#2fdc5a' : n.state === 'closing' ? (blink ? '#ffd23f' : '#6a5a10') : '#d0302a';
    c.fillStyle = '#121416'; c.fillRect(x, y, w, this.NOOK_D);
    c.fillStyle = n.state === 'open' ? 'rgba(47,220,90,0.22)' : n.state === 'closed' ? 'rgba(208,48,42,0.18)' : 'rgba(255,210,63,0.15)';
    c.fillRect(x, y, w, this.NOOK_D);
    if (n.state === 'closed') {
      // prensa: dentes no fundo do nicho
      const back = n.side < 0 ? y : y + this.NOOK_D;
      c.fillStyle = n.crush > 0 ? '#fff' : '#777';
      for (let k = 0; k < 5; k++) {
        const tx = x + 3 + k * (w - 6) / 5;
        c.beginPath(); c.moveTo(tx, back); c.lineTo(tx + (w - 6) / 10, back - n.side * 12); c.lineTo(tx + (w - 6) / 5, back); c.fill();
      }
    }
    c.strokeStyle = col; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, w - 3, this.NOOK_D - 3);
    // lâmpada no batente
    const ly = n.side < 0 ? y - 0 + 6 : y + this.NOOK_D - 6;
    c.fillStyle = col; c.beginPath(); c.arc(n.cx, ly, 4, 0, Math.PI * 2); c.fill();
  },

  drawTrain(g, c, front) {
    const a = g.arena, d = g.data, L = this.TRAIN_LEN;
    c.save();
    c.beginPath(); c.rect(a.x, d.floorTop - 4, a.w, d.floorBot - d.floorTop + 8); c.clip();
    const half = (d.floorBot - d.floorTop) / 2;
    for (let k = 0; k < 2; k++) {
      const y = d.floorTop + k * half + 3, h = half - 6;
      c.fillStyle = '#5a6470'; c.strokeStyle = '#1a1d20'; c.lineWidth = 3;
      c.beginPath(); c.roundRect(front - L, y, L, h, 10); c.fill(); c.stroke();
      c.fillStyle = '#c9a227'; c.beginPath(); c.roundRect(front - 70, y + 4, 66, h - 8, 12); c.fill();   // cabine
      c.fillStyle = '#1d2a33'; c.fillRect(front - 28, y + 14, 14, h - 28);                           // para-brisa
      c.fillStyle = '#434c55';
      for (let x = front - L + 20; x < front - 90; x += 70) { c.fillRect(x, y + 14, 48, h - 28); }   // vagões
      c.strokeStyle = '#1a1d20'; c.lineWidth = 2;
      for (let x = front - L + 140; x < front - 80; x += 140) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + h); c.stroke(); }
      // farol
      const gr = c.createLinearGradient(front, 0, front + 120, 0);
      gr.addColorStop(0, 'rgba(255,245,180,0.55)'); gr.addColorStop(1, 'rgba(255,245,180,0)');
      c.fillStyle = gr; c.fillRect(front, y + 6, 120, h - 12);
    }
    c.restore();
  },
});
