// Registro de minigames + execução de UMA rodada de um minigame.
// Leia docs/COMO_CRIAR_MINIGAME.md para a API completa (o objeto `g`).
(function () {
  const U = TN.util;
  TN.minigames = {};       // id -> definição
  TN.minigameOrder = [];   // ordem de registro

  TN.registerMinigame = function (def) {
    const required = ['id', 'title', 'init', 'update'];
    if (!def.draw && !def.draw3d) throw new Error(`Minigame sem draw3d (ou draw 2D): ${def.id}`);
    for (const k of required) if (!def[k]) throw new Error(`Minigame sem campo obrigatório "${k}": ${def.id || '?'}`);
    if (TN.minigames[def.id]) console.warn('Minigame registrado duas vezes:', def.id);
    def.rounds = def.rounds || 1;
    def.scoring = def.scoring || 'survival';
    def.brief = def.brief || [];
    def.controls = def.controls || {};
    def.color = def.color || '#2f4';
    TN.minigames[def.id] = def;
    if (!TN.minigameOrder.includes(def.id)) TN.minigameOrder.push(def.id);
  };

  // Bot genérico (usado se o minigame não definir `bot`): anda à toa e às vezes aperta Ação.
  function defaultBot(g, p, dt) {
    const d = p._wander || (p._wander = { t: 0, x: 0, y: 0 });
    d.t -= dt;
    if (d.t <= 0) { d.t = U.rand(0.4, 1.5); d.x = U.randInt(-1, 1); d.y = U.randInt(-1, 1); }
    return { x: d.x, y: d.y, a: U.chance(0.03), b: false };
  }

  class Round {
    // roster: [{ id, name, color, device, isBot }]
    constructor(def, roster, roundIndex = 1, totalRounds = 1) {
      this.def = def;
      this.W = TN.W; this.H = TN.H;
      this.round = roundIndex; this.totalRounds = totalRounds;
      this.time = 0;
      this.timeLimit = typeof def.timeLimit === 'function' ? def.timeLimit(this) : def.timeLimit || 0;
      this.timeLeft = this.timeLimit;
      this.finished = false; this._finishAt = null;
      this.arena = { x: 40, y: 70, w: TN.W - 80, h: TN.H - 130 };  // área útil padrão (abaixo do HUD)
      this.data = {};          // estado livre do minigame
      this._timers = []; this._particles = []; this._popups = [];
      this._shake = 0; this._flash = null; this._message = null;
      this._elimOrder = [];
      this.players = roster.map((r) => ({
        id: r.id, name: r.name, color: r.color, isBot: !!r.isBot, device: r.device,
        input: { x: 0, y: 0, a: false, b: false, aPressed: false, bPressed: false },
        alive: true, score: 0, x: 0, y: 0, vx: 0, vy: 0, r: 16, dir: 0,
        data: {}, finished: false, eliminatedAt: null, label: r.name || `P${r.id + 1}`,
      }));
      this.playerCount = this.players.length;
      // posição inicial padrão: espalhados em círculo
      this.placeInCircle(TN.W / 2, TN.H / 2 + 20, 120);
      def.init(this);
    }

    // ---------- API para os minigames ----------
    alive() { return this.players.filter((p) => p.alive); }
    others(p) { return this.players.filter((o) => o !== p); }
    eliminate(p, { sound = 'hurt', particles = true, msg = null } = {}) {
      if (!p.alive) return;
      p.alive = false; p.eliminatedAt = this.time;
      this._elimOrder.push(p);
      if (sound) this.sfx(sound);
      if (particles) this.particles(p.x, p.y, p.color, 24, 220);
      if (msg) this.popup(msg, p.x, p.y - 30, '#f55');
      this.shake(6);
    }
    // elimina vários de uma vez (empatam na pontuação 'survival')
    eliminateGroup(list, opts = {}) { for (const p of list) this.eliminate(p, opts); }
    addScore(p, n = 1, { popup = true } = {}) {
      p.score += n;
      if (popup && n !== 0) this.popup((n > 0 ? '+' : '') + n, p.x, p.y - 34, n > 0 ? '#ff0' : '#f55');
    }
    // Encerra a rodada (após `delay` segundos). Pode ser chamado várias vezes; vale o primeiro.
    finish(delay = 1.2) { if (this._finishAt === null) this._finishAt = this.time + delay; }
    after(sec, fn) { this._timers.push({ at: this.time + sec, fn }); }
    sfx(name, ganho) { TN.audio.play(name, ganho === undefined ? undefined : { ganho }); }   // ganho 0..1 = volume
    shake(a = 6) { this._shake = Math.max(this._shake, a); }
    flash(color = '#fff', dur = 0.15) { this._flash = { color, t: dur, dur }; }
    message(text, dur = 1.5, color = '#fff') { this._message = { text, t: dur, color }; }
    popup(text, x, y, color = '#fff') { this._popups.push({ text, x, y, color, t: 1 }); }
    particles(x, y, color = '#fff', n = 12, speed = 160, life = 0.6, size = 3) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        this._particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: life * (0.5 + Math.random() * 0.5), color, size });
      }
    }
    // Move o jogador pelo input (diagonal normalizada) e prende na área `bounds` (padrão: this.arena).
    movePlayer(p, speed, dt, bounds = this.arena) {
      let { x, y } = p.input;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      p.x += (x * speed + p.vx) * dt; p.y += (y * speed + p.vy) * dt;
      if (l > 0.1) p.dir = Math.atan2(y, x);
      if (bounds) {
        p.x = U.clamp(p.x, bounds.x + p.r, bounds.x + bounds.w - p.r);
        p.y = U.clamp(p.y, bounds.y + p.r, bounds.y + bounds.h - p.r);
      }
    }
    // impulso que decai (empurrões, explosões)
    push(p, ix, iy) { p.vx += ix; p.vy += iy; }
    decayPush(p, dt, rate = 8) { const k = Math.max(0, 1 - rate * dt); p.vx *= k; p.vy *= k; }
    placeInCircle(cx, cy, r) {
      this.players.forEach((p, i) => {
        const a = -Math.PI / 2 + (i / this.players.length) * Math.PI * 2;
        p.x = cx + Math.cos(a) * r; p.y = cy + Math.sin(a) * r; p.dir = a + Math.PI;
      });
    }
    placeInRow(y, x0, x1) {
      const n = this.players.length;
      this.players.forEach((p, i) => { p.x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1); p.y = y; });
    }
    drawPlayer(c, p, opts = {}) {
      TN.draw.robot(c, p.x, p.y, p.r, p.color, { dir: p.dir, dead: !p.alive, label: p.label, ...opts });
    }

    // ---------- loop interno ----------
    _readInputs(dt) {
      for (const p of this.players) {
        let raw;
        if (p.isBot) {
          raw = (this.def.bot || defaultBot).call(this.def, this, p, dt) || {};
          raw = { x: U.clamp(raw.x || 0, -1, 1), y: U.clamp(raw.y || 0, -1, 1), a: !!raw.a, b: !!raw.b };
        } else {
          const s = TN.input.get(p.device);
          raw = { x: s.x, y: s.y, a: s.a, b: s.b };
        }
        // bordas ("apertou neste frame") calculadas igual para humanos e bots
        const prev = p._prevRaw || {};
        raw.aPressed = raw.a && !prev.a; raw.bPressed = raw.b && !prev.b;
        raw.aReleased = !raw.a && !!prev.a; raw.bReleased = !raw.b && !!prev.b;
        raw.upPressed = raw.y < -0.5 && !(prev.y < -0.5); raw.downPressed = raw.y > 0.5 && !(prev.y > 0.5);
        raw.leftPressed = raw.x < -0.5 && !(prev.x < -0.5); raw.rightPressed = raw.x > 0.5 && !(prev.x > 0.5);
        p._prevRaw = raw;
        p.input = raw;
      }
    }
    update(dt) {
      if (this.finished) return;
      this.time += dt;
      this._readInputs(dt);
      this.def.update(this, dt);
      // timers
      for (let i = this._timers.length - 1; i >= 0; i--) {
        if (this.time >= this._timers[i].at) { const t = this._timers.splice(i, 1)[0]; t.fn(); }
      }
      // tempo limite
      if (this.timeLimit) {
        this.timeLeft = Math.max(0, this.timeLimit - this.time);
        if (this.timeLeft <= 0 && this._finishAt === null) {
          if (this.def.onTimeUp) this.def.onTimeUp(this);
          this.finish(0.8);
        }
      }
      // fim automático para jogos de sobrevivência
      const endOne = this.def.endWhenOneLeft ?? (this.def.scoring === 'survival');
      if (endOne && this._finishAt === null) {
        const minAlive = this.playerCount > 1 ? 1 : 0;
        if (this.alive().length <= minAlive) this.finish(1.5);
      }
      if (this._finishAt !== null && this.time >= this._finishAt) this.finished = true;
      // efeitos
      for (const pt of this._particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.94; pt.vy *= 0.94; pt.t -= dt; }
      this._particles = this._particles.filter((pt) => pt.t > 0);
      for (const pp of this._popups) { pp.y -= 30 * dt; pp.t -= dt; }
      this._popups = this._popups.filter((pp) => pp.t > 0);
      this._shake = Math.max(0, this._shake - 30 * dt);
      if (this._flash) { this._flash.t -= dt; if (this._flash.t <= 0) this._flash = null; }
      if (this._message) { this._message.t -= dt; if (this._message.t <= 0) this._message = null; }
    }
    // true quando este minigame é desenhado em 3D (tem draw3d e o navegador suporta WebGL)
    uses3d() { return !!(this.def.draw3d && TN.R3 && TN.R3.available && !TN.force2d); }
    draw(c) {
      if (this.uses3d()) {
        TN.R3.renderRound(this, c);
        if (this.def.drawOverlay) this.def.drawOverlay(this, c); // HUD 2D extra do minigame (opcional)
        if (this.def.screenSpace) {   // jogo em coordenadas de tela: partículas/popups em 2D por cima
          for (const pt of this._particles) { c.globalAlpha = Math.min(1, pt.t * 2); c.fillStyle = pt.color; c.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size); }
          c.globalAlpha = 1;
        }
        for (const pp of this._popups) {
          const s = this.def.screenSpace ? { x: pp.x, y: pp.y } : TN.R3.project(pp.x, 60 + (1 - pp.t) * 30, pp.y);
          c.globalAlpha = Math.min(1, pp.t * 2); TN.draw.text(c, pp.text, s.x, s.y, { size: 18, color: pp.color, align: 'center' });
        }
        c.globalAlpha = 1;
      } else if (this.def.draw) {
        c.save();
        if (this._shake > 0) c.translate(U.rand(-this._shake, this._shake), U.rand(-this._shake, this._shake));
        this.def.draw(this, c);
        for (const pt of this._particles) { c.globalAlpha = Math.min(1, pt.t * 2); c.fillStyle = pt.color; c.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size); }
        c.globalAlpha = 1;
        for (const pp of this._popups) { c.globalAlpha = Math.min(1, pp.t * 2); TN.draw.text(c, pp.text, pp.x, pp.y, { size: 18, color: pp.color, align: 'center' }); }
        c.globalAlpha = 1;
        c.restore();
      } else {
        c.fillStyle = '#111'; c.fillRect(0, 0, TN.W, TN.H);
        TN.draw.text(c, 'Este minigame precisa de WebGL (3D).', TN.W / 2, TN.H / 2, { size: 22, color: '#f88', align: 'center' });
      }
      if (this.def.hud !== false) this._drawHud(c);
      if (this._message) {
        c.globalAlpha = Math.min(1, this._message.t * 3);
        TN.draw.text(c, this._message.text, TN.W / 2, TN.H / 2 - 40, { size: 40, color: this._message.color, align: 'center' });
        c.globalAlpha = 1;
      }
      if (this._flash) { c.globalAlpha = this._flash.t / this._flash.dur * 0.6; c.fillStyle = this._flash.color; c.fillRect(0, 0, TN.W, TN.H); c.globalAlpha = 1; }
    }
    _drawHud(c) {
      const D = TN.draw;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, TN.W, 34);
      D.text(c, this.def.title, 12, 17, { size: 16, color: this.def.color });
      if (this.totalRounds > 1) D.text(c, `RODADA ${this.round}/${this.totalRounds}`, 12 + this.def.title.length * 10 + 20, 17, { size: 13, color: '#aaa' });
      if (this.timeLimit) D.text(c, U.formatTime(this.timeLeft), 495, 17, { size: 22, color: this.timeLeft < 5 ? '#f55' : '#fff', align: 'center' });
      const showScore = this.def.scoring !== 'survival' || this.players.some((p) => p.score);
      this.players.forEach((p, i) => {
        const x = TN.W - 4 * 104 + i * 104;  // slots à direita; o tempo fica em x=495
        c.fillStyle = p.alive ? p.color : '#444'; c.fillRect(x, 6, 8, 22);
        // nome (até 8 letras) numa linha e BOT pequeno embaixo: juntos invadiam o placar da vaga
        D.text(c, p.label, x + 13, p.isBot ? 12 : 17, { size: 12, color: p.alive ? '#fff' : '#777', maxWidth: 64 });
        if (p.isBot) D.text(c, 'BOT', x + 13, 25, { size: 8, color: p.alive ? '#9ab' : '#666' });
        if (showScore) D.text(c, String(this.def.hudValue ? this.def.hudValue(this, p) : p.score), x + 96, 17, { size: 15, color: '#ff0', align: 'right' });
        else if (!p.alive) D.text(c, '✖', x + 96, 17, { size: 15, color: '#f55', align: 'right' });
      });
    }

    // Pontos da rodada para cada jogador (chamado pela sessão ao terminar).
    results() {
      const pts = {};
      const n = this.playerCount;
      for (const p of this.players) pts[p.id] = 0;
      if (this.def.scoring === 'survival') {
        // como no original: quem morre primeiro ganha 0, segundo 1, ...; sobreviventes ganham n
        // quem morre no mesmo instante empata: ganha o nº de jogadores eliminados ANTES dele
        for (const p of this._elimOrder) pts[p.id] += this._elimOrder.filter((o) => o.eliminatedAt < p.eliminatedAt).length;
        for (const p of this.players) if (p.alive) pts[p.id] += n;
        for (const p of this.players) pts[p.id] += p.score;  // pontos extras por eventos
      } else if (this.def.scoring === 'rank') {
        // converte p.score em colocação: 1º = n-1, 2º = n-2 ... (empates dividem)
        for (const p of this.players) pts[p.id] = this.players.filter((o) => o.score < p.score).length;
      } else { // 'points'
        for (const p of this.players) pts[p.id] = p.score;
      }
      if (this.def.results) this.def.results(this, pts); // gancho opcional para ajustar
      return pts;
    }
  }

  TN.Round = Round;
})();
