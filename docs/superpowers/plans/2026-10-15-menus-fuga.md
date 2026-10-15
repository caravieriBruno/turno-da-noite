# Menus "Fuga da Prisão" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dois resultados:
- só o host navega nos menus: na rede, o computador que criou a sala; no mesmo computador, o P1;
- todas as telas de menu passam a ser um "mapa de fuga a giz", com textos de plano de fuga em etapas.

**Architecture:**
- `TN.input.menu(pode)` passa a receber um filtro de dispositivos. A função `TN.donoDoMenu(roster)` em `session.js` decide quem navega.
- Um kit 2D novo, `engine/giz.js` (`TN.giz`), desenha a lousa, a letra à mão, os traços, a seleção, os bilhetes e os detentos de giz. Ele é determinístico: o tremor vem de uma semente, nunca de `Math.random()`.
- As cenas de `session.js` e as telas de rede de `net.js` trocam `D.text`/`D.panel`/`D.robot`/`D.crt` pelo `TN.giz` e ganham os textos novos.
- O atalho `?cena=<Nome>` abre qualquer tela de menu com uma sessão de mentira, para os testes e os screenshots.

**Tech Stack:** JS puro (scripts clássicos, sem build), Canvas 2D, Node para os testes headless, Chrome headless para os screenshots.

**Spec:** `docs/superpowers/specs/2026-10-15-menus-fuga-design.md`

## Global Constraints

- JS puro em scripts clássicos, sem build e sem npm. O `index.html` precisa abrir por `file://`. Nada de `import`/`export`.
- Os minigames (`minigames/*.js`) não mudam. Os textos, nomes e briefings deles ficam como estão.
- `TN.input.menu()` **sem argumento** continua somando todos os dispositivos, como hoje.
- Um jogador remoto (dispositivo `n<cliente>:...`) **nunca** navega pelos menus do host.
- No lobby, cada dispositivo continua entrando, dando PRONTO e saindo pela própria vaga, inclusive os remotos. No briefing, cada jogador continua dando o próprio PRONTO.
- O `TN.giz` não chama `Math.random()`. O tremor e o grão vêm de uma semente do texto ou das coordenadas. A única animação usa o tempo da cena.
- Cores do giz: giz `#e8e4d8`, destaque `#f2d65a`, perigo `#e0574a`. Os jogadores usam `TN.PLAYER_COLORS` desbotadas.
- Nos menus o `D.crt` sai e fica só a vinheta da lousa. O jogo em si não muda.
- Textos e comentários em pt-BR, no estilo do código vizinho. Os textos novos são exatamente os da tabela 5.3 da spec.
- Depois de mexer no motor, rode:
  - `node tools/simular.js` (também com `--sessao`);
  - `node tools/teste_cenarios.js`, `node tools/teste_detento.js` e `node tools/teste_menus.js` (novo);
  - `bash tools/teste_render.sh`;
  - `node tools/teste_rede.js`, com o servidor rodando.

## Review Focus

1. **Voltar ao título depois de uma partida** (Pausa → DESISTIR DA FUGA deixa `TN.session` preenchida): o título precisa continuar navegável por qualquer dispositivo local, não só pelo P1. O teste fica na Task 1.
2. **O controle do P1 desconectado no meio da partida:** sem P1 conectado, qualquer dispositivo local navega, para ninguém ficar preso no menu. O teste fica na Task 1.
3. **Título de minigame longo com a fonte de letra à mão** (mais larga que a Courier), na roleta e no "montar o plano": o texto não pode vazar do cartão nem invadir a coluna ao lado. O `maxWidth` está nas Tasks 3 e 4, e a conferência é nos screenshots da Task 5.
4. **Cliente de rede vendo o menu do host:** precisa desenhar o mesmo giz (determinismo) e o snapshot não pode crescer (o `TN.giz` não guarda nada na cena). O teste de determinismo fica na Task 2 e o `teste_rede.js` roda na Task 5.
5. **Texto pequeno (rodapés, rótulo de dispositivo) ilegível com o grão:** abaixo de 14 px, uma passada só e sem grão. Implementado na Task 2 e conferido nos screenshots da Task 5.

---

## Arquivos

| arquivo | papel |
|---|---|
| `engine/input.js` | `menu(pode)` e `ehLocal(id)` |
| `engine/session.js` | `donoDoMenu(roster)`; as cenas usam o filtro, o giz e os textos novos; `cenaDeTeste(nome)` e `?cena=` |
| `engine/net.js` | telas de rede com filtro e giz |
| `engine/giz.js` (novo) | kit `TN.giz` |
| `engine/main.js` | com `?cena=`, o loop só desenha (a tela fica parada para o screenshot) |
| `index.html` | carrega `engine/giz.js` |
| `tools/simular.js`, `tools/teste_rede.js` | carregam `engine/giz.js` |
| `tools/teste_menus.js` (novo) | testes Node: dono do menu, giz, `?cena=`, textos |
| `tools/menus.sh` (novo) | screenshots de todas as telas de menu |
| `CLAUDE.md`, `docs/COMO_CRIAR_MINIGAME.md` | documentação |

O trabalho é feito na branch `menus-fuga`, criada a partir da `main`.

---

### Task 1: Só o host navega nos menus

**Files:**
- Modify: `engine/input.js` (`menu()`, por volta da linha 119)
- Modify: `engine/session.js` (`update` de Title, Controls, TestList, Setup, Pause, RoundOver, ScoreScreen e Final; nova função depois de `newSession`)
- Modify: `engine/net.js` (`update` de NetMessage, HostCreate e JoinList)
- Create: `tools/teste_menus.js`

**Interfaces:**
- Produces:
  - `TN.input.ehLocal(id): boolean`: `true` para `kb1`, `kb2`, `kb3` e `gpN`; `false` para `n<cliente>:...` e ids vazios;
  - `TN.input.menu(pode?: (id) => boolean)`: o mesmo objeto de antes (`up, down, left, right, ok, back, okDevice`), considerando só os dispositivos aceitos por `pode`;
  - `TN.donoDoMenu(roster?): (id) => boolean`;
  - em `tools/teste_menus.js`: `quadro(aperta)`, `espera(seg)`, `S` (= `TN.sceneClasses`) e `I` (= `TN._internal`), reutilizados pelas tasks seguintes.

- [ ] **Step 1: Criar a branch**

```bash
git checkout main && git checkout -b menus-fuga
```

- [ ] **Step 2: Escrever o teste `tools/teste_menus.js`**

```js
#!/usr/bin/env node
// Testa os menus sem navegador (spec docs/superpowers/specs/2026-10-15-menus-fuga-design.md):
// quem pode navegar (só o host/P1), o giz determinístico, o atalho ?cena= e os textos no tema de fuga.
// Uso: node tools/teste_menus.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) falhas++; };

global.window = global;
global.performance = global.performance || { now: () => Date.now() };
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const load = (rel) => vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel });
const MOTOR = ['engine/util.js', 'engine/input.js', 'engine/audio.js', 'engine/draw.js', 'engine/render3d.js', 'engine/cenarios.js', 'engine/minigame.js', 'engine/session.js', 'engine/net.js', 'minigames/manifest.js'];
MOTOR.forEach(load);
for (const f of TN.MINIGAME_FILES) load('minigames/' + f);
const S = TN.sceneClasses, I = TN._internal;

// ---- entrada simulada: um quadro com alguns dispositivos apertando algo ----
const DISPOSITIVOS = ['kb1', 'kb2', 'kb3', 'gp0', 'n1:kb1'];
const solto = () => ({ x: 0, y: 0, a: false, b: false, aPressed: false, bPressed: false, startPressed: false, upPressed: false, downPressed: false, leftPressed: false, rightPressed: false });
// aperta = { dispositivo: 'up' | 'down' | 'left' | 'right' | 'a' | 'b' }; os outros ficam soltos
function quadro(aperta = {}, dt = 1 / 60) {
  for (const id of DISPOSITIVOS) {
    const s = solto(), b = aperta[id];
    if (b === 'a') { s.a = true; s.aPressed = true; } else if (b === 'b') { s.b = true; s.bPressed = true; } else if (b) s[b + 'Pressed'] = true;
    TN.input._inject(id, s);
  }
  TN.scene.update(dt);
  TN.scene.t = (TN.scene.t || 0) + dt;
}
const espera = (seg) => { for (let i = 0; i < Math.round(seg * 60); i++) quadro(); };

// --- 1. quem navega nos menus ---
function secaoDono() {
  TN.input.setRemote('n1:kb1', {});   // o host passa a ver o cliente 1 como dispositivo "n1:kb1"
  TN.go(TN.TitleScene); TN.TitleScene.sel = 0;
  quadro({ 'n1:kb1': 'down' }); ok(TN.TitleScene.sel === 0, 'título: jogador remoto não navega');
  quadro({ kb2: 'down' }); ok(TN.TitleScene.sel === 1, 'título: teclado 2 deste computador navega');
  quadro({ gp0: 'down' }); ok(TN.TitleScene.sel === 2, 'título: controle deste computador navega');

  // P1 = teclado 2, P2 = teclado 1
  const roster = I.buildRoster([{ device: 'kb2' }, { device: 'kb1' }, null, null], true);
  ok(typeof TN.donoDoMenu === 'function' && TN.donoDoMenu(roster)('kb2') && !TN.donoDoMenu(roster)('kb1'), 'donoDoMenu: com jogadores, só o P1');
  const setup = new S.Setup(roster); TN.go(setup);
  quadro({ kb1: 'down' }); ok(setup.sel === 0, 'montar o plano: P2 não move a seleção');
  quadro({ kb2: 'down' }); ok(setup.sel === 1, 'montar o plano: P1 move a seleção');
  quadro({ kb2: 'up' }); quadro({ kb1: 'a' }); ok(TN.scene === setup, 'montar o plano: AÇÃO do P2 não começa a fuga');
  quadro({ kb2: 'a' }); ok(TN.scene instanceof S.Picker, 'montar o plano: AÇÃO do P1 começa a fuga');

  const brief = new S.Brief(); TN.go(brief);
  const pausa = new S.Pause(brief); TN.go(pausa);
  quadro({ kb1: 'down' }); ok(pausa.sel === 0, 'pausa: P2 não escolhe');
  quadro({ kb2: 'down' }); ok(pausa.sel === 1, 'pausa: P1 escolhe');

  const rodada = new TN.Round(TN.minigames[TN.session.playlist[0].id], TN.session.roster, 1, 1);
  const fim = new S.RoundOver(rodada); TN.go(fim);
  espera(1.1);
  quadro({ kb1: 'a' }); ok(TN.scene === fim, 'fim da tentativa: AÇÃO do P2 não pula');
  quadro({ kb2: 'a' }); ok(TN.scene instanceof S.ScoreScreen, 'fim da tentativa: AÇÃO do P1 pula');
  const placar = TN.scene; espera(1.6);
  quadro({ kb1: 'a' }); ok(TN.scene === placar, 'placar: AÇÃO do P2 não pula');
  quadro({ kb2: 'a' }); ok(TN.scene !== placar, 'placar: AÇÃO do P1 pula');

  // voltar ao título com a sessão ainda preenchida: o título é de todos os dispositivos locais
  TN.go(TN.TitleScene); TN.TitleScene.sel = 0;
  quadro({ kb3: 'down' }); ok(TN.TitleScene.sel === 1, 'título depois de uma partida: qualquer dispositivo local navega');

  // lobby e briefing continuam de cada um
  TN.session = null;
  const lobby = new S.Lobby({}); TN.go(lobby);
  quadro({ kb2: 'a' }); quadro({ 'n1:kb1': 'a' });
  ok(lobby.slots[0] && lobby.slots[0].device === 'kb2' && lobby.slots[1] && lobby.slots[1].device === 'n1:kb1', 'lobby: cada um (local ou remoto) entra na sua cela');
  quadro({ 'n1:kb1': 'a' }); ok(lobby.slots[1].ready && !lobby.slots[0].ready, 'lobby: o remoto dá PRONTO na própria cela');
  I.newSession(roster, [{ id: TN.minigameOrder[0], rounds: 1 }]);
  const b2 = new S.Brief(); TN.go(b2); espera(0.5);
  quadro({ kb1: 'a' }); ok(b2.ready[1] && !b2.ready[0], 'briefing: o P2 dá o próprio PRONTO');

  // sem humano local (o host só assiste): qualquer dispositivo local navega, remoto não
  const remotos = I.buildRoster([{ device: 'n1:kb1' }, { device: 'n2:kb1' }, null, null], true);
  const s2 = new S.Setup(remotos); TN.go(s2);
  quadro({ 'n1:kb1': 'down' }); ok(s2.sel === 0, 'sem humano local: remoto continua sem navegar');
  quadro({ kb3: 'down' }); ok(s2.sel === 1, 'sem humano local: teclado deste computador navega');

  // o controle do P1 foi desconectado: ninguém fica preso no menu
  const semControle = I.buildRoster([{ device: 'gp3' }, { device: 'kb1' }, null, null], true);
  const s3 = new S.Setup(semControle); TN.go(s3);
  quadro({ kb2: 'down' }); ok(s3.sel === 1, 'controle do P1 desconectado: dispositivo local navega');
}

// SEÇÕES EXTRAS (as tarefas seguintes acrescentam funções aqui)

secaoDono();
// CHAMADAS EXTRAS (as tarefas seguintes acrescentam aqui)
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node tools/teste_menus.js`
Expected: entre outros, `✗ título: jogador remoto não navega` e `✗ donoDoMenu: com jogadores, só o P1`, terminando com `N falha(s).`

- [ ] **Step 4: `engine/input.js`**

Substituir o método `menu()` (o comentário `// Navegação de menus: junta todos os dispositivos` e o corpo) por:

```js
    // Um jogador remoto aparece aqui como "n<cliente>:<dispositivo>"; os outros são deste computador.
    ehLocal: (id) => !!id && !String(id).startsWith('n'),
    // Navegação de menus: junta os dispositivos que `pode(id)` aceita (sem filtro: todos, como antes).
    // Esc/Backspace são do teclado físico deste computador e valem sempre como "voltar".
    menu(pode) {
      const m = { up: false, down: false, left: false, right: false, ok: false, back: false, okDevice: null };
      for (const id in state) {
        if (pode && !pode(id)) continue;
        const s = state[id];
        m.up ||= s.upPressed; m.down ||= s.downPressed; m.left ||= s.leftPressed; m.right ||= s.rightPressed;
        if (s.aPressed || s.startPressed) { m.ok = true; m.okDevice ||= id; }
        m.back ||= s.bPressed;
      }
      if (this.keyPressed('Escape') || this.keyPressed('Backspace')) m.back = true;
      return m;
    },
```

- [ ] **Step 5: `engine/session.js`: `donoDoMenu`**

Logo depois da função `newSession(...)`:

```js
  // Quem navega nos menus (spec 2026-10-15-menus-fuga, seção 4). Sem `roster` (título, controles, telas de
  // rede): qualquer dispositivo deste computador, nunca um jogador remoto. Com `roster`: só o P1, o humano
  // local de menor id; sem P1 local conectado (o host só assiste, ou o controle caiu), de novo os locais.
  function donoDoMenu(roster) {
    const conectados = TN.input.devices();
    const p1 = (roster || []).filter((p) => !p.isBot && TN.input.ehLocal(p.device) && conectados.includes(p.device))
      .sort((a, b) => a.id - b.id)[0];
    return p1 ? (id) => id === p1.device : TN.input.ehLocal;
  }
  TN.donoDoMenu = donoDoMenu;
```

- [ ] **Step 6: `engine/session.js`: usar o filtro nas cenas**

Trocar exatamente estas chamadas:
- `Title.update`: `const m = TN.input.menu(), n = this.items().length;` → `const m = TN.input.menu(donoDoMenu()), n = this.items().length;`
- `Controls.update`: `const m = TN.input.menu();` → `const m = TN.input.menu(donoDoMenu());`
- `TestList.update`: `const ids = TN.minigameOrder, m = TN.input.menu();` → `const ids = TN.minigameOrder, m = TN.input.menu(donoDoMenu());`
- `Setup.update`: `m = TN.input.menu(), S = TN.settings;` → `m = TN.input.menu(donoDoMenu(this.roster)), S = TN.settings;`
- `Pause.update`: `const m = TN.input.menu();` → `const m = TN.input.menu(donoDoMenu(TN.session && TN.session.roster));`
- `RoundOver.update`: `const skip = TN.session.roster.some((p) => !p.isBot && TN.input.get(p.device).aPressed);` → `const skip = TN.input.menu(donoDoMenu(TN.session.roster)).ok;   // só o P1 pula`
- `ScoreScreen.update`: a mesma troca do `RoundOver.update`.
- `Final.update`: `const m = TN.input.menu();` → `const m = TN.input.menu(donoDoMenu(TN.session.roster));`

O `Lobby` e o `Brief` não mudam: neles cada dispositivo age pela própria vaga.

- [ ] **Step 7: `engine/net.js`: telas de rede**

Trocar `TN.input.menu()` por `TN.input.menu(TN.donoDoMenu())` em `NetMessage.update`, em `HostCreate.update` (as duas ocorrências) e em `JoinList.update`.

- [ ] **Step 8: Rodar e ver passar**

Run: `node tools/teste_menus.js`
Expected: todos os itens da seção 1 com `✓` e `Tudo certo.`

Run: `node tools/simular.js --sessao 2>&1 | tail -3 && node tools/teste_rede.js`
Expected: `✓ sessão completa (...)`, `Tudo certo.` e `Rede OK.` (o `teste_rede.js` precisa do servidor: `node tools/servidor.js 8765` em background)

- [ ] **Step 9: Commit**

```bash
git add engine/input.js engine/session.js engine/net.js tools/teste_menus.js
git commit -m "Menus: só o host navega (P1 no mesmo computador; jogador remoto nunca)"
```

---

### Task 2: Kit de giz `TN.giz`, atalho `?cena=` e screenshots dos menus

**Files:**
- Create: `engine/giz.js`, `tools/menus.sh`
- Modify: `index.html`, `tools/simular.js:45`, `tools/teste_rede.js:19`, `tools/teste_menus.js`, `engine/session.js` (`TN.bootScene`), `engine/main.js` (loop)

**Interfaces:**
- Consumes: `TN.draw` (para `TN.draw.FONT` não precisa), `TN.util.clamp`, `TN.W`/`TN.H`.
- Produces:
  - `TN.giz = { CORES, FONTE, texto, linhas, titulo, linha, retangulo, circulo, selecao, bilhete, detento, parede, desbotar }`;
  - `CORES = { giz, destaque, perigo, apagado, apagadoForte, lapis, parede }`;
  - `texto(c, str, x, y, { size = 20, color = CORES.giz, align = 'left', baseline = 'middle', maxWidth, papel = false })`;
  - `linhas(c, str, x, y, opts)`, com `\n` e `opts.lineHeight`;
  - `titulo(c, str, x, y, size = 36, color = CORES.giz)`: centralizado, com sublinhado duplo;
  - `linha(c, x1, y1, x2, y2, { color, lw = 2, alpha = 0.9 })`;
  - `retangulo(c, x, y, w, h, { color, lw, alpha, fill })`;
  - `circulo(c, x, y, rx, ry, { color = CORES.destaque, lw = 2.5, progresso = 1, alpha = 0.95 })`;
  - `selecao(c, str, x, y, size, t, align = 'center')`: circula o texto `str` desenhado em (x, y), sendo `t` os segundos desde que a seleção mudou;
  - `bilhete(c, x, y, w, h, { rot = 0, fita = true })`: papel claro preso com fita;
  - `detento(c, x, y, tam, cor, { caido = false, comemorando = false, dir = 0 })`: altura total de cerca de `2,6 × tam`, centrada em y;
  - `parede(c)`: lousa e vinheta, a tela inteira;
  - `TN.cenaDeTeste(nome)` e `TN.CENAS_DE_TESTE` (lista dos 14 nomes);
  - em `tools/teste_menus.js`: `gravador()`, um contexto 2D de mentira que registra as chamadas em `c.log`.

- [ ] **Step 1: Escrever os testes (seções 2 e 3)**

Em `tools/teste_menus.js`:
- na lista `MOTOR`, acrescentar `'engine/giz.js'` logo depois de `'engine/draw.js'`;
- acrescentar abaixo de `// SEÇÕES EXTRAS (...)`:

```js
// contexto 2D de mentira: registra cada chamada (números arredondados) em c.log
function gravador() {
  const log = [];
  return new Proxy({}, {
    get(t, k) {
      if (k === 'log') return log;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k === 'createPattern') return () => ({});
      if (k in t) return t[k];
      return (...a) => { log.push([k, ...a.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' ? v : '?'))]); };
    },
    set(t, k, v) { t[k] = v; log.push(['=' + String(k), typeof v === 'object' ? '?' : v]); return true; },
  });
}
const desenho = (fn) => { const c = gravador(); fn(c); return JSON.stringify(c.log); };

// --- 2. giz: determinístico (sem Math.random), não "ferve", seleção animada ---
function secaoGiz() {
  const G = TN.giz;
  if (!G) { ok(false, 'TN.giz existe (engine/giz.js)'); return; }
  const rnd = Math.random; let erro = '', a, b, d1, d2;
  Math.random = () => { throw new Error('Math.random no giz'); };
  try {
    a = desenho((c) => G.texto(c, 'PLANEJAR A FUGA', 100, 100, { size: 24 }));
    b = desenho((c) => G.texto(c, 'PLANEJAR A FUGA', 100, 100, { size: 24 }));
    d1 = desenho((c) => G.detento(c, 50, 50, 20, '#ff4d5e', { comemorando: true }));
    d2 = desenho((c) => G.detento(c, 50, 50, 20, '#ff4d5e', { comemorando: true }));
    desenho((c) => { G.parede(c); G.linha(c, 0, 0, 10, 10); G.retangulo(c, 0, 0, 20, 20); G.circulo(c, 5, 5, 10, 6); G.selecao(c, 'X', 10, 10, 20, 0.1); G.bilhete(c, 0, 0, 50, 30); G.titulo(c, 'T', 10, 10, 30); G.linhas(c, 'a\nb', 0, 0); G.detento(c, 0, 0, 10, '#3fa9ff', { caido: true }); });
  } catch (e) { erro = e.message; } finally { Math.random = rnd; }
  ok(!erro, 'giz desenha sem Math.random (igual no host e nos clientes)' + (erro ? ` (${erro})` : ''));
  ok(!!a && a === b, 'giz: o mesmo texto desenhado duas vezes sai igual (não ferve)');
  ok(!!d1 && d1 === d2, 'giz: o mesmo detento desenhado duas vezes sai igual');
  ok(a !== desenho((c) => G.texto(c, 'PLANEJAR A FUGB', 100, 100, { size: 24 })), 'giz: textos diferentes têm tremor diferente');
  ok(desenho((c) => G.selecao(c, 'CONTINUAR', 100, 100, 24, 0.05)) !== desenho((c) => G.selecao(c, 'CONTINUAR', 100, 100, 24, 1)), 'giz: a seleção se desenha com o tempo');
  const fino = gravador(); G.texto(fino, 'rodapé', 10, 10, { size: 12 });
  ok(fino.log.filter((e) => e[0] === 'fillText').length === 1 && !fino.log.some((e) => e[0] === 'fillRect'), 'giz: texto pequeno sai com uma passada e sem grão (legível)');
}

// --- 3. atalho ?cena=: abre cada tela de menu com uma sessão de mentira ---
function secaoCenas() {
  if (!TN.cenaDeTeste) { ok(false, 'TN.cenaDeTeste existe'); return; }
  for (const nome of TN.CENAS_DE_TESTE) {
    let erro = '';
    try { const cena = TN.cenaDeTeste(nome); if (!cena || TN.scene !== cena) throw new Error('não abriu'); cena.draw(gravador()); } catch (e) { erro = e.message; }
    ok(!erro, `?cena=${nome} abre e desenha` + (erro ? ` (${erro})` : ''));
  }
  ok(TN.CENAS_DE_TESTE.length === 14, 'as 14 telas de menu da spec têm atalho');
}
```

E abaixo de `secaoDono();`: `secaoGiz();` e `secaoCenas();`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_menus.js`
Expected: ele para no carregamento com `ENOENT ... engine/giz.js`. Isso é esperado: o arquivo ainda não existe.

- [ ] **Step 3: Escrever `engine/giz.js`**

```js
// GIZ: kit de desenho dos menus no tema "mapa de fuga a giz" (a parede da cela vira lousa).
// Tudo é determinístico: o tremor e o grão vêm de uma semente do próprio texto ou das coordenadas,
// nunca de Math.random(). Assim o giz não "ferve" e o host e os clientes de rede desenham igual.
// Só a seleção anima, pelo tempo da cena. Spec: docs/superpowers/specs/2026-10-15-menus-fuga-design.md
(function () {
  const U = TN.util;
  const FONTE = '"Chalkboard SE", "Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
  const CORES = {
    giz: '#e8e4d8', destaque: '#f2d65a', perigo: '#e0574a', lapis: '#2b2a26', parede: '#1d2321',
    apagado: 'rgba(232,228,216,0.16)', apagadoForte: 'rgba(232,228,216,0.55)',
  };
  // semente FNV-1a + gerador mulberry32 (o mesmo texto dá sempre o mesmo tremor)
  function semente(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const alfa = (c) => (typeof c.globalAlpha === 'number' ? c.globalAlpha : 1);   // respeita um globalAlpha de fora
  const fonte = (size) => `bold ${size}px ${FONTE}`;
  function largura(c, str, size) { c.font = fonte(size); return c.measureText(String(str)).width; }
  // cor do jogador como giz colorido: um pouco puxada para o branco do giz
  function desbotar(cor, k = 0.22) {
    const m = /^#?([0-9a-f]{6})$/i.exec(cor || '');
    if (!m) return cor;
    const n = parseInt(m[1], 16), mix = (v, w) => Math.round(v + (w - v) * k);
    return `rgb(${mix(n >> 16, 232)},${mix((n >> 8) & 255, 228)},${mix(n & 255, 216)})`;
  }

  // letra à mão: 3 passadas levemente deslocadas e um grão que apaga pedacinhos do traço.
  // Abaixo de 14 px (rodapés, rótulos) uma passada só e sem grão, para continuar legível.
  // papel: texto de lápis num bilhete (2 passadas fracas, sem grão).
  function texto(c, str, x, y, { size = 20, color = CORES.giz, align = 'left', baseline = 'middle', maxWidth, papel = false } = {}) {
    str = String(str);
    const r = rng(semente(str + '|' + size)), fino = size < 14, a0 = alfa(c);
    const passadas = fino ? 1 : papel ? 2 : 3, amp = fino ? 0 : papel ? 0.4 : Math.max(0.6, size * 0.035);
    c.save();
    c.font = fonte(size); c.textAlign = align; c.textBaseline = baseline; c.fillStyle = color;
    for (let i = 0; i < passadas; i++) {
      c.globalAlpha = a0 * (i === 0 ? 0.95 : 0.35);
      c.fillText(str, x + (r() - 0.5) * amp * 2, y + (r() - 0.5) * amp * 2, maxWidth);
    }
    if (!fino && !papel) {
      const w = Math.min(c.measureText(str).width, maxWidth || Infinity), x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      c.globalAlpha = a0 * 0.6; c.fillStyle = CORES.parede;
      for (let i = 0, n = Math.round((w * size) / 60); i < n; i++) c.fillRect(x0 + r() * w, y - size / 2 + r() * size, 1 + r() * 0.8, 1 + r() * 0.8);
    }
    c.restore();
  }
  function linhas(c, str, x, y, opts = {}) {
    const size = opts.size || 20, lh = opts.lineHeight || size * 1.35;
    String(str).split('\n').forEach((ln, i) => texto(c, ln, x, y + i * lh, opts));
  }
  // traço de giz: curva levemente torta, com uma segunda passada mais fraca
  function linha(c, x1, y1, x2, y2, { color = CORES.giz, lw = 2, alpha = 0.9 } = {}) {
    const r = rng(semente([x1, y1, x2, y2].map(Math.round).join(','))), a0 = alfa(c);
    c.save(); c.strokeStyle = color; c.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const j = () => (r() - 0.5) * lw * 1.6;
      c.globalAlpha = a0 * alpha * (i ? 0.45 : 1); c.lineWidth = lw * (i ? 0.7 : 1);
      c.beginPath(); c.moveTo(x1 + j(), y1 + j());
      c.quadraticCurveTo((x1 + x2) / 2 + j() * 2, (y1 + y2) / 2 + j() * 2, x2 + j(), y2 + j()); c.stroke();
    }
    c.restore();
  }
  function retangulo(c, x, y, w, h, { color, lw, alpha, fill } = {}) {
    if (fill) { c.save(); c.fillStyle = fill; c.fillRect(x, y, w, h); c.restore(); }
    const o = { color, lw, alpha };
    linha(c, x, y, x + w, y, o); linha(c, x + w, y, x + w, y + h, o); linha(c, x + w, y + h, x, y + h, o); linha(c, x, y + h, x, y, o);
  }
  // elipse à mão que passa um pouco do ponto de partida; progresso 0..1 desenha só parte dela
  function circulo(c, x, y, rx, ry, { color = CORES.destaque, lw = 2.5, progresso = 1, alpha = 0.95 } = {}) {
    const r = rng(semente(`${Math.round(x)},${Math.round(y)},${Math.round(rx)},${Math.round(ry)}`));
    const a0 = -2.2 + r() * 0.6, total = (Math.PI * 2 + 0.35) * U.clamp(progresso, 0, 1), fase = r() * 6, onda = (r() - 0.5) * 0.08;
    if (total <= 0) return;
    c.save(); c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.globalAlpha = alfa(c) * alpha;
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = a0 + (total * i) / 40, k = 1 + onda * Math.sin(a * 3 + fase) + 0.04 * (i / 40);
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke(); c.restore();
  }
  // seleção: circula o texto `str` (desenhado em x, y com esse alinhamento) em ~0,25 s, mais uma setinha
  function selecao(c, str, x, y, size, t, align = 'center') {
    const w = largura(c, str, size), cx = align === 'center' ? x : align === 'right' ? x - w / 2 : x + w / 2;
    circulo(c, cx, y, w / 2 + 16, size * 0.5 + 9, { progresso: t / 0.25 });
    texto(c, '→', cx - w / 2 - 30, y, { size, color: CORES.destaque, align: 'center' });
  }
  function titulo(c, str, x, y, size = 36, color = CORES.giz) {
    texto(c, str, x, y, { size, color, align: 'center' });
    const w = largura(c, str, size), yy = y + size * 0.62;
    linha(c, x - w / 2, yy, x + w / 2, yy, { color, lw: 2.5 });
    linha(c, x - w / 2 + 12, yy + 6, x + w / 2 - 20, yy + 6, { color, lw: 1.5, alpha: 0.6 });
  }
  // bilhete de papel preso com fita (o texto em cima usa { papel: true, color: CORES.lapis })
  function bilhete(c, x, y, w, h, { rot = 0, fita = true } = {}) {
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rot);
    c.fillStyle = '#d9cfb4'; c.fillRect(-w / 2, -h / 2, w, h);
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.fillRect(-w / 2, h / 2 - 6, w, 6);
    if (fita) { c.fillStyle = 'rgba(235,230,200,0.55)'; c.fillRect(-22, -h / 2 - 8, 44, 16); }
    c.restore();
  }
  // detento de giz: cabeça, uniforme listrado na cor do jogador, braços e pernas
  function detento(c, x, y, tam, cor, { caido = false, comemorando = false, dir = 0 } = {}) {
    const k = desbotar(cor), o = { color: k, lw: Math.max(1.5, tam * 0.12) };
    const h = tam * 1.3, cab = tam * 0.32, ombro = -h + cab * 2 + 2, quadril = h * 0.35, lt = tam * 0.42, by = ombro + 3;
    c.save(); c.translate(x, y);
    if (caido) c.rotate(Math.PI / 2);
    circulo(c, 0, -h + cab, cab, cab, { color: k, lw: o.lw, alpha: 0.9 });
    retangulo(c, -lt, ombro, lt * 2, quadril - ombro, o);
    for (let yy = ombro + 5; yy < quadril - 2; yy += Math.max(4, tam * 0.22)) linha(c, -lt + 2, yy, lt - 2, yy, { ...o, lw: o.lw * 0.6, alpha: 0.6 });
    if (comemorando) { linha(c, -lt, by, -lt - tam * 0.5, by - tam * 0.9, o); linha(c, lt, by, lt + tam * 0.5, by - tam * 0.9, o); }
    else { linha(c, -lt, by, -lt - tam * 0.3, by + tam * 0.8, o); linha(c, lt, by, lt + tam * 0.3, by + tam * 0.8, o); }
    linha(c, -lt * 0.5, quadril, -lt * 0.7, h, o); linha(c, lt * 0.5, quadril, lt * 0.7, h, o);
    const ox = Math.cos(dir) * cab * 0.35;   // os olhos olham para o lado de dir
    c.fillStyle = k; c.fillRect(ox - cab * 0.35, -h + cab - 1, 2, 2); c.fillRect(ox + cab * 0.25, -h + cab - 1, 2, 2);
    c.restore();
  }

  // ---- a lousa: concreto escuro, giz apagado, planta da prisão e contagem de dias (gerada uma vez) ----
  function planta(g) {
    const o = { color: CORES.apagado, lw: 2 };
    retangulo(g, 30, 30, TN.W - 60, TN.H - 60, o);                                    // muro
    for (let i = 0; i < 5; i++) retangulo(g, 60 + i * 70, 60, 70, 90, o);            // celas
    linha(g, 60, 190, 410, 190, o);                                                   // corredor
    retangulo(g, 600, 300, 300, 180, o);                                              // pátio
    texto(g, 'PÁTIO', 750, 390, { size: 22, color: CORES.apagado, align: 'center' });
    texto(g, 'X', 340, 105, { size: 26, color: 'rgba(224,87,74,0.35)', align: 'center' });   // a nossa cela
    for (let k = 0; k < 12; k++) linha(g, 350 + k * 44, 160 + k * 28, 372 + k * 44, 174 + k * 28, o);   // o túnel
    linha(g, 880, 500, 858, 500, o); linha(g, 880, 500, 872, 482, o);
    for (let k = 0; k < 4; k++) {                                                     // contagem de dias
      for (let i = 0; i < 4; i++) linha(g, 806 + k * 32 + i * 5, 44, 804 + k * 32 + i * 5, 70, o);
      linha(g, 801 + k * 32, 64, 828 + k * 32, 50, o);
    }
  }
  let fundo = null;
  function gerarFundo() {
    const cv = document.createElement('canvas'); cv.width = TN.W; cv.height = TN.H;
    const g = cv.getContext('2d'), r = rng(171);
    g.fillStyle = CORES.parede; g.fillRect(0, 0, TN.W, TN.H);
    for (let i = 0; i < 26; i++) {                                                    // manchas de giz apagado
      const x = r() * TN.W, y = r() * TN.H, rr = 40 + r() * 140, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(220,215,200,${(0.03 + r() * 0.05).toFixed(3)})`); gr.addColorStop(1, 'rgba(220,215,200,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.035)'; g.fillRect(r() * TN.W, r() * TN.H, 1 + r() * 1.5, 1 + r() * 1.5); }
    planta(g);
    return cv;
  }
  function parede(c) {
    if (!fundo && typeof document !== 'undefined' && document.createElement) fundo = gerarFundo();
    if (fundo) c.drawImage(fundo, 0, 0); else { c.fillStyle = CORES.parede; c.fillRect(0, 0, TN.W, TN.H); }
    const v = c.createRadialGradient(TN.W / 2, TN.H / 2, TN.H * 0.4, TN.W / 2, TN.H / 2, TN.W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = v; c.fillRect(0, 0, TN.W, TN.H);
  }

  TN.giz = { CORES, FONTE, texto, linhas, titulo, linha, retangulo, circulo, selecao, bilhete, detento, parede, desbotar };
})();
```

- [ ] **Step 4: Carregar o `giz.js`**

- `index.html`: depois de `<script src="engine/draw.js"></script>`, acrescentar `<script src="engine/giz.js"></script>`.
- `tools/simular.js:45` e `tools/teste_rede.js:19`: na lista de arquivos, acrescentar `'engine/giz.js'` logo depois de `'engine/draw.js'`.

- [ ] **Step 5: `TN.cenaDeTeste` e `?cena=` em `engine/session.js`**

Logo antes de `TN.bootScene = function () {`:

```js
  // ?cena=<Nome>: abre uma tela de menu direto, com uma sessão de mentira (4 detentos, 6 etapas, placar
  // inventado). Só para testes e screenshots (tools/menus.sh, tools/teste_menus.js); não muda o fluxo normal.
  const CENAS_DE_TESTE = ['Title', 'Controls', 'TestList', 'Lobby', 'Setup', 'Picker', 'Brief', 'Pause', 'RoundOver', 'ScoreScreen', 'Final', 'HostCreate', 'JoinList', 'NetMessage'];
  function cenaDeTeste(nome) {
    const roster = buildRoster([{ device: 'kb1' }, null, null, null], true);
    const ids = TN.minigameOrder.slice(0, 6);
    newSession(roster, ids.map((id) => ({ id, rounds: 3 })));
    const s = TN.session;
    s.index = Math.min(2, ids.length - 1);
    s.totals = { 0: 34, 1: 51, 2: 12, 3: 27 };
    s.gameScores = { 0: 8, 1: 5, 2: 0, 3: 3 };
    const N = TN.NetScenes;
    const abrir = (cena) => { TN.go(cena); return cena; };
    const semEnter = (cena) => { TN.scene = cena; cena.t = 0; return cena; };   // telas de rede: sem falar com o servidor
    switch (nome) {
      case 'Title': TN.session = null; return abrir(Title);
      case 'Controls': TN.session = null; return abrir(Controls);
      case 'TestList': TN.session = null; return abrir(new TestList());
      case 'Lobby': { TN.session = null; const l = abrir(new Lobby({})); l.slots[0] = { device: 'kb1', ready: false }; l.slots[1] = { device: 'kb2', ready: true }; return l; }
      case 'Setup': return abrir(new Setup(roster));
      case 'Picker': return abrir(new Picker());
      case 'Brief': return abrir(new Brief());
      case 'Pause': { const b = abrir(new Brief()); return abrir(new Pause(b)); }
      case 'RoundOver': return abrir(new RoundOver(new TN.Round(TN.minigames[ids[s.index]], roster, 1, 3)));
      case 'ScoreScreen': return abrir(new ScoreScreen());
      case 'Final': return abrir(new Final());
      case 'HostCreate': { const h = semEnter(new N.HostCreate()); h.msg = 'ERRO'; return h; }
      case 'JoinList': { TN.net.rooms = [{ room: 'ABCD', players: 2 }, { room: 'KXT9', players: 1 }]; TN.net.status = ''; return semEnter(new N.JoinList()); }
      case 'NetMessage': return abrir(new N.NetMessage('A SALA FECHOU', 'O host saiu da partida.\nVolte e entre em outra sala.'));
    }
    return null;
  }
  TN.cenaDeTeste = cenaDeTeste;
  TN.CENAS_DE_TESTE = CENAS_DE_TESTE;
```

Em `TN.bootScene`, como primeira linha do corpo:

```js
    const cena = params.get('cena');
    if (cena) { if (!cenaDeTeste(cena)) TN.go(Title); return; }
```

- [ ] **Step 6: `engine/main.js`: com `?cena=` a tela fica parada**

Logo depois de `TN.force2d = ...`:

```js
  const CONGELAR = params.has('cena');                // ?cena=<Nome>: só desenha (a tela fica parada para o screenshot)
```

No `frame()`, trocar `while (acc >= STEP && steps < 8 * SPEED) {` por `while (!CONGELAR && acc >= STEP && steps < 8 * SPEED) {`. O avanço de `?t=` no boot continua rodando, e é ele que posiciona a tela.

- [ ] **Step 7: Escrever `tools/menus.sh`**

```bash
#!/usr/bin/env bash
# Screenshot de todas as telas de menu (atalho ?cena=), para revisar o visual de giz.
# Uso: bash tools/menus.sh [pasta]    (padrão: screenshots/menus). Precisa do servidor: node tools/servidor.js 8765
cd "$(dirname "$0")/.."
source tools/_chrome.sh
DIR="${1:-screenshots/menus}"; mkdir -p "$DIR"
# nome:segundos de avanço (a roleta precisa girar um pouco; o placar precisa encher as barras)
for PAR in Title:1 Controls:1 TestList:1 Lobby:1 Setup:1 Picker:2 Brief:1 Pause:1 RoundOver:1 ScoreScreen:3 Final:2 HostCreate:0 JoinList:0 NetMessage:1; do
  NOME="${PAR%%:*}"; T="${PAR##*:}"
  OUT="$DIR/$NOME.png"; OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$(pwd)/$OUT")"
  $TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --window-size=1280,720 --virtual-time-budget=3000 \
    --screenshot="$OUTW" "http://127.0.0.1:${PORT:-8765}/index.html?cena=$NOME&t=$T" 2>/dev/null
  echo "ok $NOME"
done
echo "salvo em $DIR/"
```

- [ ] **Step 8: Rodar e ver passar**

Run: `node tools/teste_menus.js`
Expected: seções 1 a 3 com `✓` (inclusive as 14 linhas `?cena=<Nome> abre e desenha`) e `Tudo certo.`

Run: `node tools/simular.js --sessao 2>&1 | tail -2`
Expected: `Tudo certo.`

Run (servidor rodando): `bash tools/menus.sh && ls screenshots/menus | wc -l`
Expected: `ok` para os 14 nomes e `14`. As telas ainda estão no visual antigo; isso muda nas Tasks 3 e 4.

- [ ] **Step 9: Commit**

```bash
git add engine/giz.js engine/session.js engine/main.js index.html tools/simular.js tools/teste_rede.js tools/teste_menus.js tools/menus.sh
git commit -m "Menus: kit de giz (TN.giz), atalho ?cena= e screenshots dos menus"
```

---

### Task 3: Telas antes da partida e telas de rede no giz

**Files:**
- Modify: `engine/session.js` (helpers no topo; `draw`/`update` de Title, Controls, TestList e Lobby)
- Modify: `engine/net.js` (`draw` de NetMessage, HostCreate e JoinList)
- Test: `tools/teste_menus.js` (seção 4)

**Interfaces:**
- Consumes: `TN.giz` (Task 2), `donoDoMenu` (Task 1), `gravador()` (Task 2, no teste).
- Produces, em `session.js` (locais ao IIFE, também usados na Task 4):
  - `navegar(cena, m, n)`: move `cena.sel` com cima/baixo, toca o blip e marca `cena.selAt = cena.t`;
  - `menuGiz(c, itens, sel, x, y, selT, { size = 24, gap = 42 })`;
  - `rodape(c, texto)`;
  - `const G = TN.giz`.

- [ ] **Step 1: Escrever o teste (seção 4)**

Em `tools/teste_menus.js`, abaixo da seção 3:

```js
// textos que uma tela desenha (fillText), para conferir o vocabulário novo
const textos = (cena) => { const c = gravador(); cena.draw(c); return c.log.filter((e) => e[0] === 'fillText').map((e) => e[1]).join(' | '); };
// nenhuma das telas desenha com o visual antigo (robô, painel e CRT do TN.draw)
function semVisualAntigo(cenas) {
  const D = TN.draw, orig = { robot: D.robot, panel: D.panel, crt: D.crt };
  let n = 0;
  D.robot = D.panel = D.crt = () => { n++; };
  try { for (const cena of cenas) cena.draw(gravador()); } finally { Object.assign(D, orig); }
  return n === 0;
}

// --- 4. telas antes da partida e de rede: giz e textos de fuga ---
function secaoTelasSemSessao() {
  const title = TN.cenaDeTeste('Title'), t = textos(title);
  ok(['PLANEJAR A FUGA', 'CHAMAR COMPARSAS (REDE LOCAL)', 'ENTRAR NO PLANO (REDE LOCAL)', 'ENSAIAR UMA ETAPA', 'CONTROLES'].every((x) => t.includes(x)), 'título: itens no tema de fuga');
  ok(t.includes('1 a 4 detentos · uma noite para cavar a saída') && !t.includes('unidades de teste'), 'título: subtítulo novo, sem "unidades de teste"');
  const lobby = TN.cenaDeTeste('Lobby'), l = textos(lobby);
  ok(['ESCOLHA SUA CELA', 'PRONTO PRA FUGIR!', 'na cela…', 'Celas vazias com bots'].every((x) => l.includes(x)), 'lobby: celas no tema');
  ok(textos(TN.cenaDeTeste('TestList')).includes('ENSAIAR UMA ETAPA'), 'ensaiar uma etapa: título novo');
  ok(textos(TN.cenaDeTeste('Controls')).includes('quem manda é o P1'), 'controles: avisa que só o P1 mexe no menu');
  const j = textos(TN.cenaDeTeste('JoinList'));
  ok(j.includes('ENTRAR NO PLANO (REDE LOCAL)') && j.includes('SALA ABCD'), 'rede: entrar no plano, com o código da sala');
  ok(textos(TN.cenaDeTeste('NetMessage')).includes('A SALA FECHOU'), 'rede: mensagem desenhada');
  const cenas = ['Title', 'Controls', 'TestList', 'Lobby', 'HostCreate', 'JoinList', 'NetMessage'].map((n) => TN.cenaDeTeste(n));
  ok(semVisualAntigo(cenas), 'telas antes da partida e de rede: só giz (sem robô, painel ou CRT)');
}
```

E abaixo de `secaoCenas();`: `secaoTelasSemSessao();`

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_menus.js`
Expected: `✗ título: itens no tema de fuga`, `✗ lobby: celas no tema` e os demais da seção 4, terminando com `N falha(s).`

- [ ] **Step 3: Helpers no topo de `engine/session.js`**

Logo depois de `const U = TN.util, D = TN.draw;`:

```js
  const G = TN.giz;
```

Logo depois da função `menuList(...)`, que fica por enquanto (a Task 4 a remove):

```js
  // ---- menus de giz ----
  // move a seleção com cima/baixo; selAt marca quando ela mudou (o círculo de giz se redesenha)
  function navegar(cena, m, n) {
    if (!n) return;
    const antes = cena.sel;
    if (m.up) cena.sel = (cena.sel + n - 1) % n;
    if (m.down) cena.sel = (cena.sel + 1) % n;
    if (cena.sel !== antes) { cena.selAt = cena.t; TN.audio.play('blip'); }
  }
  function menuGiz(c, itens, sel, x, y, selT, { size = 24, gap = 42 } = {}) {
    itens.forEach((it, i) => {
      const on = i === sel;
      G.texto(c, it, x, y + i * gap, { size, color: on ? G.CORES.destaque : G.CORES.giz, align: 'center' });
      if (on) G.selecao(c, it, x, y + i * gap, size, selT);
    });
  }
  function rodape(c, texto) { G.texto(c, texto, TN.W / 2, TN.H - 18, { size: 14, color: G.CORES.apagadoForte, align: 'center', maxWidth: TN.W - 40 }); }
```

- [ ] **Step 4: Título**

Em `Title`:
- `items()` passa a devolver:

```js
      return [hosting ? `PLANEJAR A FUGA (SALA ${TN.net.room} ABERTA)` : 'PLANEJAR A FUGA',
        hosting ? `FECHAR SALA ${TN.net.room}` : 'CHAMAR COMPARSAS (REDE LOCAL)',
        'ENTRAR NO PLANO (REDE LOCAL)',
        'ENSAIAR UMA ETAPA', 'CONTROLES', 'SOM: ' + (TN.audio.muted ? 'DESLIGADO' : 'LIGADO')];
```

- em `update`, trocar as duas linhas `if (m.up) { this.sel = ...` e `if (m.down) { this.sel = ...` por `navegar(this, m, n);`;
- `enter()` passa a zerar a seleção animada: acrescentar `this.selAt = 0;` no começo;
- o `draw(c)` passa a ser:

```js
    draw(c) {
      G.parede(c);
      for (const b of this.bots) G.detento(c, b.x, b.y, 16, b.c, { dir: Math.atan2(b.vy, b.vx) });
      G.titulo(c, 'TURNO DA NOITE', TN.W / 2, 78, 60);
      G.texto(c, '1 a 4 detentos · uma noite para cavar a saída', TN.W / 2, 132, { size: 17, color: G.CORES.apagadoForte, align: 'center' });
      menuGiz(c, this.items(), this.sel, TN.W / 2, 185, this.t - (this.selAt || 0), { size: 22, gap: 40 });
      rodape(c, 'WASD/Setas para navegar · ESPAÇO/CLIQUE para confirmar · ESC para voltar');
    },
```

- [ ] **Step 5: Controles**

O `draw(c)` de `Controls` passa a ser:

```js
    draw(c) {
      G.parede(c);
      G.titulo(c, 'CONTROLES', TN.W / 2, 56, 40);
      TN.input.KB_SCHEMES.forEach((s, i) => {
        const y = 110 + i * 78;
        G.bilhete(c, 130, y, 700, 62, { rot: i % 2 ? 0.006 : -0.008 });
        G.detento(c, 168, y + 31, 11, TN.PLAYER_COLORS[i]);
        G.texto(c, `TECLADO ${i + 1}`, 200, y + 20, { size: 19, color: G.CORES.lapis, papel: true });
        G.texto(c, s.label, 200, y + 44, { size: 14, color: G.CORES.lapis, papel: true, maxWidth: 610 });
      });
      G.linhas(c, 'Controles (gamepads) também funcionam: analógico/d-pad, A = Ação, B = Extra.\nNo lobby, cada detento escolhe a cela apertando AÇÃO no seu teclado/controle.\nESC pausa o jogo. Celas vazias são ocupadas por BOTS. Nos menus, quem manda é o P1.', TN.W / 2, 380, { size: 15, align: 'center' });
      rodape(c, 'Aperte AÇÃO ou ESC para voltar');
    },
```

- [ ] **Step 6: Ensaiar uma etapa**

Em `TestList`:
- `update`: trocar as linhas `if (m.up) ...` e `if (m.down) ...` por `navegar(this, m, ids.length);`;
- o `draw(c)` passa a ser:

```js
    draw(c) {
      G.parede(c);
      G.titulo(c, 'ENSAIAR UMA ETAPA', TN.W / 2, 45, 34);
      const ids = TN.minigameOrder, selT = this.t - (this.selAt || 0);
      ids.slice(this.scroll, this.scroll + 13).forEach((id, k) => {
        const i = k + this.scroll, def = TN.minigames[id], on = i === this.sel, y = 100 + k * 30;
        G.texto(c, def.title, 110, y, { size: 20, color: on ? G.CORES.destaque : G.CORES.giz, maxWidth: 400 });
        if (on) G.selecao(c, def.title, 110, y, 20, selT, 'left');
        G.texto(c, def.inspiredBy ? 'inspirado em ' + def.inspiredBy : 'original', 540, y, { size: 13, color: G.CORES.apagadoForte });
      });
      if (!ids.length) G.texto(c, 'Nenhuma etapa registrada (veja minigames/manifest.js)', TN.W / 2, 250, { size: 18, color: G.CORES.perigo, align: 'center' });
      const def = TN.minigames[ids[this.sel]];
      if (def) G.texto(c, def.tagline || '', TN.W / 2, TN.H - 50, { size: 16, align: 'center', maxWidth: TN.W - 80 });
      rodape(c, 'AÇÃO para escolher · ESC volta pra cela');
    }
```

- [ ] **Step 7: Lobby**

O `draw(c)` de `Lobby` passa a ser:

```js
    draw(c) {
      G.parede(c);
      G.titulo(c, this.test ? 'ENSAIO: ' + TN.minigames[this.test].title : 'ESCOLHA SUA CELA', TN.W / 2, 46, 34);
      G.texto(c, 'Aperte AÇÃO no seu teclado/controle para entrar. AÇÃO de novo = PRONTO. EXTRA = sair.', TN.W / 2, 92, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
      for (let i = 0; i < 4; i++) {
        const x = 40 + i * 225, y = 125, s = this.slots[i], cor = TN.PLAYER_COLORS[i];
        G.retangulo(c, x, y, 205, 285, { color: s ? G.desbotar(cor) : G.CORES.apagadoForte, lw: s ? 2.5 : 1.5 });
        for (let gx = x + 18; gx < x + 205; gx += 24) G.linha(c, gx, y + 4, gx, y + 60, { color: G.CORES.apagadoForte, lw: 1.5 });   // grade
        G.texto(c, `CELA ${i + 1}`, x + 102, y + 82, { size: 22, color: G.desbotar(cor), align: 'center' });
        if (s) {
          G.detento(c, x + 102, y + 160, 26, cor, { comemorando: s.ready && Math.sin(this.t * 6 + i) > 0 });
          G.linhas(c, TN.input.deviceLabel(s.device).split(' · ').join('\n'), x + 102, y + 215, { size: 12, align: 'center', lineHeight: 15, maxWidth: 195 });
          G.texto(c, s.ready ? 'PRONTO PRA FUGIR!' : 'na cela…', x + 102, y + 266, { size: 17, color: s.ready ? G.CORES.destaque : G.CORES.giz, align: 'center', maxWidth: 195 });
        } else {
          if (TN.settings.bots) { c.save(); c.globalAlpha = 0.35; G.detento(c, x + 102, y + 160, 26, cor); c.restore(); }
          G.texto(c, TN.settings.bots ? 'BOT' : 'cela vazia', x + 102, y + 230, { size: 18, color: G.CORES.apagadoForte, align: 'center' });
        }
      }
      G.texto(c, `[T] Celas vazias com bots: ${TN.settings.bots ? 'SIM' : 'NÃO'}`, TN.W / 2, 437, { size: 16, align: 'center' });
      if (TN.net && TN.net.mode === 'host') {
        const n = Object.keys(TN.net.peers).length;
        G.bilhete(c, 60, 455, 840, 50, { rot: -0.004 });
        G.texto(c, `SALA ${TN.net.room} · ${n} computador(es) conectado(s)`, 80, 470, { size: 15, color: G.CORES.lapis, papel: true });
        G.texto(c, `Nos outros PCs abra ${TN.net.urls.slice(0, 2).join('  ou  ') || 'http://<seu-ip>:8765'} → ENTRAR NO PLANO`, 80, 491, { size: 13, color: G.CORES.lapis, papel: true, maxWidth: 800 });
      }
      rodape(c, 'Começa quando todos estiverem PRONTOS PRA FUGIR · ESC volta pra cela');
    }
```

- [ ] **Step 8: Telas de rede em `engine/net.js`**

- Logo depois de `function bg(c) { ... }`, acrescentar `const G = TN.giz;`.
- `NetMessage.draw`:

```js
    draw(c) {
      G.parede(c);
      G.titulo(c, this.title, TN.W / 2, 210, 30, G.CORES.perigo);
      G.linhas(c, this.sub, TN.W / 2, 275, { size: 16, align: 'center' });
      G.texto(c, 'Aperte AÇÃO para voltar', TN.W / 2, 400, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
    }
```

- `HostCreate.draw`:

```js
    draw(c) {
      G.parede(c);
      if (this.msg !== 'ERRO') { G.texto(c, this.msg, TN.W / 2, 250, { size: 26, color: G.CORES.destaque, align: 'center' }); return; }
      G.titulo(c, 'Não consegui falar com o servidor de rede.', TN.W / 2, 160, 24, G.CORES.perigo);
      G.bilhete(c, 150, 210, 660, 170, { rot: -0.005 });
      G.linhas(c, 'Para jogar em rede local, inicie o servidor neste computador:\n\n    node tools/servidor.js        (ou dê dois cliques em JOGAR_EM_REDE)\n\ne abra o jogo pelo endereço que ele mostrar (http://localhost:8765).', TN.W / 2, 240, { size: 15, color: G.CORES.lapis, papel: true, align: 'center' });
      G.texto(c, 'AÇÃO ou ESC para voltar', TN.W / 2, 420, { size: 14, color: G.CORES.apagadoForte, align: 'center' });
    }
```

- `JoinList.draw`:

```js
    draw(c) {
      G.parede(c);
      G.titulo(c, 'ENTRAR NO PLANO (REDE LOCAL)', TN.W / 2, 56, 30);
      if (this.err) {
        G.linhas(c, 'Não foi possível conectar ao servidor.\n\nAbra o jogo pelo endereço que o HOST mostrou\n(ex.: http://192.168.0.10:8765) e tente de novo.', TN.W / 2, 200, { size: 18, color: G.CORES.perigo, align: 'center' });
      } else {
        const rooms = net.rooms;
        if (!rooms) G.texto(c, 'Procurando salas…', TN.W / 2, 200, { size: 20, align: 'center' });
        else if (!rooms.length) G.linhas(c, 'Nenhuma sala aberta neste servidor.\nNo computador do host: menu → CHAMAR COMPARSAS.', TN.W / 2, 200, { size: 18, align: 'center' });
        else rooms.forEach((r, i) => {
          const on = i === this.sel, y = 158 + i * 70;
          G.retangulo(c, TN.W / 2 - 260, y - 28, 520, 56, { color: on ? G.CORES.destaque : G.CORES.apagadoForte, lw: on ? 2.5 : 1.5 });
          G.texto(c, `SALA ${r.room}`, TN.W / 2 - 240, y, { size: 24, color: on ? G.CORES.destaque : G.CORES.giz });
          G.texto(c, `${r.players} conectado(s)`, TN.W / 2 + 240, y, { size: 16, color: G.CORES.apagadoForte, align: 'right' });
        });
        if (net.status) G.texto(c, net.status, TN.W / 2, 450, { size: 16, color: G.CORES.perigo, align: 'center' });
      }
      G.texto(c, 'AÇÃO entra · ESC volta · depois de entrar, aperte AÇÃO no lobby para escolher a cela', TN.W / 2, TN.H - 20, { size: 13, color: G.CORES.apagadoForte, align: 'center' });
    }
```

- Se `bg` não for mais usada no arquivo depois disso, remova-a. O `ClientView` ainda usa `bg(c)` quando não há visão do host: troque essas duas chamadas por `G.parede(c)` e remova `bg`.

- [ ] **Step 9: Rodar e ver passar**

Run: `node tools/teste_menus.js`
Expected: seções 1 a 4 com `✓` e `Tudo certo.`

Run: `node tools/simular.js --sessao 2>&1 | tail -2`
Expected: `Tudo certo.`

Run (servidor rodando): `bash tools/menus.sh` e abra `screenshots/menus/Title.png`, `Lobby.png` e `JoinList.png`. Confira que:
- a lousa e o giz aparecem;
- a seleção do título está circulada em amarelo;
- nenhum texto vaza das celas.

- [ ] **Step 10: Commit**

```bash
git add engine/session.js engine/net.js tools/teste_menus.js
git commit -m "Menus: título, controles, ensaio, lobby e telas de rede no giz, com textos de fuga"
```

---

### Task 4: Telas da partida no giz (do plano ao apito)

**Files:**
- Modify: `engine/session.js` (`update`/`draw` de Setup, Picker, Brief, RoundIntro, Pause, RoundOver, ScoreScreen e Final; remove `background`, `footer` e `menuList`)
- Test: `tools/teste_menus.js` (seção 5)

**Interfaces:**
- Consumes: `G`, `navegar`, `menuGiz` e `rodape` (Task 3); `donoDoMenu` (Task 1); `textos` e `semVisualAntigo` (Task 3, no teste).

- [ ] **Step 1: Escrever o teste (seção 5)**

Em `tools/teste_menus.js`, abaixo da seção 4:

```js
// --- 5. telas da partida: giz e vocabulário do plano em etapas ---
function secaoTelasDaPartida() {
  const ts = textos(TN.cenaDeTeste('Setup'));
  ok(['MONTAR O PLANO', 'COMEÇAR A FUGA', 'ETAPAS DO PLANO', 'TENTATIVAS POR ETAPA', 'ETAPAS POSSÍVEIS', 'só o P1 mexe no menu'].every((x) => ts.includes(x)), 'montar o plano: textos novos');
  ok(textos(TN.cenaDeTeste('Picker')).includes('ETAPA 3 DE 6'), 'roleta: ETAPA 3 DE 6');
  const tb = textos(TN.cenaDeTeste('Brief'));
  ok(tb.includes('TÚNEL CAVADO') && tb.includes('51 m') && tb.includes('3 TENTATIVAS · ETAPA 3/6'), 'briefing: túnel cavado em metros');
  const tp = textos(TN.cenaDeTeste('Pause'));
  ok(['SILÊNCIO, GUARDA NA RONDA', 'CONTINUAR', 'PULAR ESTA ETAPA', 'DESISTIR DA FUGA', 'só o P1 mexe no menu'].every((x) => tp.includes(x)), 'pausa: textos novos e aviso de que só o P1 mexe');
  const tr = textos(TN.cenaDeTeste('RoundOver'));
  ok(tr.includes('FIM DA TENTATIVA') && /\+\d+ m/.test(tr), 'fim da tentativa: ganho em metros');
  const ri = new S.RoundIntro(2); TN.go(ri);
  ok(textos(ri).includes('TENTATIVA 2 / 3'), 'início da tentativa: TENTATIVA 2 / 3');
  const sc = TN.cenaDeTeste('ScoreScreen'); sc.t = 3;
  const tsc = textos(sc);
  ok(tsc.includes('QUANTO CADA UM CAVOU') && tsc.includes('Próxima: etapa 4/6'), 'placar: quanto cada um cavou');
  const tf = textos(TN.cenaDeTeste('Final'));
  ok(['O APITO TOCOU', 'SOLITÁRIA', 'RECAPTURADO', 'TENTAR DE NOVO', 'VOLTAR PRA CELA', 'só o P1 mexe no menu'].every((x) => tf.includes(x)) && /P\d (\(BOT\) )?FUGIU!/.test(tf), 'pódio: fugiu, recapturado e solitária');
  // com 2 detentos: só FUGIU e SOLITÁRIA
  TN.cenaDeTeste('Final');
  TN.session.roster = TN.session.roster.slice(0, 2);
  const f2 = new S.Final(); TN.go(f2); const t2 = textos(f2);
  ok(t2.includes('SOLITÁRIA') && !t2.includes('RECAPTURADO'), 'pódio com 2 detentos: só fugiu e solitária');
  ok(semVisualAntigo(['Setup', 'Picker', 'Brief', 'ScoreScreen', 'Final'].map((n) => TN.cenaDeTeste(n))), 'telas da partida: só giz (sem robô, painel ou CRT)');
}
```

E abaixo de `secaoTelasSemSessao();`: `secaoTelasDaPartida();`

O teste de RoundIntro usa a sessão da última `cenaDeTeste`, porque `TN.session` continua preenchida. Por isso ele vem depois do `RoundOver`, que deixou a sessão com 3 tentativas por etapa.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_menus.js`
Expected: os itens da seção 5 com `✗`, terminando com `N falha(s).`

- [ ] **Step 3: Montar o plano (Setup)**

Em `Setup.update`, trocar as linhas `if (m.up) ...` e `if (m.down) ...` por `navegar(this, m, rows);`. O `draw(c)` passa a ser:

```js
    draw(c) {
      G.parede(c);
      const S = TN.settings, ids = TN.minigameOrder, selT = this.t - (this.selAt || 0);
      G.titulo(c, 'MONTAR O PLANO', TN.W / 2, 40, 32);
      const rows0 = ['▶▶ COMEÇAR A FUGA', `ETAPAS DO PLANO: ◀ ${S.gameCount} ▶  (de ${this.enabledIds().length} ativas)`, `TENTATIVAS POR ETAPA: ◀ ${ROUND_MODES[S.roundsMode]} ▶`];
      rows0.forEach((r, i) => {
        G.texto(c, r, 80, 95 + i * 32, { size: 20, color: this.sel === i ? G.CORES.destaque : G.CORES.giz, maxWidth: 520 });
        if (this.sel === i) G.selecao(c, r, 80, 95 + i * 32, 20, selT, 'left');
      });
      G.texto(c, 'ETAPAS POSSÍVEIS (AÇÃO liga/desliga):', 80, 200, { size: 15, color: G.CORES.apagadoForte });
      ids.slice(this.scroll, this.scroll + 10).forEach((id, k) => {
        const i = k + this.scroll, on = this.sel === i + 3, def = TN.minigames[id], y = 228 + k * 27;
        const txt = `${S.disabled[id] ? '[ ]' : '[x]'} ${def.title}`;
        G.texto(c, txt, 100, y, { size: 17, color: on ? G.CORES.destaque : S.disabled[id] ? G.CORES.apagadoForte : G.CORES.giz, maxWidth: 360 });
        if (on) G.selecao(c, txt, 100, y, 17, selT, 'left');
        G.texto(c, `${def.rounds} tent.`, 480, y, { size: 13, color: G.CORES.apagadoForte });
      });
      G.texto(c, 'Detentos:', 640, 95, { size: 16, color: G.CORES.apagadoForte });
      this.roster.forEach((p, i) => {
        G.detento(c, 660, 140 + i * 56, 13, p.color);
        G.texto(c, `P${p.id + 1} ${p.isBot ? '(BOT)' : TN.input.deviceLabel(p.device).split(' · ')[0]}`, 690, 140 + i * 56, { size: 15, color: G.desbotar(p.color), maxWidth: 250 });
      });
      rodape(c, 'As etapas sorteadas são embaralhadas · só o P1 mexe no menu · ESC volta ao lobby');
    }
```

- [ ] **Step 4: Roleta (Picker)**

O `draw(c)` de `Picker` passa a ser:

```js
    draw(c) {
      G.parede(c);
      const s = TN.session;
      G.titulo(c, `ETAPA ${s.index + 1} DE ${s.playlist.length}`, TN.W / 2, 50, 30);
      const n = this.cards.length, cols = Math.min(4, n), rows = Math.ceil(n / cols), hi = this.cur % n;
      this.cards.forEach((id, i) => {
        const def = TN.minigames[id];
        const cx = TN.W / 2 + ((i % cols) - (cols - 1) / 2) * 215, cy = 160 + Math.floor(i / cols) * 170 + (rows === 1 ? 70 : 0);
        G.bilhete(c, cx - 95, cy - 65, 190, 130, { rot: (((i * 7) % 5) - 2) * 0.012 });
        G.texto(c, def.icon || '■', cx, cy - 22, { size: 40, color: def.color, align: 'center', papel: true });
        G.texto(c, def.title, cx, cy + 35, { size: 15, color: G.CORES.lapis, align: 'center', maxWidth: 175, papel: true });
        if (i === hi) G.circulo(c, cx, cy, 118, 82, { color: G.CORES.destaque, lw: 3 });
      });
    }
```

- [ ] **Step 5: Briefing (Brief)**

O `draw(c)` de `Brief` passa a ser:

```js
    draw(c) {
      const s = TN.session, def = this.def, entry = s.playlist[s.index], L = G.CORES.lapis;
      G.parede(c);
      G.bilhete(c, 30, 24, 600, 492, { rot: -0.004 });
      G.texto(c, def.title, 55, 62, { size: 34, color: L, maxWidth: 550, papel: true });
      G.linha(c, 55, 86, 585, 86, { color: def.color, lw: 3 });
      G.texto(c, def.tagline || '', 55, 110, { size: 16, color: L, maxWidth: 550, papel: true });
      G.linhas(c, def.brief.map((b) => '> ' + b).join('\n'), 55, 155, { size: 18, color: L, lineHeight: 28, papel: true, maxWidth: 550 });
      const ctl = def.controls, lines = [];
      if (ctl.move) lines.push('MOVER: ' + ctl.move);
      if (ctl.a) lines.push('AÇÃO:  ' + ctl.a);
      if (ctl.b) lines.push('EXTRA: ' + ctl.b);
      G.texto(c, 'CONTROLES', 55, 360, { size: 16, color: L, papel: true });
      G.linhas(c, lines.join('\n'), 55, 390, { size: 17, color: L, lineHeight: 26, papel: true, maxWidth: 550 });
      G.texto(c, `${entry.rounds > 1 ? entry.rounds + ' TENTATIVAS' : '1 TENTATIVA'} · ETAPA ${s.index + 1}/${s.playlist.length}`, 55, 490, { size: 14, color: L, papel: true });
      // quanto cada um já cavou
      G.retangulo(c, 650, 24, 280, 492, { color: G.CORES.apagadoForte });
      G.texto(c, 'TÚNEL CAVADO', 790, 55, { size: 18, align: 'center' });
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]);
      sorted.forEach((p, i) => {
        const y = 110 + i * 85;
        G.detento(c, 690, y, 16, p.color);
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, 720, y - 10, { size: 16, color: G.desbotar(p.color) });
        G.texto(c, `${s.totals[p.id]} m`, 720, y + 14, { size: 18 });
        G.texto(c, this.ready[p.id] ? '✔' : '…', 905, y, { size: 24, color: this.ready[p.id] ? G.CORES.destaque : G.CORES.apagadoForte, align: 'right' });
      });
      rodape(c, 'Aperte AÇÃO quando estiver pronto');
    }
```

O texto `3 TENTATIVAS · ETAPA 2/6` leva `entry.rounds`. O código antigo testava `def.rounds && ...`; o teste espera `3 TENTATIVAS · ETAPA 3/6` com a sessão de mentira, que tem 3 tentativas.

- [ ] **Step 6: Início da tentativa (RoundIntro)**

No `draw(c)` de `RoundIntro`, as três chamadas `D.text(...)` dentro do `if (this.phase === 'intro') {...} else {...}` passam a ser:

```js
      if (this.phase === 'intro') {
        G.texto(c, this.total > 1 ? `TENTATIVA ${this.roundNo} / ${this.total}` : this.def.title, TN.W / 2, TN.H / 2 - 30, { size: 48, align: 'center' });
        G.texto(c, this.def.tagline || '', TN.W / 2, TN.H / 2 + 25, { size: 20, color: this.def.color, align: 'center', maxWidth: TN.W - 80 });
      } else {
        G.texto(c, String(this.count), TN.W / 2, TN.H / 2, { size: 120, align: 'center' });
      }
```

O resto da RoundIntro (fundo do jogo escurecido e lembrete "P1/P2" sobre cada boneco) não muda.

- [ ] **Step 7: Pausa**

Em `Pause`:
- `items()` passa a devolver `['CONTINUAR', 'PULAR ESTA ETAPA', 'DESISTIR DA FUGA'];`;
- em `update`, trocar `if (m.up) this.sel = (this.sel + 2) % 3;` e `if (m.down) this.sel = (this.sel + 1) % 3;` por `navegar(this, m, 3);`;
- o `draw(c)` passa a ser:

```js
    draw(c) {
      this.under.draw(c);
      c.fillStyle = 'rgba(29,35,33,0.9)'; c.fillRect(0, 110, TN.W, 320);
      G.linha(c, 0, 110, TN.W, 110, { color: G.CORES.apagadoForte }); G.linha(c, 0, 430, TN.W, 430, { color: G.CORES.apagadoForte });
      G.titulo(c, 'SILÊNCIO, GUARDA NA RONDA', TN.W / 2, 165, 36);
      menuGiz(c, this.items(), this.sel, TN.W / 2, 255, this.t - (this.selAt || 0), { size: 24, gap: 48 });
      G.texto(c, 'só o P1 mexe no menu', TN.W / 2, 410, { size: 13, color: G.CORES.apagadoForte, align: 'center' });
    }
```

- [ ] **Step 8: Fim da tentativa (RoundOver)**

O `draw(c)` de `RoundOver` passa a ser:

```js
    draw(c) {
      this.round.draw(c);
      c.fillStyle = 'rgba(29,35,33,0.82)'; c.fillRect(0, 0, TN.W, TN.H);
      G.titulo(c, 'FIM DA TENTATIVA', TN.W / 2, 110, 42);
      const ps = this.round.players.slice().sort((a, b) => this.pts[b.id] - this.pts[a.id]);
      ps.forEach((p, i) => {
        const y = 190 + i * 64;
        G.detento(c, TN.W / 2 - 150, y, 18, p.color, { caido: !p.alive });
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, TN.W / 2 - 115, y, { size: 22, color: G.desbotar(p.color) });
        G.texto(c, `+${this.pts[p.id]} m`, TN.W / 2 + 170, y, { size: 28, color: G.CORES.destaque, align: 'right' });
      });
    }
```

- [ ] **Step 9: Placar (ScoreScreen)**

O `draw(c)` de `ScoreScreen` passa a ser:

```js
    draw(c) {
      const s = TN.session;
      G.parede(c);
      G.titulo(c, 'QUANTO CADA UM CAVOU', TN.W / 2, 48, 36);
      const k = U.clamp((this.t - 0.6) / 1.4, 0, 1), CHAO = 175, FUNDO = 440, n = s.roster.length;
      G.linha(c, 60, CHAO, TN.W - 60, CHAO, { lw: 2.5 });   // chão da cela; os túneis descem dele
      s.roster.forEach((p, i) => {
        const x = TN.W / 2 + (i - (n - 1) / 2) * 200, val = this.before[p.id] + s.gameScores[p.id] * k;
        const L = Math.max(6, (FUNDO - CHAO - 30) * (val / this.max)), cor = G.desbotar(p.color);
        G.texto(c, `P${p.id + 1}${p.isBot ? ' BOT' : ''}`, x, CHAO - 82, { size: 16, color: cor, align: 'center' });
        G.detento(c, x, CHAO - 34, 18, p.color);
        G.linha(c, x - 16, CHAO, x - 16, CHAO + L, { color: cor }); G.linha(c, x + 16, CHAO, x + 16, CHAO + L, { color: cor });
        for (let yy = CHAO + 10; yy < CHAO + L - 4; yy += 14) G.linha(c, x - 14, yy, x + 14, yy + 8, { color: cor, lw: 1, alpha: 0.5 });
        G.texto(c, `${Math.round(val)} m`, x, CHAO + L + 22, { size: 22, align: 'center' });
        G.texto(c, `+${s.gameScores[p.id]}`, x, CHAO + L + 46, { size: 16, color: G.CORES.destaque, align: 'center' });
      });
      rodape(c, s.index + 1 < s.playlist.length ? `Próxima: etapa ${s.index + 2}/${s.playlist.length}` : 'Plano completo! Hora de sair.');
    }
```

- [ ] **Step 10: Pódio (Final)**

Em `Final.update`, trocar `if (m.up || m.down) this.sel = 1 - this.sel;` por `navegar(this, m, 2);`. O `draw(c)` passa a ser:

```js
    draw(c) {
      const s = TN.session;
      G.parede(c);
      const sorted = s.roster.slice().sort((a, b) => s.totals[b.id] - s.totals[a.id]), w = sorted[0];
      G.titulo(c, 'O APITO TOCOU', TN.W / 2, 50, 40);
      G.texto(c, `P${w.id + 1} ${w.isBot ? '(BOT) ' : ''}FUGIU!`, TN.W / 2, 100, { size: 26, color: G.desbotar(w.color), align: 'center' });
      // o muro: o 1º desenhado do lado de fora, os outros dentro; o último vai para a solitária
      const MX = 600, CHAO = 400;
      G.linha(c, 40, CHAO, TN.W - 40, CHAO, { lw: 2.5 });
      G.retangulo(c, MX - 18, 150, 36, CHAO - 150, { lw: 2.5 });
      for (let y = 176; y < CHAO; y += 26) G.linha(c, MX - 18, y, MX + 18, y, { lw: 1, alpha: 0.6 });   // tijolos
      for (let x = MX - 30; x < MX + 30; x += 10) G.linha(c, x, 146, x + 8, 136, { lw: 1 });             // arame farpado
      G.texto(c, '1º', 780, CHAO - 110, { size: 26, color: G.CORES.destaque, align: 'center' });
      G.detento(c, 780, CHAO - 40 + Math.sin(this.t * 4) * 6, 26, w.color, { comemorando: true });
      G.texto(c, `${s.totals[w.id]} m · FUGIU`, 780, CHAO + 24, { size: 18, color: G.CORES.destaque, align: 'center' });
      const dentro = sorted.slice(1);
      dentro.forEach((p, i) => {
        const x = 130 + i * 150, ultimo = i === dentro.length - 1;
        G.texto(c, `${i + 2}º`, x, CHAO - 100, { size: 22, align: 'center' });
        G.detento(c, x, CHAO - (ultimo ? 14 : 40), 22, p.color, { caido: ultimo });
        if (ultimo) { G.linha(c, x - 24, CHAO - 66, x + 24, CHAO - 14, { color: G.CORES.perigo, lw: 3 }); G.linha(c, x + 24, CHAO - 66, x - 24, CHAO - 14, { color: G.CORES.perigo, lw: 3 }); }
        G.texto(c, `${s.totals[p.id]} m · ${ultimo ? 'SOLITÁRIA' : 'RECAPTURADO'}`, x, CHAO + 24, { size: 15, color: ultimo ? G.CORES.perigo : G.CORES.giz, align: 'center' });
      });
      menuGiz(c, ['TENTAR DE NOVO', 'VOLTAR PRA CELA'], this.sel, TN.W / 2, 465, this.t - (this.selAt || 0), { size: 20, gap: 32 });
      rodape(c, 'só o P1 mexe no menu');
    }
```

- [ ] **Step 11: Remover o visual antigo que sobrou**

Em `engine/session.js`, apague as funções `background`, `footer` e `menuList`. Depois disso, `grep -n "background(\|footer(\|menuList(\|D.crt\|D.robot\|D.panel" engine/session.js` não pode mostrar nada. Se `D` ficar sem uso, mantenha a constante mesmo assim: o `RoundIntro` desenha o jogo por baixo, e outras cenas podem precisar dele.

- [ ] **Step 12: Rodar e ver passar**

Run: `node tools/teste_menus.js`
Expected: seções 1 a 5 com `✓` e `Tudo certo.`

Run: `node tools/simular.js --sessao 2>&1 | tail -2 && node tools/simular.js 2>&1 | tail -1`
Expected: `Tudo certo.` nos dois.

- [ ] **Step 13: Commit**

```bash
git add engine/session.js tools/teste_menus.js
git commit -m "Menus: do plano ao apito no giz (montar o plano, roleta, briefing, pausa, placar em túneis e pódio do muro)"
```

---

### Task 5: Revisão visual, rede e documentação

**Files:**
- Modify: `CLAUDE.md`, `docs/COMO_CRIAR_MINIGAME.md`
- Modify, só se a revisão pedir: `engine/giz.js` e `engine/session.js`, apenas coordenadas e tamanhos de desenho
- Test: os 6 testes e os screenshots

- [ ] **Step 1: Screenshots de todas as telas**

Run (servidor rodando: `node tools/servidor.js 8765` em background): `bash tools/menus.sh`
Expected: `ok` para as 14 telas e `salvo em screenshots/menus/`.

- [ ] **Step 2: Revisar cada PNG**

Abra os 14 PNGs. Para cada um, confira:
- a lousa e a planta aparecem fracas atrás, sem atrapalhar a leitura;
- nenhum texto vaza do bilhete, da cela ou do cartão (Review Focus 3);
- rodapés e rótulos de dispositivo (12 a 14 px) estão legíveis (Review Focus 5);
- a seleção está circulada em amarelo;
- os detentos de giz estão nas cores dos jogadores;
- o pódio mostra o 1º fora do muro e o último com X e SOLITÁRIA.

Ao ajustar alguma coisa, mexa só em coordenadas e tamanhos de desenho, rode `node tools/teste_menus.js` e tire de novo o screenshot daquela tela (`bash tools/menus.sh` refaz todas).

- [ ] **Step 3: Rede de ponta a ponta**

Run: `node tools/teste_rede.js`
Expected: `Rede OK.` O cliente entra no lobby e o host vê o movimento dele.

Confira também, à mão, que o cliente não navega no menu do host:
1. abra `http://localhost:8765/index.html?rede=host` numa aba e `http://localhost:8765/index.html?rede=entrar` em outra;
2. na aba do cliente, aperte AÇÃO (entra numa cela) e depois setas: o lobby do host não muda de tela;
3. no host, entre também e deixe os dois PRONTOS;
4. em "MONTAR O PLANO", as setas do cliente não movem a seleção, e as do host movem.

- [ ] **Step 4: Documentar**

Em `CLAUDE.md`:
- na Estrutura, depois da linha do `engine/cenarios.js`, acrescente: "- `engine/giz.js`: kit de giz dos menus (`TN.giz`: lousa, letra à mão, seleção, bilhete, detento de giz), determinístico. Menus abrem direto com `?cena=<Nome>` (screenshots: `bash tools/menus.sh`).";
- na Rede local, acrescente: "- Menus: só o host navega (`TN.donoDoMenu`): no mesmo computador, o P1; jogador remoto nunca. No lobby e no briefing cada um ainda age pela própria vaga.";
- na regra final, acrescente `node tools/teste_menus.js` à lista de testes depois de mexer no motor.

Em `docs/COMO_CRIAR_MINIGAME.md`, no fim da seção de regras, acrescente:

```markdown
- **Menus (fora do minigame):** são desenhados com `TN.giz` (`engine/giz.js`, tema "mapa de fuga a giz") e só o host navega neles (`TN.donoDoMenu(roster)`: o P1 no mesmo computador; jogador remoto nunca). Um minigame não precisa mexer nisso: o `title`, a `tagline` e o `brief` dele aparecem na roleta e no briefing como estão.
```

- [ ] **Step 5: Rodar tudo**

Run:
```bash
node tools/simular.js && node tools/simular.js --sessao 2>&1 | tail -1 && node tools/teste_cenarios.js && node tools/teste_detento.js && node tools/teste_menus.js && bash tools/teste_render.sh && node tools/teste_rede.js
```
Expected: `Tudo certo.` em cada um e `Rede OK.` no fim.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/COMO_CRIAR_MINIGAME.md engine/giz.js engine/session.js
git commit -m "Menus: revisão visual do giz e documentação (TN.giz, dono do menu, ?cena=)"
```
