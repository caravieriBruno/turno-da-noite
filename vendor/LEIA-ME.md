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
