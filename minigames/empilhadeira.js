// EMPILHADEIRA — inspirado em "FORKLIFT CERTIFIED" (forklift_certified) de Machine Party.
// Galpão visto de cima: cada um tem uma zona de entrega no canto. Leve caixas para a sua zona
// (do meio ou dos rivais). Quando o turno acaba, quem tem 0 caixas ou menos que o líder é eliminado.
// Tudo acontece dentro da MESMA rodada: vários turnos, cada um 1 s mais curto, até sobrar um.
TN.registerMinigame({
  id: 'empilhadeira',
  title: 'EMPILHADEIRA',
  inspiredBy: 'Forklift Certified (forklift_certified)',
  tagline: 'AS CHANCES ESTÃO EMPILHADAS.',
  brief: ['Leve caixas para a sua zona: do meio ou dos outros.', 'Caixa no garfo não conta.', 'No fim do turno, quem tiver menos que o líder sai.'],
  controls: { move: '↑↓ pedal / ←→ volante', a: 'subir/baixar o garfo' },
  icon: '▤',
  color: '#ffb02e',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (originais: pedal 5/s, volante 5/s e volta 2/s, vel. máx 5; 30 s no 1º turno, −1 s, mín. 10) ----
  MAX_SPEED: 215, REVERSE: 0.6, PEDAL_RATE: 5, STEER_RATE: 5, STEER_BACK: 3, TURN: 3.4,
  FORK: 34, CRATE_R: 14, GRAB: 24, FIRST_TIME: 30, MIN_TIME: 10, MAX_SUBS: 9,
  HIT_MIN: 40, HIT_STRONG: 150, ZONE_W: 170, ZONE_H: 130,

  init(g) {
    const a = g.arena, d = g.data, U = TN.util;
    // zonas nos 4 cantos (índice = id do jogador)
    const zw = this.ZONE_W, zh = this.ZONE_H;
    const corners = [
      { x: a.x, y: a.y }, { x: a.x + a.w - zw, y: a.y },
      { x: a.x, y: a.y + a.h - zh }, { x: a.x + a.w - zw, y: a.y + a.h - zh },
    ];
    d.zones = g.players.map((p) => ({ ...corners[p.id], w: zw, h: zh, owner: p, active: true, count: 0 }));
    // caixas: 2 × jogadores, no meio do galpão
    d.crates = [];
    const n = g.players.length * 2, cols = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      d.crates.push({
        x: a.x + a.w / 2 + (col - (cols - 1) / 2) * 46 + U.rand(-4, 4),
        y: a.y + a.h / 2 + (row - 0.5) * 50 + U.rand(-4, 4),
        r: this.CRATE_R, vx: 0, vy: 0, rot: U.rand(-0.3, 0.3), carrier: null, fade: 0,
      });
    }
    // empilhadeiras começam dentro da própria zona, viradas para o centro
    for (const p of g.players) {
      const z = d.zones.find((zz) => zz.owner === p);
      p.x = z.x + z.w / 2; p.y = z.y + z.h / 2; p.r = 18;
      p.dir = U.angle(p.x, p.y, a.x + a.w / 2, a.y + a.h / 2);
      Object.assign(p.data, { pedal: 0, steer: 0, speed: 0, crate: null, lock: 0, hitCool: 0 });
    }
    d.sub = 1;                 // turno atual
    d.subTime = this.FIRST_TIME;
    d.timer = d.subTime;
    d.phase = 'play';          // play → judge → pause → play ...
    d.batches = [];            // grupos de eliminados juntos (empatam)
    d.banner = null;
  },

  // ---------- auxiliares ----------
  forkPoint(p) { return { x: p.x + Math.cos(p.dir) * this.FORK, y: p.y + Math.sin(p.dir) * this.FORK }; },
  zoneOf(g, crate) { return g.data.zones.find((z) => TN.util.inRect(crate.x, crate.y, z)) || null; },
  countZones(g) {
    for (const z of g.data.zones) z.count = 0;
    for (const cr of g.data.crates) {
      if (cr.carrier || cr.fade > 0) continue;
      const z = this.zoneOf(g, cr);
      if (z) z.count++;
    }
  },
  dropCrate(p, vx = 0, vy = 0) {
    const cr = p.data.crate;
    if (!cr) return;
    cr.carrier = null; cr.vx = vx; cr.vy = vy;
    p.data.crate = null;
  },
  eliminateBatch(g, list, msg) {
    if (!list.length) return;
    g.data.batches.push(list.map((p) => p.id));
    for (const p of list) {
      this.dropCrate(p);
      g.eliminate(p, { sound: 'boom', msg });
      const z = g.data.zones.find((zz) => zz.owner === p);
      if (z) z.active = false;
    }
  },

  update(g, dt) {
    const U = TN.util, d = g.data, a = g.arena;
    const playing = d.phase === 'play';
    if (playing) {
      d.timer -= dt;
      if (d.timer <= 3 && Math.ceil(d.timer) !== Math.ceil(d.timer + dt) && d.timer > 0) g.sfx('tick');
      if (d.timer <= 0) this.endSub(g);
    }

    // ---- empilhadeiras ----
    for (const p of g.alive()) {
      const pd = p.data;
      pd.lock -= dt; pd.hitCool -= dt;
      const inp = playing ? p.input : { x: 0, y: 0 };
      // pedal: integra até o alvo e volta a 0 sozinho
      const want = -inp.y;
      pd.pedal = U.approach(pd.pedal, want, this.PEDAL_RATE * dt);
      pd.steer = U.approach(pd.steer, inp.x, (Math.abs(inp.x) > 0.1 ? this.STEER_RATE : this.STEER_BACK) * dt);
      pd.speed = pd.pedal * this.MAX_SPEED * (pd.pedal < 0 ? this.REVERSE : 1);
      // giro proporcional à velocidade (na ré o volante inverte naturalmente)
      p.dir += pd.steer * this.TURN * (pd.speed / this.MAX_SPEED) * dt;
      p.x += (Math.cos(p.dir) * pd.speed + p.vx) * dt;
      p.y += (Math.sin(p.dir) * pd.speed + p.vy) * dt;
      g.decayPush(p, dt, 4);
      // paredes
      const cx = U.clamp(p.x, a.x + p.r, a.x + a.w - p.r), cy = U.clamp(p.y, a.y + p.r, a.y + a.h - p.r);
      if (cx !== p.x || cy !== p.y) { pd.pedal *= 0.85; p.x = cx; p.y = cy; }
      // garfo: pega ou solta
      if (playing && p.input.aPressed && pd.lock <= 0) {
        pd.lock = 0.25;
        if (pd.crate) { this.dropCrate(p); g.sfx('step'); }
        else {
          const f = this.forkPoint(p);
          let best = null, bd = this.GRAB;
          for (const cr of d.crates) {
            if (cr.carrier || cr.fade > 0) continue;
            const dd = U.dist(f.x, f.y, cr.x, cr.y);
            if (dd < bd) { bd = dd; best = cr; }
          }
          if (best) { best.carrier = p; pd.crate = best; g.sfx('pickup'); }
          else g.sfx('blip');
        }
      }
    }

    // ---- batidas: transferem velocidade; batida forte derruba a caixa da vítima ----
    const al = g.alive();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const p = al[i], q = al[j];
      const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy);
      if (dist >= p.r + q.r || dist === 0) continue;
      const nx = dx / dist, ny = dy / dist;
      if (p.data.hitCool <= 0 && q.data.hitCool <= 0) {
        const vp = (Math.cos(p.dir) * p.data.speed + p.vx) * nx + (Math.sin(p.dir) * p.data.speed + p.vy) * ny;   // p indo em direção a q
        const vq = -((Math.cos(q.dir) * q.data.speed + q.vx) * nx + (Math.sin(q.dir) * q.data.speed + q.vy) * ny); // q indo em direção a p
        if (vp + vq > this.HIT_MIN) {
          for (const [atk, vic, v, sx] of [[p, q, vp, 1], [q, p, vq, -1]]) {
            if (v <= 0) continue;
            g.push(vic, nx * sx * v * 1.1, ny * sx * v * 1.1);
            atk.data.pedal *= 0.35;
            if (v > this.HIT_STRONG && vic.data.crate) {
              this.dropCrate(vic, nx * sx * v * 0.9 + U.rand(-60, 60), ny * sx * v * 0.9 + U.rand(-60, 60));
              g.popup('DERRUBOU!', vic.x, vic.y - 30, '#ffb02e');
            }
          }
          p.data.hitCool = q.data.hitCool = 0.35;
          g.sfx('hit'); g.shake(4); g.particles((p.x + q.x) / 2, (p.y + q.y) / 2, '#ffd27a', 10, 180);
        }
      }
    }
    U.separate(al);

    // ---- caixas ----
    for (const cr of d.crates) {
      if (cr.fade > 0) continue;
      if (cr.carrier) {
        const f = this.forkPoint(cr.carrier);
        cr.x = f.x; cr.y = f.y; cr.rot = cr.carrier.dir; cr.vx = cr.vy = 0;
        continue;
      }
      cr.x += cr.vx * dt; cr.y += cr.vy * dt;
      const k = Math.max(0, 1 - 5 * dt); cr.vx *= k; cr.vy *= k;
      // corpo das empilhadeiras (e caixas carregadas) empurram caixas soltas
      for (const p of al) {
        for (const ob of [{ x: p.x, y: p.y, r: p.r }, p.data.crate]) {
          if (!ob) continue;
          const dx = cr.x - ob.x, dy = cr.y - ob.y, dist = Math.hypot(dx, dy), md = ob.r + cr.r;
          if (dist > 0 && dist < md) { cr.x += (dx / dist) * (md - dist); cr.y += (dy / dist) * (md - dist); }
        }
      }
      cr.x = U.clamp(cr.x, a.x + cr.r, a.x + a.w - cr.r);
      cr.y = U.clamp(cr.y, a.y + cr.r, a.y + a.h - cr.r);
    }
    const loose = d.crates.filter((cr) => !cr.carrier && cr.fade <= 0);
    U.separate(loose);
    // caixas removidas pelo ímã somem aos poucos
    for (const cr of d.crates) if (cr.fade > 0) { cr.fade -= dt; cr.y -= 60 * dt; }
    d.crates = d.crates.filter((cr) => !(cr.removed && cr.fade <= 0));
    this.countZones(g);
  },

  // Fim do turno: solta tudo, conta, elimina, ímã tira caixas e começa o próximo turno.
  endSub(g) {
    const d = g.data, U = TN.util;
    d.phase = 'judge';
    d.timer = 0;
    g.sfx('buzz'); g.flash('#ffb02e', 0.2);
    for (const p of g.alive()) this.dropCrate(p);
    d.banner = { text: 'FIM DO TURNO!', color: '#ffb02e' };
    g.after(1.2, () => {
      this.countZones(g);
      const zoneOf = (p) => d.zones.find((z) => z.owner === p);
      const zeros = g.alive().filter((p) => zoneOf(p).count === 0);
      this.eliminateBatch(g, zeros, 'SEM CAIXAS!');
      g.after(0.9, () => {
        const al = g.alive();
        if (al.length > 1) {
          const max = Math.max(...al.map((p) => zoneOf(p).count));
          const low = al.filter((p) => zoneOf(p).count < max);
          this.eliminateBatch(g, low, 'INEFICIENTE!');
          if (!low.length && !zeros.length) d.banner = { text: 'EMPATE NO TOPO: TODOS SEGUEM', color: '#9f9' };
        }
        if (g.alive().length <= 1) { d.banner = null; return; } // o motor encerra a rodada
        // limite de segurança: depois de muitos turnos os empatados no topo sobrevivem juntos
        if (d.sub >= this.MAX_SUBS) { d.banner = { text: 'EXPEDIENTE ENCERRADO', color: '#9f9' }; g.finish(1.5); return; }
        // ímã remove 1–2 caixas (nunca a última)
        const live = d.crates.filter((cr) => !cr.removed);
        let rem = g.alive().length < live.length ? 2 : 1;
        if (live.length < 5) rem = 1;
        rem = Math.min(rem, live.length - 1);
        U.shuffle(live).slice(0, rem).forEach((cr) => { cr.removed = true; cr.fade = 0.9; });
        if (rem > 0) { g.sfx('whoosh'); d.banner = { text: `O ÍMÃ LEVOU ${rem} CAIXA${rem > 1 ? 'S' : ''}`, color: '#7cf' }; }
        g.after(1.6, () => {
          d.sub++;
          d.subTime = Math.max(this.MIN_TIME, this.FIRST_TIME - (d.sub - 1));
          d.timer = d.subTime;
          d.phase = 'play'; d.banner = null;
          g.message(`TURNO ${d.sub}`, 1.0, '#ffb02e'); g.sfx('go');
        });
      });
    });
  },

  // Resultado: quem sai junto empata (pontos = nº de eliminados antes do grupo); sobrevivente = nº de jogadores.
  results(g, pts) {
    let before = 0;
    for (const p of g.players) pts[p.id] = p.alive ? g.playerCount : 0;
    for (const batch of g.data.batches) {
      for (const id of batch) pts[id] = before;
      before += batch.length;
    }
  },

  // ---------- bot: busca a caixa mais próxima fora da sua zona, leva para casa e solta ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (d.phase !== 'play') return { x: 0, y: 0 };
    b.bt = b.bt || { reverse: 0, stuck: 0, lastX: p.x, lastY: p.y, ram: null, ramT: 0, think: 0 };
    const s = b.bt;
    const zone = d.zones.find((z) => z.owner === p);
    let a = false;
    // dá ré por um tempo (depois de soltar a caixa ou quando ficou preso)
    if (s.reverse > 0) { s.reverse -= dt; return { x: s.revSteer, y: 1 }; }
    // detecção de "preso"
    const moved = U.dist(p.x, p.y, s.lastX, s.lastY);
    s.lastX = p.x; s.lastY = p.y;
    s.stuck = moved < 0.6 ? s.stuck + dt : 0;
    if (s.stuck > 0.7) { s.stuck = 0; s.reverse = U.rand(0.4, 0.8); s.revSteer = U.pick([-1, 1]); return { x: s.revSteer, y: 1 }; }

    let tx, ty, careful = false;
    if (b.crate) {
      // leva para o fundo da zona (perto do canto, para não roubarem fácil)
      tx = zone.x + zone.w / 2; ty = zone.y + zone.h / 2;
      const f = this.forkPoint(p);
      const inner = { x: zone.x + 16, y: zone.y + 16, w: zone.w - 32, h: zone.h - 32 };
      if (U.inRect(f.x, f.y, inner) && b.lock <= 0) { a = true; s.reverse = 0.6; s.revSteer = U.pick([-1, 0, 1]); }
    } else {
      // às vezes persegue quem está carregando para derrubar a caixa
      s.think -= dt;
      if (s.think <= 0) {
        s.think = U.rand(1.2, 2.2);
        const carriers = g.alive().filter((o) => o !== p && o.data.crate && U.dist(o.x, o.y, p.x, p.y) < 260);
        s.ram = carriers.length && U.chance(0.3) ? U.pick(carriers) : null;
        s.ramT = 1.8;
      }
      if (s.ram && (!s.ram.alive || !s.ram.data.crate || (s.ramT -= dt) <= 0)) s.ram = null;
      if (s.ram) { tx = s.ram.x; ty = s.ram.y; }
      else {
        let best = null, bd = 1e9;
        for (const cr of d.crates) {
          if (cr.carrier || cr.fade > 0) continue;
          const z = this.zoneOf(g, cr);
          if (z === zone) continue;
          const dd = U.dist(p.x, p.y, cr.x, cr.y) + (z && z.active ? 60 : 0);
          if (dd < bd) { bd = dd; best = cr; }
        }
        if (!best) { tx = zone.x + zone.w / 2; ty = zone.y + zone.h / 2; careful = true; }
        else {
          tx = best.x; ty = best.y;
          const f = this.forkPoint(p);
          if (U.dist(f.x, f.y, best.x, best.y) < this.GRAB - 4 && b.lock <= 0) a = true;
        }
      }
    }
    const dist = U.dist(p.x, p.y, tx, ty);
    let diff = Math.atan2(ty - p.y, tx - p.x) - p.dir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // alvo atrás e perto: manobra de ré (volante invertido)
    if (Math.abs(diff) > 2.1 && dist < 110) return { x: -Math.sign(diff), y: 1, a };
    const steer = U.clamp(diff * 2.5, -1, 1);
    let pedal = Math.abs(diff) > 1.2 ? 0.55 : 1;
    if (!s.ram && dist < 70) pedal = Math.min(pedal, 0.5);
    if (careful && dist < 30) pedal = 0;
    return { x: steer, y: -pedal, a };
  },

  // ---------- desenho ----------
  drawCrate(c, cr) {
    const s = cr.r;
    c.save(); c.translate(cr.x, cr.y); c.rotate(cr.rot);
    c.globalAlpha = cr.fade > 0 ? Math.max(0, cr.fade / 0.9) : 1;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-s + 3, -s + 4, s * 2, s * 2);
    c.fillStyle = '#b07a3c'; c.fillRect(-s, -s, s * 2, s * 2);
    c.strokeStyle = '#6b4520'; c.lineWidth = 2; c.strokeRect(-s + 1, -s + 1, s * 2 - 2, s * 2 - 2);
    c.beginPath(); c.moveTo(-s + 2, -s + 2); c.lineTo(s - 2, s - 2); c.moveTo(s - 2, -s + 2); c.lineTo(-s + 2, s - 2); c.stroke();
    c.fillStyle = '#d39a55'; c.fillRect(-s + 3, -2, s * 2 - 6, 4);
    c.restore();
    c.globalAlpha = 1;
  },
  drawForklift(c, p) {
    const dead = !p.alive, col = dead ? '#555' : p.color;
    c.save(); c.translate(p.x, p.y); c.rotate(p.dir);
    if (dead) c.globalAlpha = 0.5;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-19, -13, 40, 30);
    // rodas
    c.fillStyle = '#111';
    for (const [wx, wy] of [[-14, -15], [-14, 11], [8, -15], [8, 11]]) c.fillRect(wx, wy, 9, 4);
    // garfo
    c.fillStyle = '#9aa3ad';
    c.fillRect(18, -9, 17, 4); c.fillRect(18, 5, 17, 4);
    c.fillStyle = '#333'; c.fillRect(14, -12, 5, 24);
    // corpo + contrapeso + cabine
    c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 2;
    c.beginPath(); c.roundRect(-20, -12, 34, 24, 4); c.fill(); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-20, -12, 8, 24);
    c.fillStyle = '#1a1d22'; c.fillRect(-8, -8, 14, 16);
    c.fillStyle = dead ? '#444' : '#7ff'; c.fillRect(2, -6, 3, 12);
    c.restore();
    c.globalAlpha = 1;
    TN.draw.text(c, p.label, p.x, p.y - 30, { size: 12, color: dead ? '#888' : p.color, align: 'center' });
  },

  draw(g, c) {
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    c.fillStyle = '#0b0d10'; c.fillRect(0, 0, g.W, g.H);
    D.floor(c, a.x, a.y, a.w, a.h, { tile: 55, a: '#2a2c2f', b: '#2e3134' });
    // faixas de corredor
    c.strokeStyle = 'rgba(245,196,0,0.25)'; c.lineWidth = 3; c.setLineDash([16, 12]);
    c.beginPath(); c.moveTo(a.x + this.ZONE_W + 20, a.y + a.h / 2); c.lineTo(a.x + a.w - this.ZONE_W - 20, a.y + a.h / 2); c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#555'; c.lineWidth = 6; c.strokeRect(a.x - 3, a.y - 3, a.w + 6, a.h + 6);
    // zonas
    for (const z of d.zones) {
      const col = z.active ? z.owner.color : '#666';
      c.globalAlpha = z.active ? 0.16 : 0.08; c.fillStyle = col; c.fillRect(z.x, z.y, z.w, z.h);
      c.globalAlpha = 1;
      c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([10, 6]); c.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4); c.setLineDash([]);
    }
    // caixas soltas, empilhadeiras, caixas carregadas por cima
    for (const cr of d.crates) if (!cr.carrier) this.drawCrate(c, cr);
    for (const p of g.players) if (!p.alive) this.drawForklift(c, p);
    for (const p of g.alive()) this.drawForklift(c, p);
    for (const cr of d.crates) if (cr.carrier) this.drawCrate(c, cr);
    // placar de cada zona (por cima de tudo para não sumir atrás dos veículos)
    for (const z of d.zones) {
      const col = z.active ? z.owner.color : '#666';
      const top = z.y < a.y + a.h / 2;
      const ly = top ? z.y + z.h + 14 : z.y - 14;
      D.text(c, z.active ? `${z.owner.label}  ${z.count}` : `${z.owner.label} ✖`, z.x + z.w / 2, ly, { size: 18, color: col, align: 'center' });
    }
    // faixa de status abaixo do HUD: turno + tempo
    const t = d.phase === 'play' ? d.timer : 0;
    D.text(c, `TURNO ${d.sub}`, a.x, 52, { size: 16, color: '#ffb02e' });
    D.text(c, U.formatTime(t), g.W / 2, 52, { size: 24, color: t < 5 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, `CAIXAS: ${d.crates.filter((cr) => !cr.removed).length}`, a.x + a.w, 52, { size: 14, color: '#aaa', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 220, a.y + a.h / 2 - 26, 440, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, a.y + a.h / 2, { size: 22, color: d.banner.color, align: 'center' });
    }
  },
});
