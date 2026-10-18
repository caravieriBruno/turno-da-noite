// REDE LOCAL — o host roda o jogo de verdade; os clientes só enviam entrada e desenham o estado recebido.
//
// Por que funciona com QUALQUER minigame sem código extra:
//  - Entrada: cada controle remoto vira um "dispositivo" (n<cliente>:<kb1|gp0...>) no TN.input do host,
//    então lobby, menus e minigames tratam jogador remoto igual a um teclado local.
//  - Tela: ~30x/s o host serializa a cena atual + sessão (incluindo g.data/p.data do minigame) e
//    os clientes recriam os objetos com os mesmos protótipos e chamam o mesmo draw().
//  - Sons tocados no host são repassados aos clientes.
// Regra para minigames: estado em g.data / p.data, só dados simples (veja docs/COMO_CRIAR_MINIGAME.md).
(function () {
  const D = TN.draw;

  // ===================== Serializador de grafo de objetos =====================
  // Suporta referências repetidas/cíclicas, protótipos registrados (cenas, Round), defs de minigame,
  // typed arrays, Map/Set e números não finitos. Funções são descartadas; objetos estranhos (canvas,
  // gradientes, elementos DOM) são descartados e anotados em TN.serial.dropped.
  const REG = {}; // nome -> classe (function) ou objeto-protótipo (cenas singleton como Title)
  TN.serial = {
    REG,
    register(name, ctorOrProto) { REG[name] = ctorOrProto; },
    dropped: [],
    encode(root) {
      const seen = new Map(); let n = 0;
      const dropped = this.dropped = [];
      const protoMap = new Map();
      for (const name in REG) protoMap.set(typeof REG[name] === 'function' ? REG[name].prototype : REG[name], name);
      const singletons = new Map();
      for (const name in REG) if (typeof REG[name] !== 'function') singletons.set(REG[name], name);
      function enc(v, key) {
        if (v === null) return null;
        const t = typeof v;
        if (t === 'number') return Number.isFinite(v) ? v : { $x: Number.isNaN(v) ? 'N' : v > 0 ? 'I' : '-I' };
        if (t === 'string' || t === 'boolean') return v;
        if (t !== 'object') return undefined;
        if (typeof v.id === 'string' && TN.minigames[v.id] === v) return { $d: v.id };
        if (seen.has(v)) return { $r: seen.get(v) };
        if (ArrayBuffer.isView(v)) return { $t: v.constructor.name, v: Array.from(v) };
        const id = n++; seen.set(v, id);
        if (Array.isArray(v)) return { $a: id, v: v.map((x) => { const e = enc(x); return e === undefined ? null : e; }) };
        if (v instanceof Map) return { $m: id, v: [...v].map(([k, x]) => [enc(k), enc(x)]) };
        if (v instanceof Set) return { $s: id, v: [...v].map((x) => enc(x)) };
        const proto = Object.getPrototypeOf(v);
        let cname = singletons.get(v) || protoMap.get(proto) || null;
        if (!cname && proto !== Object.prototype && proto !== null) { dropped.push(key + ':' + (proto.constructor && proto.constructor.name)); return undefined; }
        const out = { $o: id };
        if (cname) out.$c = cname;
        for (const k of Object.keys(v)) { const e = enc(v[k], k); if (e !== undefined) out[k] = e; }
        return out;
      }
      return enc(root, 'root');
    },
    decode(data) {
      const objs = [];
      function dec(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(dec);
        if ('$r' in v) return objs[v.$r];
        if ('$d' in v) return TN.minigames[v.$d];
        if ('$x' in v) return v.$x === 'N' ? NaN : v.$x === 'I' ? Infinity : -Infinity;
        if ('$t' in v) { const C = globalThis[v.$t]; return C ? C.from(v.v) : v.v; }
        if ('$a' in v) { const arr = []; objs[v.$a] = arr; for (const x of v.v) arr.push(dec(x)); return arr; }
        if ('$m' in v) { const m = new Map(); objs[v.$m] = m; for (const [k, x] of v.v) m.set(dec(k), dec(x)); return m; }
        if ('$s' in v) { const s = new Set(); objs[v.$s] = s; for (const x of v.v) s.add(dec(x)); return s; }
        const e = v.$c && REG[v.$c];
        const o = Object.create(e ? (typeof e === 'function' ? e.prototype : e) : Object.prototype);
        objs[v.$o] = o;
        for (const k in v) if (k !== '$o' && k !== '$c') o[k] = dec(v[k]);
        return o;
      }
      return dec(data);
    },
  };

  // ===================== Conexão =====================
  const net = TN.net = {
    mode: 'off',      // 'off' | 'host' | 'client'
    ws: null, room: null, urls: [], myId: null, peers: {}, roomName: '',
    nomesRemotos: {},   // host: 'n<cliente>:<dispositivo>' → nome salvo naquele computador (padrão da cela)
    status: '', sfx: [], frame: 0, lastStateAt: 0, bytes: 0,
    wsUrl() {
      const p = new URLSearchParams(location.search).get('servidor');
      if (p) return `ws://${p}/ws`;
      return location.protocol.startsWith('http') ? `ws://${location.host}/ws` : 'ws://localhost:8765/ws';
    },
    connect(onMessage) {
      return new Promise((resolve, reject) => {
        try { this.ws && this.ws.close(); } catch (e) { /* ok */ }
        let ws;
        try { ws = new WebSocket(this.wsUrl()); } catch (e) { reject(e); return; }
        this.ws = ws;
        const timer = setTimeout(() => { reject(new Error('tempo esgotado')); try { ws.close(); } catch (e) { /* ok */ } }, 4000);
        ws.onopen = () => { clearTimeout(timer); resolve(ws); };
        ws.onerror = () => { clearTimeout(timer); reject(new Error('sem conexão')); };
        ws.onmessage = (ev) => onMessage(ev.data);
        ws.onclose = () => { if (this.ws === ws) this._onClose(); };
      });
    },
    send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); },
    close() {
      this.send({ t: 'leave' });
      const ws = this.ws; this.ws = null;
      try { ws && ws.close(); } catch (e) { /* ok */ }
      for (const id in this.peers) TN.input.removeRemote('n' + id + ':');
      this.mode = 'off'; this.room = null; this.peers = {}; this.view = null;
    },
    _onClose() {
      const was = this.mode;
      this.mode = 'off'; this.ws = null; this.room = null;
      for (const id in this.peers) TN.input.removeRemote('n' + id + ':');
      this.peers = {};
      if (was === 'client') TN.go(new NetMessage('Conexão perdida.', 'O host saiu ou o servidor caiu.'));
    },

    // ---------- HOST ----------
    async host() {
      await this.connect((text) => this._hostMessage(JSON.parse(text)));
      return new Promise((resolve) => {
        this._onHosted = resolve;
        this.send({ t: 'host', name: 'Sala de ' + (navigator.platform || 'host') });
      });
    },
    _hostMessage(m) {
      if (m.t === 'hosted') { this.mode = 'host'; this.room = m.room; this.urls = m.urls || []; this.myId = m.id; this._onHosted && this._onHosted(); }
      else if (m.t === 'peer-join') { this.peers[m.id] = { id: m.id }; TN.audio.play('select'); this.toast(`Jogador da rede #${m.id} conectou`); }
      else if (m.t === 'peer-leave') { delete this.peers[m.id]; this._dropPeer(m.id); this.toast(`Jogador da rede #${m.id} saiu (virou BOT)`); }
      else if (m.t === 'input') { for (const dev in m.devices || {}) TN.input.setRemote(`n${m.from}:${dev}`, m.devices[dev] || {}); }
      else if (m.t === 'nomes') { for (const dev in m.nomes || {}) { const nome = TN._internal.limparNome(m.nomes[dev]); if (nome) this.nomesRemotos[`n${m.from}:${dev}`] = nome; } }
    },
    _dropPeer(id) {
      const pref = 'n' + id + ':';
      TN.input.removeRemote(pref);
      for (const k in this.nomesRemotos) if (k.startsWith(pref)) delete this.nomesRemotos[k];
      const toBot = (list) => { for (const r of list || []) if (r.device && String(r.device).startsWith(pref)) { r.isBot = true; r.device = null; } };
      if (TN.session) toBot(TN.session.roster);
      let sc = TN.scene;
      while (sc) { if (sc.round) toBot(sc.round.players); if (sc.slots) sc.slots.forEach((s, i) => { if (s && String(s.device).startsWith(pref)) sc.slots[i] = null; }); sc = sc.under; }
    },
    // chamado a cada passo de simulação (60 Hz) pelo loop principal
    tick() {
      if (this.mode !== 'host' || !Object.keys(this.peers).length) { this.sfx.length = 0; return; }
      if (++this.frame % 2) return; // 30 envios por segundo
      const toast = this._toast && performance.now() < this._toast.until ? this._toast.text : null;
      const d = TN.serial.encode({ scene: TN.scene, session: TN.session, settings: TN.settings, toast });
      const text = '{"t":"state","d":' + JSON.stringify(d) + ',"s":' + JSON.stringify(this.sfx) + '}';
      this.sfx = [];
      this.bytes = text.length;
      this.send(text);
    },

    // ---------- CLIENTE ----------
    async list() {
      await this.connect((text) => this._clientMessage(JSON.parse(text)));
      this.send({ t: 'list' });
    },
    join(room) { this.send({ t: 'join', room }); },
    _clientMessage(m) {
      if (m.t === 'rooms') { this.rooms = m.rooms; }
      else if (m.t === 'joined') {
        this.mode = 'client'; this.room = m.room; this.myId = m.id; this.roomName = m.name; this.view = null; TN.audio.play('confirm');
        this.send({ t: 'nomes', nomes: (TN._internal && TN._internal.nomesSalvos && TN._internal.nomesSalvos()) || {} });   // os nomes salvos aqui viram o padrão das minhas celas no host
        TN.go(new ClientView());
      }
      else if (m.t === 'error') { this.status = m.msg; TN.audio.play('back'); }
      else if (m.t === 'host-left') { this.mode = 'off'; TN.go(new NetMessage('O host fechou a sala.', '')); }
      else if (m.t === 'state') {
        try {
          const st = TN.serial.decode(m.d);
          TN.session = st.session; TN.settings = st.settings || TN.settings;
          this.view = st.scene; this.remoteToast = st.toast;
          this.lastStateAt = performance.now();
          for (const s of m.s || []) Array.isArray(s) ? playRaw.beep(...s) : typeof s === 'object' ? playRaw.play(s.n, { ganho: s.g }) : playRaw.play(s);
        } catch (e) { console.error('estado inválido', e); }
      }
    },
    // dispositivos locais que este cliente já usou → enviados ao host
    _touched: new Set(), _lastSent: '', _lastSentAt: 0,
    sendInput() {
      const devices = {};
      for (const id of TN.input.devices()) {
        const s = TN.input.get(id);
        if (s.x || s.y || s.a || s.b || s.start) this._touched.add(id);
        if (this._touched.has(id)) devices[id] = { x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100, a: s.a ? 1 : 0, b: s.b ? 1 : 0, start: s.start ? 1 : 0 };
      }
      const text = JSON.stringify(devices), now = performance.now();
      if (text !== this._lastSent || now - this._lastSentAt > 250) { this.send({ t: 'input', devices }); this._lastSent = text; this._lastSentAt = now; }
    },

    // ---------- avisos ----------
    _toast: null,
    toast(text) { this._toast = { text, until: performance.now() + 3000 }; },
    drawToast(c) {
      // no cliente o host só envia o texto enquanto o aviso está ativo (relógios diferentes)
      const text = this.mode === 'client' ? this.remoteToast : (this._toast && performance.now() < this._toast.until ? this._toast.text : null);
      if (!text) return;
      D.panel(c, TN.W / 2 - 220, TN.H - 92, 440, 30, { stroke: '#3f6' });
      D.text(c, text, TN.W / 2, TN.H - 77, { size: 14, color: '#cfe', align: 'center' });
    },
  };

  // sons tocados no host também vão para os clientes
  const playRaw = { play: TN.audio.play.bind(TN.audio), beep: TN.audio.beep.bind(TN.audio) };
  TN.audio.play = function (name, opts) {
    if (net.mode === 'host') {
      const g = opts && opts.ganho;
      if (g !== undefined && g !== 1) { if (net.sfx.length < 20) net.sfx.push({ n: name, g: Math.round(g * 100) / 100 }); }   // som com volume: { n, g }
      else if (!net.sfx.includes(name)) net.sfx.push(name);
    }
    return playRaw.play(name, opts);
  };
  TN.audio.beep = function (...a) { if (net.mode === 'host' && net.sfx.length < 20) net.sfx.push(a); return playRaw.beep(...a); };

  // ===================== Telas =====================
  const G = TN.giz;

  class NetMessage {
    constructor(title, sub) { this.title = title; this.sub = sub; }
    update() { const m = TN.input.menu(TN.donoDoMenu()); if ((m.ok || m.back) && this.t > 0.5) TN.go(TN.TitleScene); }
    draw(c) {
      G.parede(c);
      G.titulo(c, this.title, TN.W / 2, 210, 30, G.CORES.perigo);
      G.linhas(c, this.sub, TN.W / 2, 275, { size: 16, align: 'center' });
      G.texto(c, 'Aperte AÇÃO para voltar', TN.W / 2, 400, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
    }

  }

  // HOST: cria a sala e vai para o lobby
  class HostCreate {
    enter() {
      this.msg = 'Criando sala…';
      net.host().then(() => TN.go(new TN.LobbyScene({})))
        .catch(() => { this.msg = 'ERRO'; });
    }
    update() { if (this.msg === 'ERRO' && TN.input.menu(TN.donoDoMenu()).back || TN.input.keyPressed('Escape')) { net.close(); TN.go(TN.TitleScene); } if (this.msg === 'ERRO' && TN.input.menu(TN.donoDoMenu()).ok) TN.go(TN.TitleScene); }
    draw(c) {
      G.parede(c);
      if (this.msg !== 'ERRO') { G.texto(c, this.msg, TN.W / 2, 250, { size: 26, color: G.CORES.destaque, align: 'center' }); return; }
      G.titulo(c, 'Não consegui falar com o servidor de rede.', TN.W / 2, 160, 24, G.CORES.perigo);
      G.bilhete(c, 150, 210, 660, 130, { rot: -0.005 });
      G.linhas(c, 'Para jogar em rede local, inicie o servidor neste computador:\n\n    node tools/servidor.js        (ou dê dois cliques em JOGAR_EM_REDE)\n\ne abra o jogo pelo endereço que ele mostrar (http://localhost:8765).', TN.W / 2, 240, { size: 15, color: G.CORES.lapis, papel: true, align: 'center' });
      G.texto(c, 'AÇÃO ou ESC para voltar', TN.W / 2, 420, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
    }

  }

  // CLIENTE: lista as salas do servidor e entra
  class JoinList {
    constructor({ auto = null } = {}) { this.sel = 0; this.err = false; this.refresh = 0; this.auto = auto; }
    enter() { net.rooms = null; net.status = ''; net.list().catch(() => { this.err = true; }); }
    update(dt) {
      const m = TN.input.menu(TN.donoDoMenu());
      if (m.back || TN.input.keyPressed('Escape')) { net.close(); TN.go(TN.TitleScene); return; }
      if (this.err) { if (m.ok) TN.go(TN.TitleScene); return; }
      this.refresh -= dt;
      if (this.refresh <= 0) { this.refresh = 2; net.send({ t: 'list' }); }
      const rooms = net.rooms || [];
      if (this.auto && rooms.length) {
        const r = this.auto === '*' ? rooms[0] : rooms.find((x) => x.room === this.auto);
        if (r) { this.auto = null; net.join(r.room); }
      }
      if (m.up) this.sel = Math.max(0, this.sel - 1);
      if (m.down) this.sel = Math.min(rooms.length - 1, this.sel + 1);
      if (m.ok && rooms[this.sel]) { TN.audio.play('select'); net.join(rooms[this.sel].room); }
    }
    draw(c) {
      G.parede(c);
      G.titulo(c, 'ENTRAR NO PLANO (REDE LOCAL)', TN.W / 2, 56, 30);
      if (this.err) {
        G.linhas(c, 'Não foi possível conectar ao servidor.\n\nAbra o jogo pelo endereço que o HOST mostrou\n(ex.: http://192.168.0.10:8765) e tente de novo.', TN.W / 2, 200, { size: 18, color: G.CORES.perigo, align: 'center' });
      } else {
        const rooms = net.rooms;
        if (!rooms) G.texto(c, 'Procurando salas…', TN.W / 2, 200, { size: 20, align: 'center' });
        else if (!rooms.length) G.linhas(c, 'Nenhuma sala aberta neste servidor.\nNo computador do host: menu → CHAMAR COMPARSAS.', TN.W / 2, 200, { size: 18, align: 'center' });
        else rooms.forEach((r, i) => {
          const on = i === this.sel, y = 158 + i * 70;
          G.retangulo(c, TN.W / 2 - 260, y - 28, 520, 56, { color: on ? G.CORES.destaque : G.CORES.apagadoForte, lw: on ? 2.5 : 1.5 });
          G.texto(c, `SALA ${r.room}`, TN.W / 2 - 240, y, { size: 24, color: on ? G.CORES.destaque : G.CORES.giz });
          G.texto(c, `${r.players} conectado(s)`, TN.W / 2 + 240, y, { size: 16, color: G.CORES.apagadoForte, align: 'right' });
        });
        if (net.status) G.texto(c, net.status, TN.W / 2, 450, { size: 16, color: G.CORES.perigo, align: 'center' });
      }
      G.texto(c, 'AÇÃO entra · ESC volta · depois de entrar, aperte AÇÃO no lobby para escolher a cela', TN.W / 2, TN.H - 20, { size: 13, color: G.CORES.apagadoForte, align: 'center' });
    }

  }

  // CLIENTE: mostra a tela do host e envia a entrada local
  class ClientView {
    constructor() { this.escAt = -10; this._salvos = {}; }
    update() {
      net.sendInput();
      // o nome confirmado nas minhas celas fica salvo neste computador (na próxima partida já vem preenchido)
      const pref = 'n' + net.myId + ':';
      for (const s of (net.view && net.view.slots) || []) {
        if (!s || !String(s.device).startsWith(pref) || s.editando || !s.nome) continue;
        const dev = String(s.device).slice(pref.length);
        if (this._salvos[dev] !== s.nome) { this._salvos[dev] = s.nome; TN._internal.salvarNome(dev, s.nome); }
      }
      if (TN.input.keyPressed('Escape')) {
        if (this.t - this.escAt < 2) { net.close(); TN.go(TN.TitleScene); return; }
        this.escAt = this.t;
      }
    }
    draw(c) {
      const v = net.view;
      if (!v) { G.parede(c); D.text(c, `Conectado à sala ${net.room}. Aguardando o host…`, TN.W / 2, 250, { size: 20, color: '#3f6', align: 'center' }); return; }
      try { v.draw(c); } catch (e) { G.parede(c); D.text(c, 'Erro ao desenhar: ' + e.message, 20, 250, { size: 14, color: '#f55' }); }
      // quem sou eu?
      const pref = 'n' + net.myId + ':';
      const mine = [];
      const roster = (v.slots ? v.slots.map((s, i) => s && { id: i, device: s.device, name: s.nome }) : (TN.session && TN.session.roster)) || [];
      for (const r of roster) if (r && r.device && String(r.device).startsWith(pref)) mine.push(r);
      const lag = performance.now() - net.lastStateAt;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, TN.H - 22, 330, 22);
      D.text(c, `REDE · SALA ${net.room}` + (mine.length ? ` · VOCÊ: ${mine.map((r) => r.name || 'CELA ' + (r.id + 1)).join(', ')}` : ' · aperte AÇÃO no lobby'), 8, TN.H - 11, { size: 12, color: mine.length ? TN.PLAYER_COLORS[mine[0].id] : '#cdd', maxWidth: 320 });
      if (lag > 1500) D.text(c, 'sem sinal do host…', TN.W - 10, TN.H - 11, { size: 12, color: '#f55', align: 'right' });
      if (this.t - this.escAt < 2) D.text(c, 'ESC de novo para sair da sala', TN.W / 2, TN.H / 2, { size: 22, color: '#ff0', align: 'center' });
      net.drawToast(c);
    }
  }

  TN.NetScenes = { HostCreate, JoinList, ClientView, NetMessage };

  // protótipos que o cliente precisa recriar
  for (const name in TN.sceneClasses || {}) TN.serial.register(name, TN.sceneClasses[name]);
  TN.serial.register('Round', TN.Round);
  TN.serial.register('NetMessage', NetMessage);
  TN.serial.register('HostCreate', HostCreate);
})();
