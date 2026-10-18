# Mecânicas novas em 5 minigames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cinco mecânicas novas ou refeitas: laser alto com agachar (Pular Corda), guarda que anda e vira sem padrão (Bons Modos), corte simultâneo com eliminação do pior (Corte Exato), controle assistido e eliminação só do pior (Empilhadeira) e visão individual por painéis (Escultor), sem mexer no motor.

**Architecture:** O harness de rodada de `tools/teste_ajustes.js` sai para `tools/_harness.js` e passa a servir também um teste novo, `tools/teste_mecanicas.js`, com uma seção por jogo. Cada jogo muda só o próprio arquivo em `minigames/`; o estado novo fica em `g.data`/`p.data` como dado simples. O Corte Exato é reescrito por dentro (quadrantes 2D sobre o 3D de fundo), mantendo a avaliação do corte que já existe.

**Tech Stack:** JS puro, Canvas 2D para os painéis, Node para os testes, Chrome headless para screenshots.

**Spec:** `docs/superpowers/specs/2026-10-18-mecanicas-minigames-design.md`

## Global Constraints

- Só `minigames/<id>.js` e `tools/` mudam. Nada em `engine/`.
- Estado simples em `g.data`/`p.data` (a rede serializa). Nada de funções, classes ou referências a objetos do Three.
- Toda mecânica nova tem bot que a usa, e o jogo termina sozinho (`simular.js --parado`).
- Briefing e `controls` atualizados quando um botão ganha função.
- Valores da spec, exatos: Pular Corda laser alto em y≈34 entra aos ~12 s no lugar da 2ª corda baixa, agachar 0,45 s a 70 px/s com recarga 0,25 s; Bons Modos guarda a 60–140 px/s entre x 160 e 800, `TURN` 0,3 s, `LOOK` 0,7–2,5 s, taxa ~0,4/s, `MIN_WALK` 0,6, `MAX_WALK` 8, fintas 20% de 0,4 s a 40°; Corte Exato figura única por rodada, todos ao mesmo tempo, prévia 2 s + corte 8 s + resultado 2,2 s, morre o pior (empate geral: ninguém), figura seguinte diferente, prévia −0,3 s por rodada (mín. 1 s), `scoring: 'survival'`; Empilhadeira giro mínimo 0,35, `PEDAL_RATE`/`STEER_RATE` 8, `GRAB` 34, pegar/soltar automáticos com 0,6 s sem pegar depois de soltar e sem pegar caixas da própria zona, eliminação só do mínimo (empate geral: ninguém, turno novo); Escultor 4 painéis de ~420×220 com margens de ~20 px, fundo a ~85%.
- Textos em pt-BR no tom atual.
- Depois: `node tools/teste_mecanicas.js`, `node tools/teste_ajustes.js`, `node tools/simular.js` (e `--parado`/`--vezes 3` por jogo), `node tools/teste_rede.js`.

## Review Focus

1. **Pular Corda: os dois braços passam pelo jogador quase juntos** (baixo e alto em sentidos opostos se cruzam). Pular salva do baixo e mata no alto; agachar salva do alto e mata no baixo. O jogador precisa de ao menos ~0,5 s entre as duas passagens na maior parte do tempo; o bot precisa sobreviver a isso com frequência. Teste na Task 2 (bots vivos aos 20 s na maioria das rodadas).
2. **Bons Modos: tiro na fila quando o guarda vira de novo.** Depois do congelamento do tiro, o guarda retoma a caminhada e não pode "virar" instantaneamente contra quem já estava parado. Teste na Task 3 (`MIN_WALK` após o tiro).
3. **Empilhadeira: caixa roubada da zona rival cai de novo nela.** O pegar automático não pode pegar a caixa de volta no mesmo quadro em que o rival a largou (recarga de 0,6 s vale para quem largou, e a caixa não pode ser pega por quem acabou de pegar). Teste na Task 4.
4. **Corte Exato com 2 jogadores:** uma rodada só (morre o pior, acabou); com 1 jogador (`?game=&humans=1` sem bots é impossível, mas o roster mínimo é 2 com bots); o jogo não pode ficar sem figura nova quando as 5 acabarem (5 rodadas no máximo com repetição permitida a partir da 6ª). Teste na Task 5.
5. **Escultor com 3 jogadores:** dois painéis em cima e um embaixo, sem painel vazio; a bancada 3D do 4º lugar não aparece. Teste na Task 6.

---

## Arquivos

| arquivo | papel |
|---|---|
| `tools/_harness.js` (novo) | `rodada/aperta/solta/passo/segundos/gravador/textos/estilos/ok/fim` extraídos de `teste_ajustes.js` |
| `tools/teste_ajustes.js` | passa a usar o harness |
| `tools/teste_mecanicas.js` (novo) | uma seção por jogo |
| `minigames/pular_corda.js`, `bons_modos.js`, `empilhadeira.js`, `corte_exato.js`, `cinzel.js` | uma tarefa cada |
| `CLAUDE.md` | lista de testes |

Branch: `mecanicas-minigames`, a partir da `main`.

---

### Task 1: Harness compartilhado e `teste_mecanicas.js`

**Files:**
- Create: `tools/_harness.js`, `tools/teste_mecanicas.js`
- Modify: `tools/teste_ajustes.js`

**Interfaces:**
- Produces: `require('./_harness.js')` carrega o motor e os minigames no `global` (igual ao cabeçalho de `teste_ajustes.js`) e exporta `{ rodada, aperta, solta, passo, segundos, gravador, textos, estilos, ok, fim }`, onde `fim(secoes)` roda as seções com `try/catch`, imprime `Tudo certo.`/`N falha(s).` e faz `process.exit`. `textos(fn)` e `estilos(fn)` recebem uma função `(c) => ...`.

- [ ] **Step 1: Criar a branch**

```bash
git checkout main && git checkout -b mecanicas-minigames
```

- [ ] **Step 2: Extrair o harness**

Mover de `tools/teste_ajustes.js` para `tools/_harness.js` tudo do cabeçalho até `estilos` (carga do motor, `DEV`, `solto`, `rodada`, `aperta`, `solta`, `passo`, `segundos`, `gravador`, `textos`, `estilos`, `ok`, contador `falhas`) e acrescentar `fim(secoes)`. `teste_ajustes.js` passa a começar com `const { rodada, aperta, solta, passo, segundos, gravador, textos, estilos, ok, fim } = require('./_harness.js');` e termina com `fim([secaoContramao, ...]);`.

- [ ] **Step 3: `tools/teste_mecanicas.js`**

```js
#!/usr/bin/env node
// Testa as mecânicas novas sem navegador (spec docs/superpowers/specs/2026-10-18-mecanicas-minigames-design.md).
// Uso: node tools/teste_mecanicas.js
const { rodada, aperta, solta, passo, segundos, gravador, textos, ok, fim } = require('./_harness.js');
// finge o 3D para os HUDs que só desenham com WebGL
function com3d(g, fn) { const u = g.uses3d, pr = TN.R3.project; g.uses3d = () => true; TN.R3.project = (x, y, z) => ({ x: 480 + (x - 480) * 0.8, y: 300 + (z - 270) * 0.6, visible: true }); try { return fn(); } finally { g.uses3d = u; TN.R3.project = pr; } }

// SEÇÕES (uma por jogo)
fim([]);
```

- [ ] **Step 4: Rodar**

Run: `node tools/teste_ajustes.js && node tools/teste_mecanicas.js`
Expected: `Tudo certo.` nos dois.

- [ ] **Step 5: Commit**

```bash
git add tools/_harness.js tools/teste_ajustes.js tools/teste_mecanicas.js
git commit -m "Testes: harness de rodada compartilhado (tools/_harness.js) e teste_mecanicas.js"
```

---

### Task 2: Pular Corda: laser alto e agachar

**Files:**
- Modify: `minigames/pular_corda.js` (constantes l.23–26, `init` l.31–34, `armAngles` l.49, `update` l.51–110, `bot` l.112–150, `drawLaser3d` l.156, `draw3d` l.235–245, `brief`, `controls`)

**Interfaces:**
- Produces: `bracos(g)` → lista de `{ ang, alto: boolean, sign: ±1 }` (os baixos a partir de `d.theta + off`, o alto de `d.alto.theta`); `ativarAlto(g)` cria `d.alto = { theta, on: true }`; constantes `ALTO_AT = 12`, `ALTO_Y = 34`, `ALTO_FATOR = 0.8`, `CROUCH = 0.45`, `CROUCH_SPEED = 70`, `CROUCH_CD = 0.25`; `p.data.crouch` e `p.data.crouchCd`.

- [ ] **Step 1: Teste**

```js
function secaoPularCorda() {
  const def = TN.minigames.pular_corda;
  ok(def.ALTO_AT === 12 && def.ALTO_Y === 34 && def.CROUCH === 0.45 && def.CROUCH_SPEED === 70 && def.CROUCH_CD === 0.25 && def.controls.b === 'agachar', 'corda: constantes do laser alto e do agachar');
  const g = rodada('pular_corda'), d = g.data, P = g.players;
  segundos(g, 2);   // passa o aquecimento
  ok(!d.alto, 'corda: o laser alto ainda não existe no começo');
  // EXTRA agacha, e agachado não pula
  aperta(1, { b: true }); passo(g); solta();
  ok(P[1].data.crouch > 0 && P[1].data.crouch <= def.CROUCH, 'corda: EXTRA agacha por 0,45 s');
  aperta(1, { a: true }); passo(g); solta();
  ok(P[1].data.air <= 0, 'corda: agachado não pula');
  segundos(g, 0.5);
  ok(P[1].data.crouch <= 0 && P[1].data.crouchCd > 0, 'corda: depois de agachar há 0,25 s de recarga');
  // colisões: 4 jogadores no mesmo ângulo (0 rad), raio 120; um braço alto varre esse ângulo
  for (const p of P) { p.x = def.CX + 120; p.y = def.CY; p.data.air = 0; p.data.crouch = 0; p.data.cd = 0; }
  P[1].data.crouch = 0.4;    // agachado
  P[2].data.air = 0.3;       // no ar
  d.arms = [];               // sem braço baixo agora
  def.ativarAlto(g); d.alto.theta = 0; d.sign = 1; d.omega = 0;   // o alto parado exatamente sobre os jogadores
  passo(g);
  ok(!P[0].alive && P[1].alive && !P[2].alive, `corda: o laser alto mata quem está em pé e no ar, poupa o agachado (vivos: ${P.map((p) => +p.alive).join('')})`);
  // braço baixo: agachado morre, no ar escapa
  const h = rodada('pular_corda'), e = h.data, Q = h.players; segundos(h, 2);
  for (const p of Q) { p.x = def.CX + 120; p.y = def.CY; p.data.air = 0; p.data.crouch = 0; }
  Q[1].data.crouch = 0.4; Q[2].data.air = 0.3; e.alto = null; e.omega = 0; e.theta = 0; passo(h);
  ok(!Q[0].alive && !Q[1].alive && Q[2].alive, `corda: o laser baixo mata em pé e agachado, poupa quem pulou (vivos: ${Q.map((p) => +p.alive).join('')})`);
  // aos 12 s o alto entra no lugar da 2ª corda baixa e gira ao contrário
  const k = rodada('pular_corda', { humanos: 0 }); segundos(k, 12.2);
  ok(k.data.alto && k.data.alto.on && k.data.arms.length === 1, 'corda: aos 12 s entra o laser alto e não há 2ª corda baixa');
  const b = def.bracos(k), baixo = b.find((x) => !x.alto), alto = b.find((x) => x.alto);
  ok(baixo && alto && baixo.sign === -alto.sign, 'corda: o alto gira no sentido oposto ao baixo');
  // bot: diante do alto chegando, agacha em vez de pular
  const z = rodada('pular_corda', { humanos: 0 }); segundos(z, 2);
  const bp = z.players[0]; bp.x = def.CX + 120; bp.y = def.CY; bp.data.bot = { prefR: 120, skill: 0.08, noise: 0, tw: 0, tt: 9 };
  z.data.arms = []; def.ativarAlto(z); z.data.alto.theta = -0.25; z.data.sign = 1; z.data.omega = 3;
  const dec = def.bot(z, bp, 1 / 60);
  ok(dec.b === true && !dec.a, `corda: o bot agacha para o laser alto (${JSON.stringify(dec)})`);
  // Review Focus 1: os bots sobrevivem aos dois braços na maioria das rodadas
  let vivas = 0;
  for (let r = 0; r < 6; r++) { const w = rodada('pular_corda', { humanos: 0 }); segundos(w, 20); if (w.alive().length >= 1) vivas++; }
  ok(vivas >= 4, `corda: em ${vivas}/6 rodadas ainda há bot vivo aos 20 s`);
}
```

E `secaoPularCorda` no array de `fim([...])`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_mecanicas.js`
Expected: `✗ corda: constantes do laser alto e do agachar` e exceção em `ativarAlto`.

- [ ] **Step 3: Implementar**

- Constantes novas; `ARM2_AT` some (o aviso "CORDA DUPLA." vira "LASER ALTO." em ciano `#3fd6ff`, 1,2 s antes de `ALTO_AT`); `init`: `d.alto = null`, `p.data.crouch = 0, crouchCd = 0`.
- `ativarAlto(g)`: `d.alto = { theta: d.theta + Math.PI, on: true }`; no `update`, em vez do push do 2º braço, `if (!d.alto && g.time >= this.ALTO_AT) this.ativarAlto(g)`; o alto avança `d.alto.theta -= d.omega * this.ALTO_FATOR * dt` (oposto ao baixo; as inversões continuam mexendo em `d.sign`, então valem para os dois).
- `bracos(g)`: `d.arms.map(off => ({ ang: d.theta + off, alto: false, sign: d.sign })).concat(d.alto ? [{ ang: d.alto.theta, alto: true, sign: -d.sign }] : [])`. `armAngles` passa a devolver só os ângulos dos baixos (compatibilidade do desenho fantasma).
- Jogadores: `bPressed && air <= 0 && crouch <= 0 && crouchCd <= 0` → `crouch = CROUCH`; `aPressed` só pula se `crouch <= 0`; velocidade `CROUCH_SPEED` enquanto agachado; ao sair do agachar, `crouchCd = CROUCH_CD`.
- Colisão: para cada braço de `bracos(g)`: baixo mata se `air <= 0` (agachado conta como chão); alto mata se `crouch <= 0` (em pé ou no ar). Mensagens do alto: `['ABAIXA!', 'ALTO DEMAIS.', 'NÃO AGACHOU.']`.
- `drawLaser3d(r, d, ang, color, ghost, y = this.LASER_Y, sign = d.sign)`: o alto é desenhado em `ALTO_Y` com cor ciano, poste próprio no carrinho (`r.box` mais alto) e sombra no chão (`r.beam` escuro em y=1). Pose: `crouch > 0` → `'crouch'`.
- Bot: calcula `tEnter` para cada braço com o próprio `sign`; escolhe o que chega primeiro; se é alto, devolve `{ b: true }` quando `tEnter <= ideal + noise` (com `ideal` baseado em `CROUCH` em vez de `AIR`), senão `{ a: true }`; não agacha se `crouchCd > 0`.
- `brief`: acrescentar `'O laser alto passa por cima: agache (EXTRA). Não dá para pular dele.'`; `controls.b = 'agachar'`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_mecanicas.js && node tools/simular.js pular_corda --vezes 3 && node tools/simular.js pular_corda --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/pular_corda.js tools/teste_mecanicas.js
git commit -m "Pular corda: laser alto aos 12 s (no lugar da 2ª corda) e agachar com EXTRA"
```

---

### Task 3: Bons Modos: o guarda que anda

**Files:**
- Modify: `minigames/bons_modos.js` (constantes l.22, `init` l.28, `update` l.64–76 e 90, `bot` l.116–136, `gunPose` l.213, `drawHost3d` l.221–250, `brief`, textos "ELE ESTÁ OLHANDO")

**Interfaces:**
- Produces: `d.host = { state: 'walk'|'turn'|'look'|'fake', t, dur, x, vx, face }` (`face` 0 = de costas, 1 = de frente, 0,4 na finta); constantes `WALK_MIN = 60`, `WALK_MAX = 140`, `X_MIN = 160`, `X_MAX = 800`, `TURN = 0.3`, `LOOK_MIN = 0.7`, `LOOK_MAX = 2.5`, `HAZARD = 0.4`, `MIN_WALK = 0.6`, `MAX_WALK = 8`, `FAKE_CHANCE = 0.2`, `FAKE = 0.4`; `setHost(g, state, dur)` continua.

- [ ] **Step 1: Teste**

```js
function secaoBonsModos() {
  const def = TN.minigames.bons_modos;
  ok(def.TURN === 0.3 && def.LOOK_MIN === 0.7 && def.LOOK_MAX === 2.5 && def.HAZARD === 0.4 && def.MIN_WALK === 0.6 && def.MAX_WALK === 8 && def.WALK_MIN === 60 && def.WALK_MAX === 140, 'bons modos: constantes do guarda');
  const g = rodada('bons_modos'), d = g.data, h = d.host;
  ok(h.state === 'walk' && typeof h.x === 'number' && typeof h.vx === 'number', 'bons modos: o guarda começa andando');
  const x0 = h.x; segundos(g, 0.5);
  ok(h.x !== x0 && h.x >= def.X_MIN && h.x <= def.X_MAX, 'bons modos: o guarda anda dentro dos limites');
  // enquanto vira (0,3 s) ainda não pune; olhando, pune
  def.setHost(g, 'turn', def.TURN); aperta(0, { a: true }); passo(g); solta();
  ok(!d.shot && !d.queue.length, 'bons modos: agir durante o giro de 0,3 s não é tiro');
  def.setHost(g, 'look', 1); aperta(0, { a: true }); passo(g); solta();
  ok(d.shot || d.queue.length, 'bons modos: agir com o guarda olhando é tiro');
  // depois do congelamento do tiro, o guarda volta a andar e respeita MIN_WALK (Review Focus 2)
  segundos(g, def.SHOT_FREEZE + 0.05);
  ok(h.state === 'walk' && h.t < 0.2, `bons modos: depois do tiro o guarda volta a andar (${h.state})`);
  let virouCedo = false;
  for (let i = 0; i < 30; i++) { passo(g); if (h.state !== 'walk' && h.state !== 'fake') virouCedo = true; }   // 0,5 s < MIN_WALK
  ok(!virouCedo, 'bons modos: não vira antes de MIN_WALK');
  // sem padrão: em 90 s com bots, várias olhadas, nenhuma caminhada acima de MAX_WALK, e intervalos variados
  const k = rodada('bons_modos', { humanos: 0 }), kh = k.data.host; let olhadas = 0, maiorWalk = 0, prev = kh.state; const durs = [];
  for (let i = 0; i < 90 * 60 && !k.finished; i++) {
    passo(k);
    if (kh.state === 'walk') maiorWalk = Math.max(maiorWalk, kh.t);
    if (prev !== 'look' && kh.state === 'look') { olhadas++; durs.push(Math.round(kh.t * 10)); }
    prev = kh.state;
  }
  ok(olhadas >= 6 && maiorWalk <= def.MAX_WALK + 0.1, `bons modos: ${olhadas} olhadas em 90 s, caminhada máxima ${maiorWalk.toFixed(1)} s`);
  const t = textos((c) => def.drawOverlay ? def.drawOverlay(k, c) : null) + def.brief.join(' ');
  ok(!/ELE ESTÁ OLHANDO/.test(t) && /guarda/i.test(def.brief.join(' ')), 'bons modos: textos falam do guarda');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ bons modos: constantes do guarda` e `✗ bons modos: o guarda começa andando`.

- [ ] **Step 3: Implementar**

- `init`: `d.host = { state: 'walk', t: 0, dur: 0, x: 480, vx: U.pick([-1, 1]) * U.rand(WALK_MIN, WALK_MAX), face: 0 }`.
- Máquina no `update` (no lugar do bloco read/fake/lower/grace/watch/raise): em `walk`: `x += vx*dt`, rebate em `X_MIN/X_MAX`; `face → 0`; se `t >= MIN_WALK` e (`t >= MAX_WALK` ou `U.chance(1 - Math.exp(-HAZARD * dt))`): com `FAKE_CHANCE` → `setHost('fake', FAKE)`, senão `setHost('turn', TURN)` com `g.sfx('step')` baixo. `fake`: `face = 0.4 * sin(πt/FAKE)`, volta a `walk` (novo `vx`). `turn`: `face = t/TURN`, ao fim `setHost('look', U.rand(LOOK_MIN, LOOK_MAX))` e `g.sfx('tick')`. `look`: `face = 1`; ao fim `setHost('walk', 0)` com `vx` novo e sentido sorteado. Depois do tiro (`d.shot` termina), `setHost('walk', 0)`.
- Punição: `if (h.state === 'look') this.shoot(g, p)` (antes `watch`). Durante `turn` não pune.
- Bot: `walk` faz o papel de `read` (retoma depois de 0,2–0,6 s); mudar para `turn`/`look` → para em 0,05–0,3 s (7% das vezes demora 0,8–1,3 s).
- `gunPose`: origem em `h.x` (não mais `480 ± 104`). `drawHost3d`: `r.character` em `(h.x, HZ)` com `dir` = andando `vx > 0 ? 0 : Math.PI`, virando/olhando interpola para `Math.PI / 2` com `face`; uniforme azul-escuro `#2b3a6b`, quepe (`r.box` 10×3×8 sobre a cabeça) e cassetete; olhos vermelhos quando `look`. O jornal e a placa somem; `h.k` deixa de existir.
- Textos: "ELE ESTÁ OLHANDO" → "O GUARDA VIROU"; `brief`: `['Seja um bom convidado.', 'Não mexa um dedo com o guarda olhando para a mesa.', 'Termine o seu prato.']`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_mecanicas.js && node tools/simular.js bons_modos --vezes 3 && node tools/simular.js bons_modos --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/bons_modos.js tools/teste_mecanicas.js
git commit -m "Bons modos: guarda que anda atrás da mesa e vira sem padrão de tempo"
```

---

### Task 4: Empilhadeira: controle assistido e eliminação do pior

**Files:**
- Modify: `minigames/empilhadeira.js` (constantes l.18–19, `update` l.95–130, `endSub` l.187–215, `bot` l.239–285, `brief`, `controls`)

**Interfaces:**
- Produces: `GIRO_MIN = 0.35`, `PEGA_CD = 0.6`; `p.data.pegaCd`; `pegarAuto(g, p)` e `soltarAuto(g, p)` chamados no `update`; `piores(g)` → lista dos vivos com a menor contagem (vazia se todos empatam).

- [ ] **Step 1: Teste**

```js
function secaoEmpilhadeira() {
  const def = TN.minigames.empilhadeira;
  ok(def.GIRO_MIN === 0.35 && def.PEDAL_RATE === 8 && def.STEER_RATE === 8 && def.GRAB === 34 && def.PEGA_CD === 0.6 && /soltar/i.test(def.controls.a), 'empilhadeira: constantes e AÇÃO = soltar');
  const g = rodada('empilhadeira'), d = g.data, p = g.players[0], pd = p.data, zona = d.zones.find((z) => z.owner === p);
  segundos(g, 0.5);
  // gira parada
  const dir0 = p.dir; pd.pedal = 0; pd.speed = 0; aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(Math.abs(p.dir - dir0) > 0.05, `empilhadeira: gira parada (${(p.dir - dir0).toFixed(2)} rad)`);
  // pegar automático: caixa livre a 20 px da ponta do garfo, fora da própria zona
  p.x = 480; p.y = 270; p.dir = 0; pd.crate = null; pd.pegaCd = 0;
  const f = def.forkPoint(p), cr = d.crates.find((c) => !c.carrier); cr.x = f.x + 20; cr.y = f.y; cr.fade = 0;
  passo(g);
  ok(pd.crate === cr && cr.carrier === p, 'empilhadeira: encostar o garfo numa caixa livre pega sozinho');
  // soltar automático no centro da própria zona, e 0,6 s sem pegar de novo
  p.x = zona.x + zona.w / 2 - def.FORK; p.y = zona.y + zona.h / 2; p.dir = 0; passo(g);
  ok(!pd.crate && !cr.carrier && def.zoneOf(g, cr) === zona && pd.pegaCd > 0.5, 'empilhadeira: entrar na própria zona solta a caixa e dá 0,6 s sem pegar');
  passo(g, 1 / 60, 10);
  ok(!pd.crate, 'empilhadeira: a caixa recém-solta não volta para o garfo');
  segundos(g, 0.7); passo(g);
  ok(!pd.crate, 'empilhadeira: caixa já na própria zona não é pega');
  // Review Focus 3: roubar da zona rival continua, e quem largou não pega de volta na hora
  const q = g.players[1], qd = q.data, zq = d.zones.find((z) => z.owner === q);
  q.x = zona.x + zona.w / 2 - def.FORK; q.y = zona.y + zona.h / 2; q.dir = 0; qd.crate = null; qd.pegaCd = 0; passo(g);
  ok(qd.crate === cr, 'empilhadeira: o rival rouba a caixa da minha zona só encostando');
  // eliminação só do pior
  const h = rodada('empilhadeira'), e = h.data; segundos(h, 0.5);
  const porZona = [3, 1, 1, 0], caixas = e.crates.filter((c) => !c.removed);
  let k = 0; e.zones.forEach((z, i) => { for (let n = 0; n < porZona[i]; n++) { const c = caixas[k++]; c.carrier = null; c.x = z.x + 20 + n * 10; c.y = z.y + 20; } });
  for (const c of caixas.slice(k)) { c.x = 480; c.y = 270; }
  for (const pl of h.players) pl.data.crate = null;
  def.endSub(h); segundos(h, 2.3);
  ok(h.players.map((pl) => +pl.alive).join('') === '1110', `empilhadeira: só quem tem menos caixas sai (vivos ${h.players.map((pl) => +pl.alive).join('')})`);
  ok(e.phase === 'play', 'empilhadeira: vem outro turno');
  const m = rodada('empilhadeira'), me = m.data; segundos(m, 0.5);
  for (const c of me.crates) { c.x = 480; c.y = 270; c.carrier = null; }
  for (const pl of m.players) pl.data.crate = null;
  def.endSub(m); segundos(m, 2.3);
  ok(m.alive().length === 4 && me.phase === 'play', 'empilhadeira: empate geral (todos com 0) não elimina ninguém');
  ok(def.piores(m).length === 0, 'empilhadeira: piores() vazio no empate geral');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ empilhadeira: constantes e AÇÃO = soltar` e `✗ empilhadeira: gira parada`.

- [ ] **Step 3: Implementar**

- Constantes: `PEDAL_RATE: 8, STEER_RATE: 8, GRAB: 34, GIRO_MIN: 0.35, PEGA_CD: 0.6`.
- Giro (l.105): `const k = Math.max(this.GIRO_MIN, Math.abs(pd.speed) / this.MAX_SPEED) * (pd.speed < 0 ? -1 : 1); p.dir += pd.steer * this.TURN * k * dt;`.
- `pd.pegaCd -= dt`. `pegarAuto`: se `!pd.crate && pd.pegaCd <= 0`, a caixa livre (sem `carrier`, `fade <= 0`) mais perto da ponta do garfo a menos de `GRAB` e **cuja zona não é a própria** é pega (`carrier = p`, `pd.crate = cr`, `sfx pickup`). `soltarAuto`: se `pd.crate` e a ponta do garfo está no retângulo interno da própria zona (margem 16), `dropCrate(p)`, `pd.pegaCd = PEGA_CD`, `sfx step`. AÇÃO: só `if (pd.crate) { dropCrate(p); pd.pegaCd = PEGA_CD; }`.
- `piores(g)`: contagem por zona; `min`; se todos têm a mesma contagem → `[]`; senão os de contagem `min`. `endSub`: `eliminateBatch(g, this.piores(g), 'FICOU PRA TRÁS!')` (zeros entram aí); some o bloco `count < max`; banner "EMPATE: TODOS SEGUEM" quando `piores` vazio. O resto (ímã, `MAX_SUBS`, próximo turno) continua.
- Bot: remover os `a = true` de pegar; na zona, continua dando ré depois que a caixa cai sozinha (`if (!b.crate && s.reverse <= 0 && dentroDaZona) s.reverse = 0.6`).
- `controls.a = 'soltar a caixa aqui'`; `brief`: `['Encoste o garfo numa caixa para pegar; entre na sua zona para soltar.', 'Caixa no garfo não conta.', 'No fim do turno, quem tiver menos caixas sai.']`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_mecanicas.js && node tools/simular.js empilhadeira --vezes 3 && node tools/simular.js empilhadeira --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/empilhadeira.js tools/teste_mecanicas.js
git commit -m "Empilhadeira: gira parada, pega e solta sozinha, e só o pior sai no fim do turno"
```

---

### Task 5: Corte Exato: todos ao mesmo tempo, morre o pior

**Files:**
- Modify: `minigames/corte_exato.js` (reescrita interna: `init`, `startTurn` → `novaRodada`, `evaluate`, `submit`, `update`, `bot`, `standPos`/`worldPos`, `draw3d`, novos `quadrante`, `drawQuadrante`, `drawOverlay`, `draw`)

**Interfaces:**
- Produces: `scoring: 'survival'`, `rounds: 1`; `d = { shape, round, phase: 'preview'|'cut'|'show'|'end', phaseT, poly (coordenadas locais, centro 0,0, escala K = 0.6), usadas: string[] }`; `p.data = { cursor: {x,y} (local), strokes: [[{x,y}]], cutting, done, result: {score, precision, coverage}|null, plan }`; `quadrante(g, p)` → `{ x, y, w, h, cx, cy }` na tela (2 colunas; com 2 vivos lado a lado, com 3 dois em cima e um embaixo centralizado); `avaliar(g, p)`; `novaRodada(g)`; `piores(g)`; `drawQuadrante(g, c, p)` usado pelo `drawOverlay` (3D) e pelo `draw` (2D); constantes `PREVIEW = 2`, `CUT_TIME = 8`, `SHOW = 2.2`, `PREVIEW_MIN = 1`, `K = 0.6`, `MAX_RODADAS = 5`.

- [ ] **Step 1: Teste**

```js
function secaoCorteExato() {
  const def = TN.minigames.corte_exato;
  ok(def.scoring === 'survival' && def.CUT_TIME === 8 && def.PREVIEW === 2 && def.SHOW === 2.2 && def.K === 0.6, 'corte: survival, 8 s de corte, prévia 2 s, escala 0,6');
  const g = rodada('corte_exato'), d = g.data, P = g.players;
  ok(def.SHAPES.includes(d.shape) && d.round === 1 && d.phase === 'preview' && P.every((p) => p.data.cursor && Array.isArray(p.data.strokes)), 'corte: figura única, rodada 1, prévia, estado por jogador');
  const qs = P.map((p) => def.quadrante(g, p));
  ok(new Set(qs.map((q) => q.x + ',' + q.y)).size === 4 && qs.every((q) => q.w >= 400 && q.h >= 200), 'corte: 4 quadrantes distintos');
  segundos(g, def.PREVIEW + 0.05);
  ok(d.phase === 'cut', 'corte: depois da prévia vem o corte');
  const c0 = { ...P[0].data.cursor }, c1 = { ...P[1].data.cursor }, c2 = { ...P[2].data.cursor };
  aperta(0, { x: 1 }); aperta(1, { y: 1 }); passo(g, 1 / 60, 10); solta();
  ok(P[0].data.cursor.x > c0.x && P[1].data.cursor.y > c1.y && P[2].data.cursor.x === c2.x && P[2].data.cursor.y === c2.y, 'corte: dois jogadores cortam ao mesmo tempo, cada um no seu cursor');
  // notas e eliminação: P0 perfeito, P1 nada, P2 e P3 metade
  const perfeito = d.poly.map((q) => ({ x: q.x, y: q.y })), metade = perfeito.slice(0, Math.floor(perfeito.length / 2));
  P[0].data.strokes = [perfeito]; P[1].data.strokes = []; P[2].data.strokes = [metade]; P[3].data.strokes = [metade];
  const figura = d.shape;
  for (const p of P) p.data.done = true;
  segundos(g, def.CUT_TIME + def.SHOW + 0.2);
  ok(P[0].alive && !P[1].alive && P[2].alive && P[3].alive, `corte: morre só o pior (vivos ${P.map((p) => +p.alive).join('')})`);
  ok(P[0].data.result && P[0].data.result.score >= 95, `corte: contorno perfeito dá ~100 (${P[0].data.result && P[0].data.result.score})`);
  ok(d.round === 2 && d.shape !== figura && d.phase === 'preview', `corte: rodada 2 com figura diferente (${figura} → ${d.shape})`);
  // empate geral não elimina
  segundos(g, d.phaseT + 0.05);
  for (const p of g.alive()) { p.data.strokes = []; p.data.done = true; }
  segundos(g, def.CUT_TIME + def.SHOW + 0.2);
  ok(g.alive().length === 3 && d.round === 3, 'corte: empate geral (todos 0) não elimina ninguém');
  // Review Focus 4: com 2 jogadores acaba na 1ª rodada; nunca fica sem figura
  const h = rodada('corte_exato', { humanos: 0 }); h.players[2].alive = false; h.players[3].alive = false;
  segundos(h, 60);
  ok(h.finished && h.data.round <= 2, `corte: com 2 vivos termina em uma rodada (rodada ${h.data.round})`);
  const k = rodada('corte_exato', { humanos: 0 }); for (let r = 0; r < 7; r++) def.novaRodada(k);
  ok(def.SHAPES.includes(k.data.shape), 'corte: depois de usar as 5 figuras continua sorteando');
  // bots jogam e a rodada termina sozinha
  const z = rodada('corte_exato', { humanos: 0 }); segundos(z, 70);
  ok(z.finished && z.players.some((p) => !p.alive), `corte: com bots a rodada termina (vivos ${z.alive().length})`);
  // desenho: 2D e overlay 3D desenham os quadrantes com a figura
  const t2 = textos((c) => def.draw(z, c)); const t3 = com3d(z, () => textos((c) => def.drawOverlay(z, c)));
  ok(/ÚLTIMO LUGAR SAI/.test(t2) && /ÚLTIMO LUGAR SAI/.test(t3), 'corte: HUD 2D e 3D têm o cabeçalho da rodada');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `✗ corte: survival ...` e `✗ corte: figura única ...`.

- [ ] **Step 3: Implementar**

- Cabeçalho: `scoring: 'survival'`, `rounds: 1`, `endWhenOneLeft` padrão; `hudValue(g, p)`: nota da rodada ou `'—'`.
- `init`: `d.round = 0; d.usadas = []; novaRodada(g)`; posições lógicas dos jogadores = centro do próprio quadrante (para rótulos e partículas no 2D).
- `novaRodada(g)`: `d.round++`; figura sorteada entre as não usadas (se acabaram, sorteia entre todas menos a anterior); `d.poly = shapePoints(shape, 0, 0)` escalado por `K`; para cada vivo: `cursor = { x: -PLATE_Q.w/2 + 20, y: PLATE_Q.h/2 - 20 }` (canto inferior esquerdo local), `strokes = []`, `cutting = false`, `done = false`, `result = null`, `plan = null`; `phase = 'preview'`, `phaseT = max(PREVIEW_MIN, PREVIEW - 0.3 × (round - 1))`.
- `quadrante(g, p)`: índice de `p` entre os vivos ordenados por id; `n` vivos; `n <= 2` → lado a lado (480×506 a partir de y=34); `n === 3` → dois em cima (480×253) e um embaixo centralizado (x=240); `4` → grade 2×2 (480×253). `PLATE_Q = { w: 300, h: 190 }` centrada no quadrante.
- `update`: `preview` → `cut` (`sfx go`); `cut`: para cada vivo não `done`: move o cursor (local, limitado ao `PLATE_Q`), corta com `a`, `bPressed` → `done`; fim do tempo → todos `done`; ao entrar em `show`: `avaliar` cada vivo (`result`), `sfx` conforme o melhor; `show` termina → `piores(g)` (menor `score`; vazio se todos iguais) → `g.eliminate(p, { msg: 'ÚLTIMO LUGAR.' })`; se `alive > 1` e `round < MAX_RODADAS` → `novaRodada`, senão `phase = 'end'; g.finish(1.5)` (o motor também encerra quando sobra 1).
- `avaliar(g, p)`: a função `evaluate` atual com `cx = cy = 0`, `TOL × K`, `radiusAt` sobre `d.poly`.
- `bot(g, p, dt)`: o plano atual por jogador (`p.data.plan`), em coordenadas locais, durante `cut`; no fim do caminho devolve `{ b: true }`.
- `drawQuadrante(g, c, p)`: moldura na cor do jogador, nome (`p.label`, `maxWidth` 160), chapa (`PLATE_Q`), figura (forte na prévia, 10% no corte, verde no resultado), traços (brasa), cursor (cruz + brilho ao cortar), nota grande no `show`, "ÚLTIMO LUGAR" em vermelho no eliminado. `drawOverlay` (3D): cabeçalho `RODADA ${d.round} · ${d.shape} · ÚLTIMO LUGAR SAI` e os quadrantes com fundo `rgba(8,10,13,0.85)`; `draw` (2D): fundo escuro + os mesmos quadrantes + cabeçalho.
- `draw3d`: oficina e 4 bancadas pequenas (`tableX(i) = 135 + i*230`, como o Escultor) com um `r.character` por jogador (`arms` no corte); `standPos`/`worldPos` passam a apontar para a bancada de cada um; a chapa grande, o pórtico e o console somem.
- `brief`: `['Todos cortam a mesma figura ao mesmo tempo, cada um na sua chapa.', 'Segure AÇÃO para cortar. EXTRA entrega antes do tempo.', 'A pior nota da rodada sai. Repete até sobrar um.']`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_mecanicas.js && node tools/simular.js corte_exato --vezes 3 && node tools/simular.js corte_exato --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/corte_exato.js tools/teste_mecanicas.js
git commit -m "Corte exato: todos cortam a mesma figura ao mesmo tempo; a pior nota sai a cada rodada"
```

---

### Task 6: Escultor: visão individual em painéis

**Files:**
- Modify: `minigames/cinzel.js` (`quad` l.73, `camera` l.220, `drawOverlay` l.286–310, `drawQuadrant` l.388–420, `draw` l.346)

**Interfaces:**
- Produces: `painel(g, p)` → `{ x, y, w: 420, h: 220, S: 17 }` por jogador (mesma regra de ocupação do `quadrante` do Corte: 4 → 2×2 com margens de 20 px; 3 → dois em cima e um embaixo; ≤2 → lado a lado); `drawQuadrant(g, c, p, rect)` aceita o retângulo e a escala; `drawOverlay` no 3D desenha os painéis com fundo `rgba(10,8,6,0.85)` por cima do cenário.

- [ ] **Step 1: Teste**

```js
function secaoEscultor() {
  const def = TN.minigames.cinzel;
  const g = rodada('cinzel'); segundos(g, def.MEMO + 0.5);   // fase de esculpir
  const ps = g.players.map((p) => def.painel(g, p));
  ok(ps.every((q) => q.w === 420 && q.h === 220) && new Set(ps.map((q) => q.x + ',' + q.y)).size === 4 && ps.every((q) => q.x >= 20 && q.x + q.w <= 940), 'escultor: 4 painéis de 420×220 com margens');
  const c = gravador(); com3d(g, () => def.drawOverlay(g, c));
  const fundos = c.log.filter((e) => e[0] === 'fillRect' && e[3] === 420 && e[4] === 220);
  ok(fundos.length === 4, `escultor: o overlay 3D desenha os 4 painéis (${fundos.length})`);
  ok(/esculpindo|ESCULPINDO/i.test(textos((x) => com3d(g, () => def.drawOverlay(g, x)))), 'escultor: os painéis mostram o estado de cada um');
  // Review Focus 5: com 3 jogadores, dois em cima e um embaixo
  g.players[3].alive = false;
  const p3 = g.players.slice(0, 3).map((p) => def.painel(g, p));
  ok(p3[0].y === p3[1].y && p3[2].y > p3[0].y && Math.abs(p3[2].x + p3[2].w / 2 - 480) < 1, 'escultor: 3 jogadores → dois em cima, um embaixo centralizado');
  const c3 = gravador(); com3d(g, () => def.drawOverlay(g, c3));
  ok(c3.log.filter((e) => e[0] === 'fillRect' && e[3] === 420 && e[4] === 220).length === 3, 'escultor: eliminado não ganha painel');
}
```

- [ ] **Step 2: Rodar e ver falhar**

Expected: `painel is not a function`.

- [ ] **Step 3: Implementar**

- `painel(g, p)` conforme a interface (vivos ordenados por id; eliminados não têm painel, mas no `reveal` o eliminado do ciclo ainda aparece até o fim da fase).
- `drawQuadrant(g, c, p, rect = this.quad(p.id))`: usa `rect.x/y/w/h` e `rect.S || 19`; `bx = rect.x + rect.w/2 - 65`, `by = rect.y + rect.h/2 + 10`; nome com `maxWidth` 150.
- `drawOverlay` (3D): mantém o relógio do topo; para cada jogador com painel: `c.fillStyle = 'rgba(10,8,6,0.85)'; c.fillRect(q.x, q.y, q.w, q.h)` e `drawQuadrant(g, c, p, q)`; some o bloco de estado sobre a cabeça (o painel já mostra).
- `camera`: `pos: [480, 520, 1080], target: [480, 60, 270]` (cenário mais aberto atrás dos painéis).
- `draw` (2D) continua com `quad`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_mecanicas.js && node tools/simular.js cinzel --vezes 3 && node tools/simular.js cinzel --parado`

- [ ] **Step 5: Commit**

```bash
git add minigames/cinzel.js tools/teste_mecanicas.js
git commit -m "Escultor: bloco de cada um em painéis grandes por cima do 3D"
```

---

### Task 7: Screenshots, documentação e bateria

**Files:**
- Modify: `CLAUDE.md`; só se a revisão pedir, coordenadas em `minigames/`

- [ ] **Step 1: Screenshots** (servidor rodando)

```bash
mkdir -p screenshots/mecanicas
for par in pular_corda:14 bons_modos:7 bons_modos:9 empilhadeira:8 corte_exato:5 corte_exato:12 cinzel:8; do id=${par%%:*}; t=${par##*:}; bash tools/screenshot.sh $id $t screenshots/mecanicas/${id}_$t.png; done
```

Conferir: laser alto ciano acima do baixo, com poste; o guarda andando e, no outro instante, virado (olhos vermelhos); painéis do Escultor e quadrantes do Corte legíveis; nada vazando. Ajuste só coordenadas.

- [ ] **Step 2: Documentar**

`CLAUDE.md`: acrescentar `node tools/teste_mecanicas.js` à lista de testes.

- [ ] **Step 3: Tudo**

Run: `node tools/teste_mecanicas.js && node tools/teste_ajustes.js && node tools/teste_menus.js && node tools/simular.js && node tools/simular.js --sessao 2>&1 | tail -1 && node tools/teste_rede.js`
Expected: `Tudo certo.` em cada um e `Rede OK.`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md minigames/
git commit -m "Mecânicas: revisão visual e documentação"
```
