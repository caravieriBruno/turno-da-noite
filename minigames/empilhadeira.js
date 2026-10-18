// EMPILHADEIRA — inspirado em "FORKLIFT CERTIFIED" (forklift_certified) de Machine Party.
// Galpão visto de cima: cada um tem uma zona de entrega no canto. Leve caixas para a sua zona
// (do meio ou dos rivais): encostar o garfo pega, entrar na própria zona solta. Quando o turno
// acaba, só quem tem MENOS caixas é eliminado (empate geral: ninguém).
// Tudo acontece dentro da MESMA rodada: vários turnos, cada um 1 s mais curto, até sobrar um.
TN.registerMinigame({
  id: 'empilhadeira',
  title: 'EMPILHADEIRA',
  inspiredBy: 'Forklift Certified (forklift_certified)',
  tagline: 'AS CHANCES ESTÃO EMPILHADAS.',
  brief: ['Encoste o garfo numa caixa para pegar; entre na sua zona para soltar.', 'Caixa no garfo não conta.', 'No fim do turno, quem tiver menos caixas sai.'],
  controls: { move: '↑↓ pedal / ←→ volante', a: 'soltar a caixa aqui' },
  icon: '▤',
  color: '#ffb02e',
  rounds: 3,
  scoring: 'survival',

  // ---- constantes (originais: pedal 5/s, volante 5/s e volta 2/s, vel. máx 5; 30 s no 1º turno, −1 s, mín. 10).
  //      Aqui pedal e volante respondem mais rápido (8/s), a empilhadeira gira parada (GIRO_MIN da
  //      curva máxima) e o garfo pega num raio maior (GRAB). ----
  MAX_SPEED: 215, REVERSE: 0.6, PEDAL_RATE: 8, STEER_RATE: 8, STEER_BACK: 3, TURN: 3.4, GIRO_MIN: 0.35,
  FORK: 34, CRATE_R: 14, GRAB: 34, PEGA_CD: 0.6, FIRST_TIME: 30, MIN_TIME: 10, MAX_SUBS: 9,
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
      Object.assign(p.data, { pedal: 0, steer: 0, speed: 0, crate: null, lock: 0, hitCool: 0, pegaCd: 0 });
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
    const f = this.forkPoint(p);   // cai de onde o garfo está agora (a caixa só acompanha o garfo no fim do quadro)
    cr.x = f.x; cr.y = f.y;
    cr.carrier = null; cr.vx = vx; cr.vy = vy;
    p.data.crate = null;
  },
  // o garfo pega sozinho a caixa livre mais perto da ponta (a menos de GRAB), menos as que já estão na própria zona
  pegarAuto(g, p) {
    const U = TN.util, pd = p.data;
    if (pd.crate || pd.pegaCd > 0) return;
    const f = this.forkPoint(p), own = g.data.zones.find((z) => z.owner === p);
    let best = null, bd = this.GRAB;
    for (const cr of g.data.crates) {
      if (cr.carrier || cr.fade > 0) continue;
      if (this.zoneOf(g, cr) === own) continue;
      const dd = U.dist(f.x, f.y, cr.x, cr.y);
      if (dd < bd) { bd = dd; best = cr; }
    }
    if (best) { best.carrier = p; pd.crate = best; g.sfx('pickup'); }
  },
  // com a ponta do garfo dentro da própria zona (margem 16), a caixa cai sozinha; PEGA_CD sem pegar de novo
  soltarAuto(g, p) {
    const U = TN.util, pd = p.data;
    if (!pd.crate) return;
    const z = g.data.zones.find((zz) => zz.owner === p), f = this.forkPoint(p);
    if (!U.inRect(f.x, f.y, { x: z.x + 16, y: z.y + 16, w: z.w - 32, h: z.h - 32 })) return;
    this.dropCrate(p); pd.pegaCd = this.PEGA_CD; g.sfx('step');
  },
  // os vivos com a menor contagem de caixas; vazio quando todos empatam
  piores(g) {
    this.countZones(g);
    const al = g.alive(), conta = (p) => g.data.zones.find((z) => z.owner === p).count;
    const min = Math.min(...al.map(conta)), max = Math.max(...al.map(conta));
    if (min === max) return [];
    return al.filter((p) => conta(p) === min);
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
      pd.lock -= dt; pd.hitCool -= dt; pd.pegaCd -= dt;
      const inp = playing ? p.input : { x: 0, y: 0 };
      // pedal: integra até o alvo e volta a 0 sozinho
      const want = -inp.y;
      pd.pedal = U.approach(pd.pedal, want, this.PEDAL_RATE * dt);
      pd.steer = U.approach(pd.steer, inp.x, (Math.abs(inp.x) > 0.1 ? this.STEER_RATE : this.STEER_BACK) * dt);
      pd.speed = pd.pedal * this.MAX_SPEED * (pd.pedal < 0 ? this.REVERSE : 1);
      // giro proporcional à velocidade, mas nunca abaixo de GIRO_MIN: parada ela ainda gira (na ré o volante inverte)
      const k = Math.max(this.GIRO_MIN, Math.abs(pd.speed) / this.MAX_SPEED) * (pd.speed < 0 ? -1 : 1);
      p.dir += pd.steer * this.TURN * k * dt;
      p.x += (Math.cos(p.dir) * pd.speed + p.vx) * dt;
      p.y += (Math.sin(p.dir) * pd.speed + p.vy) * dt;
      g.decayPush(p, dt, 4);
      // paredes
      const cx = U.clamp(p.x, a.x + p.r, a.x + a.w - p.r), cy = U.clamp(p.y, a.y + p.r, a.y + a.h - p.r);
      if (cx !== p.x || cy !== p.y) { pd.pedal *= 0.85; p.x = cx; p.y = cy; }
      // garfo: pega e solta sozinho; AÇÃO só larga a caixa onde estiver
      if (playing) {
        if (p.input.aPressed && pd.crate && pd.lock <= 0) { pd.lock = 0.25; this.dropCrate(p); pd.pegaCd = this.PEGA_CD; g.sfx('step'); }
        else { this.soltarAuto(g, p); this.pegarAuto(g, p); }
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
              vic.data.pegaCd = this.PEGA_CD;   // senão o garfo pegava a caixa de volta no quadro seguinte
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
      // só quem tem MENOS caixas sai (zeros inclusos); empate geral não elimina ninguém
      const piores = this.piores(g);
      this.eliminateBatch(g, piores, 'FICOU PRA TRÁS!');
      if (!piores.length) d.banner = { text: 'EMPATE: TODOS SEGUEM', color: '#9f9' };
      g.after(0.9, () => {
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

  // ---------- bot: busca a caixa mais próxima fora da sua zona e leva para casa (o garfo pega e solta sozinho) ----------
  bot(g, p, dt) {
    const U = TN.util, d = g.data, b = p.data;
    if (d.phase !== 'play') return { x: 0, y: 0 };
    b.bt = b.bt || { reverse: 0, stuck: 0, lastX: p.x, lastY: p.y, ram: null, ramT: 0, think: 0, hadCrate: false };
    const s = b.bt;
    const zone = d.zones.find((z) => z.owner === p);
    const inner = { x: zone.x + 16, y: zone.y + 16, w: zone.w - 32, h: zone.h - 32 };
    // a caixa caiu sozinha na zona: dá ré para sair de cima dela
    if (s.hadCrate && !b.crate && s.reverse <= 0) { const f = this.forkPoint(p); if (U.inRect(f.x, f.y, inner)) { s.reverse = 0.6; s.revSteer = U.pick([-1, 0, 1]); } }
    s.hadCrate = !!b.crate;
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
        else { tx = best.x; ty = best.y; }
      }
    }
    const dist = U.dist(p.x, p.y, tx, ty);
    let diff = Math.atan2(ty - p.y, tx - p.x) - p.dir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // alvo atrás e perto: manobra de ré (volante invertido)
    if (Math.abs(diff) > 2.1 && dist < 110) return { x: -Math.sign(diff), y: 1 };
    const steer = U.clamp(diff * 2.5, -1, 1);
    let pedal = Math.abs(diff) > 1.2 ? 0.55 : 1;
    if (!s.ram && dist < 70) pedal = Math.min(pedal, 0.5);
    if (careful && dist < 30) pedal = 0;
    return { x: steer, y: -pedal };
  },

  // ---------- 3D (câmera fixa) ----------
  camera: { pos: [480, 600, 950], target: [480, 0, 282], fov: 39 },
  env: { ambient: 0.55, sun: 1.9, sunDir: [-0.35, 1, 0.5] },

  // cilindro deitado centrado em x,z, eixo apontando para o ângulo `ang` da lógica (rodas, tubos)
  hcyl(r, x, y, z, len, rad, ang, color, o = {}) {
    const dx = Math.cos(ang), dz = Math.sin(ang);
    r.cyl(x - dx * len / 2, y, z - dz * len / 2, rad, len, color, { ...o, rotZ: Math.PI / 2, rotY: Math.PI - ang });
  },

  crate3d(r, x, y, z, rot, op = 1) {
    const s = this.CRATE_R * 2, o = op < 1 ? { opacity: op } : {};
    r.box(x, y, z, s, s, s, '#a8743a', { rotY: -rot, rough: 0.85, ...o });
    r.box(x, y + s * 0.42, z, s + 1.5, 5, s + 1.5, '#d39a55', { rotY: -rot, ...o });
    r.box(x, y, z, s + 1, 3, s + 1, '#6b4520', { rotY: -rot, ...o });
  },

  // empilhadeira low-poly: chassi na cor do jogador, contrapeso, mastro, garfos, rodas e santantônio
  forklift3d(r, p) {
    const dead = !p.alive, col = dead ? '#3a3a3a' : p.color, c = Math.cos(p.dir), sn = Math.sin(p.dir);
    const L = (f, s) => [p.x + c * f - sn * s, p.y + sn * f + c * s];
    const rot = -p.dir;
    let q = L(-4, 0);
    r.box(q[0], 5, q[1], 36, 11, 26, col, { rotY: rot, metal: 0.35, rough: 0.5 });
    q = L(-19, 0); r.box(q[0], 5, q[1], 8, 19, 26, '#24272b', { rotY: rot, metal: 0.5 });
    q = L(-7, 0); r.box(q[0], 16, q[1], 10, 5, 14, '#16181b', { rotY: rot });                  // banco
    for (const [f, s] of [[-12, 14], [-12, -14], [9, 14], [9, -14]]) {
      q = L(f, s); this.hcyl(r, q[0], 6, q[1], 6, 6, p.dir + Math.PI / 2, '#111', { rough: 0.9 });
    }
    // arco de proteção atrás do banco (só atrás, para não esconder o motorista) + painel
    const rb = [L(-15, 12), L(-15, -12)];
    for (const [x, z] of rb) r.beam(x, 16, z, x, 58, z, 2.6, '#1d2024', { metal: 0.6 });
    r.beam(rb[0][0], 58, rb[0][1], rb[1][0], 58, rb[1][1], 3, col, { metal: 0.4 });
    q = L(7, 0); r.box(q[0], 16, q[1], 6, 8, 20, '#1d2024', { rotY: rot });
    // mastro + garfos (sobem quando há caixa)
    const forkY = p.data.crate ? 9 : 2;
    for (const s of [-9, 9]) { q = L(16, s); r.beam(q[0], 3, q[1], q[0], 52, q[1], 3.5, '#2d3136', { metal: 0.7 }); }
    q = L(17, 0); r.box(q[0], forkY, q[1], 3, 14, 22, '#3a3f45', { rotY: rot, metal: 0.6 });
    for (const s of [-6, 6]) {
      const a0 = L(17, s), a1 = L(36, s);
      r.beam(a0[0], forkY + 1, a0[1], a1[0], forkY + 1, a1[1], 2.5, '#9aa3ad', { metal: 0.85, rough: 0.3 });
    }
    // giroflex
    q = L(-14, 0);
    r.sphere(q[0], 66, q[1], 3.2, dead ? '#331010' : '#ffb02e', { glow: true });
    // motorista sentado (ou caído ao lado se a empilhadeira foi eliminada)
    if (!dead) {
      q = L(-8, 0);
      r.character({ x: q[0], y: q[1], dir: p.dir, alive: true, color: p.color, label: p.label, r: 16 }, { pose: 'drive', y: 1, key: 'drv' + p.id });
    } else {
      q = L(-6, 34);
      r.character({ x: q[0], y: q[1], dir: p.dir + 0.6, alive: false, color: p.color, label: p.label, r: 16 }, { pose: 'dead', key: 'drv' + p.id });
    }
  },

  draw3d(g, r) {
    const a = g.arena, d = g.data;
    // almoxarifado da oficina em volta
    const zp = a.y - 60;   // parede do fundo
    r.room(a.x - 90, zp, a.x + a.w + 90, a.y + a.h + 60, { estilo: 'oficina', props: false });
    const TX = a.w / 8, TZ = a.h / 4;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      r.plane(a.x + TX * (i + 0.5), 0, a.y + TZ * (j + 0.5), TX - 2, TZ - 2, (i + j) % 2 ? '#30333a' : '#2b2e33', { rough: 0.95 });
    }
    // muretas (fundo, laterais e frente) e prateleiras com caixas encostadas na parede do almoxarifado
    r.box(480, 0, a.y - 12, a.w + 60, 40, 20, '#454c54', { metal: 0.3 });
    r.box(a.x - 12, 0, a.y + a.h / 2, 20, 40, a.h + 4, '#454c54', { metal: 0.3 });
    r.box(a.x + a.w + 12, 0, a.y + a.h / 2, 20, 40, a.h + 4, '#454c54', { metal: 0.3 });
    r.box(480, 0, a.y + a.h + 10, a.w + 44, 16, 16, '#454c54', { metal: 0.3 });
    for (let i = 0; i < 9; i++) r.box(a.x + 6 + i * (a.w - 12) / 8, 0, a.y - 1, 26, 4, 2, i % 2 ? '#111' : '#f5c400', { shadow: false });
    for (const lx of [a.x + 60, a.x + 300, a.x + a.w - 300, a.x + a.w - 60]) {
      const zs = zp + 18;
      for (const sx of [-68, 68]) r.box(lx + sx, 0, zs, 4, 104, 28, '#3d3b37', { metal: 0.5 });   // montantes
      r.box(lx, 0, zs, 140, 4, 30, '#5a3d1e', { tex: 'madeira' });
      r.box(lx, 70, zs, 140, 4, 30, '#5a3d1e', { tex: 'madeira' });
      for (const k of [-45, 0, 45]) { r.box(lx + k, 4, zs - 2, 30, 30, 24, '#8a5f30'); if (k) r.box(lx + k * 0.6, 74, zs - 2, 28, 26, 24, '#7a542b'); }
    }
    // corredor central tracejado
    for (let x = a.x + this.ZONE_W + 30; x < a.x + a.w - this.ZONE_W - 20; x += 46) r.plane(x + 11, 0.4, a.y + a.h / 2, 24, 4, '#f5c400', { glow: true, opacity: 0.4 });
    // luzes
    r.light(a.x + 220, 240, a.y + 110, '#ffd9a8', 0.8, 640);
    r.light(a.x + a.w - 220, 240, a.y + 110, '#ffd9a8', 0.8, 640);
    r.light(a.x + 220, 240, a.y + a.h - 90, '#ffd9a8', 0.7, 640);
    r.light(a.x + a.w - 220, 240, a.y + a.h - 90, '#ffd9a8', 0.7, 640);
    // zonas de entrega
    for (const z of d.zones) {
      const col = z.active ? z.owner.color : '#555', cx = z.x + z.w / 2, cz = z.y + z.h / 2;
      r.plane(cx, 0.5, cz, z.w - 4, z.h - 4, col, { opacity: z.active ? 0.2 : 0.08 });
      const lo = { glow: z.active, opacity: z.active ? 0.9 : 0.5 };
      r.plane(cx, 0.8, z.y + 4, z.w - 8, 4, col, lo);
      r.plane(cx, 0.8, z.y + z.h - 4, z.w - 8, 4, col, lo);
      r.plane(z.x + 4, 0.8, cz, 4, z.h - 8, col, lo);
      r.plane(z.x + z.w - 4, 0.8, cz, 4, z.h - 8, col, lo);
      // poste com lâmpada no canto externo
      const px = z.x < 480 ? z.x + 10 : z.x + z.w - 10, pz = z.y < a.y + a.h / 2 ? z.y + 10 : z.y + z.h - 10;
      r.cyl(px, 0, pz, 2.5, 52, '#22262b', { metal: 0.6 });
      r.sphere(px, 55, pz, 5, z.active ? col : '#2a2a2a', { glow: true });
    }
    // empilhadeiras (mortas primeiro)
    for (const p of g.players) if (!p.alive) this.forklift3d(r, p);
    for (const p of g.players) if (p.alive) this.forklift3d(r, p);
    // caixas: soltas no chão, no garfo (no alto) ou subindo para o ímã
    for (const cr of d.crates) {
      if (cr.fade > 0) {
        const k = Math.max(0, cr.fade / 0.9), lift = (1 - k) * 150;
        this.crate3d(r, cr.x, 4 + lift, cr.y, cr.rot, Math.max(0.1, Math.round(k * 10) / 10));
        r.cyl(cr.x, 230, cr.y, 26, 12, '#3a4048', { metal: 0.7 });
        r.disc(cr.x, 229.5, cr.y, 22, '#7cf', { glow: true });
        r.beam(cr.x, 30 + lift, cr.y, cr.x, 228, cr.y, 4, '#7cf', { glow: true, opacity: 0.5 });
      } else this.crate3d(r, cr.x, cr.carrier ? 12 : 0, cr.y, cr.rot);
    }
  },

  // placares fixos na tela: turno, tempo, caixas e contagem de cada zona
  drawOverlay(g, c) {
    if (!g.uses3d || !g.uses3d()) return;
    const a = g.arena, D = TN.draw, d = g.data, U = TN.util;
    for (const z of d.zones) {
      const col = z.active ? z.owner.color : '#777';
      const top = z.y < a.y + a.h / 2;
      // fora da arena: as de cima na parede do fundo, as de baixo abaixo da mureta da frente
      const s = TN.R3.project(z.x + z.w / 2, top ? 70 : 0, top ? a.y - 4 : a.y + a.h + 24);
      const y = U.clamp(top ? s.y : s.y + 16, 82, g.H - 14);
      c.fillStyle = 'rgba(8,10,13,0.7)'; c.fillRect(s.x - 46, y - 13, 92, 26);
      c.fillStyle = col; c.fillRect(s.x - 46, y - 13, 4, 26);
      D.text(c, z.active ? `${z.owner.label}  ${z.count}` : `${z.owner.label} ✖`, s.x + 2, y, { size: 18, color: col, align: 'center' });
    }
    const t = d.phase === 'play' ? d.timer : 0;
    c.fillStyle = 'rgba(8,10,13,0.65)'; c.fillRect(g.W / 2 - 200, 38, 400, 30);
    D.text(c, `TURNO ${d.sub}`, g.W / 2 - 190, 53, { size: 15, color: '#ffb02e' });
    D.text(c, U.formatTime(t), g.W / 2, 53, { size: 24, color: t < 5 && d.phase === 'play' ? '#f55' : '#fff', align: 'center' });
    D.text(c, `CAIXAS: ${d.crates.filter((cr) => !cr.removed).length}`, g.W / 2 + 190, 53, { size: 13, color: '#aaa', align: 'right' });
    if (d.banner) {
      D.panel(c, g.W / 2 - 230, g.H / 2 - 26, 460, 52, { stroke: d.banner.color });
      D.text(c, d.banner.text, g.W / 2, g.H / 2, { size: 22, color: d.banner.color, align: 'center' });
    }
  },

  // ---------- desenho 2D (alternativa sem WebGL) ----------
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
