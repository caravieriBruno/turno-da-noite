// Fluxo da partida: Título → Lobby → Configuração → [Roleta → Briefing → (Rodada → Contagem → Jogo → Resultado)* → Placar]* → Pódio
(function () {
  const U = TN.util, D = TN.draw;
  const G = TN.giz;
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

  // Quem navega nos menus (spec 2026-10-15-menus-fuga, seção 4). Sem `roster` (título, controles, telas de
  // rede): qualquer dispositivo deste computador, nunca um jogador remoto. Com `roster`: só o P1, o humano
  // local de menor id; sem P1 local conectado (o host só assiste, ou o controle caiu), de novo os locais.
  function donoDoMenu(roster) {
    const p1 = (roster || []).filter((p) => !p.isBot && TN.input.ehLocal(p.device)).sort((a, b) => a.id - b.id)[0];
    return p1 && TN.input.devices().includes(p1.device) ? (id) => id === p1.device : TN.input.ehLocal;
  }
  TN.donoDoMenu = donoDoMenu;

  // ---- menus de giz ----
  // move a seleção com cima/baixo; selAt marca quando ela mudou (o círculo de giz se redesenha)
  function navegar(cena, m, n) {
    if (!n) return;
    const antes = cena.sel;
    if (m.up) cena.sel = (cena.sel + n - 1) % n;
    if (m.down) cena.sel = (cena.sel + 1) % n;
    if (cena.sel !== antes) { cena.selAt = cena.t; TN.audio.play('blip'); }
  }
  function menuGiz(c, itens, sel, x, y, selT, { size = 24, gap = 42 } = {}) {
    itens.forEach((it, i) => {
      const on = i === sel;
      G.texto(c, it, x, y + i * gap, { size, color: on ? G.CORES.destaque : G.CORES.giz, align: 'center' });
      if (on) G.selecao(c, it, x, y + i * gap, size, selT);
    });
  }
  function rodape(c, texto) { G.texto(c, texto, TN.W / 2, TN.H - 18, { size: 14, color: G.CORES.apagadoForte, align: 'center', maxWidth: TN.W - 40 }); }


  // ======================= TÍTULO =======================
  const Title = {
    sel: 0,
    items() {
      const hosting = TN.net && TN.net.mode === 'host';
      return [hosting ? `PLANEJAR A FUGA (SALA ${TN.net.room} ABERTA)` : 'PLANEJAR A FUGA',
        hosting ? `FECHAR SALA ${TN.net.room}` : 'CHAMAR COMPARSAS (REDE LOCAL)',
        'ENTRAR NO PLANO (REDE LOCAL)',
        'ENSAIAR UMA ETAPA', 'CONTROLES', 'SOM: ' + (TN.audio.muted ? 'DESLIGADO' : 'LIGADO')];
    },
    enter() { this.selAt = 0; this.bots = [0, 1, 2, 3].map((i) => ({ x: U.rand(100, 860), y: U.rand(440, 505), vx: U.rand(-60, 60), vy: U.rand(-20, 20), c: TN.PLAYER_COLORS[i] })); },
    update(dt) {
      const m = TN.input.menu(donoDoMenu()), n = this.items().length;
      navegar(this, m, n);
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
      G.parede(c);
      for (const b of this.bots) G.detento(c, b.x, b.y, 16, b.c, { dir: Math.atan2(b.vy, b.vx) });
      G.titulo(c, 'TURNO DA NOITE', TN.W / 2, 78, 60);
      G.texto(c, '1 a 4 detentos · uma noite para cavar a saída', TN.W / 2, 132, { size: 17, color: G.CORES.apagadoForte, align: 'center' });
      menuGiz(c, this.items(), this.sel, TN.W / 2, 185, this.t - (this.selAt || 0), { size: 22, gap: 40 });
      rodape(c, 'WASD/Setas para navegar · ESPAÇO/CLIQUE para confirmar · ESC para voltar');
    },

  };
  TN.TitleScene = Title;

  // ======================= CONTROLES =======================
  const Controls = {
    update() { const m = TN.input.menu(donoDoMenu()); if (m.ok || m.back) { TN.audio.play('back'); TN.go(Title); } },
    draw(c) {
      G.parede(c);
      G.titulo(c, 'CONTROLES', TN.W / 2, 56, 40);
      TN.input.KB_SCHEMES.forEach((s, i) => {
        const y = 110 + i * 78;
        G.bilhete(c, 130, y, 700, 62, { rot: i % 2 ? 0.006 : -0.008 });
        G.detento(c, 168, y + 31, 11, TN.PLAYER_COLORS[i]);
        G.texto(c, `TECLADO ${i + 1}`, 200, y + 20, { size: 19, color: G.CORES.lapis, papel: true });
        G.texto(c, s.label, 200, y + 44, { size: 14, color: G.CORES.lapis, papel: true, maxWidth: 610 });
      });
      G.linhas(c, 'Controles (gamepads) também funcionam: analógico/d-pad, A = Ação, B = Extra.\nNo lobby, cada detento escolhe a cela apertando AÇÃO no seu teclado/controle.\nESC pausa o jogo. Celas vazias são ocupadas por BOTS. Nos menus, quem manda é o P1.', TN.W / 2, 380, { size: 15, align: 'center' });
      rodape(c, 'Aperte AÇÃO ou ESC para voltar');
    },

  };

  // ======================= LISTA DE TESTE =======================
  class TestList {
    constructor() { this.sel = 0; this.scroll = 0; }
    update() {
      const ids = TN.minigameOrder, m = TN.input.menu(donoDoMenu());
      navegar(this, m, ids.length);
      if (m.back) { TN.audio.play('back'); TN.go(Title); }
      if (m.ok && ids.length) { TN.audio.play('confirm'); TN.go(new Lobby({ test: ids[this.sel] })); }
      this.scroll = U.clamp(this.sel - 6, 0, Math.max(0, ids.length - 13));
    }
    draw(c) {
      G.parede(c);
      G.titulo(c, 'ENSAIAR UMA ETAPA', TN.W / 2, 45, 34);
      const ids = TN.minigameOrder, selT = this.t - (this.selAt || 0);
      ids.slice(this.scroll, this.scroll + 13).forEach((id, k) => {
        const i = k + this.scroll, def = TN.minigames[id], on = i === this.sel, y = 100 + k * 30;
        G.texto(c, def.title, 110, y, { size: 20, color: on ? G.CORES.destaque : G.CORES.giz, maxWidth: 400 });
        if (on) G.selecao(c, def.title, 110, y, 20, selT, 'left');
        G.texto(c, def.inspiredBy ? 'inspirado em ' + def.inspiredBy : 'original', 540, y, { size: 13, color: G.CORES.apagadoForte });
      });
      if (!ids.length) G.texto(c, 'Nenhuma etapa registrada (veja minigames/manifest.js)', TN.W / 2, 250, { size: 18, color: G.CORES.perigo, align: 'center' });
      const def = TN.minigames[ids[this.sel]];
      if (def) G.texto(c, def.tagline || '', TN.W / 2, TN.H - 50, { size: 16, align: 'center', maxWidth: TN.W - 80 });
      rodape(c, 'AÇÃO para escolher · ESC volta pra cela');
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
      G.parede(c);
      G.titulo(c, this.test ? 'ENSAIO: ' + TN.minigames[this.test].title : 'ESCOLHA SUA CELA', TN.W / 2, 46, 34);
      G.texto(c, 'Aperte AÇÃO no seu teclado/controle para entrar. AÇÃO de novo = PRONTO. EXTRA = sair.', TN.W / 2, 92, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 225, y = 125, s = this.slots[i], cor = TN.PLAYER_COLORS[i];
        G.retangulo(c, x, y, 205, 285, { color: s ? G.desbotar(cor) : G.CORES.apagadoForte, lw: s ? 2.5 : 1.5 });
        for (let gx = x + 18; gx < x + 205; gx += 24) G.linha(c, gx, y + 4, gx, y + 60, { color: G.CORES.apagadoForte, lw: 1.5 });   // grade
        G.texto(c, `CELA ${i + 1}`, x + 102, y + 82, { size: 22, color: G.desbotar(cor), align: 'center' });
        if (s) {
          G.detento(c, x + 102, y + 160, 26, cor, { comemorando: s.ready && Math.sin(this.t * 6 + i) > 0 });
          G.linhas(c, TN.input.deviceLabel(s.device).split(' · ').join('\n'), x + 102, y + 215, { size: 12, align: 'center', lineHeight: 15, maxWidth: 195 });
          G.texto(c, s.ready ? 'PRONTO PRA FUGIR!' : 'na cela…', x + 102, y + 266, { size: 17, color: s.ready ? G.CORES.destaque : G.CORES.giz, align: 'center', maxWidth: 195 });
        } else {
          if (TN.settings.bots) { c.save(); c.globalAlpha = 0.35; G.detento(c, x + 102, y + 160, 26, cor); c.restore(); }
          G.texto(c, TN.settings.bots ? 'BOT' : 'cela vazia', x + 102, y + 230, { size: 18, color: G.CORES.apagadoForte, align: 'center' });
        }
      }
      G.texto(c, `[T] Celas vazias com bots: ${TN.settings.bots ? 'SIM' : 'NÃO'}`, TN.W / 2, 437, { size: 16, align: 'center' });
      if (TN.net && TN.net.mode === 'host') {
        const n = Object.keys(TN.net.peers).length;
        G.bilhete(c, 60, 455, 840, 50, { rot: -0.004 });
        G.texto(c, `SALA ${TN.net.room} · ${n} computador(es) conectado(s)`, 80, 470, { size: 15, color: G.CORES.lapis, papel: true });
        G.texto(c, `Nos outros PCs abra ${TN.net.urls.slice(0, 2).join('  ou  ') || 'http://<seu-ip>:8765'} → ENTRAR NO PLANO`, 80, 491, { size: 13, color: G.CORES.lapis, papel: true, maxWidth: 800 });
      }
      rodape(c, 'Começa quando todos estiverem PRONTOS PRA FUGIR · ESC volta pra cela');
    }

  }

  // ======================= CONFIGURAÇÃO DA PLAYLIST =======================
  class Setup {
    constructor(roster) { this.roster = roster; this.sel = 0; this.scroll = 0; }
    enabledIds() { return TN.minigameOrder.filter((id) => !TN.settings.disabled[id]); }
    update() {
      const ids = TN.minigameOrder, rows = 3 + ids.length, m = TN.input.menu(donoDoMenu(this.roster)), S = TN.settings;
      navegar(this, m, rows);
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
      G.parede(c);
      const S = TN.settings, ids = TN.minigameOrder, selT = this.t - (this.selAt || 0);
      G.titulo(c, 'MONTAR O PLANO', TN.W / 2, 40, 32);
      const rows0 = ['▶▶ COMEÇAR A FUGA', `ETAPAS DO PLANO: ◀ ${S.gameCount} ▶  (de ${this.enabledIds().length} ativas)`, `TENTATIVAS POR ETAPA: ◀ ${ROUND_MODES[S.roundsMode]} ▶`];
      rows0.forEach((r, i) => {
        G.texto(c, r, 80, 95 + i * 32, { size: 20, color: this.sel === i ? G.CORES.destaque : G.CORES.giz, maxWidth: 520 });
        if (this.sel === i) G.selecao(c, r, 80, 95 + i * 32, 20, selT, 'left');
      });
      G.texto(c, 'ETAPAS POSSÍVEIS (AÇÃO liga/desliga):', 80, 200, { size: 15, color: G.CORES.apagadoForte });
      ids.slice(this.scroll, this.scroll + 10).forEach((id, k) => {
        const i = k + this.scroll, on = this.sel === i + 3, def = TN.minigames[id], y = 228 + k * 27;
        const txt = `${S.disabled[id] ? '[ ]' : '[x]'} ${def.title}`;
        G.texto(c, txt, 100, y, { size: 17, color: on ? G.CORES.destaque : S.disabled[id] ? G.CORES.apagadoForte : G.CORES.giz, maxWidth: 360 });
        if (on) G.selecao(c, txt, 100, y, 17, selT, 'left');
        G.texto(c, `${def.rounds} tent.`, 480, y, { size: 13, color: G.CORES.apagadoForte });
      });
      G.texto(c, 'Detentos:', 640, 95, { size: 16, color: G.CORES.apagadoForte });
      this.roster.forEach((p, i) => {
        G.detento(c, 660, 140 + i * 56, 13, p.color);
        G.texto(c, `P${p.id + 1} ${p.isBot ? '(BOT)' : TN.input.deviceLabel(p.device).split(' · ')[0]}`, 690, 140 + i * 56, { size: 15, color: G.desbotar(p.color), maxWidth: 250 });
      });
      rodape(c, 'As etapas sorteadas são embaralhadas · só o P1 mexe no menu · ESC volta ao lobby');
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
      G.parede(c);
      const s = TN.session;
      G.titulo(c, `ETAPA ${s.index + 1} DE ${s.playlist.length}`, TN.W / 2, 50, 30);
      const n = this.cards.length, cols = Math.min(4, n), rows = Math.ceil(n / cols), hi = this.cur % n;
      this.cards.forEach((id, i) => {
        const def = TN.minigames[id];
        const cx = TN.W / 2 + ((i % cols) - (cols - 1) / 2) * 215, cy = 160 + Math.floor(i / cols) * 170 + (rows === 1 ? 70 : 0);
        G.bilhete(c, cx - 95, cy - 65, 190, 130, { rot: (((i * 7) % 5) - 2) * 0.012 });
        G.texto(c, def.icon || '■', cx, cy - 22, { size: 40, color: def.color, align: 'center', papel: true });
        G.texto(c, def.title, cx, cy + 35, { size: 15, color: G.CORES.lapis, align: 'center', maxWidth: 175, papel: true });
        if (i === hi) G.circulo(c, cx, cy, 118, 82, { color: G.CORES.destaque, lw: 3 });
      });
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
      const s = TN.session, def = this.def, entry = s.playlist[s.index], L = G.CORES.lapis;
      G.parede(c);
      G.bilhete(c, 30, 24, 600, 492, { rot: -0.004 });
      G.texto(c, def.title, 55, 62, { size: 34, color: L, maxWidth: 550, papel: true });
      G.linha(c, 55, 86, 585, 86, { color: def.color, lw: 3 });
      G.texto(c, def.tagline || '', 55, 110, { size: 16, color: L, maxWidth: 550, papel: true });
      G.linhas(c, def.brief.map((b) => '> ' + b).join('\n'), 55, 155, { size: 18, color: L, lineHeight: 28, papel: true, maxWidth: 550 });
      const ctl = def.controls, lines = [];
      if (ctl.move) lines.push('MOVER: ' + ctl.move);
      if (ctl.a) lines.push('AÇÃO:  ' + ctl.a);
      if (ctl.b) lines.push('EXTRA: ' + ctl.b);
      G.texto(c, 'CONTROLES', 55, 360, { size: 16, color: L, papel: true });
      G.linhas(c, lines.join('\n'), 55, 390, { size: 17, color: L, lineHeight: 26, papel: true, maxWidth: 550 });
      G.texto(c, `${entry.rounds > 1 ? entry.rounds + ' TENTATIVAS' : '1 TENTATIVA'} · ETAPA ${s.index + 1}/${s.playlist.length}`, 55, 490, { size: 14, color: L, papel: true });
      // quanto cada um já cavou
      G.retangulo(c, 650, 24, 280, 492, { color: G.CORES.apagadoForte });
      G.texto(c, 'TÚNEL CAVADO', 790, 55, { size: 18, align: 'center' });
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]);
      sorted.forEach((p, i) => {
        const y = 110 + i * 85;
        G.detento(c, 690, y, 16, p.color);
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, 720, y - 10, { size: 16, color: G.desbotar(p.color) });
        G.texto(c, `${s.totals[p.id]} m`, 720, y + 14, { size: 18 });
        G.texto(c, this.ready[p.id] ? '✔' : '…', 905, y, { size: 24, color: this.ready[p.id] ? G.CORES.destaque : G.CORES.apagadoForte, align: 'right' });
      });
      rodape(c, 'Aperte AÇÃO quando estiver pronto');
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
        G.texto(c, this.total > 1 ? `TENTATIVA ${this.roundNo} / ${this.total}` : this.def.title, TN.W / 2, TN.H / 2 - 30, { size: 48, align: 'center' });
        G.texto(c, this.def.tagline || '', TN.W / 2, TN.H / 2 + 25, { size: 20, color: this.def.color, align: 'center', maxWidth: TN.W - 80 });
      } else {
        G.texto(c, String(this.count), TN.W / 2, TN.H / 2, { size: 120, align: 'center' });
      }
      // lembrete de quem é quem
      const r3 = this.round.uses3d() && !this.def.screenSpace;
      this.round.players.forEach((p) => { const w = r3 && this.def.worldPos ? this.def.worldPos(this.round, p) : { x: p.x, y: 0, z: p.y };
        const q = r3 ? TN.R3.project(w.x, w.y + 95, w.z) : { x: p.x, y: p.y - 40 }; D.text(c, `P${p.id + 1}`, q.x, q.y, { size: 16, color: p.color, align: 'center' }); });
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
    items() { return ['CONTINUAR', 'PULAR ESTA ETAPA', 'DESISTIR DA FUGA']; }
    update() {
      const m = TN.input.menu(donoDoMenu(TN.session && TN.session.roster));
      if (TN.input.keyPressed('Escape')) { TN.scene = this.under; return; }
      navegar(this, m, 3);
      if (m.ok) {
        if (this.sel === 0) TN.scene = this.under;
        if (this.sel === 1) nextGame();
        if (this.sel === 2) TN.go(Title);
      }
    }
    draw(c) {
      this.under.draw(c);
      c.fillStyle = 'rgba(29,35,33,0.9)'; c.fillRect(0, 110, TN.W, 320);
      G.linha(c, 0, 110, TN.W, 110, { color: G.CORES.apagadoForte }); G.linha(c, 0, 430, TN.W, 430, { color: G.CORES.apagadoForte });
      G.titulo(c, 'SILÊNCIO, GUARDA NA RONDA', TN.W / 2, 165, 36);
      menuGiz(c, this.items(), this.sel, TN.W / 2, 255, this.t - (this.selAt || 0), { size: 24, gap: 48 });
      G.texto(c, 'só o P1 mexe no menu', TN.W / 2, 410, { size: 13, color: G.CORES.apagadoForte, align: 'center' });
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
      const skip = TN.input.menu(donoDoMenu(TN.session.roster)).ok;   // só o P1 pula
      if (this.t > 3.5 || (skip && this.t > 1)) {
        const s = TN.session;
        if (this.round.round < this.round.totalRounds) TN.go(new RoundIntro(this.round.round + 1));
        else TN.go(new ScoreScreen());
      }
    }
    draw(c) {
      this.round.draw(c);
      c.fillStyle = 'rgba(29,35,33,0.82)'; c.fillRect(0, 0, TN.W, TN.H);
      G.titulo(c, 'FIM DA TENTATIVA', TN.W / 2, 110, 42);
      const ps = this.round.players.slice().sort((a, b) => this.pts[b.id] - this.pts[a.id]);
      ps.forEach((p, i) => {
        const y = 190 + i * 64;
        G.detento(c, TN.W / 2 - 150, y, 18, p.color, { caido: !p.alive });
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, TN.W / 2 - 115, y, { size: 22, color: G.desbotar(p.color) });
        G.texto(c, `+${this.pts[p.id]} m`, TN.W / 2 + 170, y, { size: 28, color: G.CORES.destaque, align: 'right' });
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
      const skip = TN.input.menu(donoDoMenu(TN.session.roster)).ok;   // só o P1 pula
      if (this.t > 5 || (skip && this.t > 1.5)) nextGame();
    }
    draw(c) {
      const s = TN.session;
      G.parede(c);
      G.titulo(c, 'QUANTO CADA UM CAVOU', TN.W / 2, 48, 36);
      const k = U.clamp((this.t - 0.6) / 1.4, 0, 1), CHAO = 175, FUNDO = 440, n = s.roster.length;
      G.linha(c, 60, CHAO, TN.W - 60, CHAO, { lw: 2.5 });   // chão da cela; os túneis descem dele
      s.roster.forEach((p, i) => {
        const x = TN.W / 2 + (i - (n - 1) / 2) * 200, val = this.before[p.id] + s.gameScores[p.id] * k;
        const L = Math.max(6, (FUNDO - CHAO - 30) * (val / this.max)), cor = G.desbotar(p.color);
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, x, CHAO - 82, { size: 16, color: cor, align: 'center' });
        G.detento(c, x, CHAO - 34, 18, p.color);
        G.linha(c, x - 16, CHAO, x - 16, CHAO + L, { color: cor }); G.linha(c, x + 16, CHAO, x + 16, CHAO + L, { color: cor });
        for (let yy = CHAO + 10; yy < CHAO + L - 4; yy += 14) G.linha(c, x - 14, yy, x + 14, yy + 8, { color: cor, lw: 1, alpha: 0.5 });
        G.texto(c, `${Math.round(val)} m`, x, CHAO + L + 22, { size: 22, align: 'center' });
        G.texto(c, `+${s.gameScores[p.id]}`, x, CHAO + L + 46, { size: 16, color: G.CORES.destaque, align: 'center' });
      });
      rodape(c, s.index + 1 < s.playlist.length ? `Próxima: etapa ${s.index + 2}/${s.playlist.length}` : 'Plano completo! Hora de sair.');
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
      const m = TN.input.menu(donoDoMenu(TN.session.roster));
      navegar(this, m, 2);
      if (m.ok) {
        if (this.sel === 0) TN.go(new Setup(TN.session.roster)); else TN.go(Title);
      }
    }
    draw(c) {
      const s = TN.session;
      G.parede(c);
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]), w = sorted[0];
      G.titulo(c, 'O APITO TOCOU', TN.W / 2, 50, 40);
      G.texto(c, `P${w.id + 1} ${w.isBot ? '(BOT) ' : ''}FUGIU!`, TN.W / 2, 100, { size: 26, color: G.desbotar(w.color), align: 'center' });
      // o muro: o 1º desenhado do lado de fora, os outros dentro; o último vai para a solitária
      const MX = 600, CHAO = 400;
      G.linha(c, 40, CHAO, TN.W - 40, CHAO, { lw: 2.5 });
      G.retangulo(c, MX - 18, 150, 36, CHAO - 150, { lw: 2.5 });
      for (let y = 176; y < CHAO; y += 26) G.linha(c, MX - 18, y, MX + 18, y, { lw: 1, alpha: 0.6 });   // tijolos
      for (let x = MX - 30; x < MX + 30; x += 10) G.linha(c, x, 146, x + 8, 136, { lw: 1 });             // arame farpado
      G.texto(c, '1º', 780, CHAO - 110, { size: 26, color: G.CORES.destaque, align: 'center' });
      G.detento(c, 780, CHAO - 40 + Math.sin(this.t * 4) * 6, 26, w.color, { comemorando: true });
      G.texto(c, `${s.totals[w.id]} m · FUGIU`, 780, CHAO + 24, { size: 18, color: G.CORES.destaque, align: 'center' });
      const dentro = sorted.slice(1);
      dentro.forEach((p, i) => {
        const x = 130 + i * 150, ultimo = i === dentro.length - 1;
        G.texto(c, `${i + 2}º`, x, CHAO - 100, { size: 22, align: 'center' });
        G.detento(c, x, CHAO - (ultimo ? 14 : 40), 22, p.color, { caido: ultimo });
        if (ultimo) { G.linha(c, x - 24, CHAO - 66, x + 24, CHAO - 14, { color: G.CORES.perigo, lw: 3 }); G.linha(c, x + 24, CHAO - 66, x - 24, CHAO - 14, { color: G.CORES.perigo, lw: 3 }); }
        G.texto(c, `${s.totals[p.id]} m · ${ultimo ? 'SOLITÁRIA' : 'RECAPTURADO'}`, x, CHAO + 24, { size: 15, color: ultimo ? G.CORES.perigo : G.CORES.giz, align: 'center' });
      });
      menuGiz(c, ['TENTAR DE NOVO', 'VOLTAR PRA CELA'], this.sel, TN.W / 2, 465, this.t - (this.selAt || 0), { size: 20, gap: 32 });
      rodape(c, 'só o P1 mexe no menu');
    }
  }

  // ======================= ATALHOS POR URL (para testar rápido) =======================
  // index.html?game=<id>            → joga só esse minigame (P1 = teclado 1, resto bots)
  // index.html?game=<id>&humans=2   → P1 teclado 1, P2 teclado 2 (IJKL)
  // index.html?game=<id>&humans=0   → só bots (assistir)
  // ?cena=<Nome>: abre uma tela de menu direto, com uma sessão de mentira (4 detentos, 6 etapas, placar
  // inventado). Só para testes e screenshots (tools/menus.sh, tools/teste_menus.js); não muda o fluxo normal.
  const CENAS_DE_TESTE = ['Title', 'Controls', 'TestList', 'Lobby', 'Setup', 'Picker', 'Brief', 'Pause', 'RoundOver', 'ScoreScreen', 'Final', 'HostCreate', 'JoinList', 'NetMessage'];
  function cenaDeTeste(nome) {
    const roster = buildRoster([{ device: 'kb1' }, null, null, null], true);
    const ids = TN.minigameOrder.slice(0, 6);
    newSession(roster, ids.map((id) => ({ id, rounds: 3 })));
    const s = TN.session;
    s.index = Math.min(2, ids.length - 1);
    s.totals = { 0: 34, 1: 51, 2: 12, 3: 27 };
    s.gameScores = { 0: 8, 1: 5, 2: 0, 3: 3 };
    const N = TN.NetScenes;
    const abrir = (cena) => { TN.go(cena); return cena; };
    const semEnter = (cena) => { TN.scene = cena; cena.t = 0; return cena; };   // telas de rede: sem falar com o servidor
    switch (nome) {
      case 'Title': TN.session = null; return abrir(Title);
      case 'Controls': TN.session = null; return abrir(Controls);
      case 'TestList': TN.session = null; return abrir(new TestList());
      case 'Lobby': { TN.session = null; const l = abrir(new Lobby({})); l.slots[0] = { device: 'kb1', ready: false }; l.slots[1] = { device: 'kb2', ready: true }; return l; }
      case 'Setup': return abrir(new Setup(roster));
      case 'Picker': return abrir(new Picker());
      case 'Brief': return abrir(new Brief());
      case 'Pause': { const b = abrir(new Brief()); return abrir(new Pause(b)); }
      case 'RoundOver': return abrir(new RoundOver(new TN.Round(TN.minigames[ids[s.index]], roster, 1, 3)));
      case 'ScoreScreen': return abrir(new ScoreScreen());
      case 'Final': return abrir(new Final());
      case 'HostCreate': { const h = semEnter(new N.HostCreate()); h.msg = 'ERRO'; return h; }
      case 'JoinList': { TN.net.rooms = [{ room: 'ABCD', players: 2 }, { room: 'KXT9', players: 1 }]; TN.net.status = ''; return semEnter(new N.JoinList()); }
      case 'NetMessage': return abrir(new N.NetMessage('A SALA FECHOU', 'O host saiu da partida.\nVolte e entre em outra sala.'));
    }
    return null;
  }
  TN.cenaDeTeste = cenaDeTeste;
  TN.CENAS_DE_TESTE = CENAS_DE_TESTE;
  TN.bootScene = function () {
    const cena = params.get('cena');
    if (cena) { if (!cenaDeTeste(cena)) TN.go(Title); return; }
    const id = params.get('game');
    if (id && TN.minigames[id]) {
      const humans = Number(params.get('humans') ?? 1);
      const slots = [0, 1, 2, 3].map((i) => (i < humans && TN.input.KB_SCHEMES[i] ? { device: TN.input.KB_SCHEMES[i].id } : null));
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
