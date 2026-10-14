# Personagem glTF animado (etapa 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No visual novo, trocar o boneco de caixas por um detento low-poly com esqueleto e animações (manequim da Quaternius, CC0), sem mudar a API `r.character(p, o)` e sem quebrar o `file://`.

**Architecture:**
- Um script Node prepara o GLB da Quaternius: só o corpo, os 8 clipes usados e nenhuma trilha de dedos. Outro script embute o resultado em base64 num `<script>` (`assets/detento.glb.js`).
- O `GLTFLoader` e o `SkeletonUtils` do Three r158 são convertidos uma vez para script clássico em `vendor/`.
- Um módulo novo, `engine/detento.js`, decodifica, normaliza e clona o modelo e cuida das poses. Ele roda igual no Node e no navegador.
- O `render3d.js` carrega o modelo de forma assíncrona no `init`, refaz o pool de personagens quando o modelo fica pronto e volta ao boneco de caixas se a carga falhar.

**Tech Stack:** JS puro (scripts clássicos, sem build), Three.js r158 em `vendor/`, Node para scripts e testes, Chrome headless para o teste de render.

**Spec:** `docs/superpowers/specs/2026-10-14-visual-cadeia-design.md` (seção 5.4, mais as seções 6 e 7)

## Fatos do asset real, conferidos antes de escrever o plano

- Origem: https://quaternius.itch.io/universal-animation-library, pacote "Standard" gratuito, `Universal Animation Library[Standard].zip` (15 MB). O arquivo usado é `Unreal-Godot/UAL1_Standard.glb` (7,4 MB). A licença é CC0 1.0 (`License.txt` do pacote).
- O GLB tem uma malha `Mannequin` com duas primitivas:
  - `M_Main` (corpo): 5.732 triângulos;
  - `M_Joints` (bolinhas das juntas): 8.012 triângulos.
  - Não há texturas.
- Esqueleto de 65 ossos (`root`, `pelvis`, `spine_01..03`, `neck_01`, `Head`, `clavicle/upperarm/lowerarm/hand_l|r`, `thigh/calf/foot/ball_l|r`, dedos `index/middle/pinky/ring/thumb_0N_l|r` e `*_leaf_*`). Cada osso tem trilhas de `translation`, `rotation` e `scale`.
- 43 clipes. Os usados aqui são `Idle_Loop`, `Jog_Fwd_Loop`, `Death01`, `Sitting_Idle_Loop`, `Crouch_Idle_Loop`, `Jump_Loop`, `Push_Loop` e `Pistol_Idle_Loop`. Cada accessor tem o seu próprio bufferView, sem `byteStride`.
- Na pose de ligação (T-pose), o modelo tem altura 1,83, os pés em y=0 e olha para +Z (de `foot_l` para `ball_l` dá +Z). `Head` fica em y≈1,57, `neck_01` em 1,49 e `spine_03` em 1,31.
- Estimativa depois do corte (8 clipes sem dedos, corpo sem UV): cerca de 665 KB no GLB e cerca de 890 KB em base64.
- `vendor/three.min.js` carrega no Node com `require` e exporta via `module.exports`. Um `GLTFLoader` convertido abre o GLB no Node, e `SkeletonUtils.clone` com `AnimationMixer` funciona no Node.

## Decisões que divergem da spec (aprovar na revisão do plano)

1. **Orçamento de triângulos de cerca de 6 mil, não 3 mil.** O corpo do manequim tem 5.732 triângulos, e decimar exigiria Blender ou outra ferramenta externa. Com 8 bonecos são cerca de 46 mil triângulos, irrelevante para a GPU. As bolinhas das juntas (8.012) saem.
2. **`walk` usa só `Jog_Fwd_Loop`,** com `timeScale` proporcional à velocidade (170 px/s = 1x, entre 0,5x e 1,8x). Não há troca entre caminhada e corrida, porque os jogos quase sempre correm.
3. **O manequim não tem rosto.** Entram dois olhos pequenos presos ao osso `Head`, como no boneco atual. Orelhas e boca ficam de fora. O uniforme cobre o corpo inteiro, menos cabeça, pescoço e mãos, que recebem o material de pele (spec: "todo o corpo abaixo do pescoço recebe o material de uniforme").
4. **Entra também `tools/preparar_detento.js`.** A spec só cita `embutir_asset.js`, mas o corte do GLB é necessário para caber no orçamento. O zip original não é commitado; a origem fica em `assets/LICENCAS.md`.

## Global Constraints

- JS puro em scripts clássicos, sem build e sem npm. O `index.html` precisa abrir por `file://`. Nada de `import`/`export` em arquivo carregado pela página.
- Three.js fixo no r158 (`vendor/three.min.js`). A única dependência nova são os dois arquivos convertidos do próprio r158 (licença MIT).
- Só modelos CC0. A licença e a origem ficam em `assets/LICENCAS.md`.
- Asset embutido (`assets/detento.glb.js`) com até 1,5 MB.
- `r.character(p, o)` não muda de assinatura. O modelo é normalizado para cerca de 60 unidades de altura e olha para +X.
- Continuam funcionando: `o.flash` (emissive), `alive === false` (escurece), `o.scale`, `o.lean`, `o.y`, `o.dir`, `o.label` e `o.number`.
- Crossfade de 0,15 s entre animações. Se faltar a animação de uma pose, usa idle.
- Animação é só visual e local: não vai para `g.data` e não passa pela rede.
- `?visual=antigo` continua usando o boneco de caixas com visor e não carrega o modelo.
- Até ficar pronto, ou se falhar, o motor usa o boneco de caixas e mostra um `console.warn`.
- Textos e comentários em pt-BR, no estilo do código vizinho.
- Depois de mexer no motor, rodar `node tools/simular.js`, `node tools/teste_cenarios.js`, `node tools/teste_detento.js` (novo) e `bash tools/teste_render.sh`.

## Review Focus

1. O modelo termina de carregar depois que bonecos de caixas já foram desenhados. Esperado: no quadro seguinte o pool é refeito com o modelo glTF, sem boneco duplicado ou órfão na cena. O teste fica na Task 4.
2. Asset ausente ou corrompido (o script não carregou, ou o base64 está quebrado). Esperado: `console.warn` e boneco de caixas, sem exceção. Os testes ficam na Task 3 (`carregar` rejeita) e na Task 4 (o motor volta às caixas).
3. Clipe que desloca o corpo (root motion), afastando o boneco de `p.x/p.y`. Esperado: corrida no lugar. O teste fica na Task 3 (deslocamento da pélvis).
4. Um boneco morto que volta à vida, na mesma vaga do pool. Esperado: depois de `dead`, a pose `idle` volta a animar em vez de ficar presa no último quadro da morte. O teste fica na Task 3.
5. Oito personagens na tela. Esperado: o visual novo não fica mais lento que o antigo. O teste fica na Task 4 (o quadro típico passa a ter 8 personagens andando).

---

## Arquivos

| arquivo | papel |
|---|---|
| `tools/preparar_detento.js` (novo) | corta o GLB da Quaternius: corpo, 8 clipes, sem dedos e sem UV; reconstrói o buffer |
| `tools/embutir_asset.js` (novo) | gera `assets/<nome>.glb.js` com `TN.ASSETS.<nome> = '<base64>'`; recusa acima de 1,5 MB |
| `assets/detento.glb` (novo, binário) | asset preparado, commitado |
| `assets/detento.glb.js` (novo, gerado) | asset embutido, commitado, carregado por `<script>` |
| `assets/LICENCAS.md` (novo) | origem, licença e como regenerar |
| `tools/converter_three_jsm.js` (novo) | converte `GLTFLoader`/`SkeletonUtils` do r158 para script clássico |
| `vendor/GLTFLoader.js`, `vendor/SkeletonUtils.js` (novos, gerados) | `THREE.GLTFLoader` e `THREE.SkeletonUtils` |
| `vendor/LEIA-ME.md` (novo) | o que é cada arquivo de `vendor/` e como refazer a conversão |
| `engine/detento.js` (novo) | `TN.Detento`: carregar, normalizar, dividir pele e uniforme, clonar, poses e acessórios |
| `engine/render3d.js` | carga assíncrona no `init`, troca do pool, ramo glTF no `character()`, ganchos de teste |
| `index.html`, `tools/teste_render.html` | carregam os scripts novos |
| `tools/teste_detento.js` (novo) | testes Node do asset, dos loaders e do `TN.Detento` |
| `tools/teste_render.js` | testes no navegador do personagem glTF e medição de desempenho com 8 bonecos |
| `docs/COMO_CRIAR_MINIGAME.md`, `CLAUDE.md` | documentação |

Trabalho na branch `visual-cadeia-etapa4`, criada a partir da `main`.

---

### Task 1: Asset preparado e embutido

**Files:**
- Create: `tools/preparar_detento.js`, `tools/embutir_asset.js`, `assets/detento.glb`, `assets/detento.glb.js`, `assets/LICENCAS.md`
- Test: `tools/teste_detento.js` (criado aqui com a seção 1)

**Interfaces:**
- Produces:
  - `require('tools/preparar_detento.js')` → `{ preparar(buf: Buffer): Buffer, lerGlb(buf): { json, bin }, CLIPES: string[] }`;
  - `require('tools/embutir_asset.js')` → `{ embutir(nome: string, buf: Buffer): string, LIMITE: number }`;
  - no navegador e no Node (via `vm`), `assets/detento.glb.js` define `TN.ASSETS.detento` (string base64).

- [ ] **Step 1: Criar a branch**

```bash
git checkout main && git pull && git checkout -b visual-cadeia-etapa4
```

- [ ] **Step 2: Escrever o teste (seção 1) em `tools/teste_detento.js`**

```js
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

(async () => {
  secaoAsset();
  // CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
  console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node tools/teste_detento.js`
Expected: `✗ assets/detento.glb e assets/detento.glb.js existem` e `1 falha(s).`

- [ ] **Step 4: Escrever `tools/preparar_detento.js`**

```js
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
```

- [ ] **Step 5: Escrever `tools/embutir_asset.js`**

```js
#!/usr/bin/env node
// Embute um .glb num script clássico (o Chrome não deixa fazer fetch de arquivo local em file://):
// gera assets/<nome>.glb.js com TN.ASSETS.<nome> = '<base64>'. O arquivo gerado é commitado; só é preciso
// rodar de novo quando o asset mudar. Recusa assets acima do orçamento de 1,5 MB (já em base64).
// Uso: node tools/embutir_asset.js assets/detento.glb
const fs = require('fs');
const path = require('path');
const LIMITE = 1.5 * 1024 * 1024;

function embutir(nome, buf) {
  const b64 = buf.toString('base64');
  if (b64.length > LIMITE) throw new Error(`asset "${nome}" embutido tem ${(b64.length / 1048576).toFixed(2)} MB e passa de 1,5 MB`);
  return `// GERADO por tools/embutir_asset.js a partir de assets/${nome}.glb. Não edite à mão.\n`
    + `window.TN = window.TN || {};\nTN.ASSETS = TN.ASSETS || {};\nTN.ASSETS.${nome} = '${b64}';\n`;
}

module.exports = { embutir, LIMITE };

if (require.main === module) {
  const arq = process.argv[2];
  if (!arq || !arq.endsWith('.glb')) { console.error('Uso: node tools/embutir_asset.js <arquivo.glb>'); process.exit(1); }
  const nome = path.basename(arq, '.glb'), js = embutir(nome, fs.readFileSync(arq));
  fs.writeFileSync(arq + '.js', js);
  console.log(`salvo em ${arq}.js (${(js.length / 1048576).toFixed(2)} MB)`);
}
```

- [ ] **Step 6: Obter o original e gerar os assets**

O zip vai para o diretório de rascunho, numa pasta própria (`$RASCUNHO`). Se já estiver baixado, pule o download. O download gratuito do itch.io funciona assim:
1. abrir a página e ler o `csrf_token`;
2. fazer `POST .../download_url`, que devolve a página de download;
3. ler nela o `data-upload_id` do arquivo `Universal Animation Library[Standard].zip`;
4. fazer `POST .../file/<upload_id>?source=game_download&key=<chave>`, que devolve a URL do arquivo.

Salve as respostas em arquivo e não imprima o corpo delas.

```bash
mkdir -p "$RASCUNHO/ual" && cd "$RASCUNHO/ual" && unzip -o -q -j ual.zip '*UAL1_Standard.glb' '*License.txt' && cd -
node tools/preparar_detento.js "$RASCUNHO/ual/UAL1_Standard.glb"
node tools/embutir_asset.js assets/detento.glb
```

Expected:
- `salvo em .../assets/detento.glb: ~665 KB, 5732 triângulos, clipes: Idle_Loop, ...`
- `salvo em assets/detento.glb.js (~0.87 MB)`

- [ ] **Step 7: Escrever `assets/LICENCAS.md`**

```markdown
# Licenças dos assets

## detento.glb (e detento.glb.js)

- **Origem:** Universal Animation Library (Standard), de Quaternius — https://quaternius.itch.io/universal-animation-library (download gratuito). Arquivo usado: `Unreal-Godot/UAL1_Standard.glb`.
- **Licença:** CC0 1.0 Universal (domínio público), conforme o `License.txt` do pacote: https://creativecommons.org/publicdomain/zero/1.0/
- **Alterações:** `tools/preparar_detento.js` deixa só a malha do corpo (sem as juntas e sem UV), os clipes que o motor usa e nenhuma trilha dos dedos.

Para regenerar (o zip original não fica no repositório):

    node tools/preparar_detento.js <caminho/UAL1_Standard.glb>
    node tools/embutir_asset.js assets/detento.glb
```

- [ ] **Step 8: Rodar o teste e ver passar**

Run: `node tools/teste_detento.js`
Expected: os 8 itens com `✓` (5732 triângulos, cerca de 0,87 MB) e `Tudo certo.`

- [ ] **Step 9: Commit**

```bash
git add tools/preparar_detento.js tools/embutir_asset.js tools/teste_detento.js assets/
git commit -m "Etapa 4: asset do detento (manequim CC0 da Quaternius) preparado e embutido em base64"
```

---

### Task 2: GLTFLoader e SkeletonUtils como script clássico

**Files:**
- Create: `tools/converter_three_jsm.js`, `vendor/GLTFLoader.js`, `vendor/SkeletonUtils.js`, `vendor/LEIA-ME.md`
- Test: `tools/teste_detento.js` (seção 2)

**Interfaces:**
- Consumes: `assets/detento.glb` (Task 1).
- Produces:
  - `THREE.GLTFLoader`, a classe do r158, com `parse(arrayBuffer, path, onLoad, onError)`;
  - `THREE.SkeletonUtils = { retarget, retargetClip, clone }`;
  - na seção 2 do teste, a função `carregarThree()`, que a seção 3 reutiliza.

- [ ] **Step 1: Escrever o teste (seção 2)**

Em `tools/teste_detento.js`, acrescentar abaixo de `// SEÇÕES EXTRAS (...)`:

```js
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
```

E abaixo de `// CHAMADAS EXTRAS (...)`: `await secaoLoaders();`

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_detento.js`
Expected: `✗ vendor/GLTFLoader.js: script clássico ...` e `✗ vendor/GLTFLoader.js existe`.

- [ ] **Step 3: Escrever `tools/converter_three_jsm.js`**

```js
#!/usr/bin/env node
// Converte o GLTFLoader e o SkeletonUtils do three r158 (examples/jsm, módulos ES) em scripts clássicos em
// vendor/, porque o Chrome não carrega módulos ES via file://. O `import { ... } from 'three'` vira
// `const { ... } = THREE`, o export vira uma propriedade do THREE e a toTrianglesDrawMode (de
// BufferGeometryUtils) fica embutida. Rodar só ao trocar a versão do three. Ver vendor/LEIA-ME.md.
// Uso: node tools/converter_three_jsm.js <pasta com GLTFLoader.js, SkeletonUtils.js e BufferGeometryUtils.js>
const fs = require('fs');
const path = require('path');
const VENDOR = path.join(__dirname, '..', 'vendor');

function trocarImportThree(src) {
  const r = src.replace(/import\s*\{([^}]*)\}\s*from\s*'three';/, (m, nomes) => `const {${nomes}} = THREE;`);
  if (r === src) throw new Error('import de "three" não encontrado');
  return r;
}
function extrairFuncao(src, nome) {
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error(`função ${nome} não encontrada`);
  return src.slice(i, src.indexOf('\n}\n', i) + 2);
}
function embrulhar(nome, src, exportacao) {
  let r = src.replace(/^export\s*\{[^}]*\};?\s*$/m, exportacao);
  if (/^\s*(import|export)\b/m.test(r)) throw new Error(`${nome}: sobrou import/export`);
  return `// ${nome} do three.js r158 (examples/jsm), convertido para script clássico por tools/converter_three_jsm.js.\n`
    + `// Licença MIT (a mesma do three.js). Não edite à mão: veja vendor/LEIA-ME.md.\n(function () {\n${r}\n})();\n`;
}

const dir = process.argv[2];
if (!dir) { console.error('Uso: node tools/converter_three_jsm.js <pasta-jsm-r158>'); process.exit(1); }
const ler = (n) => fs.readFileSync(path.join(dir, n), 'utf8');
const fn = extrairFuncao(ler('BufferGeometryUtils.js'), 'toTrianglesDrawMode');
let gltf = trocarImportThree(ler('GLTFLoader.js'));
const comFuncao = gltf.replace(/import\s*\{\s*toTrianglesDrawMode\s*\}\s*from\s*'[^']+';/,
  `const toTrianglesDrawMode = (function () {\n\tconst { TrianglesDrawMode, TriangleFanDrawMode, TriangleStripDrawMode } = THREE;\n\treturn ${fn};\n})();`);
if (comFuncao === gltf) throw new Error('import de toTrianglesDrawMode não encontrado');
fs.writeFileSync(path.join(VENDOR, 'GLTFLoader.js'), embrulhar('GLTFLoader', comFuncao, 'THREE.GLTFLoader = GLTFLoader;'));
const skel = trocarImportThree(ler('SkeletonUtils.js'));
fs.writeFileSync(path.join(VENDOR, 'SkeletonUtils.js'), embrulhar('SkeletonUtils', skel, 'THREE.SkeletonUtils = { retarget, retargetClip, clone };'));
console.log('salvo em vendor/GLTFLoader.js e vendor/SkeletonUtils.js');
```

- [ ] **Step 4: Baixar os fontes do r158 e converter**

```bash
mkdir -p "$RASCUNHO/jsm"
for f in loaders/GLTFLoader.js utils/SkeletonUtils.js utils/BufferGeometryUtils.js; do
  curl -sL "https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/$f" -o "$RASCUNHO/jsm/$(basename $f)"
done
node tools/converter_three_jsm.js "$RASCUNHO/jsm"
```

Expected: `salvo em vendor/GLTFLoader.js e vendor/SkeletonUtils.js`

- [ ] **Step 5: Escrever `vendor/LEIA-ME.md`**

```markdown
# vendor/

Bibliotecas de terceiros, como scripts clássicos (o jogo abre por file://, sem build e sem módulos ES).

| arquivo | o que é | licença |
|---|---|---|
| `three.min.js` | three.js r158 (build UMD) | MIT |
| `GLTFLoader.js` | `examples/jsm/loaders/GLTFLoader.js` do r158, convertido → `THREE.GLTFLoader` | MIT |
| `SkeletonUtils.js` | `examples/jsm/utils/SkeletonUtils.js` do r158, convertido → `THREE.SkeletonUtils` | MIT |

## Como refazer a conversão (só ao trocar a versão do three)

1. Baixe de `https://cdn.jsdelivr.net/npm/three@<versão>/examples/jsm/` os arquivos `loaders/GLTFLoader.js`, `utils/SkeletonUtils.js` e `utils/BufferGeometryUtils.js` para uma pasta.
2. Rode `node tools/converter_three_jsm.js <pasta>`. O script troca `import { ... } from 'three'` por `const { ... } = THREE`, embute a `toTrianglesDrawMode` e põe o export no `THREE`.
3. Rode `node tools/teste_detento.js` e `bash tools/teste_render.sh`.
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `node tools/teste_detento.js`
Expected: seções 1 e 2 com `✓`, terminando em `Tudo certo.`

- [ ] **Step 7: Commit**

```bash
git add tools/converter_three_jsm.js vendor/GLTFLoader.js vendor/SkeletonUtils.js vendor/LEIA-ME.md tools/teste_detento.js
git commit -m "Etapa 4: GLTFLoader e SkeletonUtils do three r158 convertidos para script clássico (abre via file://)"
```

---

### Task 3: `engine/detento.js` (carregar, normalizar, pele, poses, acessórios)

**Files:**
- Create: `engine/detento.js`
- Test: `tools/teste_detento.js` (seção 3)

**Interfaces:**
- Consumes: `THREE.GLTFLoader` e `THREE.SkeletonUtils.clone` (Task 2); `TN.ASSETS.detento` (Task 1); `carregarThree()` e `abrirGlb()` do teste (Task 2).
- Produces `TN.Detento`:
  - `ALTURA = 60`;
  - `POSE_CLIPE`: objeto `{ idle, walk, dead, lie, sit, crouch, fall, arms, aim }` → nome do clipe;
  - `carregar(b64: string): Promise<modelo>`, com `modelo = { cena, clipes: Map<nome, AnimationClip>, escala, giro, piso }`;
  - `criar(modelo, mat): inst`, onde `mat = { suit, skin, placa, coleira, luz, olho }` são materiais do Three;
  - `inst = { root: Group, corpo: Group, luz: Mesh, placa: Mesh, mixer, atual: string|null, acao: AnimationAction|null, pose(nome, velocidade = 0), avancar(dt) }`.

- [ ] **Step 1: Escrever o teste (seção 3)**

Em `tools/teste_detento.js`, acrescentar abaixo da seção 2:

```js
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
  // corrida no lugar: o clipe não pode levar o boneco embora de p.x/p.y
  a.pose('walk', 170); a.avancar(0.3); a.root.updateMatrixWorld(true);
  const p0 = W(a, 'pelvis'); a.avancar(1); a.root.updateMatrixWorld(true); const p1 = W(a, 'pelvis');
  ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 6, `corrida no lugar (pélvis andou ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)})`);
  ok(Math.abs(a.acao.timeScale - 1) < 0.05, 'velocidade 170 → animação em 1x');
  a.pose('walk', 340); ok(a.acao.timeScale > 1.7, 'mais rápido → a corrida anima mais rápido');
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
```

E abaixo de `await secaoLoaders();`: `await secaoDetento();`

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_detento.js`
Expected: `✗ engine/detento.js existe` e `1 falha(s).`

- [ ] **Step 3: Escrever `engine/detento.js`**

```js
// DETENTO glTF: o personagem do visual novo (manequim CC0 da Quaternius, em assets/detento.glb.js).
// Decodifica o modelo embutido, normaliza (cerca de 60 de altura, pés em y=0, olhando para +X, igual ao
// boneco de caixas), separa pele e uniforme e cria instâncias com o próprio AnimationMixer.
// A animação é só visual e local: não entra em g.data e não passa pela rede.
// Roda igual no navegador e no Node (tools/teste_detento.js). Precisa de THREE.GLTFLoader e THREE.SkeletonUtils.
(function () {
  // pose do r.character → clipe (o asset só tem estes, ver tools/preparar_detento.js)
  const POSE_CLIPE = {
    idle: 'Idle_Loop', walk: 'Jog_Fwd_Loop', dead: 'Death01', lie: 'Death01', sit: 'Sitting_Idle_Loop',
    crouch: 'Crouch_Idle_Loop', fall: 'Jump_Loop', arms: 'Push_Loop', aim: 'Pistol_Idle_Loop',
  };
  const UMA_VEZ = new Set(['Death01']);                  // toca uma vez e para no último quadro
  const OSSOS_PELE = /^(Head|neck_01|hand_[lr])$|^(index|middle|pinky|ring|thumb)_/;
  const CORRIDA_1X = 170;                                // px/s em que a corrida anima em 1x
  const FADE = 0.15;

  function base64ParaBuffer(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }
  const comp = (attr, v, c) => (c === 0 ? attr.getX(v) : c === 1 ? attr.getY(v) : c === 2 ? attr.getZ(v) : attr.getW(v));

  // reordena os triângulos em dois grupos: 0 = uniforme, 1 = pele (cabeça, pescoço e mãos). Um triângulo
  // é pele quando o osso de maior peso dos três vértices é de pele.
  function dividirPele(geo, esqueleto) {
    if (geo.groups.length === 2) return;
    const pele = new Set();
    esqueleto.bones.forEach((b, i) => { if (OSSOS_PELE.test(b.name)) pele.add(i); });
    const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
    const dominante = (v) => { let mw = -1, k = 0; for (let c = 0; c < 4; c++) { const w = comp(sw, v, c); if (w > mw) { mw = w; k = comp(si, v, c); } } return k; };
    const corpo = [], cabeca = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      (pele.has(dominante(a)) && pele.has(dominante(b)) && pele.has(dominante(c)) ? cabeca : corpo).push(a, b, c);
    }
    geo.setIndex(corpo.concat(cabeca));
    geo.clearGroups();
    geo.addGroup(0, corpo.length, 0);
    geo.addGroup(corpo.length, cabeca.length, 1);
  }

  function preparar(gltf) {
    const cena = gltf.scene;
    cena.updateMatrixWorld(true);
    let malha = null;
    cena.traverse((o) => { if (o.isSkinnedMesh && !malha) malha = o; });
    if (!malha) throw new Error('o modelo não tem malha com esqueleto');
    dividirPele(malha.geometry, malha.skeleton);
    const osso = (n) => { const b = cena.getObjectByName(n); if (!b) throw new Error(`osso "${n}" não encontrado`); return b.getWorldPosition(new THREE.Vector3()); };
    const frente = osso('ball_l').sub(osso('foot_l')).add(osso('ball_r').sub(osso('foot_r')));
    const caixa = new THREE.Box3().setFromObject(cena, true);
    return {
      cena,
      clipes: new Map(gltf.animations.map((c) => [c.name, c])),
      escala: TN.Detento.ALTURA / (caixa.max.y - caixa.min.y),
      giro: Math.atan2(frente.z, frente.x),   // rotation.y que leva a frente do modelo para +X
      piso: caixa.min.y,
    };
  }

  function carregar(b64) {
    return new Promise((resolve, reject) => {
      if (typeof b64 !== 'string' || !b64) { reject(new Error('asset ausente (assets/detento.glb.js não foi carregado)')); return; }
      let buf;
      try { buf = base64ParaBuffer(b64); } catch (e) { reject(new Error('base64 inválido')); return; }
      try {
        new THREE.GLTFLoader().parse(buf, '', (gltf) => { try { resolve(preparar(gltf)); } catch (e) { reject(e); } },
          (e) => reject(e instanceof Error ? e : new Error(String(e))));
      } catch (e) { reject(e); }
    });
  }

  function criar(m, mat) {
    const root = new THREE.Group(), corpo = new THREE.Group(), modelo = THREE.SkeletonUtils.clone(m.cena);
    root.add(corpo); corpo.add(modelo);
    modelo.rotation.y = m.giro;
    modelo.scale.setScalar(m.escala);
    modelo.position.y = -m.piso * m.escala;
    modelo.traverse((o) => { if (o.isSkinnedMesh) { o.material = [mat.suit, mat.skin]; o.castShadow = true; o.frustumCulled = false; } });
    // acessórios: posicionados em relação à pose de ligação (frente = +X, para cima = +Y) e presos ao osso
    // com attach, que mantém a posição de mundo; daí em diante acompanham a animação
    root.updateMatrixWorld(true);
    const osso = (n) => modelo.getObjectByName(n);
    const pos = (n) => osso(n).getWorldPosition(new THREE.Vector3());
    const prender = (malha, nomeOsso, x, y, z) => { malha.position.set(x, y, z); root.add(malha); root.updateMatrixWorld(true); osso(nomeOsso).attach(malha); return malha; };
    const tronco = pos('spine_03'), pescoco = pos('neck_01'), cabeca = pos('Head');
    const placa = prender(new THREE.Mesh(new THREE.PlaneGeometry(10, 5).rotateY(-Math.PI / 2), mat.placa), 'spine_03', tronco.x - 5.6, tronco.y, tronco.z);   // nas costas
    prender(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.9, 6, 12).rotateX(Math.PI / 2), mat.coleira), 'neck_01', pescoco.x, pescoco.y, pescoco.z);
    const luz = prender(new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), mat.luz), 'neck_01', pescoco.x + 3, pescoco.y, pescoco.z);
    for (const lado of [-1, 1]) prender(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 1.2), mat.olho), 'Head', cabeca.x + 3.3, cabeca.y + 4.5, cabeca.z + lado * 1.3);
    const mixer = new THREE.AnimationMixer(modelo);
    return {
      root, corpo, luz, placa, mixer, atual: null, acao: null,
      // troca de pose com crossfade; pose sem clipe → Idle_Loop; a corrida anima conforme a velocidade (px/s)
      pose(nome, velocidade = 0) {
        let clipe = POSE_CLIPE[nome] && m.clipes.has(POSE_CLIPE[nome]) ? POSE_CLIPE[nome] : 'Idle_Loop';
        if (!m.clipes.has(clipe)) return;
        if (clipe !== this.atual) {
          const nova = mixer.clipAction(m.clipes.get(clipe));
          nova.reset();
          nova.setLoop(UMA_VEZ.has(clipe) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          nova.clampWhenFinished = UMA_VEZ.has(clipe);
          nova.play();
          if (this.acao) nova.crossFadeFrom(this.acao, FADE, false);
          this.acao = nova; this.atual = clipe;
        }
        this.acao.timeScale = clipe === POSE_CLIPE.walk ? Math.min(1.8, Math.max(0.5, velocidade / CORRIDA_1X)) : 1;
      },
      avancar(dt) { mixer.update(dt); },
    };
  }

  TN.Detento = { ALTURA: 60, POSE_CLIPE, carregar, criar };
})();
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node tools/teste_detento.js`
Expected: seções 1 a 3 com `✓` e `Tudo certo.` Atenção a dois itens:
- se `olha para +X` falhar, imprima `frente` antes e depois de `modelo.rotation.y` para confirmar o sentido;
- se `corrida no lugar` falhar (clipe com root motion), zere em `preparar` as trilhas `pelvis.position` x e z do clipe `Jog_Fwd_Loop`, ou seja, os valores de índice 0 e 2 de cada trio do `VectorKeyframeTrack` cujo nome é `pelvis.position`.

- [ ] **Step 5: Commit**

```bash
git add engine/detento.js tools/teste_detento.js
git commit -m "Etapa 4: TN.Detento carrega o modelo embutido, normaliza, separa pele e uniforme e anima por pose"
```

---

### Task 4: Integração no `render3d.js`: carga assíncrona, troca do pool e queda para as caixas

**Files:**
- Modify: `engine/render3d.js` (`makeCharacter` por volta da linha 301, `character()` por volta da 429, `init` por volta da 520, objeto `TN.R3`)
- Modify: `index.html`, `tools/teste_render.html`
- Test: `tools/teste_render.js`

**Interfaces:**
- Consumes: `TN.Detento.carregar` e `TN.Detento.criar` (Task 3); `TN.ASSETS.detento` (Task 1); `THREE.GLTFLoader` e `THREE.SkeletonUtils` (Task 2).
- Produces:
  - `TN.R3.detentoPronto: Promise<boolean>`, definido no `init`;
  - `TN.R3.estadoDetento(): 'desligado'|'carregando'|'pronto'|'falhou'`;
  - os ganchos de teste `TN.R3._personagens(): c[]` e `TN.R3._recarregarDetento(b64): Promise<boolean>`;
  - cada `c` do pool passa a ter `c.gltf`, a instância de `TN.Detento.criar`, quando o modelo glTF está em uso.

- [ ] **Step 1: Carregar os scripts nas páginas**

Em `tools/teste_render.html`:
- depois de `../vendor/three.min.js`, acrescentar `<script src="../vendor/GLTFLoader.js"></script>` e `<script src="../vendor/SkeletonUtils.js"></script>`;
- depois de `../engine/util.js`, acrescentar `<script src="../assets/detento.glb.js"></script>`;
- antes de `../engine/render3d.js`, acrescentar `<script src="../engine/detento.js"></script>`.

No `index.html`, as mesmas quatro linhas, sem o `../`, nas mesmas posições relativas.

- [ ] **Step 2: Escrever os testes no navegador**

Em `tools/teste_render.js`:

(a) Trocar `(function () {` da linha 5 por `(async function () {`, e o `})();` final por:

```js
})().catch((e) => {
  const pre = document.createElement('pre'); pre.id = 'resultado';
  pre.textContent = 'RESULTADO-INICIO\n✗ exceção: ' + e.message + '\nRESULTADO-FIM';
  document.body.append(pre);
});
```

(b) Logo depois da linha `ok(true, 'visual ' + ...)`, desenhar um boneco antes de esperar o modelo:

```js
  const umBoneco = (o = {}) => TN.R3.renderRound({ def: { draw3d: (g, r) => r.character({ id: 0, x: 480, y: 280, dir: 0, color: '#c33', alive: true }, o) }, time: 1, _particles: [], _shake: 0 }, ctx);
  umBoneco();
  const antesDeCarregar = TN.R3._personagens()[0];
```

(c) Depois do bloco `// luzes do minigame têm prioridade ...` e antes de `// tempo médio de quadro`:

```js
  // personagem glTF: carrega sozinho (assíncrono), refaz o pool, mapeia poses; no visual antigo nem carrega
  const pronto = await TN.R3.detentoPronto;
  if (TN.R3.RETRO) {
    ok(pronto === true && TN.R3.estadoDetento() === 'pronto', 'modelo glTF carregou (estado: ' + TN.R3.estadoDetento() + ')');
    ok(!antesDeCarregar.gltf, 'antes de carregar, o personagem é o boneco de caixas');
    umBoneco();
    const c = TN.R3._personagens()[0];
    ok(!!c.gltf && TN.R3._personagens().length === 1, 'depois de carregar, o pool é refeito com o modelo glTF (sem sobra de caixas)');
    c.root.updateMatrixWorld(true);
    const bx = new THREE.Box3().setFromObject(c.root, true);
    ok(Math.abs(bx.max.y - bx.min.y - 60) < 6, 'altura na cena ~60 (deu ' + (bx.max.y - bx.min.y).toFixed(1) + ')');
    umBoneco({ pose: 'sit' }); ok(c.gltf.atual === 'Sitting_Idle_Loop', 'pose sit → Sitting_Idle_Loop');
    umBoneco({ pose: 'dead' }); ok(c.gltf.atual === 'Death01', 'pose dead → Death01');
  } else {
    ok(pronto === false && TN.R3.estadoDetento() === 'desligado' && !TN.R3._personagens()[0].gltf, 'visual antigo: boneco de caixas, sem carregar o modelo');
  }
```

(d) Trocar a cena `tipico` por 8 personagens andando:

```js
  // tempo médio de quadro: cela + piso em ladrilhos + 8 personagens andando (pior caso de um minigame real)
  const tipico = (g, r) => {
    r.room(40, 20, 920, 520);
    for (let x = 40; x < 920; x += 44) for (let z = 70; z < 480; z += 44) r.plane(x + 22, 0, z + 22, 42, 42, '#3a4048');
    for (let i = 0; i < 8; i++) r.character({ id: i, x: 120 + i * 100 + (g.time * 120) % 60, y: 200 + (i % 2) * 140, dir: 0, color: TN.PLAYER_COLORS[i % 4], alive: true });
  };
```

(e) Antes do `fim();` final (depois da linha `TEMPO_QUADRO_MS=`):

```js
  // asset quebrado: avisa no console e volta ao boneco de caixas (sem exceção)
  if (TN.R3.RETRO) {
    const avisos = [], aviso = console.warn;
    console.warn = (...a) => { avisos.push(a.join(' ')); };
    const r1 = await TN.R3._recarregarDetento('!!!');
    console.warn = aviso;
    umBoneco();
    ok(r1 === false && TN.R3.estadoDetento() === 'falhou' && !TN.R3._personagens()[0].gltf && avisos.some((a) => a.includes('boneco de caixas')), 'asset quebrado: avisa no console e volta ao boneco de caixas');
  }
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bash tools/teste_render.sh`
Expected: falha nos dois visuais com `✗ exceção: TN.R3._personagens is not a function`.

- [ ] **Step 4: Implementar no `engine/render3d.js`**

(a) Logo depois de `const charState = new Map();` (por volta da linha 282):

```js
  // detento glTF (visual novo): carregado em segundo plano no init; até ficar pronto, ou se falhar, o pool
  // usa o boneco de caixas. Quando fica pronto, o pool é refeito com o modelo.
  let detento = null, detentoEstado = RETRO ? 'carregando' : 'desligado', detentoPronto = Promise.resolve(false);
  function falhaDetento(e) {
    detento = null; detentoEstado = 'falhou';
    for (const c of charPool.list) if (c.gltf) scene.remove(c.root);
    charPool.list = charPool.list.filter((c) => !c.gltf);
    console.warn('detento: usando o boneco de caixas (' + (e && e.message) + ')');
    return false;
  }
  function carregarDetento(b64) {
    detentoEstado = 'carregando';
    if (!TN.Detento || !THREE.GLTFLoader || !THREE.SkeletonUtils) return Promise.resolve(falhaDetento(new Error('engine/detento.js ou vendor/GLTFLoader.js não foram carregados')));
    return TN.Detento.carregar(b64).then((m) => {
      detento = m; detentoEstado = 'pronto';
      for (const c of charPool.list) scene.remove(c.root);
      charPool.list.length = 0;
      return true;
    }, falhaDetento);
  }
```

(b) No começo de `function makeCharacter() {`, como primeira linha:

```js
    if (detento) return makeCharacterGltf();
```

(c) Logo depois do fim de `makeCharacter` (depois de `return c;\n  }`):

```js
  // detento glTF: os mesmos campos do boneco de caixas (root, body, suit, skin, numCanvas, numTex,
  // collarLight), mais c.gltf com as animações
  function makeCharacterGltf() {
    const suit = new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.8, envMapIntensity: 0.5 });
    texturize(suit, 'tecido', false);
    const skin = new THREE.MeshStandardMaterial({ color: SKIN_TONES[0], roughness: 0.7, envMapIntensity: 0.3 });
    const numCanvas = document.createElement('canvas'); numCanvas.width = 64; numCanvas.height = 32;
    const numTex = new THREE.CanvasTexture(numCanvas);
    numTex.magFilter = THREE.NearestFilter; numTex.minFilter = THREE.NearestFilter; numTex.generateMipmaps = false;
    const inst = TN.Detento.criar(detento, {
      suit, skin, placa: new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.9 }),
      coleira: collarMat, luz: new THREE.MeshBasicMaterial({ color: '#f33' }), olho: eyeMat,
    });
    scene.add(inst.root);
    return { root: inst.root, body: inst.corpo, suit, skin, numCanvas, numTex, collarLight: inst.luz, gltf: inst, ultimoT: 0 };
  }
```

(d) Em `character()`, trocar o trecho que vai de `// reset` até a linha `if (o.lean) c.body.rotation.z += o.lean;` por:

```js
      if (c.gltf) {
        // detento glTF: a pose vira um clipe; dt local (animação é só visual, não vai para a rede)
        const agora = performance.now() / 1000, dt = c.ultimoT ? Math.min(0.1, agora - c.ultimoT) : 0;
        c.ultimoT = agora;
        c.gltf.pose(pose, dt > 0 ? moved / dt : 0);
        c.gltf.avancar(dt);
        c.body.rotation.set(0, 0, o.lean || 0);
      } else {
        // reset
        c.body.position.set(0, 0, 0); c.body.rotation.set(0, 0, 0); c.body.scale.set(1, 1, 1);
        // ... (o resto do código atual das poses de caixas, sem alteração, até o fim do bloco de poses) ...
        if (o.lean) c.body.rotation.z += o.lean;   // inclina o corpo (positivo = para trás)
      }
```

O comentário `// ... (o resto ...)` acima não vai para o código. Nesse lugar ficam, sem nenhuma alteração, as linhas atuais entre o reset e o `if (o.lean)`: o `for (const l of [c.legL, ...])`, o `const t`, o `const sw` e a cadeia de `if (pose === 'walk') ... else if (pose === 'arms' || pose === 'aim') {...}`. Só a indentação muda.

(e) No `init`, logo antes de `return true;` (fim da função):

```js
      if (RETRO) detentoPronto = carregarDetento(TN.ASSETS && TN.ASSETS.detento);
      TN.R3.detentoPronto = detentoPronto;
```

(f) No `Object.assign(TN.R3, { ... })`, junto dos outros ganchos (`stats`, `_textura`):

```js
    estadoDetento: () => detentoEstado,
    _personagens: () => charPool.list,
    _recarregarDetento: (b64) => carregarDetento(b64),
```

E inicializar `detentoPronto: Promise.resolve(false)` no objeto `TN.R3`, para quem ler antes do `init`.

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `bash tools/teste_render.sh`
Expected:
- os itens novos com `✓` nos dois visuais (no antigo, `visual antigo: boneco de caixas, sem carregar o modelo`);
- `tempo médio de quadro: novo X ms · antigo Y ms`, com X ≤ Y × 1,1;
- `Tudo certo.`

Se faltar `RESULTADO-FIM`, o `--dump-dom` saiu antes da decodificação assíncrona. A decodificação de GLB embutido é feita só com Promises e deveria terminar antes do evento `load`. Se não terminar, acrescente `--virtual-time-budget=20000` à linha do Chrome em `tools/teste_render.sh` e confira se `TEMPO_QUADRO_MS` continua com valores maiores que 0 nos dois visuais.

Run: `node tools/simular.js && node tools/teste_cenarios.js && node tools/teste_detento.js`
Expected: os três terminam com `Tudo certo.` O simular não carrega o modelo: o validador mantém o `character` de mentira.

- [ ] **Step 6: Commit**

```bash
git add engine/render3d.js index.html tools/teste_render.html tools/teste_render.js
git commit -m "Etapa 4: r.character usa o detento glTF animado no visual novo (carga assíncrona, troca do pool, volta às caixas se falhar)"
```

---

### Task 5: Revisão visual dos 23 jogos, rede e documentação

**Files:**
- Modify: `docs/COMO_CRIAR_MINIGAME.md`, `CLAUDE.md`
- Modify (só se a revisão pedir): `minigames/<id>.js`, apenas coordenadas visuais de enfeites presos ao boneco
- Test: screenshots, `tools/teste_rede.js`, os quatro testes

**Interfaces:**
- Consumes: tudo das Tasks 1 a 4.

- [ ] **Step 1: Screenshots dos 23 jogos nos dois visuais**

Run (com o servidor rodando em background, via `node tools/servidor.js 8765`): `bash tools/screenshots.sh screenshots/etapa4 12`
Expected: `ok <id>` para os 23 e `salvo em screenshots/etapa4/`.

- [ ] **Step 2: Revisar os screenshots, começando pelos jogos de risco**

Estes jogos prendem enfeites em coordenadas pensadas para o boneco de caixas ou usam poses especiais:
- `bons_modos`: o anfitrião com camisa e gravata em caixas, e os convidados com `pose: 'sit'` e `scale` 1,6;
- `tragada`: o cigarro na boca e o banco;
- `cabo_de_guerra`: `lean` e as mãos na corda;
- `carrapato`: o aparelho nas costas, em y=33;
- `temporada_de_caca`: a escala calculada para 60 de altura;
- `morto_vivo`: `lie` e `crouch` com `scale`;
- `piso_falso`: `pose: 'fall'`.

Para cada jogo, confira três coisas:
- o detento aparece, sem caixa sobrando;
- a pose faz sentido;
- os enfeites encostam no corpo.

Quando um enfeite flutuar, ajuste só as coordenadas visuais dele no `draw3d` do jogo. Nunca mexa em regra, estado ou `g.data`. Depois de cada ajuste, rode `node tools/simular.js <id> --vezes 3` e `node tools/simular.js <id> --parado` (os dois precisam terminar com "Tudo certo") e tire de novo o screenshot daquele jogo.

- [ ] **Step 3: Rede e file://**

Run: `node tools/teste_rede.js` (com o servidor rodando)
Expected: termina sem erro. A animação não entra no snapshot.

O `file://` é coberto pelo `teste_render.sh`, que abre `file:///.../tools/teste_render.html`. Confira no resultado o item `modelo glTF carregou`.

- [ ] **Step 4: Documentar**

Em `docs/COMO_CRIAR_MINIGAME.md`, no bloco "Visual de cadeia" e na linha do `r.character`, acrescentar:

```markdown
- **Detento animado (visual novo):** o `r.character` desenha um modelo low-poly com esqueleto (manequim CC0 da Quaternius, `assets/detento.glb.js`). Cada pose toca um clipe: `idle` → Idle_Loop, `walk` → Jog_Fwd_Loop (mais rápido quanto mais rápido o boneco anda), `dead`/`lie` → Death01 (uma vez, para no fim), `sit` → Sitting_Idle_Loop, `crouch` → Crouch_Idle_Loop, `fall` → Jump_Loop, `arms` → Push_Loop, `aim` → Pistol_Idle_Loop. A troca tem crossfade de 0,15 s. A altura continua cerca de 60, com frente para +X, e `scale`, `y`, `dir`, `lean`, `flash`, `label`, `number` e `alive` funcionam igual. A animação é só local (não vai para `g.data`). Enquanto o modelo carrega, ou se falhar, aparece o boneco de caixas. O `?visual=antigo` usa sempre as caixas. Ao prender enfeites no boneco (chapéu do anfitrião, cigarro...), confira no screenshot do visual novo.
```

Em `CLAUDE.md`:
- na Estrutura, acrescentar a linha "`engine/detento.js`: personagem glTF animado do visual novo (asset em `assets/`, loaders em `vendor/`; ver `assets/LICENCAS.md` e `vendor/LEIA-ME.md`)";
- na regra final, acrescentar `node tools/teste_detento.js` à lista de testes depois de mexer no motor.

- [ ] **Step 5: Rodar tudo**

Run: `node tools/simular.js && node tools/teste_cenarios.js && node tools/teste_detento.js && bash tools/teste_render.sh`
Expected: os quatro terminam com `Tudo certo.`

- [ ] **Step 6: Commit**

```bash
git add docs/COMO_CRIAR_MINIGAME.md CLAUDE.md minigames/
git commit -m "Etapa 4: revisão visual dos 23 jogos com o detento animado e documentação"
```
