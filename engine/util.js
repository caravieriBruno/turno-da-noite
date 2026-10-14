// TURNO DA NOITE — utilidades compartilhadas.
// Tudo fica no namespace global `TN` (scripts clássicos, funciona abrindo o index.html direto, sem servidor).
window.TN = window.TN || {};

TN.W = 960;   // resolução virtual (o canvas é escalado para caber na janela)
TN.H = 540;

TN.PLAYER_COLORS = ['#ff4d5e', '#3fa9ff', '#46e27b', '#ffd23f'];
TN.PLAYER_NAMES = ['VERMELHO', 'AZUL', 'VERDE', 'AMARELO'];

TN.util = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), // inclusivo
  chance: (p) => Math.random() < p,
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
  dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
  angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  len: (x, y) => Math.hypot(x, y),
  norm(x, y) { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; },
  approach: (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target)),
  // círculo x círculo
  circles: (a, b, ra = a.r, rb = b.r) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (ra + rb) ** 2,
  // ponto dentro de retângulo {x,y,w,h}
  inRect: (px, py, r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h,
  // retângulo x retângulo
  rects: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,
  // círculo x retângulo
  circleRect(c, r, rad = c.r) {
    const nx = Math.max(r.x, Math.min(c.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(c.y, r.y + r.h));
    return (c.x - nx) ** 2 + (c.y - ny) ** 2 < rad * rad;
  },
  // empurra círculos para não se sobreporem (colisão simples entre jogadores)
  separate(list, minDist) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const md = minDist ?? (a.r + b.r);
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < md) {
          const push = (md - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }
  },
  // segmento de reta x círculo (útil para tiros/lasers)
  segCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / (dx * dx + dy * dy || 1)));
    const px = x1 + t * dx, py = y1 + t * dy;
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
  },
  formatTime(s) {
    s = Math.max(0, Math.ceil(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
};
