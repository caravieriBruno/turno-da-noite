#!/usr/bin/env node
// Servidor do Turno da Noite: arquivos estáticos + salas de REDE LOCAL via WebSocket (sem dependências).
// Uso: node tools/servidor.js [porta]        (padrão 8765)
// Os outros computadores/celulares da mesma rede abrem http://<IP-mostrado>:<porta>
//
// Protocolo (JSON em texto):
//   cliente→servidor  {t:'host', name}            → {t:'hosted', room, urls}
//                     {t:'list'}                  → {t:'rooms', rooms:[{room,name,players}]}
//                     {t:'join', room}            → {t:'joined', room, id}   (host recebe {t:'peer-join', id})
//   cliente→host      {t:'input', devices:{...}}  → host recebe {t:'input', from:id, devices}
//   host→clientes     {t:'state', ...}            → repassado sem alteração para todos da sala
//   saídas            host recebe {t:'peer-leave', id}; clientes recebem {t:'host-left'}
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8765;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|Loopback/i.test(name)) continue; // adaptadores virtuais
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  // redes locais primeiro (192.168.x, 10.x, 172.16-31.x); depois VPNs (ex.: Radmin 26.x, ZeroTier, Hamachi 25.x)
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : ip.startsWith('169.254.') ? 9 : 5);
  return out.sort((a, b) => rank(a) - rank(b));
}

// ---------------- HTTP (arquivos estáticos) ----------------
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((s) => s.startsWith('.'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

// ---------------- WebSocket mínimo (RFC 6455) ----------------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
let nextId = 1;

function wsSend(sock, text) {
  if (sock.destroyed) return;
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  sock.write(Buffer.concat([header, payload]));
}

server.on('upgrade', (req, sock) => {
  if (!req.url.startsWith('/ws')) return sock.destroy();
  const key = req.headers['sec-websocket-key'];
  if (!key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const client = { id: nextId++, sock, room: null, isHost: false };
  let buf = Buffer.alloc(0), frag = [];

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskOff = off; if (masked) off += 4;
      if (buf.length < off + len) return;
      let data = buf.subarray(off, off + len);
      if (masked) { const m = buf.subarray(maskOff, maskOff + 4); data = Buffer.from(data); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
      buf = buf.subarray(off + len);
      if (op === 0x8) { sock.end(); return; }
      if (op === 0x9) { sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); continue; }
      if (op === 0x1 || op === 0x0) {
        frag.push(data);
        if (fin) { const text = Buffer.concat(frag).toString('utf8'); frag = []; onMessage(client, text); }
      }
    }
  });
  sock.on('close', () => onClose(client));
  sock.on('error', () => onClose(client));
});

// ---------------- Salas ----------------
const rooms = new Map(); // code -> { code, name, host, peers: Map(id -> client) }
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do { c = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms.has(c));
  return c;
}

function onMessage(client, text) {
  // estado do host: repassa direto, sem parse (pode ser grande e frequente)
  if (client.isHost && text.startsWith('{"t":"state"')) {
    const room = rooms.get(client.room);
    if (room) for (const p of room.peers.values()) wsSend(p.sock, text);
    return;
  }
  let msg; try { msg = JSON.parse(text); } catch (e) { return; }
  if (msg.t === 'host') {
    leave(client);
    const code = newCode();
    rooms.set(code, { code, name: String(msg.name || 'Sala').slice(0, 24), host: client, peers: new Map() });
    client.room = code; client.isHost = true;
    wsSend(client.sock, JSON.stringify({ t: 'hosted', room: code, id: client.id, urls: lanAddresses().map((ip) => `http://${ip}:${PORT}`) }));
    console.log(`[sala ${code}] criada`);
  } else if (msg.t === 'list') {
    wsSend(client.sock, JSON.stringify({ t: 'rooms', rooms: [...rooms.values()].map((r) => ({ room: r.code, name: r.name, players: r.peers.size + 1 })) }));
  } else if (msg.t === 'join') {
    const room = rooms.get(String(msg.room || '').toUpperCase());
    if (!room) return wsSend(client.sock, JSON.stringify({ t: 'error', msg: 'Sala não encontrada' }));
    leave(client);
    room.peers.set(client.id, client); client.room = room.code;
    wsSend(client.sock, JSON.stringify({ t: 'joined', room: room.code, id: client.id, name: room.name }));
    wsSend(room.host.sock, JSON.stringify({ t: 'peer-join', id: client.id }));
    console.log(`[sala ${room.code}] cliente #${client.id} entrou`);
  } else if (msg.t === 'input' && client.room && !client.isHost) {
    const room = rooms.get(client.room);
    if (room) wsSend(room.host.sock, JSON.stringify({ t: 'input', from: client.id, devices: msg.devices }));
  } else if (msg.t === 'leave') {
    leave(client);
  }
}

function leave(client) {
  const room = client.room && rooms.get(client.room);
  if (!room) { client.room = null; return; }
  if (client.isHost) {
    for (const p of room.peers.values()) { wsSend(p.sock, JSON.stringify({ t: 'host-left' })); p.room = null; }
    rooms.delete(room.code);
    console.log(`[sala ${room.code}] fechada`);
  } else {
    room.peers.delete(client.id);
    wsSend(room.host.sock, JSON.stringify({ t: 'peer-leave', id: client.id }));
    console.log(`[sala ${room.code}] cliente #${client.id} saiu`);
  }
  client.room = null; client.isHost = false;
}
function onClose(client) { if (client.closed) return; client.closed = true; leave(client); }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  TURNO DA NOITE — servidor rodando\n`);
  console.log(`  Neste computador:   http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  Na rede local:      http://${ip}:${PORT}`);
  console.log(`\n  Para jogar em rede: um computador escolhe "CRIAR SALA EM REDE";`);
  console.log(`  os outros abrem o endereço da rede local e escolhem "ENTRAR EM SALA".\n`);
});
