// Fluxo da partida: Título → Lobby → Configuração → [Roleta → Briefing → (Rodada → Contagem → Jogo → Resultado)* → Placar]* → Pódio
(function () {
  const U = TN.util, D = TN.draw;
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

  // ---------- configurações salvas ----------
  const SETTINGS_KEY = 'turno-da-noite-settings';
  TN.settings = { bots: true, gameCount: 6, roundsMode: 0, disabled: {} };
  try { Object.assign(TN.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* sem storage */ }
  TN.saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(TN.settings)); } catch (e) { /* ok */ } };
  const ROUND_MODES = ['ORIGINAL', '1', '2', '3'];

  // ---------- gerenciador de cenas ----------
  TN.scene = null;
  TN.go = function (scene) { TN.scene = scene; scene.t = 0; scene.enter && scene.enter(); };
  TN.session = null;

  function buildRoster(slots, fillBots) {
    const roster = [];
    slots.forEach((s, i) => { if (s && s.device) roster.push({ device: s.device, isBot: false, slot: i }); });
    if (fillBots || roster.length === 0) {
      for (let i = 0; i < 4 && roster.length < 4; i++) if (!roster.find((r) => r.slot === i)) roster.push({ device: null, isBot: true, slot: i });
    }
    roster.sort((a, b) => a.slot - b.slot);
    return roster.map((r) => ({ id: r.slot, name: TN.PLAYER_NAMES[r.slot], color: TN.PLAYER_COLORS[r.slot], device: r.device, isBot: r.isBot }));
  }

  function newSession(roster, playlist, { test = null } = {}) {
    TN.session = { roster, playlist, index: 0, totals: {}, test };
    for (const p of roster) TN.session.totals[p.id] = 0;
  }

  function background(c, t, tint = '#0b0f13') {
    c.fillStyle = tint; c.fillRect(0, 0, TN.W, TN.H);
    c.strokeStyle = 'rgba(60,255,120,0.05)'; c.lineWidth = 1;
    for (let x = (t * 20) % 40; x < TN.W; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, TN.H); c.stroke(); }
    for (let y = 0; y < TN.H; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(TN.W, y); c.stroke(); }
  }
  function footer(c, text) { D.text(c, text, TN.W / 2, TN.H - 18, { size: 14, color: '#7a8', align: 'center' }); }
  function menuList(c, items, sel, x, y, { size = 26, gap = 44, align = 'center' } = {}) {
    items.forEach((it, i) => {
      const on = i === sel;
      D.text(c, (on ? '▶ ' : '  ') + it + (on ? ' ◀' : '  '), x, y + i * gap, { size, color: on ? '#3f6' : '#9aa', align });
    });
  }

  // ======================= TÍTULO =======================
  const Title = {
    sel: 0,
    items() {
      const hosting = TN.net && TN.net.mode === 'host';
      return [hosting ? `JOGAR (SALA ${TN.net.room} ABERTA)` : 'JOGAR (NESTE COMPUTADOR)',
        hosting ? `FECHAR SALA ${TN.net.room}` : 'CRIAR SALA EM REDE LOCAL',
        'ENTRAR EM SALA (REDE LOCAL)',
        'TESTAR UM MINIGAME', 'CONTROLES', 'SOM: ' + (TN.audio.muted ? 'DESLIGADO' : 'LIGADO')];
    },
    enter() { this.bots = [0, 1, 2, 3].map((i) => ({ x: U.rand(100, 860), y: U.rand(440, 505), vx: U.rand(-60, 60), vy: U.rand(-20, 20), c: TN.PLAYER_COLORS[i] })); },
    update(dt) {
      const m = TN.input.menu(), n = this.items().length;
      if (m.up) { this.sel = (this.sel + n - 1) % n; TN.audio.play('blip'); }
      if (m.down) { this.sel = (this.sel + 1) % n; TN.audio.play('blip'); }
      if (m.ok) {
        TN.audio.play('confirm');
        if (this.sel === 0) TN.go(new Lobby({}));
        if (this.sel === 1) { if (TN.net.mode === 'host') TN.net.close(); else TN.go(new TN.NetScenes.HostCreate()); }
        if (this.sel === 2) { if (TN.net.mode === 'host') TN.net.close(); TN.go(new TN.NetScenes.JoinList()); }
        if (this.sel === 3) TN.go(new TestList());
        if (this.sel === 4) TN.go(Controls);
        if (this.sel === 5) TN.audio.toggleMute();
      }
      for (const b of this.bots) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < 40 || b.x > 920) b.vx *= -1;
        if (b.y < 435 || b.y > 510) b.vy *= -1;
      }
    },
    draw(c) {
      background(c, this.t);
      for (const b of this.bots) D.robot(c, b.x, b.y, 18, b.c, { dir: Math.atan2(b.vy, b.vx) });
      D.text(c, 'TURNO DA NOITE', TN.W / 2, 80, { size: 64, color: '#3f6', align: 'center' });
      D.text(c, 'uma festa de minigames para 1–4 unidades de teste', TN.W / 2, 128, { size: 16, color: '#8a9', align: 'center' });
      menuList(c, this.items(), this.sel, TN.W / 2, 180, { size: 22, gap: 40 });
      footer(c, 'Setas/WASD para navegar · ESPAÇO/ENTER para confirmar · ESC para voltar');
      D.crt(c, this.t);
    },
  };
  TN.TitleScene = Title;

  // ======================= CONTROLES =======================
  const Controls = {
    update() { const m = TN.input.menu(); if (m.ok || m.back) { TN.audio.play('back'); TN.go(Title); } },
    draw(c) {
      background(c, this.t);
      D.text(c, 'CONTROLES', TN.W / 2, 60, { size: 40, color: '#3f6', align: 'center' });
      TN.input.KB_SCHEMES.forEach((s, i) => {
        c.fillStyle = TN.PLAYER_COLORS[i]; c.fillRect(150, 122 + i * 60, 10, 30);
        D.text(c, `TECLADO ${i + 1}`, 175, 128 + i * 60, { size: 20 });
        D.text(c, s.label, 175, 150 + i * 60, { size: 15, color: '#9ab' });
      });
      D.lines(c, 'Controles (gamepads) também funcionam: analógico/d-pad, A = Ação, B = Extra.\nCada jogador escolhe um esquema no lobby apertando o botão de AÇÃO dele.\nESC pausa o jogo. Vagas vazias são preenchidas por BOTS.', TN.W / 2, 390, { size: 15, color: '#cdd', align: 'center' });
      footer(c, 'Aperte AÇÃO ou ESC para voltar');
      D.crt(c, this.t);
    },
  };

  // ======================= LISTA DE TESTE =======================
  class TestList {
    constructor() { this.sel = 0; this.scroll = 0; }
    update() {
      const ids = TN.minigameOrder, m = TN.input.menu();
      if (m.up) { this.sel = (this.sel + ids.length - 1) % ids.length; TN.audio.play('blip'); }
      if (m.down) { this.sel = (this.sel + 1) % ids.length; TN.audio.play('blip'); }
      if (m.back) { TN.audio.play('back'); TN.go(Title); }
      if (m.ok && ids.length) { TN.audio.play('confirm'); TN.go(new Lobby({ test: ids[this.sel] })); }
      this.scroll = U.clamp(this.sel - 6, 0, Math.max(0, ids.length - 13));
    }
    draw(c) {
      background(c, this.t);
      D.text(c, 'TESTAR UM MINIGAME', TN.W / 2, 45, { size: 34, color: '#3f6', align: 'center' });
      const ids = TN.minigameOrder;
      ids.slice(this.scroll, this.scroll + 13).forEach((id, k) => {
        const i = k + this.scroll, def = TN.minigames[id], on = i === this.sel;
        D.text(c, (on ? '▶ ' : '  ') + def.title, 90, 100 + k * 30, { size: 20, color: on ? '#3f6' : '#9aa' });
        D.text(c, def.inspiredBy ? 'inspirado em ' + def.inspiredBy : 'original', 520, 100 + k * 30, { size: 13, color: '#567' });
      });
      if (!ids.length) D.text(c, 'Nenhum minigame registrado (veja minigames/manifest.js)', TN.W / 2, 250, { size: 18, color: '#f55', align: 'center' });
      const def = TN.minigames[ids[this.sel]];
      if (def) D.text(c, def.tagline || '', TN.W / 2, TN.H - 50, { size: 16, color: '#cdd', align: 'center' });
      footer(c, 'AÇÃO para escolher · ESC para voltar');
      D.crt(c, this.t);
    }
  }

  // ======================= LOBBY =======================
  class Lobby {
    constructor({ test = null }) { this.test = test; this.slots = [null, null, null, null]; this.startIn = null; }
    update(dt) {
      for (const dev of TN.input.devices()) {
        const s = TN.input.get(dev);
        const idx = this.slots.findIndex((x) => x && x.device === dev);
        if (s.aPressed) {
          if (idx === -1) {
            const free = this.slots.findIndex((x) => !x);
            if (free !== -1) { this.slots[free] = { device: dev, ready: false }; TN.audio.play('select'); }
          } else { this.slots[idx].ready = !this.slots[idx].ready; TN.audio.play(this.slots[idx].ready ? 'confirm' : 'back'); }
        }
        if (s.bPressed && idx !== -1) {
          if (this.slots[idx].ready) this.slots[idx].ready = false; else this.slots[idx] = null;
          TN.audio.play('back');
        }
      }
      if (TN.input.keyPressed('KeyT')) { TN.settings.bots = !TN.settings.bots; TN.saveSettings(); TN.audio.play('blip'); }
      if (TN.input.keyPressed('Escape')) { TN.audio.play('back'); TN.go(this.test ? new TestList() : Title); return; }
      const joined = this.slots.filter(Boolean);
      const allReady = joined.length > 0 && joined.every((s) => s.ready);
      if (allReady) {
        if (this.startIn === null) this.startIn = 0.8;
        this.startIn -= dt;
        if (this.startIn <= 0) {
          const roster = buildRoster(this.slots, TN.settings.bots);
          if (this.test) {
            const def = TN.minigames[this.test];
            newSession(roster, [{ id: this.test, rounds: def.rounds }], { test: this.test });
            TN.go(new Brief());
          } else TN.go(new Setup(roster));
        }
      } else this.startIn = null;
    }
    draw(c) {
      background(c, this.t);
      D.text(c, this.test ? 'TESTE: ' + TN.minigames[this.test].title : 'LOBBY', TN.W / 2, 50, { size: 36, color: '#3f6', align: 'center' });
      D.text(c, 'Aperte AÇÃO no seu teclado/controle para entrar. AÇÃO de novo = PRONTO. EXTRA = sair.', TN.W / 2, 92, { size: 14, color: '#9ab', align: 'center' });
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 225, y = 130, s = this.slots[i];
        D.panel(c, x, y, 205, 280, { stroke: s ? TN.PLAYER_COLORS[i] : '#333' });
        D.text(c, `P${i + 1}`, x + 102, y + 28, { size: 26, color: TN.PLAYER_COLORS[i], align: 'center' });
        if (s) {
          D.robot(c, x + 102, y + 120, 34, TN.PLAYER_COLORS[i], { dir: Math.sin(this.t * 2 + i) * 0.6 + Math.PI / 2 });
          D.lines(c, TN.input.deviceLabel(s.device).split(' · ').join('\n'), x + 102, y + 190, { size: 12, color: '#bcd', align: 'center', lineHeight: 16 });
          D.text(c, s.ready ? 'PRONTO!' : 'aguardando…', x + 102, y + 255, { size: 20, color: s.ready ? '#3f6' : '#aa8', align: 'center' });
        } else {
          if (TN.settings.bots) { c.globalAlpha = 0.35; D.robot(c, x + 102, y + 120, 34, TN.PLAYER_COLORS[i], { dir: Math.PI / 2 }); c.globalAlpha = 1; }
          D.text(c, TN.settings.bots ? 'BOT' : 'vazio', x + 102, y + 200, { size: 20, color: '#666', align: 'center' });
        }
      }
      D.text(c, `[T] Completar vagas com bots: ${TN.settings.bots ? 'SIM' : 'NÃO'}`, TN.W / 2, 435, { size: 16, color: '#cdd', align: 'center' });
      if (TN.net && TN.net.mode === 'host') {
        const n = Object.keys(TN.net.peers).length;
        D.panel(c, 60, 452, 840, 50, { stroke: '#3fa9ff' });
        D.text(c, `SALA ${TN.net.room} · ${n} computador(es) conectado(s)`, 80, 467, { size: 15, color: '#3fa9ff' });
        D.text(c, `Nos outros PCs abra ${TN.net.urls.slice(0, 2).join('  ou  ') || 'http://<seu-ip>:8765'} → ENTRAR EM SALA`, 80, 488, { size: 13, color: '#cde', maxWidth: 800 });
      }
      footer(c, 'Começa quando todos que entraram estiverem PRONTOS · ESC volta');
      D.crt(c, this.t);
    }
  }

  // ======================= CONFIGURAÇÃO DA PLAYLIST =======================
  class Setup {
    constructor(roster) { this.roster = roster; this.sel = 0; this.scroll = 0; }
    enabledIds() { return TN.minigameOrder.filter((id) => !TN.settings.disabled[id]); }
    update() {
      const ids = TN.minigameOrder, rows = 3 + ids.length, m = TN.input.menu(), S = TN.settings;
      if (m.up) { this.sel = (this.sel + rows - 1) % rows; TN.audio.play('blip'); }
      if (m.down) { this.sel = (this.sel + 1) % rows; TN.audio.play('blip'); }
      const dx = (m.right ? 1 : 0) - (m.left ? 1 : 0);
      const total = this.enabledIds().length;
      if (this.sel === 1 && dx) { S.gameCount = U.clamp(S.gameCount + dx, 1, Math.max(1, total)); TN.audio.play('blip'); }
      if (this.sel === 2 && dx) { S.roundsMode = (S.roundsMode + dx + ROUND_MODES.length) % ROUND_MODES.length; TN.audio.play('blip'); }
      if (this.sel >= 3 && (m.ok || dx)) {
        const id = ids[this.sel - 3];
        if (S.disabled[id]) delete S.disabled[id];
        else if (total > 1) S.disabled[id] = true;
        TN.audio.play('select');
      }
      S.gameCount = U.clamp(S.gameCount, 1, Math.max(1, this.enabledIds().length));
      if (this.sel === 0 && m.ok) {
        TN.saveSettings(); TN.audio.play('confirm');
        const chosen = U.shuffle(this.enabledIds().slice()).slice(0, S.gameCount);
        const playlist = chosen.map((id) => ({ id, rounds: S.roundsMode === 0 || TN.minigames[id].fixedRounds ? TN.minigames[id].rounds : Number(ROUND_MODES[S.roundsMode]) }));
        newSession(this.roster, playlist);
        TN.go(new Picker());
      }
      if (m.back && this.sel < 3) { TN.saveSettings(); TN.go(new Lobby({})); }
      this.scroll = U.clamp(this.sel - 3 - 5, 0, Math.max(0, ids.length - 10));
    }
    draw(c) {
      background(c, this.t);
      const S = TN.settings, ids = TN.minigameOrder;
      D.text(c, 'CONFIGURAR PARTIDA', TN.W / 2, 40, { size: 32, color: '#3f6', align: 'center' });
      const rows0 = ['▶▶ COMEÇAR', `JOGOS NA PARTIDA: ◀ ${S.gameCount} ▶  (de ${this.enabledIds().length} ativos)`, `RODADAS POR JOGO: ◀ ${ROUND_MODES[S.roundsMode]} ▶`];
      rows0.forEach((r, i) => D.text(c, r, 80, 95 + i * 32, { size: 20, color: this.sel === i ? '#3f6' : '#9aa' }));
      D.text(c, 'MINIGAMES (AÇÃO liga/desliga):', 80, 200, { size: 15, color: '#789' });
      ids.slice(this.scroll, this.scroll + 10).forEach((id, k) => {
        const i = k + this.scroll, on = this.sel === i + 3, def = TN.minigames[id];
        D.text(c, `${S.disabled[id] ? '[ ]' : '[x]'} ${def.title}`, 100, 228 + k * 27, { size: 17, color: on ? '#3f6' : S.disabled[id] ? '#555' : '#cdd' });
        D.text(c, `${def.rounds} rod.`, 470, 228 + k * 27, { size: 13, color: '#678' });
      });
      D.text(c, 'Jogadores:', 640, 95, { size: 16, color: '#789' });
      this.roster.forEach((p, i) => { D.robot(c, 660, 135 + i * 50, 14, p.color); D.text(c, `P${p.id + 1} ${p.isBot ? '(BOT)' : TN.input.deviceLabel(p.device).split(' · ')[0]}`, 690, 135 + i * 50, { size: 15, color: p.color }); });
      footer(c, 'Os jogos sorteados são embaralhados · ESC volta ao lobby');
      D.crt(c, this.t);
    }
  }

  // ======================= ROLETA (escolhe o próximo jogo) =======================
  class Picker {
    enter() {
      const s = TN.session;
      this.cards = s.playlist.slice(s.index).map((e) => e.id);
      if (this.cards.length < 2) this.cards = U.shuffle(TN.minigameOrder.slice()).slice(0, 6).concat([]);
      if (!this.cards.includes(s.playlist[s.index].id)) this.cards[0] = s.playlist[s.index].id;
      this.cards = this.cards.slice(0, 8);
      this.target = this.cards.indexOf(s.playlist[s.index].id);
      this.steps = this.cards.length * 2 + this.target;
      this.cur = 0; this.stepT = 0; this.done = 0;
      if (s.test || this.cards.length === 1) this.steps = this.target;
    }
    update(dt) {
      if (this.cur < this.steps) {
        this.stepT += dt;
        const delay = 0.06 + 0.25 * (this.cur / this.steps) ** 3;
        if (this.stepT > delay) { this.stepT = 0; this.cur++; TN.audio.play('blip'); if (this.cur === this.steps) TN.audio.play('confirm'); }
      } else {
        this.done += dt;
        if (this.done > 1.2) TN.go(new Brief());
      }
    }
    draw(c) {
      background(c, this.t);
      const s = TN.session;
      D.text(c, `PRÓXIMO TESTE  ·  ${s.index + 1}/${s.playlist.length}`, TN.W / 2, 50, { size: 28, color: '#3f6', align: 'center' });
      const n = this.cards.length, cols = Math.min(4, n), rows = Math.ceil(n / cols);
      const hi = this.cur % n;
      this.cards.forEach((id, i) => {
        const def = TN.minigames[id];
        const cx = TN.W / 2 + ((i % cols) - (cols - 1) / 2) * 215, cy = 160 + Math.floor(i / cols) * 170 + (rows === 1 ? 70 : 0);
        const on = i === hi;
        D.panel(c, cx - 100, cy - 70, 200, 140, { stroke: on ? '#fff' : def.color, lw: on ? 5 : 2, fill: on ? 'rgba(40,60,40,0.95)' : 'rgba(10,14,18,0.85)' });
        D.text(c, def.icon || '■', cx, cy - 22, { size: 40, color: def.color, align: 'center', bold: false });
        D.text(c, def.title, cx, cy + 35, { size: 15, color: '#fff', align: 'center', maxWidth: 185 });
      });
      D.crt(c, this.t);
    }
  }

  // ======================= BRIEFING =======================
  class Brief {
    enter() {
      const s = TN.session;
      this.def = TN.minigames[s.playlist[s.index].id];
      this.ready = {};
      for (const p of s.roster) this.ready[p.id] = p.isBot;
      s.gameScores = {}; for (const p of s.roster) s.gameScores[p.id] = 0;
      TN.audio.play('whoosh');
    }
    update() {
      const s = TN.session;
      for (const p of s.roster) if (!p.isBot && TN.input.get(p.device).aPressed && this.t > 0.4) {
        if (!this.ready[p.id]) TN.audio.play('select');
        this.ready[p.id] = true;
      }
      if (TN.input.keyPressed('Escape')) { TN.go(new Pause(this)); return; }
      if (s.roster.every((p) => this.ready[p.id]) && this.t > 1.2 || this.t > 30) TN.go(new RoundIntro(1));
    }
    draw(c) {
      const s = TN.session, def = this.def;
      background(c, this.t, '#0a120d');
      D.panel(c, 30, 24, 600, 492, { stroke: def.color });
      D.text(c, def.title, 55, 65, { size: 38, color: def.color, maxWidth: 560 });
      D.text(c, def.tagline || '', 55, 105, { size: 16, color: '#ffd', maxWidth: 560 });
      D.lines(c, def.brief.map((b) => '> ' + b).join('\n'), 55, 155, { size: 18, color: '#dfe', lineHeight: 28 });
      const ctl = def.controls;
      const lines = [];
      if (ctl.move) lines.push('MOVER: ' + ctl.move);
      if (ctl.a) lines.push('AÇÃO:  ' + ctl.a);
      if (ctl.b) lines.push('EXTRA: ' + ctl.b);
      D.text(c, 'CONTROLES', 55, 360, { size: 16, color: '#789' });
      D.lines(c, lines.join('\n'), 55, 390, { size: 17, color: '#cdd', lineHeight: 26 });
      D.text(c, `${def.rounds && s.playlist[s.index].rounds > 1 ? s.playlist[s.index].rounds + ' RODADAS' : '1 RODADA'}  ·  JOGO ${s.index + 1}/${s.playlist.length}`, 55, 490, { size: 14, color: '#789' });
      // placar
      D.panel(c, 650, 24, 280, 492, { stroke: '#355' });
      D.text(c, 'PLACAR GERAL', 790, 55, { size: 18, color: '#9ab', align: 'center' });
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]);
      sorted.forEach((p, i) => {
        const y = 110 + i * 85;
        D.robot(c, 690, y, 18, p.color);
        D.text(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, 720, y - 10, { size: 16, color: p.color });
        D.text(c, `${s.totals[p.id]} pts`, 720, y + 14, { size: 18, color: '#fff' });
        D.text(c, this.ready[p.id] ? '✔' : '…', 905, y, { size: 24, color: this.ready[p.id] ? '#3f6' : '#aa8', align: 'right' });
      });
      footer(c, 'Aperte AÇÃO quando estiver pronto');
      D.crt(c, this.t);
    }
  }

  // ======================= RODADA: intro + contagem =======================
  class RoundIntro {
    constructor(roundNo) { this.roundNo = roundNo; }
    enter() {
      const s = TN.session, entry = s.playlist[s.index];
      this.def = TN.minigames[entry.id];
      this.total = entry.rounds;
      this.round = new TN.Round(this.def, s.roster, this.roundNo, this.total);
      this.phase = 'intro'; this.count = 3; this.ct = 0;
      TN.audio.play('whoosh');
    }
    update(dt) {
      if (TN.input.keyPressed('Escape')) { TN.go(new Pause(this)); return; }
      if (this.phase === 'intro' && this.t > 2.0) { this.phase = 'count'; this.ct = 0; TN.audio.play('tick'); }
      if (this.phase === 'count') {
        this.ct += dt;
        if (this.ct > 0.9) { this.ct = 0; this.count--; if (this.count > 0) TN.audio.play('tick'); else { TN.audio.play('go'); this.round.message('VAI!', 0.7, '#3f6'); TN.go(new Play(this.round)); } }
      }
    }
    draw(c) {
      this.round.draw(c);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0, 0, TN.W, TN.H);
      if (this.phase === 'intro') {
        D.text(c, this.total > 1 ? `RODADA ${this.roundNo} / ${this.total}` : this.def.title, TN.W / 2, TN.H / 2 - 30, { size: 48, color: '#fff', align: 'center' });
        D.text(c, this.def.tagline || '', TN.W / 2, TN.H / 2 + 25, { size: 20, color: this.def.color, align: 'center' });
      } else {
        D.text(c, String(this.count), TN.W / 2, TN.H / 2, { size: 120, color: '#fff', align: 'center' });
      }
      // lembrete de quem é quem
      this.round.players.forEach((p) => D.text(c, `P${p.id + 1}`, p.x, p.y - 40, { size: 16, color: p.color, align: 'center' }));
    }
  }

  // ======================= JOGO =======================
  class Play {
    constructor(round) { this.round = round; }
    update(dt) {
      if (TN.input.keyPressed('Escape')) { TN.go(new Pause(this)); return; }
      this.round.update(dt);
      if (this.round.finished) TN.go(new RoundOver(this.round));
    }
    draw(c) { this.round.draw(c); }
  }

  // ======================= PAUSA =======================
  class Pause {
    constructor(under) { this.under = under; this.sel = 0; }
    items() { return ['CONTINUAR', 'PULAR ESTE MINIGAME', 'SAIR PARA O MENU']; }
    update() {
      const m = TN.input.menu();
      if (TN.input.keyPressed('Escape')) { TN.scene = this.under; return; }
      if (m.up) this.sel = (this.sel + 2) % 3;
      if (m.down) this.sel = (this.sel + 1) % 3;
      if (m.ok) {
        if (this.sel === 0) TN.scene = this.under;
        if (this.sel === 1) nextGame();
        if (this.sel === 2) TN.go(Title);
      }
    }
    draw(c) {
      this.under.draw(c);
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(0, 0, TN.W, TN.H);
      D.text(c, 'PAUSA', TN.W / 2, 150, { size: 50, color: '#3f6', align: 'center' });
      menuList(c, this.items(), this.sel, TN.W / 2, 250);
    }
  }

  // ======================= FIM DA RODADA =======================
  class RoundOver {
    constructor(round) { this.round = round; }
    enter() {
      const s = TN.session;
      this.pts = this.round.results();
      for (const id in this.pts) s.gameScores[id] = (s.gameScores[id] || 0) + this.pts[id];
      TN.audio.play('win');
    }
    update(dt) {
      this.round.update(0); // mantém partículas paradas
      const skip = TN.session.roster.some((p) => !p.isBot && TN.input.get(p.device).aPressed);
      if (this.t > 3.5 || (skip && this.t > 1)) {
        const s = TN.session;
        if (this.round.round < this.round.totalRounds) TN.go(new RoundIntro(this.round.round + 1));
        else TN.go(new ScoreScreen());
      }
    }
    draw(c) {
      this.round.draw(c);
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, TN.W, TN.H);
      D.text(c, 'FIM DA RODADA', TN.W / 2, 110, { size: 44, color: '#fff', align: 'center' });
      const ps = this.round.players.slice().sort((a, b) => this.pts[b.id] - this.pts[a.id]);
      ps.forEach((p, i) => {
        const y = 190 + i * 64;
        D.robot(c, TN.W / 2 - 150, y, 20, p.color, { dead: !p.alive });
        D.text(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, TN.W / 2 - 115, y, { size: 22, color: p.color });
        D.text(c, `+${this.pts[p.id]}`, TN.W / 2 + 170, y, { size: 28, color: '#ff0', align: 'right' });
      });
    }
  }

  // ======================= PLACAR =======================
  class ScoreScreen {
    enter() {
      const s = TN.session;
      this.before = { ...s.totals };
      for (const id in s.gameScores) s.totals[id] += s.gameScores[id];
      this.max = Math.max(1, ...Object.values(s.totals));
      TN.audio.play('coin');
    }
    update() {
      const skip = TN.session.roster.some((p) => !p.isBot && TN.input.get(p.device).aPressed);
      if (this.t > 5 || (skip && this.t > 1.5)) nextGame();
    }
    draw(c) {
      const s = TN.session;
      background(c, this.t);
      D.text(c, 'PLACAR', TN.W / 2, 55, { size: 40, color: '#3f6', align: 'center' });
      const k = U.clamp((this.t - 0.6) / 1.4, 0, 1);
      s.roster.forEach((p, i) => {
        const y = 130 + i * 90, val = this.before[p.id] + s.gameScores[p.id] * k;
        D.robot(c, 90, y + 12, 22, p.color);
        D.text(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, 125, y, { size: 18, color: p.color });
        D.bar(c, 125, y + 16, 640 * (val / this.max) + 4, 22, 1, p.color);
        D.text(c, `${Math.round(val)}`, 800, y + 27, { size: 24, color: '#fff' });
        D.text(c, `+${s.gameScores[p.id]}`, 870, y + 27, { size: 18, color: '#ff0' });
      });
      footer(c, s.index + 1 < s.playlist.length ? `Próximo: jogo ${s.index + 2}/${s.playlist.length}` : 'Último jogo concluído!');
      D.crt(c, this.t);
    }
  }

  function nextGame() {
    const s = TN.session;
    s.index++;
    if (s.index < s.playlist.length) TN.go(new Picker());
    else if (s.test) TN.go(new TestList());
    else TN.go(new Final());
  }

  // ======================= PÓDIO FINAL =======================
  class Final {
    constructor() { this.sel = 0; }
    enter() { TN.audio.play('win'); }
    update() {
      if (this.t < 1.5) return;
      const m = TN.input.menu();
      if (m.up || m.down) this.sel = 1 - this.sel;
      if (m.ok) {
        if (this.sel === 0) TN.go(new Setup(TN.session.roster)); else TN.go(Title);
      }
    }
    draw(c) {
      const s = TN.session;
      background(c, this.t, '#0d0b14');
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]);
      const w = sorted[0];
      D.text(c, 'TURNO ENCERRADO', TN.W / 2, 55, { size: 40, color: '#3f6', align: 'center' });
      D.text(c, `P${w.id + 1} ${w.isBot ? '(BOT) ' : ''}FOI APROVADO.`, TN.W / 2, 100, { size: 24, color: w.color, align: 'center' });
      const podium = [[1, 260, 150], [0, 480, 200], [2, 700, 110], [3, 860, 60]];
      for (const [rank, x, h] of podium) {
        const p = sorted[rank]; if (!p) continue;
        c.fillStyle = '#1d2630'; c.fillRect(x - 70, 420 - h, 140, h);
        D.text(c, `${rank + 1}º`, x, 440 - h + 20, { size: 26, color: '#fff', align: 'center' });
        D.robot(c, x, 420 - h - 40 + Math.sin(this.t * 4 + rank) * (rank === 0 ? 8 : 0), 28, p.color, { dead: rank === 3 && s.roster.length === 4, dir: Math.PI / 2 });
        D.text(c, `${s.totals[p.id]} pts`, x, 400, { size: 18, color: '#ff0', align: 'center' });
      }
      menuList(c, ['JOGAR DE NOVO', 'MENU PRINCIPAL'], this.sel, TN.W / 2, 470, { size: 20, gap: 30 });
      D.crt(c, this.t);
    }
  }

  // ======================= ATALHOS POR URL (para testar rápido) =======================
  // index.html?game=<id>            → joga só esse minigame (P1 = teclado 1, resto bots)
  // index.html?game=<id>&humans=2   → P1 teclado 1, P2 setas
  // index.html?game=<id>&humans=0   → só bots (assistir)
  TN.bootScene = function () {
    const id = params.get('game');
    if (id && TN.minigames[id]) {
      const humans = Number(params.get('humans') ?? 1);
      const slots = [0, 1, 2, 3].map((i) => (i < humans ? { device: TN.input.KB_SCHEMES[i].id } : null));
      newSession(buildRoster(slots, true), [{ id, rounds: Number(params.get('rounds')) || TN.minigames[id].rounds }], { test: id });
      TN.go(new Brief());
    } else {
      TN.go(Title);
    }
  };
  TN._internal = { buildRoster, newSession, Picker };  // usado por tools/simular.js --sessao
  TN.LobbyScene = Lobby;
  // cenas que a rede precisa recriar no cliente (engine/net.js)
  TN.sceneClasses = { Title, Controls, TestList, Lobby, Setup, Picker, Brief, RoundIntro, Play, Pause, RoundOver, ScoreScreen, Final };
})();
