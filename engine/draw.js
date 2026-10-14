// Helpers de desenho (Canvas 2D). Todos recebem `c` = CanvasRenderingContext2D.
(function () {
  const FONT = '"Courier New", ui-monospace, monospace';

  TN.draw = {
    FONT,
    // Personagem padrão: robô visto de cima. opts: { dir (rad), dead, label, scale, flash, hat }
    robot(c, x, y, r, color, opts = {}) {
      if (opts.scale) r *= opts.scale;
      const dir = opts.dir ?? 0;
      c.save();
      c.translate(x, y);
      // sombra
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.ellipse(0, r * 0.75, r * 0.95, r * 0.4, 0, 0, Math.PI * 2); c.fill();
      // corpo
      c.fillStyle = opts.dead ? '#555' : (opts.flash ? '#fff' : color);
      c.strokeStyle = '#111'; c.lineWidth = Math.max(2, r * 0.12);
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
      // antena
      c.strokeStyle = '#222'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -r); c.lineTo(0, -r * 1.45); c.stroke();
      c.fillStyle = opts.dead ? '#333' : '#fffa'; c.beginPath(); c.arc(0, -r * 1.5, r * 0.15, 0, Math.PI * 2); c.fill();
      // visor apontando para dir
      c.rotate(dir);
      c.fillStyle = '#111';
      c.beginPath(); c.roundRect(r * 0.15, -r * 0.45, r * 0.75, r * 0.9, r * 0.25); c.fill();
      if (opts.dead) {
        c.strokeStyle = '#f33'; c.lineWidth = 2;
        for (const oy of [-0.2, 0.2]) {
          c.beginPath(); c.moveTo(r * 0.4, (oy - 0.12) * r); c.lineTo(r * 0.64, (oy + 0.12) * r);
          c.moveTo(r * 0.64, (oy - 0.12) * r); c.lineTo(r * 0.4, (oy + 0.12) * r); c.stroke();
        }
      } else {
        c.fillStyle = '#7ff';
        c.fillRect(r * 0.45, -r * 0.3, r * 0.2, r * 0.18);
        c.fillRect(r * 0.45, r * 0.12, r * 0.2, r * 0.18);
      }
      c.restore();
      if (opts.label) this.text(c, opts.label, x, y - r * 2.1, { size: 12, color: opts.dead ? '#888' : color, align: 'center' });
    },
    // Robô visto de lado (para jogos de plataforma). facing: 1 ou -1
    robotSide(c, x, y, w, h, color, opts = {}) {
      const f = opts.facing ?? 1;
      c.save(); c.translate(x, y);
      c.fillStyle = opts.dead ? '#555' : (opts.flash ? '#fff' : color);
      c.strokeStyle = '#111'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(-w / 2, -h, w, h, w * 0.3); c.fill(); c.stroke();
      c.fillStyle = '#111'; c.fillRect(f > 0 ? 0 : -w * 0.45, -h * 0.8, w * 0.45, h * 0.25);
      if (!opts.dead) { c.fillStyle = '#7ff'; c.fillRect(f > 0 ? w * 0.18 : -w * 0.32, -h * 0.75, w * 0.12, h * 0.12); }
      c.strokeStyle = '#222'; c.beginPath(); c.moveTo(0, -h); c.lineTo(0, -h - 8); c.stroke();
      c.restore();
      if (opts.label) this.text(c, opts.label, x, y - h - 18, { size: 12, color, align: 'center' });
    },
    text(c, str, x, y, { size = 20, color = '#e8e8e8', align = 'left', baseline = 'middle', bold = true, shadow = true, maxWidth } = {}) {
      c.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
      c.textAlign = align; c.textBaseline = baseline;
      if (shadow) { c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillText(str, x + 2, y + 2, maxWidth); }
      c.fillStyle = color; c.fillText(str, x, y, maxWidth);
    },
    // texto com várias linhas ("\n")
    lines(c, str, x, y, opts = {}) {
      const size = opts.size || 20, lh = opts.lineHeight || size * 1.35;
      String(str).split('\n').forEach((ln, i) => this.text(c, ln, x, y + i * lh, opts));
    },
    panel(c, x, y, w, h, { fill = 'rgba(10,14,18,0.85)', stroke = '#2f4', lw = 2, radius = 6 } = {}) {
      c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = lw;
      c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill(); if (stroke) c.stroke();
    },
    bar(c, x, y, w, h, t, color = '#2f4', bg = '#222') {
      c.fillStyle = bg; c.fillRect(x, y, w, h);
      c.fillStyle = color; c.fillRect(x, y, w * TN.util.clamp(t, 0, 1), h);
      c.strokeStyle = '#000'; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    },
    // chão quadriculado industrial
    floor(c, x, y, w, h, { tile = 40, a = '#1b1f24', b = '#20252b' } = {}) {
      for (let ty = 0; ty < h; ty += tile) for (let tx = 0; tx < w; tx += tile) {
        c.fillStyle = ((tx + ty) / tile) % 2 === 0 ? a : b;
        c.fillRect(x + tx, y + ty, Math.min(tile, w - tx), Math.min(tile, h - ty));
      }
    },
    // faixa de perigo amarela/preta
    hazardStripes(c, x, y, w, h, s = 16) {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.fillStyle = '#111'; c.fillRect(x, y, w, h); c.fillStyle = '#f5c400';
      for (let i = -h; i < w + h; i += s * 2) {
        c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + s, y); c.lineTo(x + i + s - h, y + h); c.lineTo(x + i - h, y + h); c.fill();
      }
      c.restore();
    },
    // efeito de monitor CRT (linhas + vinheta) sobre a tela inteira
    crt(c, t = 0) {
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = (t * 30) % 3; y < TN.H; y += 3) c.fillRect(0, y, TN.W, 1);
      const g = c.createRadialGradient(TN.W / 2, TN.H / 2, TN.H * 0.35, TN.W / 2, TN.H / 2, TN.W * 0.65);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.65)');
      c.fillStyle = g; c.fillRect(0, 0, TN.W, TN.H);
      c.restore();
    },
  };
})();
