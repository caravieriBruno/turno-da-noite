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
