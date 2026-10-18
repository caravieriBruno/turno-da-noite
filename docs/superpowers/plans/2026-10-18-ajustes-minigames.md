# Ajustes rápidos em 11 minigames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar os 11 ajustes de regra, números e feedback da spec, cada um com um teste em Node que falha antes e passa depois.

**Architecture:** Um teste novo, `tools/teste_ajustes.js`, carrega o motor e os minigames no Node (como `tools/teste_menus.js` faz), monta uma `TN.Round` de verdade com jogadores humanos cujos botões são injetados por `TN.input._inject`, avança a rodada com `g.update(dt)` e confere a regra. Cada jogo é uma tarefa: teste → ver falhar → mudar só `minigames/<id>.js` → ver passar → `simular.js` → commit. Mudanças de tela sem lógica (painéis, cores no 3D) são conferidas por screenshot na última tarefa.

**Tech Stack:** JS puro, Node para os testes, Chrome headless para screenshots (`tools/screenshot.sh`, servidor em `node tools/servidor.js 8765`).

**Spec:** `docs/superpowers/specs/2026-10-18-ajustes-minigames-design.md`

## Global Constraints

- Só `minigames/<id>.js` muda. Nada em `engine/`.
- O estado continua em `g.data`/`p.data` como dado simples (números, strings, arrays, objetos planos): a rede serializa isso.
- Os bots são ajustados sempre que a regra que eles seguem muda.
- Textos em pt-BR, no tom atual; briefings mudam só onde a regra mudou.
- Cada jogo alterado passa em `node tools/simular.js <id> --vezes 3` e `node tools/simular.js <id> --parado`, terminando em "Tudo certo".
- Valores da spec, exatos: contramão 4/3/2/1 e consolação 1; serviço interno `HOLDER_MULT` 1,3, `HUNTER_MULT` 1,15, `INFECT_RANGE` 56, `LIGHT_R` 95, `FREEZE` 3, 16 a 18 móveis, arena `{x:20, y:44, w:920, h:480}`; triagem pausa ~1,5 s com 3-2-1; fábrica `START_PARTS` 14, `MAX_FLOOR` 14, `RESPAWN` 2, reposição por tempo a cada 2 s se chão < 8; carrapato ativação sorteada 11–17 s, 8 a 10 pilares de raio 22–34, luz vermelha contínua nos últimos 3 s; memória segura `#2aa7ff` ✓, errada `#ff8a2a` ✗, chão da porta a 0,35; piso falso 5 pontos a ±10 px, tolerância 0,15 s, seguros ~45% → ~30%, garantia a `SPEED × final × 0,8`, cadência ±0,3 s; tragada atordoamento 0,3 s, `CHOKE_TIME` 1,2, `CIG_MULT` ~0,3; batata pavio × `1 + 0,6 × heldT` (teto 3×), aviso a 1,5 s; cabo `FAST` 0,20, `IMP_FAST` 0,3, `GRIP_COST` 0,18; trem `SHOVE_RANGE` 72, `SHOVE_LOCK` 0,35, 0,3 s sem reentrar.
- Depois de tudo: `node tools/simular.js` completo, `node tools/teste_ajustes.js`, `node tools/teste_rede.js`.

## Review Focus

1. **Contramão: o tempo acaba com todos ainda na escada.** Ninguém chegou, ninguém caiu: todos marcam 0 e a rodada termina pelo `timeLimit`. Teste na Task 2.
2. **Linha de montagem: todos já montaram a arma.** A demanda de todo tipo é 0; a reposição não pode travar nem lançar erro: cai no sorteio. Teste na Task 5.
3. **Piso falso: a garantia de piso seguro não pode ressuscitar um ladrilho `gone`** (removido para sempre). Teste na Task 8.
4. **Tragada: o cigarro acaba no meio da tragada.** Deve exalar e terminar, sem atordoamento preso. Teste na Task 9.
5. **Hora do trem: nicho da parede de baixo.** O empurrão para fora tem de ir para cima (`vy < 0`), e o da parede de cima para baixo. Teste na Task 12.

---

## Arquivos

| arquivo | papel |
|---|---|
| `tools/teste_ajustes.js` (novo) | harness + uma seção por jogo |
| `minigames/contramao.js`, `servico_interno.js`, `triagem.js`, `fabrica_de_armas.js`, `carrapato.js`, `caminho_da_memoria.js`, `piso_falso.js`, `tragada.js`, `batata_quente.js`, `cabo_de_guerra.js`, `hora_do_trem.js` | um por tarefa |
| `CLAUDE.md` | acrescenta `teste_ajustes.js` à lista de testes |

Branch: `ajustes-minigames`, a partir da `main`.

---

### Task 1: Harness `tools/teste_ajustes.js`

**Files:**
- Create: `tools/teste_ajustes.js`

**Interfaces:**
- Produces (usados por todas as tarefas seguintes):
  - `rodada(id, { humanos = 4, rodadaN = 1, total = 1 })` → `TN.Round` com 4 jogadores; os `humanos` primeiros têm `device = 'h' + i` e `isBot = false`, os demais são bots;
  - `aperta(i, { x = 0, y = 0, a = false, b = false })`: injeta o estado do dispositivo `'h' + i`;
  - `solta()`: zera os 4 dispositivos;
  - `passo(g, seg = 1/60, n = 1)`: `n` chamadas de `g.update(seg)`;
  - `segundos(g, s)`: avança `s` segundos em passos de 1/60;
  - `gravador()`: contexto 2D de mentira que registra chamadas em `c.log` (igual ao de `tools/teste_menus.js`); `textos(fn)` devolve os `fillText` concatenados; `estilos(fn)` devolve os `fillStyle` atribuídos;
  - `ok(cond, msg)` e o contador `falhas`; o arquivo termina com `Tudo certo.` / `N falha(s).` e `process.exit`.

- [ ] **Step 1: Criar a branch**

```bash
git checkout main && git checkout -b ajustes-minigames
```

- [ ] **Step 2: Escrever o harness**

Cabeçalho e carga do motor iguais a `tools/teste_menus.js` (mesmo `global.window`, `localStorage` de mentira, `load()` da lista `MOTOR` incluindo `engine/giz.js`, e `load('minigames/' + f)` para `TN.MINIGAME_FILES`). Depois:

```js
const DEV = (i) => 'h' + i;
const solto = () => ({ x: 0, y: 0, a: false, b: false });
function rodada(id, { humanos = 4, rodadaN = 1, total = 1 } = {}) {
  const roster = [0, 1, 2, 3].map((i) => ({ id: i, name: TN.PLAYER_NAMES[i], color: TN.PLAYER_COLORS[i], device: i < humanos ? DEV(i) : null, isBot: i >= humanos }));
  solta();
  return new TN.Round(TN.minigames[id], roster, rodadaN, total);
}
function aperta(i, s) { TN.input._inject(DEV(i), { ...solto(), ...s }); }
function solta() { for (let i = 0; i < 4; i++) TN.input._inject(DEV(i), solto()); }
function passo(g, seg = 1 / 60, n = 1) { for (let k = 0; k < n; k++) g.update(seg); }
function segundos(g, s) { passo(g, 1 / 60, Math.round(s * 60)); }
```

Mais `gravador()` copiado de `teste_menus.js`, e:

```js
const textos = (fn) => { const c = gravador(); fn(c); return c.log.filter((e) => e[0] === 'fillText').map((e) => String(e[1])).join(' | '); };
const estilos = (fn) => { const c = gravador(); fn(c); return c.log.filter((e) => e[0] === '=fillStyle').map((e) => String(e[1])); };
```

No fim do arquivo:

```js
// SEÇÕES (uma por jogo; as tarefas acrescentam aqui)
const secoes = [];
for (const s of secoes) { try { s(); } catch (e) { ok(false, `${s.name}: exceção ${e.message}`); } }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
```

Cada tarefa define a sua função `secaoX()` acima desse bloco e acrescenta o nome dentro do array literal (`const secoes = [secaoContramao, secaoServicoInterno, ...]`).

- [ ] **Step 3: Rodar**

Run: `node tools/teste_ajustes.js`
Expected: `Tudo certo.` (ainda sem seções).

- [ ] **Step 4: Commit**

```bash
git add tools/teste_ajustes.js
git commit -m "Ajustes: harness de teste de rodada em Node (tools/teste_ajustes.js)"
```

---

### Task 2: Contramão: pontos só pela chegada, painel de setas fixo

**Files:**
- Modify: `minigames/contramao.js` (`update` l.85–115, `onTimeUp` l.129, `drawOverlay` l.220–242, `camera` l.154, `brief`)
- Test: `tools/teste_ajustes.js`

**Interfaces:**
- Produces em `contramao`: `pontosChegada(g)`: número de pontos para o próximo a chegar = `g.playerCount − d.chegaram` (4/3/2/1 com 4 jogadores); `d.chegaram` em `g.data`; `CONSOLACAO = 1`.

- [ ] **Step 1: Teste**

```js
function secaoContramao() {
  const g = rodada('contramao'), d = g.data, P = g.players, def = g.def;
  for (const p of P) p.data.speed = 0;
  P[0].data.s = 1.01; passo(g);
  ok(P[0].score === 4, `contramão: 1º a chegar ganha 4 (deu ${P[0].score})`);
  P[1].data.s = -0.01; passo(g);
  ok(!P[1].alive && P[1].score === 0 && P[0].score === 4 && P[2].score === 0, 'contramão: cair vale 0 e não dá ponto a ninguém');
  P[2].data.s = 1.01; passo(g);
  ok(P[2].score === 3, `contramão: 2º a chegar ganha 3 (deu ${P[2].score})`);
  passo(g);
  ok(P[3].score === def.CONSOLACAO && d.over, 'contramão: último na escada ganha 1 de consolação e a rodada termina');
  // Review Focus 1: o tempo acaba com todos na escada
  const h = rodada('contramao');
  for (const p of h.players) p.data.speed = 0.5;
  segundos(h, 61);
  ok(h.finished && h.players.every((p) => p.score === 0), 'contramão: tempo esgotado com todos na escada → todos 0 e a rodada termina');
  ok(def.brief.some((b) => /cair/i.test(b) && /0/.test(b)), 'contramão: brief avisa que cair é 0');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_ajustes.js`
Expected: `✗ contramão: 1º a chegar ganha 4 (deu 2)` e os seguintes.

- [ ] **Step 3: Implementar**

Em `contramao.js`:
- `CONSOLACAO: 1` nas constantes; `d.chegaram = 0` no `init`.
- `pontosChegada(g)` conforme a interface; no bloco `s.s >= 1` trocar `const pts = d.firstUp ? 1 : 2; d.firstUp = true;` por `const pts = this.pontosChegada(g); d.chegaram++;`.
- No bloco `s.s <= 0` remover `for (const o of this.active(g)) g.addScore(o, 1);`.
- No fim (`left.length === 1`): `g.addScore(left[0], this.CONSOLACAO)` com o popup "ÚLTIMO NA ESCADA".
- `onTimeUp`: mantém a mensagem; quem está na escada não ganha nada (já é 0).
- `brief`: trocar a linha de pontuação por `'Só a chegada conta: 4, 3, 2, 1. Cair é 0.'`.
- `drawOverlay`: tirar o painel preso à cabeça (o bloco com `TN.R3.project(w.x, w.y + 78, w.z)` e a seta de 22 px); desenhar, para cada jogador ativo, um painel de 64×64 na borda inferior em `x = 120 + i × 220`, `y = TN.H − 80`, com moldura na cor do jogador, a seta a 44 px e o medidor de ritmo ao lado; sobre o boneco fica só um triângulo de 10 px na cor (`project` do `worldPos`).
- `camera.pos[2]` 1080 → 900 e `target` ajustado para as 4 escadas (conferir no screenshot da Task 13).

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js contramao --vezes 3 && node tools/simular.js contramao --parado`
Expected: seção com `✓` e os dois `simular` em "Tudo certo".

- [ ] **Step 5: Commit**

```bash
git add minigames/contramao.js tools/teste_ajustes.js
git commit -m "Contramão: só a chegada pontua (4/3/2/1), painel de setas fixo e câmera mais perto"
```

---

### Task 3: Serviço interno: portador mais rápido, planta aberta

**Files:**
- Modify: `minigames/servico_interno.js` (constantes l.19–23, `LAYOUT` l.26–37, `SPAWNS` l.38, `init` l.40, `camera` l.271)

- [ ] **Step 1: Teste**

```js
function secaoServicoInterno() {
  const def = TN.minigames.servico_interno, g = rodada('servico_interno');
  ok(def.HOLDER_MULT === 1.3 && def.HUNTER_MULT === 1.15, 'serviço interno: portador 1,3× e infectado 1,15×');
  ok(def.INFECT_RANGE === 56 && def.LIGHT_R === 95 && def.FREEZE === 3, 'serviço interno: alcance 56, lanterna 95, congelamento 3 s');
  ok(def.LAYOUT.length >= 16 && def.LAYOUT.length <= 18, `serviço interno: ${def.LAYOUT.length} móveis (16 a 18)`);
  ok(g.arena.w >= 920 && g.arena.h >= 480, `serviço interno: arena ${g.arena.w}×${g.arena.h}`);
  const dentro = (x, y) => x >= g.arena.x && x <= g.arena.x + g.arena.w && y >= g.arena.y && y <= g.arena.y + g.arena.h;
  ok(def.SPAWNS.every(([x, y]) => dentro(x, y)) && g.players.every((p) => dentro(p.x, p.y)), 'serviço interno: nascimentos dentro da arena nova');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ serviço interno: portador 1,3× ...` e os demais.

- [ ] **Step 3: Implementar**

Constantes conforme a spec; `LAYOUT` sem as 2 mesas centrais e os 3 vasos (16 a 18 itens, corredores laterais livres); `g.arena = { x: 20, y: 44, w: 920, h: 480 }` como primeira linha do `init`; `SPAWNS` reposicionados dentro da arena; `camera` afastada o bastante para a arena nova (ponto de partida `pos: [480, 700, 860]`, confirmar no screenshot). O bot caçador já usa `HUNTER_MULT` pela fórmula da l.173.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js servico_interno --vezes 3 && node tools/simular.js servico_interno --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/servico_interno.js tools/teste_ajustes.js
git commit -m "Serviço interno: portador mais rápido, planta aberta, arena maior, infecção e lanterna com mais alcance"
```

---

### Task 4: Triagem: pausa com contagem entre turnos

**Files:**
- Modify: `minigames/triagem.js` (`endSub` l.80–115, `update` l.61–71, `drawOverlay` l.273, `draw` l.403)

**Interfaces:**
- Produces: fase `'pause'` em `d.phase` com `d.pauseT` (segundos restantes) e `d.contagem` (3, 2, 1, 0 = "JÁ!"); `PAUSA = 1.5`.

- [ ] **Step 1: Teste**

```js
function secaoTriagem() {
  const g = rodada('triagem'), d = g.data;
  d.timer = 0.01; passo(g);
  ok(d.phase === 'judge', 'triagem: fim do turno entra em judge');
  segundos(g, 3.05);
  ok(d.phase === 'pause' && d.contagem >= 1, `triagem: depois do julgamento vem a pausa com contagem (fase ${d.phase}, contagem ${d.contagem})`);
  const antes = g.players[1].data.sub;
  aperta(1, { a: true }); passo(g); solta();
  ok(g.players[1].data.sub === antes, 'triagem: durante a pausa a entrada é ignorada');
  segundos(g, 1.6);
  ok(d.phase === 'play' && d.sub === 2, 'triagem: ~1,5 s depois começa o turno 2');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ triagem: depois do julgamento vem a pausa ... (fase play ...)`.

- [ ] **Step 3: Implementar**

Em `endSub`, dentro do `g.after(1.4, ...)`: em vez de `d.phase = 'play'` e `g.message('TURNO N')`, entrar em `d.phase = 'pause'; d.pauseT = this.PAUSA; d.contagem = 3;` e zerar `p.data.sub` com um destaque (`p.data.subFlash = 0.5`). No `update`, se `d.phase === 'pause'`: decrementar `d.pauseT`; `d.contagem = Math.ceil(d.pauseT / (this.PAUSA / 3))` (3 → 2 → 1), tocando `tick` a cada mudança; ao chegar a 0: `d.phase = 'play'`, `d.timer = d.subTime`, `g.sfx('go')`, `g.flash('#fff', 0.1)`, `g.message('JÁ!', 0.6, '#ff5a3c')`. `drawOverlay` e `draw`: durante `pause`, "TURNO N" grande no centro (fonte 40) com o número da contagem embaixo (fonte 64).

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js triagem --vezes 3 && node tools/simular.js triagem --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/triagem.js tools/teste_ajustes.js
git commit -m "Triagem: pausa com contagem 3-2-1 entre os turnos"
```

---

### Task 5: Linha de montagem: reposição pela necessidade e por tempo

**Files:**
- Modify: `minigames/fabrica_de_armas.js` (constantes l.27, `init` l.44–60, reposição l.148–156)

**Interfaces:**
- Produces: `tipoParaRepor(g)` → índice de tipo (o de maior demanda positiva; senão `U.pick(this.TYPES)`); `d.proximoSpawn` (tempo do próximo spawn por tempo); `SPAWN_TEMPO = 2`, `MIN_CHAO = 8`.

- [ ] **Step 1: Teste**

```js
function secaoFabrica() {
  const def = TN.minigames.fabrica_de_armas, g = rodada('fabrica_de_armas'), d = g.data;
  ok(def.START_PARTS === 14 && def.MAX_FLOOR === 14 && def.RESPAWN === 2, 'fábrica: 14 peças iniciais, chão 14, reposição 2 s');
  ok(d.parts.length === 14 && g.players.every((p) => d.parts.some((pt) => pt.type === p.data.recipe[0])), 'fábrica: no início há 14 peças e a 1ª peça da receita de cada um');
  const precisa = g.players[0].data.recipe[0];
  d.parts = d.parts.filter((pt) => pt.type !== precisa);
  for (const p of g.players) { p.data.prog = 0; p.data.recipe[0] = precisa; p.data.carry = null; }
  ok(def.tipoParaRepor(g) === precisa, 'fábrica: repõe o tipo que todos precisam e não há no chão');
  d.parts = []; segundos(g, 2.1);
  ok(d.parts.length >= 1, `fábrica: com o chão vazio entra peça por tempo (${d.parts.length})`);
  // Review Focus 2: todos já montaram
  for (const p of g.players) p.data.prog = 5;
  let erro = ''; try { def.tipoParaRepor(g); } catch (e) { erro = e.message; }
  ok(!erro && def.TYPES.includes(def.tipoParaRepor(g)), 'fábrica: sem demanda, a reposição sorteia e não quebra');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ fábrica: 14 peças iniciais ...`, `✗ fábrica: repõe o tipo ...` (não existe `tipoParaRepor`).

- [ ] **Step 3: Implementar**

`tipoParaRepor(g)`: para cada tipo T, `demanda = vivos com recipe[prog] === T (prog < 5)` − `parts com type T` − `vivos com carry === T`; devolve o de maior demanda se > 0, senão `U.pick(this.TYPES)`. Trocar `U.pick(this.TYPES)` da l.154 por `this.tipoParaRepor(g)`. No `init`: 14 peças, com o saco começando pelo `recipe[0]` de cada jogador. No `update`, antes da reposição: `if (g.time >= d.proximoSpawn) { d.proximoSpawn = g.time + this.SPAWN_TEMPO; if (d.parts.length < this.MIN_CHAO) d.respawns.push(g.time); }`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js fabrica_de_armas --vezes 3 && node tools/simular.js fabrica_de_armas --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/fabrica_de_armas.js tools/teste_ajustes.js
git commit -m "Linha de montagem: reposição pela necessidade e por tempo; 14 peças iniciais"
```

---

### Task 6: Carrapato: sem contagem, ativação sorteada, mais pilares

**Files:**
- Modify: `minigames/carrapato.js` (`init` l.26, timer l.30/73/89–98/109, `devLit` l.224, rótulos l.311–314 e 386–389, painéis l.318–327 e 390–394, bot l.184)

**Interfaces:**
- Produces: `armarTimer(g)`: sorteia `dev.dur ∈ [11, 17]`, `dev.timer = dev.dur`, `dev.timerOn = true`; `ATIVACAO_MIN = 11`, `ATIVACAO_MAX = 17`; `d.pillars` com 8 a 10 itens.

- [ ] **Step 1: Teste**

```js
function secaoCarrapato() {
  const def = TN.minigames.carrapato, g = rodada('carrapato'), d = g.data, dev = d.dev;
  ok(d.pillars.length >= 8 && d.pillars.length <= 10 && d.pillars.every((p) => p.r >= 22 && p.r <= 34), `carrapato: ${d.pillars.length} pilares de raio 22–34`);
  ok(d.pillars.every((a, i) => d.pillars.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 40)), 'carrapato: há passagem (≥ 40 px) entre os pilares');
  const durs = new Set();
  for (let k = 0; k < 12; k++) { def.armarTimer(g); durs.add(dev.dur); ok(dev.dur >= 11 && dev.dur <= 17 && dev.timer === dev.dur, `carrapato: ativação sorteada ${dev.dur.toFixed(1)} s`); if (dev.dur < 11 || dev.dur > 17) break; }
  ok(durs.size > 1, 'carrapato: a duração varia');
  dev.timer = 7.3;
  const t = textos((c) => def.draw(g, c)), tO = textos((c) => def.drawOverlay(g, c));
  ok(!/\d\.\d s/.test(t + tO) && !/\|\s*8\s*\|/.test(' | ' + t + ' | '), 'carrapato: nenhuma contagem numérica na tela');
  ok(/VAI DISPARAR/.test(t), 'carrapato: painel diz "O CARRAPATO VAI DISPARAR…"');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ carrapato: 4 pilares ...` e `armarTimer is not a function`.

- [ ] **Step 3: Implementar**

`armarTimer(g)` usado nas l.73 e l.109 (e no `init`, `dur: this.ACTIVATION` passa a ser preenchido por ela). Em `update` l.92, `devLit` l.225 e no bot l.184, trocar `this.ACTIVATION` por `dev.dur`. Rótulos sobre o dispositivo: remover os `Math.ceil(dev.timer)` (3D e 2D); manter só "!!" quando armado. Painéis: `'O CARRAPATO VAI DISPARAR…'` quando `timerOn`; nos últimos 3 s (`dev.timer < 3`) `devLit` devolve `true` constante (luz vermelha contínua) e o painel fica vermelho. Pilares: grade 3×3 irregular (`fx ∈ {0.2, 0.5, 0.8} ± 0.06`, `fy ∈ {0.25, 0.5, 0.75} ± 0.06`, raio `U.rand(22, 34)`), sem o central se der 9 e precisar de corredor; garantir a distância mínima de 40 px entre bordas.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js carrapato --vezes 3 && node tools/simular.js carrapato --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/carrapato.js tools/teste_ajustes.js
git commit -m "Carrapato: ativação sorteada e sem contagem na tela; 8 a 10 pilares"
```

---

### Task 7: Caminho da memória: ✓ azul, ✗ laranja, chão pintado

**Files:**
- Modify: `minigames/caminho_da_memoria.js` (cores l.226–233 no 3D e l.280–290 no 2D)

**Interfaces:**
- Produces: `COR_SEGURA = '#2aa7ff'`, `COR_ERRADA = '#ff8a2a'`, `COR_EXPLODIDA = '#444'`.

- [ ] **Step 1: Teste**

```js
function secaoMemoria() {
  const def = TN.minigames.caminho_da_memoria, g = rodada('caminho_da_memoria');
  ok(def.COR_SEGURA === '#2aa7ff' && def.COR_ERRADA === '#ff8a2a', 'memória: cores azul (segura) e laranja (errada)');
  const prev = estilos((c) => def.draw(g, c));
  ok(prev.includes('#2aa7ff') && prev.includes('#ff8a2a') && !prev.includes('#46e27b') && !prev.includes('#ff3b3b'), 'memória: a prévia 2D usa as cores novas e não o verde/vermelho');
  const t = textos((c) => def.draw(g, c));
  ok(/✓/.test(t) && /✗/.test(t), 'memória: a prévia desenha ✓ e ✗');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ memória: cores azul ...`.

- [ ] **Step 3: Implementar**

Constantes novas. 3D (l.226–233): `col` usa as novas cores; no lugar da esfera, um painel `r.box(w.x, WH + 14, dr.cy, T + 2, 26, 26, col || '#222')` com `r.label(w.x, WH + 14, dr.cy, seguro ? '✓' : '✗', '#fff', 22)` quando `col`; na prévia, `r.plane(w.x, 0.5, dr.cy, T + 10, dr.y1 - dr.y0, col, { glow: true, opacity: 0.35 })`; porta explodida: `dr.red && !preview` → painel `COR_EXPLODIDA` com '✗' cinza e a fuligem que já existe. 2D (l.280–290): mesmas cores, e `D.text` com ✓/✗ no centro da porta durante a prévia, mais um retângulo translúcido na cor sobre a porta.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js caminho_da_memoria --vezes 3 && node tools/simular.js caminho_da_memoria --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/caminho_da_memoria.js tools/teste_ajustes.js
git commit -m "Caminho da memória: ✓ azul e ✗ laranja nas portas, chão pintado na prévia"
```

---

### Task 8: Piso falso: queda por área, padrões e garantia

**Files:**
- Modify: `minigames/piso_falso.js` (`randomize`/layout l.45 e 62–67, queda l.99–106, cadência l.68 e 81, `init` l.32)

**Interfaces:**
- Produces: `semChao(g, p)` → `true` se nenhum dos 5 pontos está sobre piso; `gerarLayout(g)`: define `t.sym` por um padrão sorteado (`'blocos' | 'faixas' | 'aneis' | 'tabuleiro' | 'ruido'`) e escolhe `d.safe` com a proporção alvo `0.45 − 0.05 × min(3, d.cycle)`; `garantir(g)`: para cada vivo, se não há ladrilho `up` com `sym === d.safe` a até `alcance = SPEED × d.phaseDur × 0.8`, converte o ladrilho `up` mais próximo; `TOLERANCIA = 0.15`; `p.data.semChaoT`.

- [ ] **Step 1: Teste**

```js
function secaoPisoFalso() {
  const def = TN.minigames.piso_falso, g = rodada('piso_falso'), d = g.data, p = g.players[0];
  def.setPhase(g, 'drop', 2.5);
  const t0 = def.tileAt(g, p.x, p.y), vizinho = def.tileAt(g, p.x + def.TILE, p.y);
  for (const t of d.tiles) t.state = 'up';
  t0.state = 'down'; p.x = d.gx + (t0.c + 1) * def.TILE - 4;   // quina: centro no buraco, 10 px à direita já é piso
  ok(!def.semChao(g, p), 'piso falso: na quina de um piso o jogador não cai');
  for (const t of d.tiles) t.state = 'down';
  passo(g, 1 / 60, 6);
  ok(p.alive, 'piso falso: 0,1 s sem chão ainda não elimina');
  passo(g, 1 / 60, 6);
  ok(!p.alive, 'piso falso: 0,2 s sem chão elimina');
  const h = rodada('piso_falso'), e = h.data;
  const padroes = new Set();
  for (let k = 0; k < 8; k++) {
    e.cycle = k % 4; def.setPhase(h, 'final', 2); def.gerarLayout(h); padroes.add(e.padrao);
    const up = e.tiles.filter((t) => t.state === 'up'), seg = up.filter((t) => t.sym === e.safe).length / up.length;
    ok(seg >= 0.25 && seg <= 0.6, `piso falso: padrão ${e.padrao}, ${(seg * 100).toFixed(0)}% seguros`);
    def.garantir(h);
    const alc = def.SPEED * e.phaseDur * 0.8;
    ok(h.alive().every((q) => e.tiles.some((t) => t.state === 'up' && t.sym === e.safe && Math.hypot(def.center(h, t).x - q.x, def.center(h, t).y - q.y) <= alc)), 'piso falso: todo mundo tem um piso seguro ao alcance');
  }
  ok(padroes.size >= 2, 'piso falso: os padrões variam');
  // Review Focus 3: gone fica gone
  const gone = e.tiles[0]; gone.state = 'gone'; for (const q of h.players) { q.x = def.center(h, gone).x; q.y = def.center(h, gone).y; }
  for (const t of e.tiles) if (t !== gone) t.state = 'down';
  def.garantir(h);
  ok(gone.state === 'gone', 'piso falso: a garantia não ressuscita ladrilho removido');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `semChao is not a function`.

- [ ] **Step 3: Implementar**

`semChao` com os 5 pontos `[0,0],[10,0],[-10,0],[0,10],[0,-10]`. Na queda (l.100–104): `p.data.semChaoT = this.semChao(g, p) ? p.data.semChaoT + dt : 0; if (p.data.semChaoT > this.TOLERANCIA) { fallT = 0; eliminate }`. `gerarLayout(g)` substitui o par `randomize` + `options` nas l.63–67 (os embaralhamentos de mentira continuam com `randomize`), guarda `d.padrao` e chama `garantir(g)` ao fim; `garantir` ignora `gone`. Cadência: `WAIT_T ± U.rand(-0.3, 0.3)` e a duração de `final` com o mesmo jitter, piso 1,0.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js piso_falso --vezes 3 && node tools/simular.js piso_falso --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/piso_falso.js tools/teste_ajustes.js
git commit -m "Piso falso: queda por área com tolerância, padrões de queda variados e piso seguro garantido"
```

---

### Task 9: Tragada certa: sem a barra de fôlego

**Files:**
- Modify: `minigames/tragada.js` (constantes l.26–27, `update` l.85–105, `botTarget` l.48, bot l.139–144, `drawOverlay` l.297–304 e o 2D equivalente)

**Interfaces:**
- Produces: `ATORDOA = 0.3`, `p.data.stun` (segundos), `CHOKE_TIME = 1.2`, `CIG_MULT = 0.3`.

- [ ] **Step 1: Teste**

```js
function secaoTragada() {
  const def = TN.minigames.tragada, g = rodada('tragada'), s = g.players[0].data;
  ok(def.CHOKE_TIME === 1.2 && def.CIG_MULT >= 0.28 && def.CIG_MULT <= 0.32, 'tragada: tosse 1,2 s e cigarro gasta ~0,3 por tragada');
  aperta(0, { a: true }); segundos(g, 3);
  ok(s.coughs === 0 && s.choke === 0 && !s.inhaling && s.exhaling, 'tragada: lotar o pulmão força a exalação sem tosse');
  ok(s.stun > 0 || s.lung < 1, 'tragada: o atordoamento de 0,3 s aconteceu');
  solta(); segundos(g, 2);
  aperta(0, { a: true }); segundos(g, 0.4); solta(); aperta(0, { a: true }); passo(g);
  ok(s.choke > 0 && s.choke <= 1.2, `tragada: apertar antes de esvaziar ainda tosse (${s.choke.toFixed(2)} s)`);
  // Review Focus 4: o cigarro acaba no meio da tragada
  const h = rodada('tragada'), q = h.players[0].data; q.cig = 0.001; q.lung = 0;
  aperta(0, { a: true }); segundos(h, 3); solta(); segundos(h, 2);
  ok(q.done, 'tragada: cigarro acabando no meio da tragada termina normalmente');
  const t = textos((c) => def.drawOverlay(h, c));
  ok(!/F[ÔO]LEGO|PULM/i.test(t), 'tragada: nenhum rótulo de fôlego/pulmão na tela');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ tragada: tosse 1,2 s ...` e `✗ tragada: lotar o pulmão força a exalação sem tosse`.

- [ ] **Step 3: Implementar**

L.95: `else if (s.lung > 1.0) { s.lung = 1.0; s.inhaling = false; s.exhaling = true; s.stun = this.ATORDOA; }`; enquanto `s.stun > 0`, decrementa e ignora `aPressed`. `drawOverlay`/`draw`: tirar a barra de pulmão e a linha vermelha (`LUNG_MAX_VIEW` some); a brasa (`r.sphere` da ponta) ganha raio e brilho proporcionais a `s.lung` enquanto traga. Bot: `botTarget` passa a ser "tragar até a exalação forçada" (`target = 1.0`), e espera `s.exhaling` terminar antes de apertar de novo. `brief`: trocar a linha do pulmão por `'Trague, solte, espere a fumaça sair. Tragar com a boca cheia dá tosse.'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js tragada --vezes 3 && node tools/simular.js tragada --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/tragada.js tools/teste_ajustes.js
git commit -m "Tragada certa: sem barra de fôlego; lotar o pulmão só força a exalação"
```

---

### Task 10: Batata quente: a batata esquenta na mão

**Files:**
- Modify: `minigames/batata_quente.js` (`spawnPot` l.58–67, `pass` l.88–100, `update` l.153–185, bot l.187–205)

**Interfaces:**
- Produces: `pot.heldT`; `AQUECE = 0.6`, `AQUECE_MAX = 3`, `QUEIMA_AVISO = 1.5`.

- [ ] **Step 1: Teste**

```js
function secaoBatata() {
  const def = TN.minigames.batata_quente, g = rodada('batata_quente');
  segundos(g, 1.2);
  const pot = g.data.pot, dono = pot.holder;
  ok(pot && pot.state === 'held' && dono, 'batata: alguém segura a batata');
  pot.fuse = 10; pot.heldT = 0; solta();
  segundos(g, 2);
  ok(pot.holder === dono && pot.fuse < 7.3, `batata: 2 s na mão queimam mais que 2 s de pavio (restou ${pot.fuse.toFixed(2)})`);
  ok(g._popups.some((pp) => pp.text === 'QUEIMANDO!'), 'batata: aviso QUEIMANDO! depois de 1,5 s');
  const i = dono.id; aperta(i, { a: true }); passo(g); solta();
  ok(pot.state === 'flight' && pot.heldT === 0, 'batata: passar zera o tempo na mão');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ batata: 2 s na mão queimam mais ... (restou 8.00)`.

- [ ] **Step 3: Implementar**

`heldT: 0` no `spawnPot`; em `pass` e ao cair/receber (`state = 'held'`) `pot.heldT = 0`; l.157: `pot.fuse -= dt * (pot.state === 'held' ? Math.min(this.AQUECE_MAX, 1 + this.AQUECE * pot.heldT) : 1)` com `pot.heldT += dt` quando `held`; aviso: ao cruzar `QUEIMA_AVISO`, `g.popup('QUEIMANDO!', holder.x, holder.y - 40, '#ff6a10')` uma vez (`pot.avisou`) e `pot.interval` multiplicado por 0,6. Bot: `d.botWait` máximo reduzido para `CATCH_LOCK + 1.2`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js batata_quente --vezes 3 && node tools/simular.js batata_quente --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/batata_quente.js tools/teste_ajustes.js
git commit -m "Batata quente: segurar esquenta o pavio (até 3×) e avisa QUEIMANDO!"
```

---

### Task 11: Cabo de guerra: janela de ritmo e medidor de cadência

**Files:**
- Modify: `minigames/cabo_de_guerra.js` (constantes l.29–35, `handlePulls` l.115–156, `drawOverlay` l.431–445, `brief` l.12)

**Interfaces:**
- Produces: `FAST = 0.20`, `IMP_FAST = 0.3`, `GRIP_COST = 0.18`; `q.qualidade ∈ {'bom','afobado','devagar','mesmo'}` e `q.qualidadeT` (tempo desde a última mudança) em `p.data`.

- [ ] **Step 1: Teste**

```js
function secaoCabo() {
  const def = TN.minigames.cabo_de_guerra, g = rodada('cabo_de_guerra'), q = g.players[0].data;
  ok(def.FAST === 0.2 && def.SLOW === 0.32 && def.IMP_FAST === 0.3 && def.GRIP_COST === 0.18, 'cabo: janela 0,20–0,32 s, afobado 0,3 e custo de pegada 0,18');
  segundos(g, 1.5);
  const toque = (btn, espera) => { solta(); segundos(g, espera); aperta(0, btn === 'a' ? { a: true } : { b: true }); passo(g); solta(); };
  toque('a', 0.5); toque('b', 0.25);
  ok(q.qualidade === 'bom', `cabo: 0,25 s entre toques = bom (${q.qualidade})`);
  toque('a', 0.1);
  ok(q.qualidade === 'afobado', `cabo: 0,1 s = afobado (${q.qualidade})`);
  toque('b', 0.6);
  ok(q.qualidade === 'devagar', `cabo: 0,6 s = devagar (${q.qualidade})`);
  ok(def.brief.some((b) => /4 toques/.test(b)), 'cabo: brief fala em 4 toques por segundo');
  const t = textos((c) => def.drawOverlay(g, c));
  ok(/PEGADA/.test(t), 'cabo: HUD tem o rótulo PEGADA');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ cabo: janela 0,20–0,32 s ...` e `cabo: ... = bom (undefined)`.

- [ ] **Step 3: Implementar**

Constantes; em `handlePulls`, depois de calcular `imp`: `const qual = q.last === btn ? 'mesmo' : fast ? 'afobado' : gap > this.SLOW ? 'devagar' : 'bom'; if (qual !== q.qualidade) { q.qualidade = qual; q.qualidadeT = 0; if (qual === 'afobado') g.popup('AFOBADO', ...); if (qual === 'devagar') g.popup('DEVAGAR', ...); }`. `drawOverlay`: sob cada jogador um anel de raio 14 que pulsa a 4 Hz (`1 + 0.25 × sin(g.time × 2π × 4)`) na cor da qualidade (verde `#46e27b`, vermelho `#ff3b3b`, cinza `#777`), a barra de pegada com 120×10 e rótulo "PEGADA"; nos primeiros 5 s um metrônomo central (dois traços que alternam a 4 Hz). `brief`: `'Alterne AÇÃO e EXTRA, uns 4 toques por segundo. Martelar escorrega.'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js cabo_de_guerra --vezes 3 && node tools/simular.js cabo_de_guerra --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/cabo_de_guerra.js tools/teste_ajustes.js
git commit -m "Cabo de guerra: janela de ritmo 3–5 toques/s, martelar rende menos, medidor de cadência no HUD"
```

---

### Task 12: Hora do trem: empurrão para fora do nicho

**Files:**
- Modify: `minigames/hora_do_trem.js` (constantes l.19, `shove` l.128–140, entrada no nicho l.108–118)

**Interfaces:**
- Produces: `SHOVE_RANGE = 72`, `SHOVE_LOCK = 0.35`, `FORA_DO_NICHO = 0.3`, `p.data.foraT` (segundos em que não pode contar como dentro de um nicho).

- [ ] **Step 1: Teste**

```js
function secaoTrem() {
  const def = TN.minigames.hora_do_trem;
  ok(def.SHOVE_RANGE === 72 && def.SHOVE_LOCK === 0.35 && def.FORA_DO_NICHO === 0.3, 'trem: alcance 72, recarga 0,35, 0,3 s sem reentrar');
  for (const lado of [-1, 1]) {   // Review Focus 5: parede de cima e de baixo
    const g = rodada('hora_do_trem'), d = g.data, n = d.nooks.find((k) => k.side === lado);
    const a = g.players[0], v = g.players[1];
    v.x = n.cx; v.y = lado < 0 ? d.floorTop - 20 : d.floorBot + 20;   // fundo do nicho
    a.x = n.cx + 30; a.y = lado < 0 ? d.floorTop + 10 : d.floorBot - 10; a.dir = Math.atan2(v.y - a.y, v.x - a.x);
    ok(def.nookOf(g, v) === n, `trem (lado ${lado}): vítima está no nicho`);
    def.shove(g, a);
    ok(Math.abs(v.vx) < 1 && Math.sign(v.vy) === -lado && Math.abs(v.vy) > 300, `trem (lado ${lado}): empurrão sai reto do nicho (vy ${v.vy.toFixed(0)})`);
    ok(v.data.foraT === def.FORA_DO_NICHO, `trem (lado ${lado}): vítima fica 0,3 s sem reentrar`);
    segundos(g, 0.1);
    ok(!(def.nookOf(g, v) && def.isSafeIn(g, v, def.nookOf(g, v)) && v.data.foraT > 0) , `trem (lado ${lado}): enquanto foraT > 0 não conta como segura`);
  }
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ trem: alcance 72 ...` e `empurrão sai reto do nicho (vy ...)` com `vx ≠ 0`.

- [ ] **Step 3: Implementar**

Em `shove`: se `const n = this.nookOf(g, o)` existe, `o.vx = 0; o.vy = -n.side * this.SHOVE; o.data.foraT = this.FORA_DO_NICHO;` senão o impulso atual. No `update`, `b.foraT = Math.max(0, b.foraT - dt)` e, na checagem de segurança (l.118), `safe = ... && b.foraT <= 0`. Inicializar `foraT: 0` no `init`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_ajustes.js && node tools/simular.js hora_do_trem --vezes 3 && node tools/simular.js hora_do_trem --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/hora_do_trem.js tools/teste_ajustes.js
git commit -m "Hora do trem: empurrão tira do nicho de verdade; alcance 72 e recarga 0,35"
```

---

### Task 13: Screenshots, rede e documentação

**Files:**
- Modify: `CLAUDE.md` (lista de testes); só se a revisão pedir, coordenadas em `contramao.js`, `servico_interno.js`, `caminho_da_memoria.js`, `cabo_de_guerra.js`, `tragada.js`, `carrapato.js`

- [ ] **Step 1: Screenshots** (servidor rodando: `node tools/servidor.js 8765` em background)

```bash
for par in contramao:8 servico_interno:12 caminho_da_memoria:2 cabo_de_guerra:6 tragada:6 carrapato:5 triagem:16 piso_falso:9; do
  id=${par%%:*}; t=${par##*:}; bash tools/screenshot.sh $id $t screenshots/ajustes/$id.png
done
```

Conferir em cada um: contramão (painéis embaixo, 4 escadas na tela), serviço interno (arena inteira enquadrada), memória (✓/✗ legíveis e chão pintado), cabo (anel e PEGADA), tragada (sem barra), carrapato (sem número, pilares com passagem), triagem (contagem), piso falso (padrão em blocos ou faixas). Ajuste só coordenadas e tamanhos; repita o screenshot do jogo ajustado.

- [ ] **Step 2: Tudo**

Run: `node tools/teste_ajustes.js && node tools/simular.js && node tools/teste_rede.js`
Expected: `Tudo certo.`, `Tudo certo.`, `Rede OK.`

- [ ] **Step 3: Documentar**

Em `CLAUDE.md`, na regra final de testes, acrescentar `node tools/teste_ajustes.js` depois de `teste_menus.js`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md minigames/
git commit -m "Ajustes: revisão visual dos 8 jogos com mudança de tela e documentação"
```
