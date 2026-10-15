#!/usr/bin/env node
// Gera assets/detento.glb a partir do UAL1_Standard.glb da Quaternius (CC0; origem em assets/LICENCAS.md).
// Fica só o que o motor usa: a malha do corpo (sem as bolinhas das juntas e sem UV, porque a textura é
// triplanar), os clipes de CLIPES e nenhuma trilha dos dedos. O buffer é reconstruído só com o que sobrou.
// Uso: node tools/preparar_detento.js <caminho/UAL1_Standard.glb> [saida=assets/detento.glb]
const fs = require('fs');
const path = require('path');

// pose do motor → clipe: ver POSE_CLIPE em engine/detento.js
const CLIPES = ['Idle_Loop', 'Jog_Fwd_Loop', 'Death01', 'Sitting_Idle_Loop', 'Crouch_Idle_Loop', 'Jump_Loop', 'Push_Loop', 'Pistol_Idle_Loop'];
const DEDO = /^(index|middle|pinky|ring|thumb)_|_leaf_/;
const GLTF = 0x46546c67, JSON_ = 0x4e4f534a, BIN = 0x004e4942;

function lerGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== GLTF) throw new Error('não é um arquivo GLB');
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl, bl = buf.readUInt32LE(bo);
  return { json, bin: buf.slice(bo + 8, bo + 8 + bl) };
}

function escreverGlb(json, bin) {
  const alinhar = (b, byte) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, byte)]);
  const jb = alinhar(Buffer.from(JSON.stringify(json)), 0x20), bb = alinhar(bin, 0);
  const pedaco = (len, tipo) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.writeUInt32LE(tipo, 4); return c; };
  const cab = Buffer.alloc(12);
  cab.writeUInt32LE(GLTF, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  return Buffer.concat([cab, pedaco(jb.length, JSON_), jb, pedaco(bb.length, BIN), bb]);
}

function preparar(buf) {
  const { json: j, bin } = lerGlb(buf);
  const malha = j.meshes[0];
  const prim = malha.primitives.find((p) => j.materials[p.material].name === 'M_Main');
  if (!prim) throw new Error('primitiva com o material M_Main não encontrada');
  for (const k of Object.keys(prim.attributes)) if (k.startsWith('TEXCOORD')) delete prim.attributes[k];
  j.materials = [j.materials[prim.material]];
  prim.material = 0;
  malha.primitives = [prim];
  const faltam = CLIPES.filter((n) => !j.animations.some((a) => a.name === n));
  if (faltam.length) throw new Error('clipes ausentes no GLB: ' + faltam.join(', '));
  j.animations = CLIPES.map((nome) => {
    const a = j.animations.find((x) => x.name === nome), channels = [], samplers = [];
    for (const ch of a.channels) {
      if (DEDO.test(j.nodes[ch.target.node].name || '')) continue;
      samplers.push(a.samplers[ch.sampler]);
      channels.push({ sampler: samplers.length - 1, target: ch.target });
    }
    return { name: nome, channels, samplers };
  });
  // buffer novo só com os accessors usados (no GLB da Quaternius cada accessor tem o seu bufferView)
  const novoIndice = new Map(), accessors = [], bufferViews = [], partes = [];
  let deslocamento = 0;
  const copiar = (i) => {
    if (novoIndice.has(i)) return novoIndice.get(i);
    const a = { ...j.accessors[i] }, v = j.bufferViews[a.bufferView], ini = v.byteOffset || 0;
    const dados = bin.slice(ini, ini + v.byteLength), sobra = (4 - (dados.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: deslocamento, byteLength: v.byteLength, ...(v.target ? { target: v.target } : {}) });
    partes.push(dados, Buffer.alloc(sobra));
    deslocamento += dados.length + sobra;
    a.bufferView = bufferViews.length - 1;
    accessors.push(a);
    novoIndice.set(i, accessors.length - 1);
    return accessors.length - 1;
  };
  for (const k of Object.keys(prim.attributes)) prim.attributes[k] = copiar(prim.attributes[k]);
  prim.indices = copiar(prim.indices);
  for (const s of j.skins) s.inverseBindMatrices = copiar(s.inverseBindMatrices);
  for (const a of j.animations) for (const s of a.samplers) { s.input = copiar(s.input); s.output = copiar(s.output); }
  j.accessors = accessors;
  j.bufferViews = bufferViews;
  j.buffers = [{ byteLength: deslocamento }];
  return escreverGlb(j, Buffer.concat(partes));
}

module.exports = { preparar, lerGlb, CLIPES };

if (require.main === module) {
  const [entrada, saida = path.join(__dirname, '..', 'assets', 'detento.glb')] = process.argv.slice(2);
  if (!entrada) { console.error('Uso: node tools/preparar_detento.js <UAL1_Standard.glb> [saida.glb]'); process.exit(1); }
  const out = preparar(fs.readFileSync(entrada)), j = lerGlb(out).json;
  fs.writeFileSync(saida, out);
  const tris = j.accessors[j.meshes[0].primitives[0].indices].count / 3;
  console.log(`salvo em ${saida}: ${(out.length / 1024).toFixed(0)} KB, ${tris} triângulos, clipes: ${CLIPES.join(', ')}`);
}
