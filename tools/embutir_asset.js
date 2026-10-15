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
