# Visual Cadeia: etapas 1 e 2 (motor + kit de cenários). Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** consolidar o protótipo do visual "cadeia PS2" no motor e criar o kit de cenários (`r.room` com 5 estilos, `r.yard` e `r.prop`), com testes automáticos, para que o retoque dos 23 minigames (etapa 3) seja só usar peças prontas.

**Arquitetura:**
- O `engine/render3d.js` continua dono do pipeline: baixa resolução, texturas, luz e personagem.
- Um arquivo novo, `engine/cenarios.js`, monta os cenários usando **só** as primitivas públicas da API do `draw3d`. Por isso o mesmo código roda no navegador e no validador do `tools/simular.js`.
- O `render3d.js` só repassa `r.room/yard/prop` para `TN.cenarios`.
- Os testes são dois scripts novos e sem dependências:
  - `tools/teste_cenarios.js` (Node, usa o validador);
  - `tools/teste_render.sh` (abre `tools/teste_render.html` num Chrome headless e lê o resultado com `--dump-dom`).

**Tecnologias:** JS clássico (sem build), Three.js r158 em `vendor/`, Node para os testes, Chrome headless com SwiftShader.

**Especificação:** `docs/superpowers/specs/2026-10-14-visual-cadeia-design.md`. Este plano cobre as seções 5.1, 5.2, 6 e 7 (etapas 1 e 2). As etapas 3 (retoque dos 23 jogos) e 4 (glTF) terão planos próprios: a 3 depende deste kit pronto, e a 4 depende de baixar o asset para conhecer os nomes dos ossos e das animações.

## Restrições globais

- JS clássico, **sem build e sem dependências npm**. O jogo precisa abrir pelo `index.html`, inclusive via `file://`.
- Three.js fica fixo no r158 (`vendor/three.min.js`).
- O motor é genérico: nada em `engine/` pode ser específico de um minigame.
- Textos e comentários em pt-BR.
- Tudo que pisca ou se mexe num cenário depende **só** de `r.time` (igual no host e nos clientes). Nada de `Math.random()` em cenário.
- Cada cenário acende no máximo **2** luzes pontuais, sempre com `{ fundo: true }`. As luzes do minigame têm prioridade nas 6 vagas do motor.
- Elementos com `glow: true` não recebem textura nem luz. É assim que o verde CRT e o vermelho de perigo ficam puros.
- `?visual=antigo` continua funcionando: liso, sem textura nem pós-processo.
- Depois de mexer no motor: `node tools/simular.js` termina com "Tudo certo."
- O visual novo não pode ficar mais lento que o antigo (tolerância de 10% no `teste_render.sh`).
- Mensagens de commit em pt-BR, terminando com `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Foco de revisão

1. **Cantos invertidos ou degenerados** (`x2 < x1`, `z2 < z1`, largura 0) num `room` ou `yard` desenham o mesmo cenário que os cantos na ordem certa, sem NaN e sem paredes viradas. Testes nas tarefas 2 e 7.
2. **Nome de estilo ou de objeto digitado errado** dá erro claro com a lista dos nomes válidos, e o `simular.js` acusa antes de alguém jogar. Testes nas tarefas 5 e 6.
3. **Minigame que já usa 6 luzes** e também chama um cenário: as 6 luzes do jogo aparecem, e as do cenário ficam de fora. Teste na tarefa 2.
4. **`?visual=antigo` com cenários:** nada quebra e o cenário aparece liso. Coberto porque o `teste_render.sh` roda todas as cenas nos dois visuais (tarefa 1 em diante).
5. **Mesma cena no mesmo `time` dá pixels idênticos** (host e cliente veem igual). O `teste_render` confere em todas as cenas e o `teste_cenarios` confere as chamadas (tarefas 1, 2, 5, 6 e 7).

---

### Task 0: branch e commit do trabalho pendente

O working tree tem duas mudanças sem commit:
- os controles (WASD/setas, espaço/clique);
- o protótipo do visual, mais a especificação e este plano.

**Arquivos:** nenhum novo.

- [ ] **Passo 1: criar a branch**

```bash
git switch -c visual-cadeia
```

- [ ] **Passo 2: commit dos controles, separado**

```bash
git add engine/input.js engine/session.js README.md
git commit -m "Controles: WASD/setas para andar, ação no espaço/clique, extra no shift/G/clique direito

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Passo 3: commit do protótipo, da especificação e do plano**

```bash
git add engine/render3d.js minigames/aspiradores.js docs/superpowers/
git commit -m "Protótipo do visual cadeia PS2 (baixa resolução, texturas, detentos, r.room) + especificação e plano

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Passo 4: conferir**

Rodar: `git status --short`
Esperado: nenhuma linha.

---

### Task 1: ferramentas de teste visual (macOS + teste de render)

**Arquivos:**
- Criar: `tools/_chrome.sh` (acha o navegador e o comando de tempo-limite; usado pelos scripts abaixo)
- Modificar: `tools/screenshot.sh` (passa a usar `_chrome.sh`; funciona no macOS, que não tem `timeout`)
- Criar: `tools/screenshots.sh` (todos os minigames, nos dois visuais)
- Criar: `tools/teste_render.html`, `tools/teste_render.js`, `tools/teste_render.sh`
- Criar: `tools/ver_cena.sh` (screenshot de uma cena do teste, para conferir com os olhos)
- Modificar: `.gitignore` (ignorar `screenshots/`)

**Interfaces:**
- Produz: `bash tools/teste_render.sh`, que imprime "Tudo certo." e sai com código 0, ou imprime as linhas com `✗` e sai com código 1.
- Produz: o array `CENAS` em `tools/teste_render.js` e o trecho marcado `// TESTES EXTRAS`. As tarefas seguintes acrescentam cenas e testes ali.
- Produz: `bash tools/screenshots.sh [pasta] [segundos]`, que gera `<pasta>/<id>.png` e `<pasta>/<id>_antigo.png`.
- Produz: `bash tools/ver_cena.sh <trecho-do-nome> [saida.png] [antigo]`, que desenha só a cena de `CENAS` cujo nome contém o trecho, no instante `time = 2.5`, e salva o PNG (padrão: `/tmp/tn_cena.png`).

- [ ] **Passo 1: criar `tools/_chrome.sh`**

```bash
# Acha o Chrome/Edge (Windows/Git Bash, macOS, Linux) e um comando de tempo-limite.
# Uso: source "$(dirname "$0")/_chrome.sh"   → define BROWSER, TIMEOUT e CHROME_FLAGS
for B in "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
         "$(command -v google-chrome)" "$(command -v chromium)"; do
  [ -n "$B" ] && [ -x "$B" ] && BROWSER="$B" && break
done
[ -z "$BROWSER" ] && { echo "Chrome/Edge não encontrado"; exit 1; }
# o macOS não tem `timeout`: usa o gtimeout (coreutils) se existir; senão roda sem limite
TIMEOUT=""
command -v timeout >/dev/null && TIMEOUT="timeout 120"
[ -z "$TIMEOUT" ] && command -v gtimeout >/dev/null && TIMEOUT="gtimeout 120"
CHROME_FLAGS=(--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars)
```

- [ ] **Passo 2: reescrever `tools/screenshot.sh`** (mesmo uso de antes)

```bash
#!/usr/bin/env bash
# Tira um screenshot do jogo num momento específico usando Chrome/Edge headless (com WebGL via SwiftShader).
# Uso: bash tools/screenshot.sh <id-do-minigame> <segundos> [saida.png]
#   ex.: bash tools/screenshot.sh aspiradores 12 shot.png
#   EXTRA_PARAMS="&visual=antigo" bash tools/screenshot.sh aspiradores 12 antigo.png
# Funciona mesmo para minigames fora do manifesto (carrega minigames/<id>.js via ?extra=).
# Precisa do servidor rodando: node tools/servidor.js 8765
source "$(dirname "$0")/_chrome.sh"
ID="$1"; T="${2:-10}"; OUT="${3:-screenshot_$1_$2.png}"
OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$(pwd)/$OUT")"
URL="http://127.0.0.1:${PORT:-8765}/index.html?game=$ID&extra=$ID&humans=0&t=$T${EXTRA_PARAMS}"
$TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --window-size=1280,720 --virtual-time-budget=3000 \
  --screenshot="$OUTW" "$URL" 2>/dev/null
echo "salvo em $OUT"
```

- [ ] **Passo 3: conferir o screenshot no macOS**

Rodar (com `node tools/servidor.js 8765` em background):
```bash
bash tools/screenshot.sh aspiradores 12 /tmp/tn_shot.png && ls -la /tmp/tn_shot.png
```
Esperado: "salvo em /tmp/tn_shot.png" e um arquivo com mais de 50 KB. Abra com a ferramenta Read para ver a cela com os detentos.

- [ ] **Passo 4: criar `tools/screenshots.sh`**

```bash
#!/usr/bin/env bash
# Screenshot de todos os minigames do manifesto, no visual novo e no antigo (?visual=antigo), para revisão.
# Uso: bash tools/screenshots.sh [pasta] [segundos]    (padrão: screenshots e 12; pasta relativa à raiz)
# Saída: <pasta>/<id>.png e <pasta>/<id>_antigo.png. Precisa do servidor: node tools/servidor.js 8765
cd "$(dirname "$0")/.."
DIR="${1:-screenshots}"; T="${2:-12}"
mkdir -p "$DIR"
IDS=$(node -e "global.TN={};require('./minigames/manifest.js');console.log(TN.MINIGAME_FILES.map((f)=>f.replace(/\.js$/,'')).join(' '))")
for ID in $IDS; do
  bash tools/screenshot.sh "$ID" "$T" "$DIR/$ID.png" >/dev/null
  EXTRA_PARAMS="&visual=antigo" bash tools/screenshot.sh "$ID" "$T" "$DIR/${ID}_antigo.png" >/dev/null
  echo "ok $ID"
done
echo "salvo em $DIR/"
```

E acrescentar ao `.gitignore`, logo abaixo de `screenshot_*.png`:
```
screenshots/
```

- [ ] **Passo 5: escrever primeiro o script do teste, `tools/teste_render.sh`**

```bash
#!/usr/bin/env bash
# Teste do render 3D num Chrome headless, abrindo tools/teste_render.html direto do arquivo (sem servidor).
# Roda as cenas no visual novo e no antigo (?visual=antigo) e compara o tempo médio de quadro.
# Uso: bash tools/teste_render.sh      → termina com "Tudo certo." (código 0) ou "FALHOU." (código 1)
cd "$(dirname "$0")/.."
source tools/_chrome.sh
P="$(pwd)"; command -v cygpath >/dev/null && P="$(cygpath -m "$P")"
PAGE="file:///${P#/}/tools/teste_render.html"
rodar() {
  $TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --allow-file-access-from-files --dump-dom "$PAGE$1" 2>/dev/null \
    | sed -n '/RESULTADO-INICIO/,/RESULTADO-FIM/p' | sed '1d;$d'
}
NOVO=$(rodar "")
ANTIGO=$(rodar "?visual=antigo")
echo "== visual novo";   echo "$NOVO"   | grep -v '^TEMPO_QUADRO_MS='
echo "== visual antigo"; echo "$ANTIGO" | grep -v '^TEMPO_QUADRO_MS='
TNOVO=$(echo "$NOVO" | sed -n 's/^TEMPO_QUADRO_MS=//p')
TANT=$(echo "$ANTIGO" | sed -n 's/^TEMPO_QUADRO_MS=//p')
FALHOU=0
if [ -z "$TNOVO" ] || [ -z "$TANT" ]; then echo "✗ a página de teste não rodou até o fim"; FALHOU=1
else
  echo "tempo médio de quadro: novo ${TNOVO} ms · antigo ${TANT} ms"
  awk -v n="$TNOVO" -v a="$TANT" 'BEGIN { exit !(n <= a * 1.10) }' || { echo "✗ visual novo mais lento que o antigo (tolerância 10%)"; FALHOU=1; }
fi
printf '%s\n%s\n' "$NOVO" "$ANTIGO" | grep -q '^✗' && FALHOU=1
[ "$FALHOU" = 0 ] && echo "Tudo certo." || { echo "FALHOU."; exit 1; }
```

- [ ] **Passo 6: rodar e ver falhar**

Rodar: `bash tools/teste_render.sh`
Esperado: "✗ a página de teste não rodou até o fim" e "FALHOU." (a página ainda não existe).

- [ ] **Passo 7: criar `tools/teste_render.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Teste do render 3D</title></head>
<body>
  <!-- Aberto por tools/teste_render.sh (Chrome headless). Também dá para abrir no navegador e ler o resultado. -->
  <script src="../vendor/three.min.js"></script>
  <script src="../engine/util.js"></script>
  <script src="../engine/draw.js"></script>
  <script src="../engine/render3d.js"></script>
  <script src="teste_render.js"></script>
</body>
</html>
```

- [ ] **Passo 8: criar `tools/teste_render.js`**

```js
// Teste do render 3D no navegador. O tools/teste_render.sh abre tools/teste_render.html num Chrome headless.
// Para cada cena confere: desenha sem exceção, não fica em branco e é determinística (mesmo r.time =
// mesmos pixels, como host e clientes na rede). No fim mede o tempo médio de quadro de uma cena típica.
// O resultado vai para <pre id="resultado">, entre as linhas RESULTADO-INICIO e RESULTADO-FIM.
(function () {
  const linhas = [];
  const ok = (cond, msg) => linhas.push((cond ? '✓ ' : '✗ ') + msg);
  const fim = () => {
    const pre = document.createElement('pre'); pre.id = 'resultado';
    pre.textContent = ['RESULTADO-INICIO', ...linhas, 'RESULTADO-FIM'].join('\n');
    document.body.append(pre);
  };
  const c3 = document.createElement('canvas'), c2 = document.createElement('canvas');
  c2.width = TN.W; c2.height = TN.H;
  const ctx = c2.getContext('2d');
  document.body.append(c3);
  if (!TN.R3.init(c3)) { ok(false, 'WebGL indisponível'); fim(); return; }
  TN.R3.resize(TN.W, TN.H, 1);
  ok(true, 'visual ' + (TN.R3.RETRO ? 'novo (cadeia)' : 'antigo (liso)'));

  const rodada = (draw3d, time) => ({ def: { draw3d }, time, _particles: [], _shake: 0 });
  const desenhar = (draw3d, time) => TN.R3.renderRound(rodada(draw3d, time), ctx);
  function hash() {   // FNV-1a dos pixels do canvas 3D (preserveDrawingBuffer está ligado no motor)
    const t = document.createElement('canvas'); t.width = c3.width; t.height = c3.height;
    const x = t.getContext('2d'); x.drawImage(c3, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const quadro = (draw3d, time) => { desenhar(draw3d, time); return hash(); };

  // cenas de referência: as tarefas do kit de cenários acrescentam as suas aqui
  const CENAS = [
    ['cela (r.room padrão)', (g, r) => r.room(40, 20, 920, 520)],
  ];
  // ?ver=<trecho do nome>: só desenha essa cena (para olhar ou tirar screenshot) e não roda os testes
  const ver = new URLSearchParams(location.search).get('ver');
  if (ver) {
    const cena = CENAS.find(([n]) => n.includes(ver));
    if (cena) desenhar(cena[1], 2.5);
    c3.style.width = '960px'; c3.style.height = '540px'; c3.style.imageRendering = 'pixelated';
    ok(!!cena, 'cena "' + ver + '"');
    fim(); return;
  }
  const vazio = quadro(() => {}, 0);
  for (const [nome, draw] of CENAS) {
    try {
      const a = quadro(draw, 2.5); quadro(draw, 4.1); const b = quadro(draw, 2.5);
      ok(a !== vazio, nome + ': desenha algo');
      ok(a === b, nome + ': determinística (mesmo time = mesmos pixels)');
    } catch (e) { ok(false, nome + ': exceção ' + e.message); }
  }

  // TESTES EXTRAS (as tarefas seguintes acrescentam blocos aqui)

  // tempo médio de quadro: cela + piso em ladrilhos + 4 personagens (parecido com um minigame real)
  const tipico = (g, r) => {
    r.room(40, 20, 920, 520);
    for (let x = 40; x < 920; x += 44) for (let z = 70; z < 480; z += 44) r.plane(x + 22, 0, z + 22, 42, 42, '#3a4048');
    for (let i = 0; i < 4; i++) r.character({ id: i, x: 200 + i * 160, y: 280, dir: 0, color: TN.PLAYER_COLORS[i], alive: true });
  };
  for (let i = 0; i < 10; i++) desenhar(tipico, i / 60);
  hash();
  const t0 = performance.now();
  for (let i = 0; i < 60; i++) desenhar(tipico, i / 60);
  hash();   // força a GPU a terminar antes de parar o relógio
  linhas.push('TEMPO_QUADRO_MS=' + ((performance.now() - t0) / 60).toFixed(2));
  fim();
})();
```

- [ ] **Passo 8b: criar `tools/ver_cena.sh`**

```bash
#!/usr/bin/env bash
# Screenshot de uma cena do tools/teste_render.js (sem servidor), para conferir cenários com os olhos.
# Uso: bash tools/ver_cena.sh <trecho-do-nome> [saida.png] [antigo]
#   ex.: bash tools/ver_cena.sh oficina /tmp/oficina.png
#        bash tools/ver_cena.sh pátio /tmp/patio_antigo.png antigo
cd "$(dirname "$0")/.."
source tools/_chrome.sh
CENA="$1"; OUT="${2:-/tmp/tn_cena.png}"; Q="?ver=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$CENA")"
[ "$3" = "antigo" ] && Q="$Q&visual=antigo"
P="$(pwd)"; command -v cygpath >/dev/null && P="$(cygpath -m "$P")"
OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$OUT")"
$TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --allow-file-access-from-files --window-size=980,560 \
  --screenshot="$OUTW" "file:///${P#/}/tools/teste_render.html$Q" 2>/dev/null
echo "salvo em $OUT"
```

- [ ] **Passo 9: rodar e ver passar**

Rodar: `bash tools/teste_render.sh && bash tools/ver_cena.sh cela /tmp/tn_cela.png`
Esperado: nos dois visuais aparecem `✓ cela (r.room padrão): desenha algo` e `✓ ... determinística`, depois a linha do tempo de quadro e "Tudo certo." Se a determinística falhar, procure `Math.random` ou `performance.now` dentro do `room` (só pode depender de `api.time`).

- [ ] **Passo 10: commit**

```bash
chmod +x tools/teste_render.sh tools/screenshots.sh tools/ver_cena.sh
git add tools/_chrome.sh tools/screenshot.sh tools/screenshots.sh tools/ver_cena.sh tools/teste_render.html tools/teste_render.js tools/teste_render.sh .gitignore
git commit -m "Ferramentas: screenshot no macOS, screenshots de todos os jogos e teste do render 3D no Chrome headless

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `engine/cenarios.js`, validador com rastreio e prioridade de luz

Tira o `room` de dentro do `render3d.js` e cria o arquivo do kit. O validador passa a rastrear as chamadas, e as luzes de cenário só ocupam vaga que sobrar.

**Arquivos:**
- Criar: `engine/cenarios.js`
- Modificar: `engine/render3d.js`:
  - validador (por volta das linhas 23-54);
  - `light` (por volta da 351);
  - remover o `room` (por volta das 430-476);
  - `renderRound` (por volta da 592);
  - `Object.assign(TN.R3, {...})`.
- Modificar: `index.html:30`, `tools/simular.js:45`, `tools/teste_rede.js:19` e `tools/teste_render.html` (carregar `engine/cenarios.js`)
- Criar: `tools/teste_cenarios.js`
- Modificar: `tools/teste_render.js` (teste de prioridade de luz)

**Interfaces:**
- Produz: `TN.cenarios = { room(r, x1, z1, x2, z2, o) }`. As tarefas 5 e 7 acrescentam `prop(r, nome, x, z, o)` e `yard(r, x1, z1, x2, z2, o)`.
- Produz: `r.room(...)`, `r.yard(...)` e `r.prop(...)` na API do `draw3d`, real e validador. Eles chamam `TN.cenarios[k](r, ...args)`.
- Produz: `r.light(x, y, z, cor, intensidade, alcance, { fundo: true })`. Uma luz de fundo só entra se sobrar vaga depois do `draw3d`.
- Produz: `TN.R3.trace(fn, time = 0)`, que retorna `{ errs: string[], counts: {[primitiva]: number}, calls: [nome, args][] }`.
- Produz: `TN.R3.stats()` (só no navegador), que retorna `{ luzes: [{ x, y, z }] }` do último quadro.
- Produz: o helper `rect(x1, z1, x2, z2)` dentro de `cenarios.js`, que normaliza os cantos.

- [ ] **Passo 1: escrever primeiro o teste em Node, `tools/teste_cenarios.js`**

```js
#!/usr/bin/env node
// Testa o kit de cenários (engine/cenarios.js) contra o validador do render3d, sem navegador.
// Confere: números válidos, no máximo 2 luzes por cenário, nada aleatório (mesmo time = mesmas chamadas),
// cantos invertidos desenham o mesmo cenário e nomes errados dão erro claro.
// Uso: node tools/teste_cenarios.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
global.window = global;
global.localStorage = { getItem: () => null, setItem() {} };
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
['engine/util.js', 'engine/render3d.js', 'engine/cenarios.js'].forEach(load);

let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };
const trace = (fn, time) => TN.R3.trace(fn, time);
const mesmas = (a, b) => JSON.stringify(a.calls) === JSON.stringify(b.calls);

function cenarioValido(nome, fn) {
  let t;
  try { t = trace(fn, 2.5); } catch (e) { ok(false, `${nome}: exceção ${e.message}`); return; }
  ok(t.errs.length === 0, `${nome}: números válidos${t.errs.length ? ' (' + t.errs[0] + ')' : ''}`);
  ok((t.counts.light || 0) <= 2, `${nome}: no máximo 2 luzes (usou ${t.counts.light || 0})`);
  ok(t.calls.length > 5, `${nome}: desenha alguma coisa`);
  ok(mesmas(t, trace(fn, 2.5)), `${nome}: nada aleatório (mesmo time = mesmas chamadas)`);
}
function deveFalhar(nome, fn, trecho) {
  try { trace(fn); ok(false, `${nome}: deveria dar erro`); }
  catch (e) { ok(e.message.includes(trecho), `${nome}: erro claro ("${e.message}")`); }
}

// --- r.room ---
cenarioValido('room padrão (cela)', (r) => r.room(40, 20, 920, 520));
ok(mesmas(trace((r) => r.room(920, 520, 40, 20)), trace((r) => r.room(40, 20, 920, 520))), 'room com cantos invertidos = cantos na ordem');
cenarioValido('room degenerado (largura 0)', (r) => r.room(300, 100, 300, 100));
ok(trace((r) => r.room(NaN, 20, 920, 520)).errs.length > 0, 'room com NaN: o validador acusa');

// CASOS EXTRAS (as tarefas seguintes acrescentam aqui)

console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node tools/teste_cenarios.js`
Esperado: erro ao carregar `engine/cenarios.js` (ENOENT).

- [ ] **Passo 3: criar `engine/cenarios.js` com o `room` do protótipo**

```js
// CENÁRIOS DE CADEIA: peças prontas de cenário para o draw3d.
//   r.room(x1, z1, x2, z2, o)  ambientes internos (a frente fica aberta para a câmera)
// Usam só as primitivas públicas da API do draw3d (box, tube, light...), então rodam igual no navegador
// e no validador do tools/simular.js. Regras:
//   - tudo que pisca ou se mexe depende só de r.time (fica igual no host e nos clientes);
//   - cada cenário acende no máximo 2 luzes pontuais, sempre com { fundo: true } (as luzes do
//     minigame têm prioridade nas 6 vagas do motor).
// (x1,z1) = canto do fundo à esquerda, (x2,z2) = canto da frente à direita (aceita em qualquer ordem).
(function () {
  const ESCURO = '#1b1d1c';
  // aceita os cantos em qualquer ordem e garante área mínima (evita paredes invertidas)
  function rect(x1, z1, x2, z2) {
    const ax = Math.min(x1, x2), bx = Math.max(x1, x2), az = Math.min(z1, z2), bz = Math.max(z1, z2);
    return { x1: ax, z1: az, x2: Math.max(bx, ax + 1), z2: Math.max(bz, az + 1) };
  }

  // Cela: chão, parede do fundo e laterais com pintura de meia-parede, janelas gradeadas, cano,
  // grade de cela na lateral esquerda e luminárias fluorescentes (a do meio pisca).
  // o: { h, paintH, paint, top, floor, windows, lamps (nº), lights (quantas acendem luz), bars }
  function room(r, x1, z1, x2, z2, o = {}) {
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 200, PH = o.paintH ?? H * 0.45, T = 16, w = x2 - x1, cx = (x1 + x2) / 2;
    const paint = o.paint ?? '#35574a', top = o.top ?? '#857d6b', floor = o.floor ?? '#3e3c38';
    const zFront = z2 + 500, sideD = zFront - z1, sideZ = (z1 + zFront) / 2;
    r.plane(cx, -1.5, sideZ, w + 1400, sideD + 900, floor);
    const wall = (x, z, ww, dd) => {
      r.box(x, 0, z, ww, PH, dd, paint, { tex: 'tinta' });
      r.box(x, PH, z, ww, H - PH, dd, top, { tex: 'tinta' });
      r.box(x, PH - 3, z, ww + 2, 6, dd + 2, ESCURO, { tex: 'tinta' });
      r.box(x, 0, z, ww + 2, 9, dd + 2, ESCURO);
    };
    wall(cx, z1 - T / 2, w + T * 2, T);
    wall(x1 - T / 2, sideZ, T, sideD);
    wall(x2 + T / 2, sideZ, T, sideD);
    const nWin = o.windows ?? Math.max(1, Math.round(w / 320));
    for (let i = 0; i < nWin; i++) {
      const wx = x1 + w * (i + 0.5) / nWin, wy = H * 0.55, ww = 74, wh = H * 0.28;
      r.box(wx, wy, z1 + 0.5, ww + 10, wh + 10, 3, '#3a3a36', { metal: 0.5 });
      r.box(wx, wy + 5, z1 + 1, ww, wh, 3, '#06080a', { tex: false });
      for (let b = 0; b < 7; b++) { const bx = wx - ww / 2 + (b + 0.5) * ww / 7; r.tube(bx, wy + 5, z1 + 4, bx, wy + 5 + wh, z1 + 4, 1.6, '#4a4844', { metal: 0.6 }); }
    }
    r.tube(x1, H - 22, z1 + 10, x2, H - 22, z1 + 10, 5, '#6b5846', { metal: 0.5 });
    if (o.bars !== false) {
      const bz = z1 + 60, bl = Math.min(220, sideD * 0.4);
      r.box(x1 + 1, 0, bz + bl / 2, 3, H * 0.7, bl, '#07090a', { tex: false });
      for (let z = bz; z <= bz + bl; z += 14) r.tube(x1 + 5, 0, z, x1 + 5, H * 0.7, z, 2, '#55534e', { metal: 0.6 });
      r.box(x1 + 5, H * 0.7, bz + bl / 2, 5, 6, bl + 4, '#55534e', { metal: 0.6 });
    }
    const nLamp = o.lamps ?? 3, t = r.time || 0, maxLuz = Math.min(2, o.lights ?? 2);
    let acesas = 0;
    for (let i = 0; i < nLamp; i++) {
      const lx = x1 + w * (i + 0.5) / nLamp;
      const pisca = i === Math.floor(nLamp / 2) && Math.sin(t * 17) + Math.sin(t * 5.3 + 1) > 1.25;
      r.box(lx, PH + 8, z1 + 6, 100, 9, 12, '#5d5f5c', { metal: 0.5 });
      r.box(lx, PH + 4, z1 + 9, 90, 4, 6, pisca ? '#3c403c' : '#eafff0', { glow: true });
      if (!pisca && acesas < maxLuz) { r.light(lx, PH + 10, z1 + 70, '#d9ffe6', 0.7, 700, { fundo: true }); acesas++; }
    }
  }

  TN.cenarios = { room };
})();
```

- [ ] **Passo 4: validador com rastreio e repasse do kit (`engine/render3d.js`)**

Trocar o bloco inteiro de `function makeValidator() {` até o fechamento de `TN.R3 = { ... };` (antes de `if (!hasThree || typeof document === 'undefined') return;`) por:

```js
  // r.room / r.yard / r.prop: montados por engine/cenarios.js usando as primitivas da própria API
  // (por isso funcionam igual no navegador e no validador)
  const KIT = ['room', 'yard', 'prop'];
  const viaCenarios = (api, k) => (...args) => {
    const f = TN.cenarios && TN.cenarios[k];
    if (!f) throw new Error(`r.${k}: engine/cenarios.js não foi carregado (ou não tem "${k}")`);
    return f(api, ...args);
  };

  // ====================== VALIDADOR (Node / sem WebGL) ======================
  // Mesmo formato da API real; confere se os números são válidos e registra as chamadas (para testes).
  function makeValidator() {
    const errs = [], counts = {}, calls = [];
    const chk = (name, args) => {
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (typeof a === 'number' && !Number.isFinite(a)) errs.push(`${name}: argumento ${i + 1} inválido (${a})`);
      }
    };
    const api = {};
    for (const k of ['camera', 'env', 'box', 'cyl', 'sphere', 'cone', 'plane', 'disc', 'ring', 'beam', 'tube', 'light', 'label', 'character']) {
      api[k] = (...args) => {
        counts[k] = (counts[k] || 0) + 1; calls.push([k, args]);
        if (k === 'character') { const p = args[0] || {}; chk(k, [p.x, p.y, p.dir || 0]); } else chk(k, args);
      };
    }
    for (const k of KIT) api[k] = viaCenarios(api, k);
    api.W = TN.W; api.H = TN.H; api.time = 0;
    api.project = () => ({ x: 0, y: 0, visible: true });
    api.unproject = (sx, sy, py = 0) => ({ x: sx, y: py, z: sy });
    return { api, errs, counts, calls };
  }

  TN.R3 = {
    available: false,
    used: false,
    RETRO,
    DEFAULT_CAMERA, DEFAULT_ENV,
    // usado pelo tools/simular.js: roda draw3d contra o validador
    validate(round) {
      const { api, errs } = makeValidator();
      round.def.draw3d(round, api);
      return errs;
    },
    // usado pelo tools/teste_cenarios.js: roda fn(api) no validador com r.time = time e devolve o rastro
    trace(fn, time = 0) {
      const v = makeValidator();
      v.api.time = time;
      fn(v.api);
      return { errs: v.errs, counts: v.counts, calls: v.calls };
    },
  };
```

- [ ] **Passo 5: luz com prioridade e repasse do kit na API real (`engine/render3d.js`)**

Trocar o método `light` da API por:

```js
    // luz pontual (máx. 6 por quadro). o.fundo: luz de cenário, que só ocupa vaga sobrando depois do minigame
    light(x, y, z, color = '#fff', intensity = 1, distance = 300, o = {}) {
      if (o.fundo) { luzesFundo.push([x, y, z, color, intensity, distance]); return; }
      addLight(x, y, z, color, intensity, distance);
    },
```

Logo acima de `const api = {` (junto de `const lightPool = ...`), acrescentar:

```js
  const luzesFundo = [];   // luzes de cenário do quadro atual, acesas depois das do minigame
  function addLight(x, y, z, color, intensity, distance) {
    if (lightPool.n >= 6) return;
    let l = lightPool.list[lightPool.n];
    if (!l) { l = new THREE.PointLight('#fff', 1, 300, 1.6); scene.add(l); lightPool.list.push(l); }
    lightPool.n++;
    l.visible = true; l.position.set(x, y, z); l.color.set(color); l.intensity = intensity * 60000 / 100; l.distance = distance;
  }
```

Apagar o método `room(x1, z1, x2, z2, o = {}) { ... }` inteiro, com o comentário de 4 linhas acima dele, de dentro de `const api = { ... }`. No lugar, logo antes do `};` que fecha o `api`, colocar:

```js
    // cenários de cadeia (engine/cenarios.js)
    room: (...a) => viaCenarios(api, 'room')(...a),
    yard: (...a) => viaCenarios(api, 'yard')(...a),
    prop: (...a) => viaCenarios(api, 'prop')(...a),
```

No `renderRound`, trocar:

```js
      charPool.n = 0; lightPool.n = 0; labels = [];
```
por
```js
      charPool.n = 0; lightPool.n = 0; labels = []; luzesFundo.length = 0;
```
e trocar:
```js
      def.draw3d(round, api);
```
por
```js
      def.draw3d(round, api);
      for (const l of luzesFundo) addLight(...l);   // cenário ocupa só as vagas que sobraram
      luzesFundo.length = 0;
```

No `Object.assign(TN.R3, { ... })`, antes de `project: (x, y, z) => project(x, y, z),`, acrescentar:

```js
    // para testes (tools/teste_render.js): o que o último quadro acendeu
    stats() { return { luzes: lightPool.list.slice(0, lightPool.n).map((l) => ({ x: l.position.x, y: l.position.y, z: l.position.z })) }; },
```

- [ ] **Passo 6: carregar `engine/cenarios.js` em todo lugar que carrega o `render3d.js`**

- `index.html`: depois de `<script src="engine/render3d.js"></script>`, acrescentar `  <script src="engine/cenarios.js"></script>`.
- `tools/simular.js:45` e `tools/teste_rede.js:19`: na lista, depois de `'engine/render3d.js', `, acrescentar `'engine/cenarios.js', `.
- `tools/teste_render.html`: depois de `<script src="../engine/render3d.js"></script>`, acrescentar `  <script src="../engine/cenarios.js"></script>`.

- [ ] **Passo 7: rodar o teste em Node e ver passar**

Rodar: `node tools/teste_cenarios.js`
Esperado: todas as linhas com `✓` e "Tudo certo." Em particular `✓ room com cantos invertidos = cantos na ordem` e `✓ room com NaN: o validador acusa`.

- [ ] **Passo 8: teste de prioridade de luz no navegador**

Em `tools/teste_render.js`, logo abaixo de `// TESTES EXTRAS (as tarefas seguintes acrescentam blocos aqui)`, acrescentar:

```js
  // luzes do minigame têm prioridade sobre as do cenário (o motor tem 6 vagas)
  try {
    desenhar((g, r) => { r.room(40, 20, 920, 520); for (let i = 0; i < 6; i++) r.light(100 + i * 150, 40, 300, '#f00', 1, 200); }, 1);
    const luzes = TN.R3.stats().luzes;
    ok(luzes.length === 6 && luzes.every((l) => Math.abs(l.y - 40) < 0.01), 'luzes do jogo têm prioridade sobre as do cenário');
    desenhar((g, r) => { r.room(40, 20, 920, 520); r.light(480, 40, 300, '#f00', 1, 200); }, 1);
    ok(TN.R3.stats().luzes.length === 3, 'sobrando vaga, as luzes do cenário acendem (1 do jogo + 2 do cenário)');
  } catch (e) { ok(false, 'prioridade de luz: exceção ' + e.message); }
```

- [ ] **Passo 9: rodar todos os testes**

Rodar: `bash tools/teste_render.sh && node tools/simular.js | tail -3`
Esperado: o `teste_render.sh` termina com "Tudo certo." (as duas linhas novas com `✓` nos dois visuais), e o simulador também.

- [ ] **Passo 10: commit**

```bash
git add engine/cenarios.js engine/render3d.js index.html tools/simular.js tools/teste_rede.js tools/teste_cenarios.js tools/teste_render.html tools/teste_render.js
git commit -m "Kit de cenários em engine/cenarios.js, validador com rastreio e luzes de cenário com prioridade baixa

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: afinar o ambiente padrão e documentar a etapa 1

**Arquivos:**
- Modificar: `engine/render3d.js:19-21` (`DEFAULT_ENV` do visual novo)
- Modificar: `docs/COMO_CRIAR_MINIGAME.md` (seção "Gráficos 3D")

**Interfaces:**
- Consome: `bash tools/screenshots.sh` (tarefa 1).
- Produz: valores finais do `DEFAULT_ENV` e documentação de `o.tex`, `o.texWorld`, `env.spot*`, `o.number`, `{ fundo }` e `?visual=antigo`.

- [ ] **Passo 1: gerar os screenshots de referência**

Rodar (servidor na 8765 em background): `bash tools/screenshots.sh screenshots/antes 12`
Esperado: "ok <id>" 23 vezes e 46 PNGs em `screenshots/antes/`.

- [ ] **Passo 2: revisar os 23 pares com a ferramenta Read e anotar quem falha nesta lista**

Para cada `<id>.png`, comparado com `<id>_antigo.png`:
- (a) cada jogador está visível e distinguível pela cor;
- (b) todo perigo e alvo do jogo é visível (escotilha, nicho, símbolo, seta, laser, mina revelada);
- (c) o centro da arena não fica abaixo de cerca de 25% de brilho percebido;
- (d) as bordas podem ficar escuras, mas o HUD 2D não pode competir com o fundo.

Anote as falhas num arquivo temporário `screenshots/antes/NOTAS.txt` (não vai para o git), no formato `id: falha (a|b|c|d) — observação`.

- [ ] **Passo 3: ajustar o `DEFAULT_ENV` do visual novo**

Só mexa nestes parâmetros, dentro destas faixas (linha `RETRO ? {...}`):

| parâmetro | atual | faixa | efeito |
|---|---|---|---|
| `ambient` | 0.16 | 0.12–0.30 | levanta as sombras (resolve (c)) |
| `sun` | 0.45 | 0.30–0.90 | ilumina tudo por igual (usar pouco) |
| `spot` | 5.5 | 4–7 | luz do centro da arena |
| `fog` | [1000, 2200] | perto 800–1300 | escurece o fundo distante |

O que **não** se resolve aqui: um jogo específico escuro demais por causa do `env` próprio. Isso fica anotado para a etapa 3.

- [ ] **Passo 4: gerar de novo e comparar**

Rodar: `bash tools/screenshots.sh screenshots/depois 12`
Esperado: as falhas de (a), (b) e (c) anotadas no passo 2 que não eram de `env` próprio somem nos `screenshots/depois/<id>.png`. Repita os passos 3 e 4 até isso acontecer, no máximo 3 vezes. Se sobrar alguma falha, deixe anotada para a etapa 3.

- [ ] **Passo 5: documentar no `docs/COMO_CRIAR_MINIGAME.md`**

Trocar o item que começa com `- Ajuste a luz com \`env: {` por:

```markdown
- Ajuste a luz com `env: { bg, fog: [perto, longe], ambient, sun, sunDir: [x,y,z], sunColor, envMap, spot, spotColor, spotPos: [x,y,z], spotTarget: [x,y,z], spotAngle }`. `spot` é o holofote de teto (intensidade; `0` desliga) que deixa o centro claro e as bordas escuras. Use `envMap: 0` para desligar os reflexos do ambiente e deixar a cena escura de verdade (ex.: apagão); `r.env({...})` dentro do `draw3d` muda a luz por fase. O padrão é a cadeia: pouca luz ambiente, tom quente e holofote no centro.
```

Logo depois do item que começa com `- \`draw3d\` é chamado **a cada quadro**`, acrescentar:

```markdown

**Visual de cadeia (padrão):** a cena é desenhada em 640×360 e ampliada com pixel duro, com redução de cores, texturas sujas e luz dura. `?visual=antigo` na URL volta ao visual liso (para comparar, ou em máquina sem fôlego). `TN.R3.RETRO` diz qual está ativo.
- Toda primitiva sem `glow` ganha uma textura suja que **multiplica** a cor pedida. Pisos (`plane`, `disc`, `ring`) usam `piso` em coordenadas do mundo; o resto usa `concreto`, presa ao objeto (não escorrega quando ele anda); `metal >= 0.4` vira `metal`.
- `o.tex` escolhe a textura (`'concreto' | 'piso' | 'metal' | 'tinta' | 'tecido'`) ou desliga (`false`). `o.texWorld: true` amarra a textura ao mundo em vez do objeto, o que deixa contínuos os ladrilhos vizinhos.
- O que precisa saltar aos olhos (perigo, alvo, símbolo, seta) deve usar `glow: true`: não recebe textura nem luz, então o verde e o vermelho continuam puros no escuro.
```

Na tabela de chamadas, trocar a linha do `r.light` por:

```markdown
| `r.light(x, y, z, cor, intensidade, alcance, o)` | luz pontual, com no máximo 6 por quadro; `o.fundo: true` = luz de cenário, que só acende se sobrar vaga |
```

e a linha do `r.character` por:

```markdown
| `r.character(p, o)` | **personagem** (detento de uniforme na cor do jogador), animado sozinho (veja abaixo) |
```

Na lista "Outras opções" do personagem, depois de `o.key (id para a animação, quando não é um jogador)`, acrescentar `, \`o.number\` (número de prontuário nas costas; padrão: 171, 155, 157 e 180 para os jogadores)`.

- [ ] **Passo 6: rodar os testes**

Rodar: `bash tools/teste_render.sh && node tools/teste_cenarios.js | tail -1 && node tools/simular.js | tail -1`
Esperado: "Tudo certo." três vezes.

- [ ] **Passo 7: commit**

```bash
git add engine/render3d.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Visual cadeia: afina a luz padrão pelos 23 jogos e documenta texturas, holofote e luzes de fundo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: texturas novas (tijolo, azulejo, caquinho, madeira, taco)

**Arquivos:**
- Modificar: `engine/render3d.js` (função `makeTexture`, `TEX_SIZE` e `Object.assign(TN.R3, ...)`)
- Modificar: `tools/teste_render.js` (teste de texturas)
- Modificar: `docs/COMO_CRIAR_MINIGAME.md` (lista do `o.tex`)

**Interfaces:**
- Produz: os nomes de textura `'tijolo' | 'azulejo' | 'caquinho' | 'madeira' | 'taco'`, válidos em `o.tex`.
- Produz: `TN.R3._textura(nome)` (só no navegador, para testes), que retorna a `THREE.DataTexture` (`.image.data` é um Uint8Array RGBA 128×128).

- [ ] **Passo 1: escrever primeiro o teste em `tools/teste_render.js`** (abaixo de `// TESTES EXTRAS ...`)

```js
  // texturas: todas existem, não são lisas, têm brilho de multiplicador (0.5..1) e são diferentes entre si
  try {
    const nomes = ['concreto', 'piso', 'metal', 'tinta', 'tecido', 'tijolo', 'azulejo', 'caquinho', 'madeira', 'taco'];
    const assinaturas = new Set();
    for (const n of nomes) {
      const d = TN.R3._textura(n).image.data;
      let soma = 0, soma2 = 0, h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { const v = d[i] / 255; soma += v; soma2 += v * v; h = Math.imul(h ^ d[i], 16777619); }
      const qtd = d.length / 4, media = soma / qtd, desvio = Math.sqrt(Math.max(0, soma2 / qtd - media * media));
      ok(media > 0.5 && media < 0.98 && desvio > 0.02, `textura ${n}: média ${media.toFixed(2)}, desvio ${desvio.toFixed(3)}`);
      assinaturas.add(h >>> 0);
    }
    ok(assinaturas.size === nomes.length, 'as texturas são todas diferentes entre si');
  } catch (e) { ok(false, 'texturas: exceção ' + e.message); }
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `bash tools/teste_render.sh`
Esperado: no visual novo, `✗ texturas: exceção TN.R3._textura is not a function` e "FALHOU."

- [ ] **Passo 3: expor a textura para os testes**

No `Object.assign(TN.R3, { ... })`, junto do `stats()`, acrescentar:

```js
    _textura: (nome) => texOf(nome),   // para testes (tools/teste_render.js)
```

- [ ] **Passo 4: gerar as texturas novas em `makeTexture`**

Trocar:

```js
    const col = Array.from({ length: N }, () => rnd());   // variação por coluna (riscos verticais, escorridos)
    const px = new Float32Array(N * N * 3);
```
por
```js
    const col = Array.from({ length: N }, () => rnd());   // variação por coluna (riscos verticais, escorridos)
    const per = Array.from({ length: 64 }, () => rnd());   // tom de cada peça (tijolo, azulejo, tábua, taco)
    // caquinho: pontos de Voronoi (cacos), com distância que "dá a volta" para repetir sem emenda
    const pts = kind === 'caquinho' ? Array.from({ length: 36 }, () => [rnd() * N, rnd() * N, 0.72 + 0.28 * rnd()]) : null;
    const px = new Float32Array(N * N * 3);
```

e trocar:

```js
      } else {   // 'concreto' e 'piso'
```
por
```js
      } else if (kind === 'tijolo') {   // fiadas de 16 px, tijolos de 32 px, juntas escuras
        const fiada = Math.floor(y / 16), off = fiada % 2 ? 16 : 0, tij = Math.floor((x + off) / 32) % 4;
        const junta = y % 16 < 2 || (x + off) % 32 < 2;
        r = g = b = junta ? 0.5 : 0.78 + 0.18 * per[(fiada * 4 + tij) % 64] + 0.08 * n32(u, v) - 0.05 * rnd();
      } else if (kind === 'azulejo') {   // azulejo de 32 px, rejunte escuro, encardido
        const junta = x % 32 < 2 || y % 32 < 2;
        const sujo = Math.max(0, n8(u, v) - 0.55) * 0.9;
        const k = (junta ? 0.55 : 0.93 + 0.04 * per[(Math.floor(y / 32) * 4 + Math.floor(x / 32)) % 64]) - sujo;
        r = k; g = k * 0.99; b = k * 0.95;
      } else if (kind === 'caquinho') {   // piso de caquinho: cacos irregulares com rejunte
        let d1 = 1e9, d2 = 1e9, tom = 1;
        for (const [qx, qy, qv] of pts) {
          let dx = Math.abs(x - qx), dy = Math.abs(y - qy); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; tom = qv; } else if (d < d2) d2 = d;
        }
        r = g = b = d2 - d1 < 1.6 ? 0.5 : tom + 0.05 * n32(u, v) - 0.04 * rnd();
      } else if (kind === 'madeira') {   // tábuas verticais de 16 px com veio
        const tab = Math.floor(x / 16);
        const veio = 0.08 * Math.sin((u * 6 + n16(u, v) * 2.5 + per[tab % 64] * 6) * Math.PI * 2);
        r = g = b = x % 16 === 0 ? 0.5 : 0.78 + veio + 0.1 * per[tab % 64] + 0.04 * rnd();
      } else if (kind === 'taco') {   // taco em blocos de 32 px alternando o sentido, réguas de 8 px
        const bx = Math.floor(x / 32), by = Math.floor(y / 32), lx = x % 32, ly = y % 32;
        const deitado = (bx + by) % 2 === 0, faixa = Math.floor((deitado ? ly : lx) / 8);
        const junta = (deitado ? ly : lx) % 8 === 0 || lx === 0 || ly === 0;
        r = g = b = junta ? 0.5 : 0.76 + 0.16 * per[((by * 4 + bx) * 4) % 64 + faixa] + 0.05 * n32(u, v);
      } else {   // 'concreto' e 'piso'
```

E trocar a linha do `TEX_SIZE` por:

```js
  const TEX_SIZE = { concreto: 300, piso: 420, metal: 220, tinta: 340, tecido: 60, tijolo: 170, azulejo: 110, caquinho: 190, madeira: 130, taco: 150 };   // unidades de mundo por repetição
```

- [ ] **Passo 5: rodar e ver passar**

Rodar: `bash tools/teste_render.sh`
Esperado: no visual novo, 10 linhas `✓ textura ...` e `✓ as texturas são todas diferentes entre si`, terminando em "Tudo certo." No visual antigo as texturas também são geradas, porque o teste chama `_textura` direto.

- [ ] **Passo 6: atualizar a lista no `docs/COMO_CRIAR_MINIGAME.md`**

Trocar `` `o.tex` escolhe a textura (`'concreto' | 'piso' | 'metal' | 'tinta' | 'tecido'`) `` por
`` `o.tex` escolhe a textura (`'concreto' | 'piso' | 'metal' | 'tinta' | 'tecido' | 'tijolo' | 'azulejo' | 'caquinho' | 'madeira' | 'taco'`) ``.

- [ ] **Passo 7: commit**

```bash
git add engine/render3d.js tools/teste_render.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Texturas novas: tijolo, azulejo, caquinho, madeira e taco

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: objetos de cenário `r.prop`

**Arquivos:**
- Modificar: `engine/cenarios.js`
- Modificar: `tools/teste_cenarios.js`, `tools/teste_render.js`
- Modificar: `docs/COMO_CRIAR_MINIGAME.md`

**Interfaces:**
- Consome: `rect` não é usado aqui; texturas `'tecido'` (já existe).
- Produz: `TN.cenarios.prop(r, nome, x, z, o)` e `r.prop(nome, x, z, o)`.
  - `nome`: um de `beliche | vaso | banco | mesa | tambor | pneu | colchao | grade | poste | arquivo`.
  - `o`: `{ rotY, scale, y, color, w, h, luz }` (`w`/`h` só para `grade`; `luz` só para `poste`).
  - Nome desconhecido lança `Error('r.prop: objeto desconhecido "<nome>" (use: beliche, vaso, ...)')`.
- Produz: o helper interno `montador(r, x, z, o)`, que retorna `{ box, cyl, tube, sphere, light }` em coordenadas locais. As tarefas 6 e 7 usam `r.prop(...)`, não o montador.

- [ ] **Passo 1: escrever primeiro os testes**

Em `tools/teste_cenarios.js`, abaixo de `// CASOS EXTRAS ...`:

```js
// --- r.prop ---
for (const nome of ['beliche', 'vaso', 'banco', 'mesa', 'tambor', 'pneu', 'colchao', 'grade', 'poste', 'arquivo']) {
  const t = trace((r) => r.prop(nome, 300, 200, { rotY: 0.7, scale: 1.2 }));
  ok(t.errs.length === 0 && t.calls.length >= 1 && (t.counts.light || 0) === 0, `prop ${nome}: válido, sem luz`);
}
{ const t = trace((r) => r.prop('poste', 300, 200, { luz: true })); ok(t.counts.light === 1, 'prop poste com luz: acende 1 luz'); }
deveFalhar('prop com nome errado', (r) => r.prop('belixe', 0, 0), 'beliche');
{
  // girar 180° em torno de (300,200) espelha os pontos: a 1ª gaveta (x local 15.5) vai de x=315.5 para x=284.5
  const a = trace((r) => r.prop('arquivo', 300, 200)).calls[1][1], b = trace((r) => r.prop('arquivo', 300, 200, { rotY: Math.PI })).calls[1][1];
  ok(Math.abs((a[0] - 300) + (b[0] - 300)) < 1e-6 && Math.abs((a[2] - 200) + (b[2] - 200)) < 1e-6, 'prop girado 180° espelha em torno do ponto');
}
```

Em `tools/teste_render.js`, no array `CENAS`, acrescentar:

```js
    ['objetos (r.prop)', (g, r) => {
      ['beliche', 'vaso', 'banco', 'mesa', 'tambor', 'pneu', 'colchao', 'grade', 'poste', 'arquivo']
        .forEach((n, i) => r.prop(n, 120 + (i % 5) * 180, 180 + Math.floor(i / 5) * 200, { rotY: i * 0.4 }));
    }],
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node tools/teste_cenarios.js`
Esperado: `✗ prop beliche: exceção ... engine/cenarios.js não foi carregado (ou não tem "prop")` (ou a mesma mensagem dentro do `trace`), e "N falha(s)."

- [ ] **Passo 3: implementar em `engine/cenarios.js`**

No comentário do topo, depois da linha do `r.room`, acrescentar:

```js
//   r.prop(nome, x, z, o)     objetos (beliche, vaso, banco, mesa, tambor, pneu, colchao, grade, poste, arquivo)
```

Antes de `TN.cenarios = { room };`, acrescentar:

```js
  // Desenha em coordenadas locais (lx, lz) em torno de (x, z), girado por o.rotY (mesmo sentido do
  // rotation.y do Three), escalado por o.scale e elevado por o.y.
  function montador(r, x, z, o) {
    const s = o.scale ?? 1, a = o.rotY || 0, c = Math.cos(a), sn = Math.sin(a), y0 = o.y || 0;
    const P = (lx, lz) => [x + s * (lx * c + lz * sn), z + s * (-lx * sn + lz * c)];
    return {
      box(lx, ly, lz, w, h, d, cor, op = {}) { const [wx, wz] = P(lx, lz); r.box(wx, y0 + ly * s, wz, w * s, h * s, d * s, cor, { ...op, rotY: a + (op.rotY || 0) }); },
      cyl(lx, ly, lz, rad, h, cor, op = {}) { const [wx, wz] = P(lx, lz); r.cyl(wx, y0 + ly * s, wz, rad * s, h * s, cor, op); },
      tube(ax, ay, az, bx, by, bz, rad, cor, op = {}) { const [px, pz] = P(ax, az), [qx, qz] = P(bx, bz); r.tube(px, y0 + ay * s, pz, qx, y0 + by * s, qz, rad * s, cor, op); },
      sphere(lx, ly, lz, rad, cor, op = {}) { const [wx, wz] = P(lx, lz); r.sphere(wx, y0 + ly * s, wz, rad * s, cor, op); },
      light(lx, ly, lz, cor, k, dist) { const [wx, wz] = P(lx, lz); r.light(wx, y0 + ly * s, wz, cor, k, dist * s, { fundo: true }); },
    };
  }

  const FERRO = '#4a4b47', INOX = '#9a9d9a', CIMENTO = '#6e6b63';
  const PROPS = {
    beliche(m) {
      for (const [px, pz] of [[-22, -48], [22, -48], [-22, 48], [22, 48]]) m.box(px, 0, pz, 4, 112, 4, FERRO, { metal: 0.6 });
      for (const y of [18, 72]) { m.box(0, y, 0, 46, 4, 100, FERRO, { metal: 0.6 }); m.box(0, y + 4, 0, 42, 9, 94, '#6d6a58', { tex: 'tecido' }); }
    },
    vaso(m) {
      m.cyl(0, 0, 0, 8, 16, INOX, { metal: 0.8, rough: 0.3 });
      m.cyl(0, 16, 0, 13, 6, INOX, { metal: 0.8, rough: 0.3 });
      m.cyl(0, 21.5, 0, 9, 1, '#2a3a3a', { tex: false });
      m.box(-14, 0, 0, 8, 34, 24, INOX, { metal: 0.8, rough: 0.3 });
    },
    banco(m) {
      m.box(-34, 0, 0, 10, 20, 22, CIMENTO); m.box(34, 0, 0, 10, 20, 22, CIMENTO);
      m.box(0, 20, 0, 92, 6, 26, CIMENTO);
    },
    mesa(m) {
      const tampo = '#7c7e79';
      m.box(0, 0, 0, 14, 32, 14, CIMENTO);
      m.box(0, 32, 0, 140, 5, 58, tampo, { metal: 0.6, rough: 0.4 });
      for (const pz of [-48, 48]) { m.box(0, 0, pz, 12, 18, 12, CIMENTO); m.box(0, 18, pz, 140, 4, 18, tampo, { metal: 0.6, rough: 0.4 }); }
    },
    tambor(m, o) {
      const cor = o.color ?? '#4f5e3a';
      m.cyl(0, 0, 0, 16, 44, cor, { metal: 0.5 });
      for (const y of [12, 30]) m.cyl(0, y, 0, 16.8, 2, cor, { metal: 0.5 });
      m.cyl(0, 44, 0, 15, 0.6, '#1d1f1c', { metal: 0.5 });
    },
    pneu(m) {
      m.cyl(0, 0, 0, 18, 10, '#1a1a1a', { rough: 0.95, tex: false });
      m.cyl(0, 0.2, 0, 9, 10.2, '#070707', { tex: false });
    },
    colchao(m, o) { m.box(0, 0, 0, 50, 8, 100, o.color ?? '#7a7660', { tex: 'tecido' }); },
    grade(m, o) {   // trecho de grade ao longo do eixo X local; o.w = largura, o.h = altura
      const w = o.w ?? 100, h = o.h ?? 140, ferro = '#55534e';
      for (let x = -w / 2; x <= w / 2 + 0.1; x += 12) m.tube(x, 0, 0, x, h, 0, 2, ferro, { metal: 0.6 });
      m.box(0, h, 0, w + 4, 5, 5, ferro, { metal: 0.6 });
      m.box(0, h * 0.5, 0, w + 4, 4, 4, ferro, { metal: 0.6 });
    },
    poste(m, o) {   // poste de vapor de sódio; o braço aponta para +X local; o.luz acende 1 luz de fundo
      const ferro = '#3d3e3b';
      m.tube(0, 0, 0, 0, 230, 0, 4, ferro, { metal: 0.5 });
      m.tube(0, 226, 0, 46, 236, 0, 2.5, ferro, { metal: 0.5 });
      m.box(52, 228, 0, 26, 8, 14, ferro, { metal: 0.5 });
      m.box(52, 226, 0, 20, 2, 10, '#ffb04a', { glow: true });
      if (o.luz) m.light(52, 200, 0, '#ffa040', 1, 700);
    },
    arquivo(m) {   // arquivo de aço; a frente (gavetas) olha para +X local
      const aco = '#6b6f6a';
      m.box(0, 0, 0, 30, 80, 36, aco, { metal: 0.55 });
      for (let i = 0; i < 4; i++) {
        m.box(15.5, 6 + i * 19, 0, 1, 1.2, 32, '#2a2c2a', { tex: false });
        m.box(16, 14 + i * 19, 0, 1.5, 2, 8, '#b9bcb6', { metal: 0.8 });
      }
    },
  };
  function prop(r, nome, x, z, o = {}) {
    const f = PROPS[nome];
    if (!f) throw new Error(`r.prop: objeto desconhecido "${nome}" (use: ${Object.keys(PROPS).join(', ')})`);
    f(montador(r, x, z, o), o);
  }
```

E trocar `TN.cenarios = { room };` por `TN.cenarios = { room, prop };`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node tools/teste_cenarios.js && bash tools/teste_render.sh`
Esperado: todas as linhas de `prop` com `✓`, `✓ objetos (r.prop): desenha algo` e `... determinística` nos dois visuais, e "Tudo certo." nos dois scripts.

- [ ] **Passo 5: documentar no `docs/COMO_CRIAR_MINIGAME.md`**

Na tabela de chamadas, depois da linha do `r.character`, acrescentar:

```markdown
| `r.prop(nome, x, z, o)` | objeto de cenário: `beliche`, `vaso`, `banco`, `mesa`, `tambor`, `pneu`, `colchao`, `grade` (`o.w`, `o.h`), `poste` (`o.luz`), `arquivo`; `o: { rotY, scale, y, color }` |
```

- [ ] **Passo 6: commit**

```bash
git add engine/cenarios.js tools/teste_cenarios.js tools/teste_render.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Kit de cenários: objetos (beliche, vaso, banco, mesa, tambor, pneu, colchão, grade, poste, arquivo)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `r.room` com 5 estilos

**Arquivos:**
- Modificar: `engine/cenarios.js` (substitui a função `room`)
- Modificar: `tools/teste_cenarios.js`, `tools/teste_render.js`
- Modificar: `docs/COMO_CRIAR_MINIGAME.md`

**Interfaces:**
- Consome: `r.prop('grade' | 'tambor' | 'arquivo', ...)` (tarefa 5) e as texturas `tijolo`, `azulejo`, `caquinho`, `madeira`, `taco` (tarefa 4).
- Produz: `r.room(x1, z1, x2, z2, o)` com `o.estilo`, que é um de `cela` (padrão), `oficina`, `refeitorio`, `subsolo` ou `escritorio`. Estilo desconhecido lança `Error('r.room: estilo desconhecido "<x>" (use: cela, oficina, ...)')`.
  - Opções: `{ estilo, h, paintH, paint, top, floor, windows, lamps, lights, bars, frente, props }`.
  - `frente` é quanto as paredes laterais avançam em direção à câmera (padrão 500).
  - `props: false` tira os objetos de canto (bancada, tambores, arquivos).
- Garantia de layout: os detalhes de canto ficam a até 60 unidades da parede do fundo. Deixe essa margem entre `z1` e a arena do jogo.

- [ ] **Passo 1: escrever primeiro os testes**

Em `tools/teste_cenarios.js`, abaixo dos casos de `prop`:

```js
// --- r.room: estilos ---
for (const estilo of ['cela', 'oficina', 'refeitorio', 'subsolo', 'escritorio']) {
  cenarioValido(`room estilo ${estilo}`, (r) => r.room(40, 20, 920, 520, { estilo }));
  ok(mesmas(trace((r) => r.room(920, 520, 40, 20, { estilo })), trace((r) => r.room(40, 20, 920, 520, { estilo }))), `room ${estilo}: cantos invertidos = cantos na ordem`);
}
deveFalhar('room com estilo errado', (r) => r.room(0, 0, 100, 100, { estilo: 'cozinha' }), 'refeitorio');
ok(!mesmas(trace((r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' }), 0), trace((r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' }), 0.4)), 'room subsolo: giroflex muda com o tempo');
```

Em `tools/teste_render.js`, no array `CENAS`, acrescentar:

```js
    ['oficina', (g, r) => r.room(40, 20, 920, 520, { estilo: 'oficina' })],
    ['refeitório', (g, r) => r.room(40, 20, 920, 520, { estilo: 'refeitorio' })],
    ['subsolo', (g, r) => r.room(40, 20, 920, 520, { estilo: 'subsolo' })],
    ['escritório', (g, r) => r.room(40, 20, 920, 520, { estilo: 'escritorio' })],
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node tools/teste_cenarios.js`
Esperado: `✗ room com estilo errado: deveria dar erro` e `✗ room subsolo: giroflex muda com o tempo` (o `room` atual ignora `estilo`).

- [ ] **Passo 3: substituir a função `room` em `engine/cenarios.js`**

Trocar desde o comentário `// Cela: chão, parede do fundo...` até o fim da função `room` por:

```js
  // Estilos de ambiente interno. Paredes: meia-parede (paint, até paintH) + parte de cima (top).
  const ESTILOS = {
    cela:       { paint: '#35574a', top: '#857d6b', floor: '#3e3c38', texPaint: 'tinta',    texTop: 'tinta',    texFloor: 'piso',     lamp: 'fluor' },
    oficina:    { paint: '#6b3a2a', top: '#5e3426', floor: '#45413b', texPaint: 'tijolo',   texTop: 'tijolo',   texFloor: 'piso',     lamp: 'pendente' },
    refeitorio: { paint: '#cfccc2', top: '#8a8370', floor: '#7a3328', texPaint: 'azulejo',  texTop: 'tinta',    texFloor: 'caquinho', lamp: 'fluor' },
    subsolo:    { paint: '#3b3e3d', top: '#2d302f', floor: '#2b2c2b', texPaint: 'concreto', texTop: 'concreto', texFloor: 'piso',     lamp: 'emergencia' },
    escritorio: { paint: '#6e4f33', top: '#a39778', floor: '#5c4129', texPaint: 'madeira',  texTop: 'tinta',    texFloor: 'taco',     lamp: 'pendente' },
  };

  function janelas(r, b, o, persiana) {   // janelas altas no fundo: com grade (cela) ou persiana (escritório)
    const n = o.windows ?? Math.max(1, Math.round(b.w / 320));
    for (let i = 0; i < n; i++) {
      const wx = b.x1 + b.w * (i + 0.5) / n, wy = b.H * 0.55, ww = 74, wh = b.H * 0.28;
      r.box(wx, wy, b.z1 + 0.5, ww + 10, wh + 10, 3, '#3a3a36', { metal: 0.5 });
      r.box(wx, wy + 5, b.z1 + 1, ww, wh, 3, '#06080a', { tex: false });
      if (persiana) for (let k = 0; k < 8; k++) r.box(wx, wy + 8 + k * wh / 8, b.z1 + 3, ww, 2.5, 2, '#b9b39f', { tex: false });
      else for (let k = 0; k < 7; k++) { const bx = wx - ww / 2 + (k + 0.5) * ww / 7; r.tube(bx, wy + 5, b.z1 + 4, bx, wy + 5 + wh, b.z1 + 4, 1.6, '#4a4844', { metal: 0.6 }); }
    }
  }

  // detalhes de cada estilo (b = medidas já normalizadas do ambiente)
  const DETALHES = {
    cela(r, b, o) {
      janelas(r, b, o, false);
      r.tube(b.x1, b.H - 22, b.z1 + 10, b.x2, b.H - 22, b.z1 + 10, 5, '#6b5846', { metal: 0.5 });
      if (o.bars !== false) {   // grade de cela na lateral esquerda, com o fundo escuro da cela vizinha
        const bz = b.z1 + 60, bl = Math.min(220, b.sideD * 0.4);
        r.box(b.x1 + 1, 0, bz + bl / 2, 3, b.H * 0.7, bl, '#07090a', { tex: false });
        r.prop('grade', b.x1 + 5, bz + bl / 2, { w: bl, h: b.H * 0.7, rotY: Math.PI / 2 });
      }
    },
    oficina(r, b, o) {
      const n = Math.floor(b.w / 12);   // faixa zebrada na base da parede do fundo
      for (let i = 0; i < n; i++) r.box(b.x1 + 6 + i * 12, 9, b.z1 + 1, 12, 14, 2, i % 2 ? '#141414' : '#d9a800', { tex: false });
      if (o.props !== false) {
        r.box(b.x1 + 90, 0, b.z1 + 26, 140, 34, 40, '#5a4a38');   // bancada
        r.box(b.x1 + 90, 34, b.z1 + 26, 146, 4, 44, '#3d3b37', { metal: 0.5 });
        r.prop('tambor', b.x2 - 50, b.z1 + 30);
        r.prop('tambor', b.x2 - 86, b.z1 + 26, { color: '#6b2e22' });
      }
    },
    refeitorio(r, b) {
      const pw = Math.min(220, b.w * 0.3);   // passa-pratos gradeado com balcão de inox
      r.box(b.cx, b.PH + 10, b.z1 + 1, pw, 60, 3, '#0a0b0b', { tex: false });
      r.box(b.cx, b.PH + 4, b.z1 + 8, pw + 16, 6, 18, '#8b8d88', { metal: 0.6 });
      r.prop('grade', b.cx, b.z1 + 4, { w: pw, h: 60, y: b.PH + 10 });
    },
    subsolo(r, b) {
      r.tube(b.x1, b.H - 30, b.z1 + 14, b.x2, b.H - 30, b.z1 + 14, 9, '#4d4038', { metal: 0.5 });
      r.tube(b.x1, b.H - 52, b.z1 + 12, b.x2, b.H - 52, b.z1 + 12, 6, '#39443f', { metal: 0.5 });
      for (let i = 0; i < 3; i++) { const px = b.x1 + b.w * (0.2 + 0.3 * i); r.tube(px, 0, b.z1 + 12, px, b.H - 30, b.z1 + 12, 5, '#4d4038', { metal: 0.5 }); }
      r.disc(b.x1 + 60, 0.2, b.z1 + 40, 30, '#111312', { rough: 0.15, metal: 0.3, tex: false });   // poças
      r.disc(b.x2 - 80, 0.2, b.z1 + 36, 24, '#111312', { rough: 0.15, metal: 0.3, tex: false });
    },
    escritorio(r, b, o) {
      janelas(r, b, o, true);
      if (o.props !== false) { r.prop('arquivo', b.x1 + 40, b.z1 + 22, { rotY: -Math.PI / 2 }); r.prop('arquivo', b.x1 + 76, b.z1 + 22, { rotY: -Math.PI / 2 }); }
    },
  };

  // luminárias no fundo: fluorescente (a do meio pisca), pendente (lâmpada amarela) ou giroflex vermelho
  function luminarias(r, tipo, b, o) {
    const n = o.lamps ?? 3, t = r.time || 0, maxLuz = Math.min(2, o.lights ?? 2);
    let acesas = 0;
    for (let i = 0; i < n; i++) {
      const lx = b.x1 + b.w * (i + 0.5) / n;
      if (tipo === 'fluor') {
        const pisca = i === Math.floor(n / 2) && Math.sin(t * 17) + Math.sin(t * 5.3 + 1) > 1.25;
        r.box(lx, b.PH + 8, b.z1 + 6, 100, 9, 12, '#5d5f5c', { metal: 0.5 });
        r.box(lx, b.PH + 4, b.z1 + 9, 90, 4, 6, pisca ? '#3c403c' : '#eafff0', { glow: true });
        if (!pisca && acesas < maxLuz) { r.light(lx, b.PH + 10, b.z1 + 70, '#d9ffe6', 0.7, 700, { fundo: true }); acesas++; }
      } else if (tipo === 'pendente') {
        const ly = b.H - 60, lz = b.z1 + 80;
        r.beam(lx, b.H + 40, lz, lx, ly + 14, lz, 1.5, '#111111');
        r.cone(lx, ly + 2, lz, 16, 12, '#2f3a33', { metal: 0.5 });
        r.sphere(lx, ly + 2, lz, 5, '#ffd28a', { glow: true });
        if (acesas < maxLuz) { r.light(lx, ly - 10, lz, '#ffc477', 0.8, 650, { fundo: true }); acesas++; }
      } else {   // 'emergencia': giroflex
        const ang = t * 4 + i, k = 0.5 + 0.5 * Math.cos(ang);
        r.cyl(lx, b.PH + 20, b.z1 + 8, 7, 6, '#222222', { metal: 0.5 });
        r.sphere(lx, b.PH + 30, b.z1 + 8, 6, k > 0.5 ? '#ff2a1a' : '#5a0d08', { glow: true });
        if (acesas < maxLuz) { r.light(lx + Math.cos(ang) * 60, b.PH + 30, b.z1 + 8 + Math.abs(Math.sin(ang)) * 60, '#ff3a22', 0.4 + 0.6 * k, 500, { fundo: true }); acesas++; }
      }
    }
  }

  // Ambiente interno: chão, parede do fundo e laterais (a frente fica aberta para a câmera), detalhes do
  // estilo e luminárias. o: { estilo, h, paintH, paint, top, floor, windows, lamps, lights, bars, frente, props }
  function room(r, x1, z1, x2, z2, o = {}) {
    const nome = o.estilo || 'cela', est = ESTILOS[nome];
    if (!est) throw new Error(`r.room: estilo desconhecido "${o.estilo}" (use: ${Object.keys(ESTILOS).join(', ')})`);
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 200, PH = o.paintH ?? H * 0.45, T = 16, w = x2 - x1, cx = (x1 + x2) / 2;
    const paint = o.paint ?? est.paint, top = o.top ?? est.top, floor = o.floor ?? est.floor;
    const zFront = z2 + (o.frente ?? 500), sideD = zFront - z1, sideZ = (z1 + zFront) / 2;
    r.plane(cx, -1.5, sideZ, w + 1400, sideD + 900, floor, { tex: est.texFloor });
    const wall = (x, z, ww, dd) => {
      r.box(x, 0, z, ww, PH, dd, paint, { tex: est.texPaint });
      r.box(x, PH, z, ww, H - PH, dd, top, { tex: est.texTop });
      r.box(x, PH - 3, z, ww + 2, 6, dd + 2, ESCURO, { tex: 'tinta' });
      r.box(x, 0, z, ww + 2, 9, dd + 2, ESCURO);
    };
    wall(cx, z1 - T / 2, w + T * 2, T);
    wall(x1 - T / 2, sideZ, T, sideD);
    wall(x2 + T / 2, sideZ, T, sideD);
    const b = { x1, z1, x2, z2, w, cx, H, PH, sideD };
    DETALHES[nome](r, b, o);
    luminarias(r, est.lamp, b, o);
  }
```

Atualizar o comentário do topo do arquivo: trocar a linha do `r.room` por:

```js
//   r.room(x1, z1, x2, z2, o)  ambientes internos: o.estilo = cela | oficina | refeitorio | subsolo | escritorio
```

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node tools/teste_cenarios.js && bash tools/teste_render.sh && node tools/simular.js aspiradores | tail -1`
Esperado: "Tudo certo." nos três. O Aspiradores usa `r.room` sem estilo, então cai em `cela` e continua igual.

- [ ] **Passo 5: conferir visualmente os 5 estilos**

Rodar: `bash tools/screenshot.sh aspiradores 12 /tmp/tn_aspiradores.png`, abrir com Read e comparar com `screenshots/depois/aspiradores.png` da tarefa 3. Esperado: idêntico ou quase.

Depois, um screenshot por estilo, abrindo cada PNG com Read:
```bash
for c in cela oficina refeitório subsolo escritório; do bash tools/ver_cena.sh "$c" "/tmp/tn_$c.png"; done
```
Esperado: cada estilo com a sua parede, chão e luminária (tijolo e zebrado; azulejo e caquinho; canos e giroflex; madeira, taco e persiana). Se algum detalhe flutuar ou atravessar uma parede, corrija as coordenadas desse detalhe em `DETALHES` e rode de novo o passo 4.

- [ ] **Passo 6: documentar no `docs/COMO_CRIAR_MINIGAME.md`**

Na tabela de chamadas, logo acima da linha do `r.prop`, acrescentar:

```markdown
| `r.room(x1, z1, x2, z2, o)` | ambiente interno de cadeia em volta da arena (chão, paredes do fundo e laterais, detalhes, luminárias); `o.estilo`: `cela` (padrão), `oficina`, `refeitorio`, `subsolo`, `escritorio`; outras opções: `h`, `paint`, `top`, `floor`, `windows`, `lamps`, `lights`, `bars`, `frente`, `props: false`. Deixe ~60 de margem entre `z1` e a arena (objetos de canto). Acende até 2 luzes de fundo |
```

- [ ] **Passo 7: commit**

```bash
git add engine/cenarios.js tools/teste_cenarios.js tools/teste_render.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Kit de cenários: r.room com estilos cela, oficina, refeitório, subsolo e escritório

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: pátio `r.yard`

**Arquivos:**
- Modificar: `engine/cenarios.js`
- Modificar: `tools/teste_cenarios.js`, `tools/teste_render.js`
- Modificar: `docs/COMO_CRIAR_MINIGAME.md`

**Interfaces:**
- Consome: `rect` (tarefa 2) e `r.prop('poste', ...)` (tarefa 5).
- Produz: `TN.cenarios.yard(r, x1, z1, x2, z2, o)` e `r.yard(...)`.
  - `o`: `{ h, floor, wall, quadra, guarita: true | false | 'esquerda' | 'direita', holofote, postes, frente }`.
  - Acende no máximo 2 luzes: 1 do poste e 1 do holofote.

- [ ] **Passo 1: escrever primeiro os testes**

Em `tools/teste_cenarios.js`, abaixo dos casos de `room`:

```js
// --- r.yard ---
cenarioValido('yard padrão', (r) => r.yard(40, 20, 920, 520));
cenarioValido('yard sem guarita, 4 postes', (r) => r.yard(40, 20, 920, 520, { guarita: false, postes: 4 }));
cenarioValido('yard guarita à esquerda', (r) => r.yard(40, 20, 920, 520, { guarita: 'esquerda' }));
ok(mesmas(trace((r) => r.yard(920, 520, 40, 20)), trace((r) => r.yard(40, 20, 920, 520))), 'yard com cantos invertidos = cantos na ordem');
cenarioValido('yard degenerado (largura 0)', (r) => r.yard(300, 100, 300, 100));
ok(!mesmas(trace((r) => r.yard(40, 20, 920, 520), 1), trace((r) => r.yard(40, 20, 920, 520), 3)), 'yard: holofote varre com o tempo');
```

Em `tools/teste_render.js`, no array `CENAS`, acrescentar:

```js
    ['pátio (r.yard)', (g, r) => r.yard(40, 20, 920, 520)],
```

- [ ] **Passo 2: rodar e ver falhar**

Rodar: `node tools/teste_cenarios.js`
Esperado: `✗ yard padrão: exceção r.yard: engine/cenarios.js não foi carregado (ou não tem "yard")`.

- [ ] **Passo 3: implementar em `engine/cenarios.js`**

No comentário do topo, depois da linha do `r.room`, acrescentar:

```js
//   r.yard(x1, z1, x2, z2, o)  pátio externo à noite (muros, arame farpado, guarita com holofote, postes)
```

Antes de `TN.cenarios = ...`, acrescentar:

```js
  // arame farpado no topo de um muro: hastes em V e três fios
  function arame(r, xa, za, xb, zb, H) {
    const len = Math.hypot(xb - xa, zb - za);
    if (len < 1) return;
    const n = Math.max(1, Math.round(len / 70)), ux = (xb - xa) / len, uz = (zb - za) / len;
    for (let i = 0; i <= n; i++) {
      const px = xa + ux * len * i / n, pz = za + uz * len * i / n;
      r.beam(px, H, pz, px - uz * 14, H + 30, pz + ux * 14, 2, '#2c2c2a');
      r.beam(px, H, pz, px + uz * 14, H + 30, pz - ux * 14, 2, '#2c2c2a');
    }
    for (const [off, hy] of [[-14, 30], [0, 18], [14, 30]]) r.beam(xa - uz * off, H + hy, za + ux * off, xb - uz * off, H + hy, zb + ux * off, 1.2, '#55534d');
  }

  // Pátio à noite: chão com linhas de quadra apagadas, muros com arame farpado no fundo e nas laterais,
  // postes de vapor de sódio e guarita com holofote que varre o pátio (só depende de r.time).
  // o: { h, floor, wall, quadra, guarita: true|false|'esquerda'|'direita', holofote, postes, frente }
  function yard(r, x1, z1, x2, z2, o = {}) {
    ({ x1, z1, x2, z2 } = rect(x1, z1, x2, z2));
    const H = o.h ?? 260, T = 24, w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, mz = (z1 + z2) / 2, t = r.time || 0;
    const zFront = z2 + (o.frente ?? 500), sideD = zFront - z1, sideZ = (z1 + zFront) / 2, muro = o.wall ?? '#5f5c55';
    r.plane(cx, -1.5, sideZ, w + 1600, sideD + 1000, o.floor ?? '#3b3934');
    if (o.quadra !== false && w > 120 && d > 120) {   // linhas de quadra apagadas
      const m = 40, lc = '#77735f', y = -1.2, L = { tex: false, opacity: 0.5 };
      const ix1 = x1 + m, ix2 = x2 - m, iz1 = z1 + m, iz2 = z2 - m;
      r.plane(cx, y, iz1, ix2 - ix1, 4, lc, L); r.plane(cx, y, iz2, ix2 - ix1, 4, lc, L);
      r.plane(ix1, y, mz, 4, iz2 - iz1, lc, L); r.plane(ix2, y, mz, 4, iz2 - iz1, lc, L);
      r.plane(cx, y, mz, 4, iz2 - iz1, lc, L);
      r.ring(cx, y, mz, 56, 60, lc, L);
    }
    r.box(cx, 0, z1 - T / 2, w + T * 2, H, T, muro);
    r.box(x1 - T / 2, 0, sideZ, T, H, sideD, muro);
    r.box(x2 + T / 2, 0, sideZ, T, H, sideD, muro);
    arame(r, x1 - T / 2, z1 - T / 2, x2 + T / 2, z1 - T / 2, H);
    arame(r, x1 - T / 2, z1 - T / 2, x1 - T / 2, zFront, H);
    arame(r, x2 + T / 2, z1 - T / 2, x2 + T / 2, zFront, H);
    // postes de vapor de sódio alternando os lados; só o primeiro acende luz de verdade
    const np = o.postes ?? 2;
    for (let i = 0; i < np; i++) {
      const esq = i % 2 === 0, fila = Math.floor(i / 2), filas = Math.ceil(np / 2);
      r.prop('poste', esq ? x1 + 20 : x2 - 20, z1 + d * (fila + 0.5) / filas, { rotY: esq ? 0 : Math.PI, luz: i === 0 });
    }
    if (o.guarita !== false) {
      const gx = o.guarita === 'esquerda' ? x1 + 30 : x2 - 30, gz = z1 + 30, gh = H + 40;
      for (const [dx, dz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) r.box(gx + dx, 0, gz + dz, 6, gh, 6, '#4a4843', { metal: 0.4 });
      r.box(gx, gh, gz, 70, 46, 70, '#6a675f');
      r.box(gx, gh + 16, gz + 35.5, 56, 20, 1, '#0b0d0e', { tex: false });
      r.box(gx, gh + 46, gz, 84, 6, 84, '#3a3936', { metal: 0.4 });
      if (o.holofote !== false) {
        const lx = gx + (gx > cx ? -36 : 36), ly = gh + 30, lz = gz + 36;
        const tx = cx + Math.sin(t * 0.5) * w * 0.38, tz = mz + Math.cos(t * 0.37) * d * 0.3;
        r.cyl(lx, ly - 6, lz, 7, 12, '#2a2a2a', { metal: 0.6 });
        r.sphere(lx, ly, lz, 6, '#fff6d8', { glow: true });
        // facho: cone com a base no chão e o vértice no holofote (rotZ inclina, rotY aponta)
        const dx = lx - tx, dy = ly, dz = lz - tz, len = Math.hypot(dx, dy, dz);
        r.cone(tx, 0, tz, 70, len, '#fff2c8', { glow: true, additive: true, opacity: 0.1, shadow: false, rotZ: Math.acos(dy / len), rotY: Math.atan2(dz, -dx) });
        r.disc(tx, 0.6, tz, 70, '#fff2c8', { glow: true, additive: true, opacity: 0.15 });
        r.light(tx, 60, tz, '#fff0d0', 1.2, 260, { fundo: true });
      }
    }
  }
```

Trocar `TN.cenarios = { room, prop };` por `TN.cenarios = { room, prop, yard };`.

- [ ] **Passo 4: rodar e ver passar**

Rodar: `node tools/teste_cenarios.js && bash tools/teste_render.sh`
Esperado: as linhas de `yard` com `✓` (incluindo `no máximo 2 luzes` e `holofote varre com o tempo`), `✓ pátio (r.yard): desenha algo` e `... determinística` nos dois visuais, e "Tudo certo." nos dois scripts.

- [ ] **Passo 5: conferir o facho do holofote**

Rodar: `bash tools/ver_cena.sh pátio /tmp/tn_patio.png` e abrir com Read. Confirme que o cone de luz sai do holofote da guarita (canto do fundo à direita) e toca o chão. Se apontar para o lado errado, troque `rotY: Math.atan2(dz, -dx)` por `Math.atan2(-dz, dx)`, rode de novo o passo 4 e confira outra vez.

- [ ] **Passo 6: documentar no `docs/COMO_CRIAR_MINIGAME.md`**

Na tabela de chamadas, logo abaixo da linha do `r.room`, acrescentar:

```markdown
| `r.yard(x1, z1, x2, z2, o)` | pátio de cadeia à noite (muros com arame farpado, postes de vapor de sódio, guarita com holofote que varre); opções: `h`, `floor`, `wall`, `quadra: false`, `guarita: false \| 'esquerda' \| 'direita'`, `holofote: false`, `postes`, `frente`. Acende até 2 luzes de fundo |
```

- [ ] **Passo 7: commit**

```bash
git add engine/cenarios.js tools/teste_cenarios.js tools/teste_render.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Kit de cenários: pátio r.yard com muros, arame farpado, postes e guarita com holofote

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: verificação final e registro

**Arquivos:**
- Modificar: `CLAUDE.md` (estrutura e fluxo: cenários e testes novos)

- [ ] **Passo 1: atualizar o `CLAUDE.md`**

Na lista "Estrutura", depois do item do `engine/`, acrescentar:

```markdown
- `engine/cenarios.js`: kit de cenários de cadeia (`r.room` com estilos, `r.yard`, `r.prop`). O visual padrão é "cadeia PS2" (baixa resolução, texturas sujas, luz dura); `?visual=antigo` volta ao liso.
```

No "Fluxo para criar um minigame novo", no passo 2, acrescentar ao fim da frase sobre a cena 3D: `Monte o cenário com r.room/r.yard/r.prop (veja docs/COMO_CRIAR_MINIGAME.md).`

Em "Regras", trocar `- Rode \`node tools/simular.js\`, que testa todos os minigames, depois de mexer no motor.` por:

```markdown
- Depois de mexer no motor, rode `node tools/simular.js` (todos os minigames), `node tools/teste_cenarios.js` e `bash tools/teste_render.sh` (render 3D no Chrome headless, nos dois visuais).
```

- [ ] **Passo 2: rodar a bateria completa**

Rodar (servidor na 8765 em background):
```bash
node tools/simular.js | tail -1
node tools/simular.js aspiradores --parado | tail -1
node tools/teste_cenarios.js | tail -1
bash tools/teste_render.sh | tail -2
node tools/teste_rede.js | tail -3
```
Esperado: "Tudo certo." nos quatro primeiros, e o teste de rede termina com sucesso (a última linha do script indica OK).

- [ ] **Passo 3: screenshots finais e confirmação de que nada mudou nos jogos**

Rodar: `bash tools/screenshots.sh screenshots/final 12`
Compare com Read `screenshots/final/<id>.png` e `screenshots/depois/<id>.png` (tarefa 3) em pelo menos 5 jogos: aspiradores, hora_do_trem, piso_falso, bons_modos e temporada_de_caca. Esperado: igual. Esta etapa não retoca nenhum jogo, só o Aspiradores usa cenário. Também confira que `screenshots/final/<id>_antigo.png` continua liso.

- [ ] **Passo 4: commit**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: registra o kit de cenários, o visual cadeia e os testes novos

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Passo 5: entregar ao usuário**

Mostre ao usuário os screenshots de `screenshots/final/` e os das cenas (`bash tools/ver_cena.sh <estilo>` para os 5 estilos e o pátio). Pergunte se aprova o kit antes de escrever o plano da etapa 3 (retoque em 4 lotes) ou da etapa 4 (glTF).
