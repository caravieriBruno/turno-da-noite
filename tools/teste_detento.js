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

// --- 3. engine/detento.js ---
async function secaoDetento() {
  if (!carregarThree()) return;
  if (!existe('engine/detento.js')) { ok(false, 'engine/detento.js existe'); return; }
  global.window = global;
  global.localStorage = global.localStorage || { getItem: () => null, setItem() {} };
  for (const f of ['engine/util.js', 'assets/detento.glb.js', 'engine/detento.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
  const D = TN.Detento;
  const mats = () => ({ suit: new THREE.MeshStandardMaterial(), skin: new THREE.MeshStandardMaterial(), placa: new THREE.MeshStandardMaterial(), coleira: new THREE.MeshStandardMaterial(), luz: new THREE.MeshBasicMaterial(), olho: new THREE.MeshBasicMaterial() });
  const m = await D.carregar(TN.ASSETS.detento);
  const a = D.criar(m, mats());
  const W = (inst, n) => inst.root.getObjectByName(n).getWorldPosition(new THREE.Vector3());
  a.pose('idle'); a.avancar(0.3); a.root.updateMatrixWorld(true);
  const caixa = new THREE.Box3().setFromObject(a.root, true), alt = caixa.max.y - caixa.min.y;
  ok(Math.abs(alt - D.ALTURA) < 6, `altura ~${D.ALTURA} (deu ${alt.toFixed(1)})`);
  ok(Math.abs(caixa.min.y) < 3, `pés no chão (y mínimo ${caixa.min.y.toFixed(1)})`);
  const frente = W(a, 'ball_l').sub(W(a, 'foot_l')).add(W(a, 'ball_r').sub(W(a, 'foot_r')));   // média dos dois pés
  frente.y = 0; frente.normalize();
  ok(frente.x > 0.9, `olha para +X, como o boneco de caixas (frente ${frente.x.toFixed(2)}, ${frente.z.toFixed(2)})`);
  const geo = a.root.getObjectByProperty('isSkinnedMesh', true).geometry;
  ok(geo.groups.length === 2 && geo.groups[1].count > 0 && geo.groups[0].count > geo.groups[1].count, 'malha dividida em uniforme (grupo 0, maior) e pele (grupo 1: cabeça, pescoço e mãos)');
  ok(a.luz.parent && a.luz.parent.name === 'neck_01' && a.placa.parent && a.placa.parent.name === 'spine_03', 'coleira com luz presa ao pescoço e placa de prontuário presa ao tronco');
  for (const [pose, clipe] of Object.entries(D.POSE_CLIPE)) { a.pose(pose); ok(a.atual === clipe, `pose ${pose} → ${clipe}`); }
  a.pose('xyz'); ok(a.atual === 'Idle_Loop', 'pose desconhecida → Idle_Loop');
  // a morte toca uma vez e para no último quadro; voltar para idle (mesma vaga do pool) reinicia o loop
  a.pose('dead'); a.avancar(5);
  ok(Math.abs(a.acao.time - m.clipes.get('Death01').duration) < 0.05, 'morte toca uma vez e fica no último quadro');
  a.pose('idle'); a.avancar(0.2);
  ok(a.atual === 'Idle_Loop' && a.acao.isRunning(), 'depois da morte, idle volta a animar');
  // deitar (lie) usa a animação da morte mais rápida: num jogo de reflexo o boneco precisa estar no chão logo
  a.pose('idle'); a.avancar(0.3); a.pose('lie'); a.avancar(0.5); a.root.updateMatrixWorld(true);
  ok(W(a, 'Head').y < 12, `lie: deitado em 0,5 s (cabeça a ${W(a, 'Head').y.toFixed(1)})`);
  // corrida no lugar: o clipe não pode levar o boneco embora de p.x/p.y
  a.pose('walk', 170); a.avancar(0.3); a.root.updateMatrixWorld(true);
  const p0 = W(a, 'pelvis'); a.avancar(1); a.root.updateMatrixWorld(true); const p1 = W(a, 'pelvis');
  ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 6, `corrida no lugar (pélvis andou ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)})`);
  ok(Math.abs(a.acao.timeScale - 1) < 0.05, 'velocidade 170 → animação em 1x');
  a.pose('walk', 340); ok(a.acao.timeScale > 1.7, 'mais rápido → a corrida anima mais rápido');
  // walk → idle → walk rápido (bot hesitando, rede a 30 snapshots/s): a corrida continua de onde estava
  a.pose('walk', 170); a.avancar(0.4); const tCorrida = a.acao.time;
  a.pose('idle'); a.avancar(0.05); a.pose('walk', 170); a.avancar(0.05);
  ok(a.atual === 'Jog_Fwd_Loop' && a.acao.time > tCorrida, `troca rápida walk/idle não reinicia a corrida (t ${tCorrida.toFixed(2)} → ${a.acao.time.toFixed(2)})`);
  const b = D.criar(m, mats()); b.pose('sit');
  ok(b.atual === 'Sitting_Idle_Loop' && a.atual !== b.atual, 'duas instâncias com animações independentes');
  const semSentar = { ...m, clipes: new Map([...m.clipes].filter(([n]) => n !== 'Sitting_Idle_Loop')) };
  const c = D.criar(semSentar, mats()); c.pose('sit');
  ok(c.atual === 'Idle_Loop', 'falta o clipe da pose → Idle_Loop');
  for (const [nome, dado] of [['base64 inválido', '!!!'], ['bytes que não são glTF', 'AAAAAAAA'], ['asset ausente', undefined]]) {
    const r = await D.carregar(dado).then(() => 'carregou', (e) => 'erro: ' + e.message);
    ok(r.startsWith('erro'), `carregar com ${nome} rejeita (${r})`);
  }
}

(async () => {
  secaoAsset();
  await secaoLoaders();
  await secaoDetento();
  // CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
