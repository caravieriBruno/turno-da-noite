# Nomes dos jogadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada jogador escolhe o próprio nome no lobby, por uma roda de letras operada com o próprio dispositivo, e esse nome aparece sobre o boneco, no HUD e nos menus.

**Architecture:** O nome vive no slot do lobby (`{ device, ready, nome, editando, cursor }`, dados simples) e segue para o `roster` como `name`; `TN.Round` passa a usar `r.name` como `label`, então os minigames e o HUD mostram o nome sem mudar. O padrão vem do `localStorage` por dispositivo ou de uma lista de apelidos de detento. O cliente de rede manda os nomes salvos ao entrar na sala (`{ t: 'nomes' }`, repassado pelo servidor), e o host usa como padrão nas celas daquele cliente. A roda é desenhada pelo `TN.giz`.

**Tech Stack:** JS puro, Canvas 2D (giz), Node para `tools/teste_menus.js` e `tools/teste_rede.js`, Chrome headless para screenshots.

**Spec:** `docs/superpowers/specs/2026-10-18-nomes-jogadores-design.md`

## Global Constraints

- Nome: até **8** caracteres do alfabeto `A–Z`, `0–9`, espaço e `-`; nome vazio (só espaços) não é aceito.
- Roda operada **só pela entrada abstrata** (`TN.input`), para valer igual para teclado, controle e jogador remoto.
- Estado do slot e do roster são dados simples (a rede serializa).
- `localStorage` com a chave `turno-da-noite-nomes`, `{ <device>: '<NOME>' }`, lido e escrito dentro de `try/catch`.
- Padrão sem nome salvo: apelido sorteado da lista, **sem repetir** entre as 4 celas.
- Nome igual ao de outra cela ganha `" 2"` ao confirmar (cabendo em 8; senão corta o fim).
- Fluxo: AÇÃO entra (roda com cursor em ✓) → AÇÃO em ✓ confirma → "na cela…" → AÇÃO = PRONTO. EXTRA: editando apaga o último caractere (vazio → sai da cela); na cela volta a editar; PRONTO volta a "na cela…".
- Jogador remoto nunca navega pelos menus (continua valendo); edita só o próprio nome.
- Textos em pt-BR, no estilo atual. O rótulo "P1" some de todo lugar onde um jogador é mostrado; a cor continua identificando.
- Depois: `node tools/teste_menus.js`, `node tools/teste_ajustes.js`, `node tools/simular.js` (com `--sessao`), `node tools/teste_rede.js`, `bash tools/teste_render.sh`.

## Review Focus

1. **Dois jogadores confirmam o mesmo nome.** O segundo vira "NOME 2" e, se "NOME" já tem 7 ou 8 letras, o resultado cabe em 8. Teste na Task 2.
2. **Cliente de rede cai e volta** (outro `n<id>`): o nome que ele mandou na nova conexão vale para as novas celas, sem sobrar o antigo. Teste na Task 4.
3. **Partida por URL (`?game=`) e `--sessao` do simulador**, que não passam pelo lobby: o roster precisa de nome mesmo assim (apelido), e o `label` nunca fica vazio. Teste na Task 1.
4. **Nome com espaço no fim** ("BRUNO   "): salvo e exibido sem o espaço sobrando. Teste na Task 2.
5. **HUDs apertados** (contramão, triagem, empilhadeira) com nome de 8 letras: nada vaza. Conferido por screenshot na Task 5.

---

## Arquivos

| arquivo | papel |
|---|---|
| `engine/session.js` | `APELIDOS`, `nomesSalvos`/`salvarNome`, `nomePadrao`, roda no `Lobby`, `buildRoster` com `name`, menus com nome, `cenaDeTeste` com nomes |
| `engine/minigame.js` | `label: r.name` |
| `engine/giz.js` | `rodaDeLetras` |
| `engine/net.js` | cliente manda `nomes` ao entrar; host guarda `nomesRemotos` |
| `tools/servidor.js` | repassa `{ t: 'nomes' }` ao host |
| `tools/teste_menus.js`, `tools/teste_rede.js` | testes |
| `CLAUDE.md`, `docs/COMO_CRIAR_MINIGAME.md` | documentação |

Branch: `nomes-jogadores`, a partir da `main`.

---

### Task 1: Apelidos, persistência, roster e `label`

**Files:**
- Modify: `engine/session.js` (topo, `buildRoster` l.18–26), `engine/minigame.js:49`
- Test: `tools/teste_menus.js` (seção 7)

**Interfaces:**
- Produces, em `session.js` (locais ao IIFE e expostos em `TN._internal` para teste):
  - `APELIDOS: string[]` (≥ 16 apelidos de detento em maiúsculas, até 8 letras);
  - `nomesSalvos(): { [device]: string }` e `salvarNome(device, nome)`;
  - `nomePadrao(device, emUso: string[]): string` → nome salvo do dispositivo, ou (se estiver em `emUso` ou não existir) um apelido sorteado que não esteja em `emUso`;
  - `buildRoster(slots, fillBots)` passa `name: s.nome` para humanos e `nomePadrao(null, usados)` para bots;
  - `TN.Round`: `label = r.name || 'P' + (r.id + 1)`.

- [ ] **Step 1: Teste (seção 7 em `tools/teste_menus.js`)**

```js
// --- 7. nomes: apelidos, persistência e roster ---
function secaoNomes() {
  const I = TN._internal;
  ok(Array.isArray(I.APELIDOS) && I.APELIDOS.length >= 16 && I.APELIDOS.every((a) => /^[A-Z0-9 -]{1,8}$/.test(a)), 'nomes: lista de apelidos válidos');
  localStorage.setItem('turno-da-noite-nomes', JSON.stringify({ kb2: 'BRUNO' }));
  ok(I.nomePadrao('kb2', []) === 'BRUNO', 'nomes: o padrão do dispositivo vem do localStorage');
  ok(I.nomePadrao('kb2', ['BRUNO']) !== 'BRUNO', 'nomes: salvo mas já em uso → sorteia outro');
  const a = I.nomePadrao('gp0', []), b = I.nomePadrao('gp0', [a]);
  ok(I.APELIDOS.includes(a) && I.APELIDOS.includes(b) && a !== b, 'nomes: sem nome salvo, apelido sorteado sem repetir');
  I.salvarNome('kb3', 'ZECA'); ok(I.nomesSalvos().kb3 === 'ZECA', 'nomes: salvarNome persiste');
  const roster = I.buildRoster([{ device: 'kb2', nome: 'BRUNO' }, null, null, null], true);
  ok(roster[0].name === 'BRUNO' && roster.slice(1).every((r) => I.APELIDOS.includes(r.name)) && new Set(roster.map((r) => r.name)).size === 4, 'nomes: roster leva o nome escolhido e apelidos únicos para os bots');
  const g = new TN.Round(TN.minigames[TN.minigameOrder[0]], roster, 1, 1);
  ok(g.players[0].label === 'BRUNO' && g.players.every((p) => p.label && p.label.length > 0), 'nomes: o label do jogador é o nome');
  // Review Focus 3: roster sem lobby (?game= e --sessao) também tem nome
  const semLobby = I.buildRoster([{ device: 'kb1' }, null, null, null], true);
  ok(semLobby.every((r) => r.name && r.name.length > 0), 'nomes: roster montado sem lobby ganha apelidos');
}
```

E `secaoNomes();` depois de `secaoInstrucoes();`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_menus.js`
Expected: `✗ nomes: lista de apelidos válidos` (ou exceção `APELIDOS` indefinido) e seguintes.

- [ ] **Step 3: Implementar**

`session.js`: `const APELIDOS = ['BIGODE', 'SOMBRA', 'FAISCA', 'MUDO', 'CANHOTO', 'PIOLHO', 'TRINTA', 'FUMACA', 'CAVEIRA', 'MAGRELO', 'TUBARAO', 'GAIOLA', 'PAREDE', 'CORUJA', 'FERRUGEM', 'BARATA', 'CHAVEIRO', 'PINGUIM', 'TRANCA', 'ZOIO']` (só `A–Z`, até 8 letras, sem acento). `nomesSalvos`/`salvarNome` com `try/catch` na chave `turno-da-noite-nomes`. `nomePadrao` conforme a interface (sorteio com `U.shuffle`). `buildRoster`: humanos `name: s.nome || nomePadrao(s.device, usados)`, bots `nomePadrao(null, usados)`, acumulando `usados`. `TN._internal` ganha `APELIDOS, nomesSalvos, salvarNome, nomePadrao`. `minigame.js:49`: `label: r.name || \`P${r.id + 1}\``.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_menus.js && node tools/simular.js --sessao 2>&1 | tail -1`
Expected: `Tudo certo.` nos dois.

- [ ] **Step 5: Commit**

```bash
git add engine/session.js engine/minigame.js tools/teste_menus.js
git commit -m "Nomes: apelidos de detento, nome salvo por dispositivo, roster com name e label = nome"
```

---

### Task 2: Roda de letras no lobby

**Files:**
- Modify: `engine/session.js` (`Lobby.update` l.153–168, `Lobby.draw`), `engine/giz.js`
- Test: `tools/teste_menus.js` (seção 8)

**Interfaces:**
- Consumes: `nomePadrao`, `salvarNome` (Task 1).
- Produces:
  - slot: `{ device, ready: false, nome, editando: true, cursor }` ao entrar; `cursor` vai de 0 a `nome.length` (a posição `nome.length` é o ✓, só existe se `nome.length < 8`; com 8 letras o ✓ é a posição 8);
  - `ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'`, `NOME_MAX = 8`;
  - `Lobby.confirmarNome(slot)`: aplica `trim`, recusa vazio (`blip` grave, continua editando), resolve duplicata com `" 2"`, salva no `localStorage` para dispositivos locais, `editando = false`;
  - `G.rodaDeLetras(c, x, y, nome, cursor, t)`: desenha os caracteres (16 px, 14 px de passo) com o do cursor em destaque e setas ↑↓ pulsando sobre ele, e o ✓ ao fim (circulado quando é o cursor).

- [ ] **Step 1: Teste (seção 8)**

```js
// --- 8. roda de letras no lobby ---
function secaoRoda() {
  const I = TN._internal;
  localStorage.setItem('turno-da-noite-nomes', JSON.stringify({}));
  TN.session = null; TN.net.nomesRemotos = {};
  const lobby = new S.Lobby({}); TN.go(lobby);
  quadro({ kb1: 'a' });
  const s0 = lobby.slots[0];
  ok(s0 && s0.editando && s0.cursor === s0.nome.length && I.APELIDOS.includes(s0.nome), 'roda: entrar abre a roda com um apelido e o cursor no ✓');
  quadro({ kb1: 'a' });
  ok(!s0.editando && !s0.ready, 'roda: AÇÃO no ✓ aceita o padrão → na cela');
  quadro({ kb1: 'b' }); ok(s0.editando, 'roda: EXTRA na cela volta a editar');
  s0.nome = 'ABCDEFGH'; s0.cursor = 8;
  for (let i = 0; i < 8; i++) quadro({ kb1: 'b' });
  ok(s0.nome === '' && s0.editando && lobby.slots[0] === s0, 'roda: EXTRA apaga uma letra por toque; com 8 toques esvazia e continua na cela');
  quadro({ kb1: 'a' }); ok(s0.editando && lobby.slots[0] === s0, 'roda: nome vazio não confirma');
  quadro({ kb1: 'up' }); ok(s0.nome === 'A' && s0.cursor === 0, 'roda: ↑ no ✓ de um nome vazio acrescenta A');
  quadro({ kb1: 'up' }); ok(s0.nome === 'B', 'roda: ↑ troca a letra');
  quadro({ kb1: 'down' }); quadro({ kb1: 'down' }); ok(s0.nome === '-', 'roda: ↓ anda para trás e dá a volta no alfabeto');
  quadro({ kb1: 'right' }); ok(s0.cursor === 1, 'roda: → vai para o ✓ (posição nome.length)');
  for (let i = 0; i < 12; i++) { quadro({ kb1: 'up' }); quadro({ kb1: 'right' }); }
  ok(s0.nome.length === 8 && s0.cursor === 8, 'roda: nunca passa de 8 letras');
  quadro({ kb1: 'a' }); ok(!s0.editando && s0.nome.length === 8, 'roda: confirma com 8 letras');
  ok(I.nomesSalvos().kb1 === s0.nome, 'roda: ao confirmar, o nome fica salvo para o dispositivo');
  // Review Focus 4: espaço no fim some
  quadro({ kb1: 'b' }); s0.nome = 'BRUNO   '; s0.cursor = 8; quadro({ kb1: 'a' });
  ok(s0.nome === 'BRUNO', `roda: espaço no fim é cortado (${JSON.stringify(s0.nome)})`);
  // Review Focus 1: nome repetido
  quadro({ kb2: 'a' }); const s1 = lobby.slots[1]; s1.nome = 'BRUNO'; s1.cursor = 5; quadro({ kb2: 'a' });
  ok(s1.nome === 'BRUNO 2', `roda: nome repetido vira "BRUNO 2" (${s1.nome})`);
  quadro({ kb3: 'a' }); const s2 = lobby.slots[2]; s2.nome = 'FERRUGEM'; s2.cursor = 8; quadro({ kb3: 'a' });
  quadro({ gp0: 'a' }); const s3 = lobby.slots[3]; s3.nome = 'FERRUGEM'; s3.cursor = 8; quadro({ gp0: 'a' });
  ok(s3.nome.length <= 8 && s3.nome !== 'FERRUGEM' && s3.nome.endsWith(' 2'), `roda: repetido com 8 letras cabe em 8 (${s3.nome})`);
  // o remoto edita o próprio nome pela entrada abstrata, e a cela vazia sai com EXTRA
  quadro({ kb1: 'a' }); ok(s0.ready, 'roda: AÇÃO na cela = PRONTO');
  const l2 = new S.Lobby({}); TN.go(l2);
  quadro({ 'n1:kb1': 'a' }); quadro({ 'n1:kb1': 'up' });
  ok(l2.slots[0].device === 'n1:kb1' && l2.slots[0].editando && l2.slots[0].nome.length > 0, 'roda: jogador remoto edita o próprio nome');
  for (let i = 0; i < 9; i++) quadro({ 'n1:kb1': 'b' }); quadro({ 'n1:kb1': 'b' });
  ok(l2.slots[0] === null, 'roda: EXTRA com o nome vazio sai da cela');
  // desenho
  const t = textos(lobby);
  ok(/BRUNO/.test(t) && /BRUNO 2/.test(t), 'roda: a cela mostra o nome');
  quadro({ kb1: 'a' }); const l3 = new S.Lobby({}); TN.go(l3); quadro({ kb1: 'a' });
  ok(/AÇÃO ✓/.test(textos(l3)), 'roda: a cela editando mostra a dica dos botões');
}
```

E `secaoRoda();` depois de `secaoNomes();`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ roda: entrar abre a roda ...` (slot sem `editando`).

- [ ] **Step 3: Implementar**

`Lobby.update`: ao entrar, `slot = { device, ready: false, nome: nomePadrao(dev, nomesEmUso), editando: true, cursor: nome.length }` (padrão remoto: `(TN.net.nomesRemotos || {})[dev]` tem prioridade, se existir). Enquanto `editando`: `leftPressed/rightPressed` movem `cursor` em `[0, min(nome.length, NOME_MAX)]`; `upPressed/downPressed` trocam o caractere em `cursor` (se `cursor === nome.length` e `< 8`, acrescenta 'A' primeiro e `up` vira 'A', `down` vira '-'); `aPressed`: se `cursor === nome.length` (✓) → `confirmarNome`, senão `cursor++`; `bPressed`: se `nome` vazio → `slots[i] = null`, senão apaga o último e `cursor = min(cursor, nome.length)`. Fora de edição: AÇÃO alterna PRONTO como hoje; EXTRA: PRONTO → não pronto; não pronto → `editando = true, cursor = nome.length`. A contagem para começar exige `!editando` em todos. `confirmarNome`: `nome = nome.trim()`; vazio → `blip` e volta; duplicata → `(nome.slice(0, 6) + ' 2')` se `nome.length > 6`, senão `nome + ' 2'`; `salvarNome` se `TN.input.ehLocal(device)`; `editando = false`. `Lobby.draw`: na cela, se `editando`, `G.rodaDeLetras(c, x + 102, y + 232, s.nome, s.cursor, this.t)` e a dica "↑↓ letra · ←→ posição · AÇÃO ✓ · EXTRA apaga" (12 px); senão o nome no lugar de "CELA N" (`maxWidth` 190). Rodapé ganha "EXTRA = mudar o nome". `giz.js`: `rodaDeLetras` conforme a interface, exportada em `TN.giz`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_menus.js`
Expected: `Tudo certo.`

- [ ] **Step 5: Commit**

```bash
git add engine/session.js engine/giz.js tools/teste_menus.js
git commit -m "Lobby: roda de letras para cada detento escolher o nome"
```

---

### Task 3: Menus e HUD com o nome

**Files:**
- Modify: `engine/session.js` (`Setup` l.263, `Brief` l.349, `RoundIntro` l.388, `RoundOver` l.453, `ScoreScreen` l.481, `Final` l.517, `cenaDeTeste`)
- Test: `tools/teste_menus.js` (seção 9)

**Interfaces:**
- Consumes: `p.name`/`p.label` (Task 1). `cenaDeTeste` passa a dar nomes fixos ao roster de mentira: `['BRUNO', 'SOMBRA', 'PIOLHO', 'MUDO']`.

- [ ] **Step 1: Teste (seção 9)**

```js
// --- 9. menus mostram o nome, não P1 ---
function secaoMenusComNome() {
  for (const cena of ['Setup', 'Brief', 'RoundOver', 'ScoreScreen', 'Final']) {
    const t = textos(TN.cenaDeTeste(cena));
    ok(/BRUNO/.test(t) && /SOMBRA/.test(t) && !/\bP[1-4]\b/.test(t), `${cena}: mostra os nomes e nenhum P1..P4`);
  }
  TN.cenaDeTeste('Brief'); const ri = new S.RoundIntro(1); TN.go(ri);
  ok(/BRUNO/.test(textos(ri)) && !/\bP1\b/.test(textos(ri)), 'RoundIntro: lembrete usa o nome');
}
```

E `secaoMenusComNome();` depois de `secaoRoda();`.

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ Setup: mostra os nomes e nenhum P1..P4`.

- [ ] **Step 3: Implementar**

Trocar cada `` `P${p.id + 1}` `` dos seis pontos por `p.name` (mantendo o sufixo `BOT` onde existe e `maxWidth` 120–170 onde o texto é apertado: Setup 250, Brief 160, RoundOver 170, ScoreScreen 180, Final 220). `RoundIntro` l.388 usa `p.label`. `cenaDeTeste`: `buildRoster([{ device: 'kb1', nome: 'BRUNO' }, null, null, null], true)` e depois `roster[1].name = 'SOMBRA'; roster[2].name = 'PIOLHO'; roster[3].name = 'MUDO'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_menus.js && node tools/simular.js --sessao 2>&1 | tail -1`

- [ ] **Step 5: Commit**

```bash
git add engine/session.js tools/teste_menus.js
git commit -m "Menus: briefing, fim da tentativa, placar e pódio mostram o nome do detento"
```

---

### Task 4: Nome do cliente de rede chega ao host

**Files:**
- Modify: `engine/net.js` (`_clientMessage` l.155, host `onmessage` l.122–125, `_dropPeer` l.127), `tools/servidor.js` (l.130–132)
- Test: `tools/teste_rede.js`

**Interfaces:**
- Produces: mensagem cliente→servidor `{ t: 'nomes', nomes: { kb1: 'BRUNO', ... } }`; servidor→host `{ t: 'nomes', from: <id>, nomes }`; no host `TN.net.nomesRemotos = { 'n<id>:kb1': 'BRUNO', ... }`, limpo em `_dropPeer`. Exposto `TN.net.nomesSalvos = () => nomesSalvos()` (o `session.js` registra a função em `TN.net` depois de defini-la, ou `net.js` lê `TN._internal.nomesSalvos()`; escolher a segunda, que não cria dependência de ordem).

- [ ] **Step 1: Teste (`tools/teste_rede.js`)**

Depois de `ok('cliente entrou como #${myId}')`:

```js
  ws.send(JSON.stringify({ t: 'nomes', nomes: { kb1: 'REMOTAO' } }));
  await sleep(300);
  if (TN.net.nomesRemotos[`n${myId}:kb1`] !== 'REMOTAO') fail('o host não recebeu o nome do cliente (' + JSON.stringify(TN.net.nomesRemotos) + ')');
  ok('host recebeu o nome salvo do cliente');
```

E, depois de `ok('jogador remoto pegou a vaga P1 no lobby do host')`, antes do PRONTO:

```js
  if (slot.nome !== 'REMOTAO' || !slot.editando) fail('a cela do remoto não abriu com o nome dele (' + slot.nome + ')');
  ok('cela do remoto abre com o nome que ele mandou');
  await tap(); // aceita o nome (cursor já está no ✓)
```

E no fim, no bloco em que o cliente sai (`cliente saiu → o jogador virou BOT`): `if (Object.keys(TN.net.nomesRemotos).some((k) => k.startsWith('n' + myId + ':'))) fail('nomes do cliente que saiu ficaram no host');` (Review Focus 2).

- [ ] **Step 2: Rodar e ver falhar**

Run (servidor rodando): `node tools/teste_rede.js`
Expected: `✗ o host não recebeu o nome do cliente ({})`.

- [ ] **Step 3: Implementar**

`servidor.js`: ao lado do `input`, `else if (msg.t === 'nomes' && client.room && !client.isHost) { const room = rooms.get(client.room); if (room) wsSend(room.host.sock, JSON.stringify({ t: 'nomes', from: client.id, nomes: msg.nomes || {} })); }`. `net.js`: `nomesRemotos: {}` no objeto `net`; no host, `else if (m.t === 'nomes') { for (const dev in m.nomes || {}) if (typeof m.nomes[dev] === 'string') this.nomesRemotos[\`n${m.from}:${dev}\`] = String(m.nomes[dev]).slice(0, 8).toUpperCase(); }`; em `_dropPeer`, apagar as chaves com o prefixo; no cliente, em `joined`, `this.send({ t: 'nomes', nomes: (TN._internal && TN._internal.nomesSalvos()) || {} })`. O `Lobby` (Task 2) já lê `TN.net.nomesRemotos[dev]` como padrão.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_rede.js && node tools/teste_menus.js`
Expected: `Rede OK.` e `Tudo certo.`

- [ ] **Step 5: Commit**

```bash
git add engine/net.js tools/servidor.js tools/teste_rede.js
git commit -m "Rede: o cliente manda o nome salvo ao entrar e a cela dele já abre com ele"
```

---

### Task 5: Screenshots, documentação e bateria completa

**Files:**
- Modify: `CLAUDE.md`, `docs/COMO_CRIAR_MINIGAME.md`; só se a revisão pedir, `maxWidth`/posições em `engine/session.js`

- [ ] **Step 1: Screenshots** (servidor em `node tools/servidor.js 8765`)

`bash tools/menus.sh` (o `cenaDeTeste('Lobby')` passa a abrir a cela 1 editando "BRUNO" e a cela 2 pronta "SOMBRA"), e `bash tools/screenshot.sh <id> <t> screenshots/nomes/<id>.png` para `contramao:8`, `triagem:16`, `aspiradores:6`, `empilhadeira:8` com `?humans=0` (os bots têm apelidos). Conferir: a roda legível na cela, nomes sobre os bonecos, nada vazando nos HUDs apertados (Review Focus 5). Ajuste só `maxWidth`/posições.

- [ ] **Step 2: Documentar**

`CLAUDE.md`, seção Rede local, acrescentar à linha dos menus: "No lobby cada jogador escolhe o nome por uma roda de letras (salvo por dispositivo em `localStorage`; o cliente de rede manda os seus em `{ t: 'nomes' }`)." `docs/COMO_CRIAR_MINIGAME.md`: na linha de `p.label` (seção do jogador), dizer que `p.label` é o **nome** escolhido no lobby (até 8 caracteres) e que `p.name` é igual; textos que concatenam `p.label` devem prever 8 letras.

- [ ] **Step 3: Tudo**

Run: `node tools/teste_menus.js && node tools/teste_ajustes.js && node tools/simular.js && node tools/simular.js --sessao 2>&1 | tail -1 && node tools/teste_rede.js && bash tools/teste_render.sh`
Expected: tudo `Tudo certo.` / `Rede OK.`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/COMO_CRIAR_MINIGAME.md engine/session.js
git commit -m "Nomes: revisão visual, documentação"
```
