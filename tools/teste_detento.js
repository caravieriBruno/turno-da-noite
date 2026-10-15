#!/usr/bin/env node
// Testa o personagem glTF sem navegador: o asset preparado (tamanho, clipes, sem dedos), os loaders
// convertidos para script clássico e o engine/detento.js (altura, frente, poses, pele, morte, no lugar).
// Uso: node tools/teste_detento.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };
const existe = (rel) => fs.existsSync(path.join(ROOT, rel));
const DEDO = /^(index|middle|pinky|ring|thumb)_|_leaf_/;

// --- 1. asset preparado e embutido ---
function secaoAsset() {
  if (!existe('assets/detento.glb') || !existe('assets/detento.glb.js')) { ok(false, 'assets/detento.glb e assets/detento.glb.js existem'); return; }
  const { preparar, lerGlb, CLIPES } = require(path.join(ROOT, 'tools/preparar_detento.js'));
  const { embutir, LIMITE } = require(path.join(ROOT, 'tools/embutir_asset.js'));
  const glb = fs.readFileSync(path.join(ROOT, 'assets/detento.glb')), j = lerGlb(glb).json;
  const prims = j.meshes.flatMap((m) => m.primitives);
  ok(prims.length === 1 && !Object.keys(prims[0].attributes).some((k) => k.startsWith('TEXCOORD')), 'asset: uma só malha (o corpo), sem UV');
  const tris = j.accessors[prims[0].indices].count / 3;
  ok(tris <= 6000, `asset: ${tris} triângulos (orçamento 6000)`);
  ok(JSON.stringify(j.animations.map((a) => a.name)) === JSON.stringify(CLIPES), 'asset: só os clipes usados, nesta ordem: ' + CLIPES.join(', '));
  ok(!j.animations.some((a) => a.channels.some((c) => DEDO.test(j.nodes[c.target.node].name || ''))), 'asset: sem trilhas dos dedos');
  ok(Buffer.compare(preparar(glb), glb) === 0, 'preparar_detento é idempotente (rodar no asset pronto dá o mesmo arquivo)');
  const js = fs.readFileSync(path.join(ROOT, 'assets/detento.glb.js'), 'utf8');
  ok(js.length <= LIMITE + 400, `asset embutido: ${(js.length / 1048576).toFixed(2)} MB (limite 1,5 MB)`);
  ok(js === embutir('detento', glb), 'assets/detento.glb.js está em dia com assets/detento.glb');
  let erro = ''; try { embutir('grande', Buffer.alloc(1200 * 1024)); } catch (e) { erro = e.message; }
  ok(erro.includes('1,5 MB'), 'embutir_asset recusa asset acima do orçamento');
}

// SEÇÕES EXTRAS (as tarefas seguintes acrescentam funções aqui)
// --- 2. loaders do three r158 convertidos para script clássico ---
function carregarThree() {
  if (global.THREE && THREE.GLTFLoader) return true;
  const aviso = console.warn; console.warn = () => {};   // o three.min.js avisa que está obsoleto
  global.THREE = require(path.join(ROOT, 'vendor/three.min.js'));
  console.warn = aviso;
  for (const f of ['vendor/GLTFLoader.js', 'vendor/SkeletonUtils.js']) {
    if (!existe(f)) { ok(false, f + ' existe'); return false; }
    vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  }
  return true;
}
const abrirGlb = (buf) => new Promise((res, rej) => new THREE.GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '', res, rej));
async function secaoLoaders() {
  for (const f of ['vendor/GLTFLoader.js', 'vendor/SkeletonUtils.js']) {
    const src = existe(f) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '';
    ok(src !== '' && !/^\s*(import|export)\b/m.test(src), f + ': script clássico (sem import/export, abre via file://)');
  }
  if (!carregarThree()) return;
  ok(typeof THREE.GLTFLoader === 'function' && typeof THREE.SkeletonUtils.clone === 'function', 'THREE.GLTFLoader e THREE.SkeletonUtils.clone existem');
  const gltf = await abrirGlb(fs.readFileSync(path.join(ROOT, 'assets/detento.glb'))).catch((e) => ({ erro: e }));
  ok(!gltf.erro && gltf.animations.length === 8, 'GLTFLoader abre o asset no Node com os 8 clipes' + (gltf.erro ? ` (${gltf.erro.message})` : ''));
  let malha = null;
  if (!gltf.erro) gltf.scene.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  ok(!!malha && malha.skeleton.bones.length === 65, 'malha com esqueleto de 65 ossos');
}

(async () => {
  secaoAsset();
  await secaoLoaders();
  // CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
