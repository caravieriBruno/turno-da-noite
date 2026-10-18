// Áudio sintetizado com WebAudio (sem arquivos). Use TN.audio.play('nome').
// Sons: blip, select, confirm, back, tick, go, hit, boom, pickup, coin, jump, shoot, laser, hurt, win, lose, whoosh, buzz, cough, step, latido
(function () {
  let ctx = null, master = null;
  const enabled = typeof window.AudioContext !== 'undefined' || typeof window.webkitAudioContext !== 'undefined';
  let lastPlay = {};

  function tone({ type = 'square', f = 440, f2 = null, dur = 0.1, vol = 0.2, delay = 0, attack = 0.005 }) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise({ dur = 0.2, vol = 0.3, delay = 0, filter = 1200, f2 = null }) {
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(filter, t);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t);
    src.connect(flt).connect(g).connect(master); src.start(t);
  }

  const SOUNDS = {
    blip: () => tone({ f: 660, dur: 0.05, vol: 0.08 }),
    select: () => tone({ f: 520, f2: 780, dur: 0.07, vol: 0.1 }),
    confirm: () => { tone({ f: 523, dur: 0.08, vol: 0.12 }); tone({ f: 784, dur: 0.12, vol: 0.12, delay: 0.07 }); },
    back: () => tone({ f: 400, f2: 220, dur: 0.1, vol: 0.1 }),
    tick: () => tone({ type: 'triangle', f: 880, dur: 0.12, vol: 0.2 }),
    go: () => { tone({ type: 'sawtooth', f: 440, f2: 880, dur: 0.35, vol: 0.18 }); },
    hit: () => { noise({ dur: 0.12, vol: 0.35, filter: 2500 }); tone({ f: 180, f2: 60, dur: 0.12, vol: 0.2 }); },
    boom: () => { noise({ dur: 0.7, vol: 0.6, filter: 900, f2: 80 }); tone({ type: 'sine', f: 90, f2: 30, dur: 0.5, vol: 0.4 }); },
    pickup: () => { tone({ f: 660, dur: 0.06, vol: 0.12 }); tone({ f: 990, dur: 0.08, vol: 0.12, delay: 0.05 }); },
    coin: () => { tone({ f: 988, dur: 0.06, vol: 0.12 }); tone({ f: 1319, dur: 0.15, vol: 0.12, delay: 0.06 }); },
    jump: () => tone({ f: 300, f2: 700, dur: 0.12, vol: 0.12 }),
    shoot: () => { noise({ dur: 0.15, vol: 0.4, filter: 4000, f2: 300 }); },
    laser: () => tone({ type: 'sawtooth', f: 1400, f2: 200, dur: 0.15, vol: 0.1 }),
    hurt: () => tone({ type: 'sawtooth', f: 300, f2: 90, dur: 0.25, vol: 0.18 }),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.18, vol: 0.13, delay: i * 0.11 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.25, vol: 0.15, delay: i * 0.18 })),
    whoosh: () => noise({ dur: 0.3, vol: 0.2, filter: 400, f2: 3000 }),
    buzz: () => tone({ type: 'sawtooth', f: 110, dur: 0.3, vol: 0.15 }),
    cough: () => { noise({ dur: 0.12, vol: 0.4, filter: 700 }); noise({ dur: 0.15, vol: 0.35, filter: 600, delay: 0.16 }); },
    step: () => noise({ dur: 0.04, vol: 0.08, filter: 600 }),
    latido: () => { tone({ type: 'sawtooth', f: 420, f2: 180, dur: 0.09, vol: 0.28 }); noise({ dur: 0.08, vol: 0.18, filter: 900, delay: 0.02 }); },
  };

  TN.audio = {
    muted: false,
    unlock() {
      if (!enabled || ctx) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    },
    play(name, { throttle = 0.04 } = {}) {
      if (!ctx || this.muted || !SOUNDS[name]) return;
      const now = ctx.currentTime;
      if (lastPlay[name] && now - lastPlay[name] < throttle) return;  // evita estourar com muitos sons iguais
      lastPlay[name] = now;
      try { SOUNDS[name](); } catch (e) { /* ignora */ }
    },
    // som livre: TN.audio.beep(freq, duração, tipo)
    beep(f = 440, dur = 0.1, type = 'square', vol = 0.12) { if (ctx && !this.muted) tone({ f, dur, type, vol }); },
    toggleMute() { this.muted = !this.muted; return this.muted; },
  };
})();
