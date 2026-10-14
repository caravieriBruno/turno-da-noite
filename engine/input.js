// Entrada: 3 esquemas de teclado (o 1º inclui o mouse) + gamepads. Cada jogador é ligado a um "dispositivo".
// Estado por dispositivo: { x, y (−1..1), a, b (segurando), aPressed, bPressed (apertou neste frame) }
(function () {
  const KB_SCHEMES = [
    { id: 'kb1', label: 'WASD/SETAS · Ação: ESPAÇO/CLIQUE · Extra: SHIFT/G/BOTÃO DIR.',
      up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      a: ['Space', 'Mouse0'], b: ['ShiftLeft', 'ShiftRight', 'KeyG', 'Mouse2'] },
    { id: 'kb2', label: 'IJKL · Ação: U · Extra: O',
      up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], a: ['KeyU'], b: ['KeyO'] },
    { id: 'kb3', label: 'NUMPAD 8456 · Ação: NUM 0 · Extra: NUM .',
      up: ['Numpad8'], down: ['Numpad5'], left: ['Numpad4'], right: ['Numpad6'], a: ['Numpad0'], b: ['NumpadDecimal'] },
  ];

  const down = new Set();
  const pressedThisFrame = new Set();
  const blockKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', (e) => {
      if (blockKeys.has(e.code)) e.preventDefault();
      if (!down.has(e.code)) pressedThisFrame.add(e.code);
      down.add(e.code);
      TN.audio && TN.audio.unlock();
    });
    window.addEventListener('keyup', (e) => down.delete(e.code));
    window.addEventListener('blur', () => down.clear());
    // botões do mouse viram códigos "Mouse<botão>" (Mouse0 = esquerdo, Mouse2 = direito)
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (!down.has(code)) pressedThisFrame.add(code);
      down.add(code);
      TN.audio && TN.audio.unlock();
    });
    window.addEventListener('mouseup', (e) => down.delete('Mouse' + e.button));
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerdown', () => TN.audio && TN.audio.unlock());
  }

  const state = {};   // deviceId -> {x,y,a,b,aPressed,bPressed}
  const prev = {};
  // Dispositivos remotos (jogadores em rede): id "n<cliente>:<dispositivo>" -> { raw, latchA, latchB }
  // O "latch" garante que um toque rápido não se perca entre dois frames do host.
  const remote = {};
  const any = (codes) => codes.some((c) => down.has(c));

  function readKeyboard(s) {
    return {
      x: (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0),
      y: (any(s.down) ? 1 : 0) - (any(s.up) ? 1 : 0),
      a: any(s.a), b: any(s.b), start: false,
    };
  }

  function readGamepad(gp) {
    const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let x = dz(gp.axes[0] || 0), y = dz(gp.axes[1] || 0);
    if (btn(14)) x = -1; if (btn(15)) x = 1; if (btn(12)) y = -1; if (btn(13)) y = 1;
    return { x, y, a: btn(0) || btn(7), b: btn(1) || btn(2) || btn(6), start: btn(9) };
  }

  TN.input = {
    KB_SCHEMES,
    devices() {
      const list = KB_SCHEMES.map((s) => s.id);
      const pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
      for (const gp of pads) if (gp && gp.connected) list.push('gp' + gp.index);
      for (const id in remote) list.push(id);
      return list;
    },
    // Entrada vinda da rede (usado por engine/net.js no host)
    setRemote(id, raw) {
      const r = remote[id] || (remote[id] = { raw: {}, latchA: false, latchB: false, latchStart: false });
      r.raw = raw;
      if (raw.a) r.latchA = true;
      if (raw.b) r.latchB = true;
      if (raw.start) r.latchStart = true;
    },
    removeRemote(prefix) {
      for (const id in remote) if (id.startsWith(prefix)) { delete remote[id]; delete state[id]; delete prev[id]; }
    },
    deviceLabel(id) {
      if (!id) return 'BOT';
      if (id.startsWith('n')) {
        const [peer, dev] = id.slice(1).split(':');
        return 'REDE #' + peer + ' · ' + this.deviceLabel(dev).split(' · ')[0];
      }
      if (id.startsWith('gp')) return 'CONTROLE ' + (Number(id.slice(2)) + 1);
      const s = KB_SCHEMES.find((k) => k.id === id);
      return s ? s.label : id;
    },
    // chamado 1x por frame pelo loop principal
    update() {
      const pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
      const raw = {};
      for (const s of KB_SCHEMES) raw[s.id] = readKeyboard(s);
      for (const gp of pads) if (gp && gp.connected) raw['gp' + gp.index] = readGamepad(gp);
      for (const id in remote) {
        const r = remote[id];
        raw[id] = { x: Number(r.raw.x) || 0, y: Number(r.raw.y) || 0, a: !!r.raw.a || r.latchA, b: !!r.raw.b || r.latchB, start: !!r.raw.start || r.latchStart };
        r.latchA = r.latchB = r.latchStart = false;
      }
      for (const id in raw) {
        const r = raw[id], p = prev[id] || {};
        state[id] = { ...r, aPressed: r.a && !p.a, bPressed: r.b && !p.b, startPressed: r.start && !p.start,
          upPressed: r.y < -0.5 && !(p.y < -0.5), downPressed: r.y > 0.5 && !(p.y > 0.5),
          leftPressed: r.x < -0.5 && !(p.x < -0.5), rightPressed: r.x > 0.5 && !(p.x > 0.5) };
        prev[id] = r;
      }
      this._keysPressed = new Set(pressedThisFrame);
      pressedThisFrame.clear();
    },
    get(deviceId) {
      return state[deviceId] || { x: 0, y: 0, a: false, b: false, aPressed: false, bPressed: false };
    },
    keyPressed(code) { return !!(this._keysPressed && this._keysPressed.has(code)); },
    keyDown(code) { return down.has(code); },
    // Navegação de menus: junta todos os dispositivos
    menu() {
      const m = { up: false, down: false, left: false, right: false, ok: false, back: false, okDevice: null };
      for (const id in state) {
        const s = state[id];
        m.up ||= s.upPressed; m.down ||= s.downPressed; m.left ||= s.leftPressed; m.right ||= s.rightPressed;
        if (s.aPressed || s.startPressed) { m.ok = true; m.okDevice ||= id; }
        m.back ||= s.bPressed;
      }
      if (this.keyPressed('Escape') || this.keyPressed('Backspace')) m.back = true;
      return m;
    },
    // Para testes headless / bots
    _inject(id, s) { state[id] = s; },
  };
})();
