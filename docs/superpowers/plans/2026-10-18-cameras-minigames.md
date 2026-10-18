# Câmeras pelas costas, duas vistas e a Temporada de Caça refeita: plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** o motor passa a desenhar várias vistas (viewports) da mesma cena; o Pisa Leve ganha câmera pelas costas e cães de guarda, o Hora do Trem ganha câmera de frente com o trem vindo do fundo, e a Temporada de Caça é refeita com a vista do guarda em cima e a dos fugitivos embaixo.

**Arquitetura:** `def.viewports(g)` (opcional) devolve `[{ rect, camera }]`; `renderRound` monta a cena uma vez e a desenha uma vez por vista com `setViewport`/`setScissor` (no canvas ou dentro do `rt` retrô, com os retângulos escalados), com uma `PerspectiveCamera` por vista (aspecto do próprio `rect`); rótulos, `project` e `unproject` ganham o índice da vista. Os minigames continuam sem netcode: toda a lógica nova fica em `g.data`/`p.data` como dado simples; `viewports` é função do `def`, então o cliente de rede desenha as duas vistas a partir do snapshot.

**Stack:** JS puro sem build, Three.js r158 (`vendor/`), testes em Node (`tools/_harness.js`, `tools/simular.js`) e Chrome headless (`tools/teste_render.sh`, `tools/screenshot.sh`).

**Spec:** `docs/superpowers/specs/2026-10-18-cameras-minigames-design.md`

## Restrições globais

- Não altere o motor para um jogo específico; o que for genérico entra no motor e em `docs/COMO_CRIAR_MINIGAME.md`.
- Minigames usam só `p.input`; todo minigame termina sozinho (`simular.js --parado`).
- Estado de minigame em `g.data`/`p.data` como dado simples (serializado pela rede a ~30 snapshots/s).
- Textos em pt-BR, tom sombrio-cômico de "instalação de testes".
- Sem `viewports`, tudo continua como hoje (uma câmera, `def.camera`); minigames de uma vista não mudam.
- Pisa Leve mantém a mecânica (sonar, coleira, minas, pontos); `REVEAL` 2,2 → **1,4 s**.
- Hora do Trem: só troca de eixos; as regras (nichos abertos por ciclo, empurrão com `FORA_DO_NICHO`, pontos) não mudam.
- Temporada de Caça: 4 rodadas, um guarda por rodada (`fixedRounds`), 40 s, laser 0,5 s antes do tiro, recarga 1,5 s, mira travada nos 2 s iniciais, +1 por acerto, +1 se ninguém escapou; fugitivo: +1 ao chegar no muro, +1 extra para o primeiro, um tiro basta.
- Textos da Temporada: tagline "O guarda da torre tem uma bala para cada um."; brief "Corra até o muro.", "O laser aparece meio segundo antes do tiro: mergulhe (EXTRA) atrás de algo.", "Na torre: mire, trave com AÇÃO e reze para ele não se mexer.".
- Bateria depois de mexer no motor: `simular.js` (todos), `teste_cenarios`, `teste_detento`, `teste_menus`, `teste_ajustes`, `teste_mecanicas`, `teste_render.sh`; `teste_rede.js` no fim (servidor em 8765).

## Foco da revisão

1. **Viewports no visual retrô** (`rt` de 640×360): o scissor escalado tem de recortar certo e a vista 2 não pode apagar a vista 1. Teste na Task 1 (hash por metade, nos dois visuais, via `teste_render.sh`).
2. **Pisa Leve: mina revelada visível pela câmera baixa.** A mina no fundo do campo fica pequena; o anel vermelho precisa aparecer no screenshot a 20 s. Teste visual na Task 6 (screenshot com `REVEAL` ativo) e, na Task 2, o anel é desenhado com raio mínimo (`r.ring` com `TRIG`), não escalado.
3. **Hora do Trem: empurrado para fora do nicho lateral** cai no trilho e não atravessa a parede; o `FORA_DO_NICHO` de 0,3 s continua valendo. Teste na Task 3 (`secaoTrem` de `teste_ajustes.js` transposta + parede em `secaoTrem` de `teste_cameras.js`).
4. **Temporada: cobertura e recarga.** Agachado atrás de cobertura é invisível ao tiro; de pé atrás dela ainda é alvo; agachado no aberto é alvo menor; AÇÃO durante a recarga não acende outro laser. Testes na Task 4.
5. **Temporada em rede:** o cliente desenha as duas vistas e a mira do guarda a partir do snapshot. Teste na Task 1 (`simular.js` valida `viewports` também na cópia recebida pela rede) e na Task 4 (`simular temporada_de_caca` → "compatível com rede · 3D ok").

---

### Task 1: Motor: viewports

**Arquivos:**
- Modificar: `engine/render3d.js` (`makeValidator` l.38–56, `validate` l.66–70, `unproject`/`project` l.402–411, `renderRound` l.683–716, exports l.723–724)
- Modificar: `tools/simular.js:80,90` (valida `viewports`), `tools/teste_render.js` (bloco novo antes de "tempo médio de quadro"), `docs/COMO_CRIAR_MINIGAME.md` (seção da câmera, l.120, e tabela da API)

**Interfaces:**
- Produz: `def.viewports(g)` → `[{ rect: [x, y, w, h], camera: { pos, target, fov } }]` em coordenadas virtuais (`TN.W` × `TN.H`); `TN.R3.project(x, y, z, vista = 0)` → `{ x, y, visible }` em coordenadas de tela, já deslocado para o `rect` da vista; `TN.R3.unproject(sx, sy, planeY = 0, vista = 0)`; no validador, `r.project(x, y, z, vista)` aceita o 4º argumento; `TN.R3.validate(round)` devolve erros `viewports: ...` quando a lista tem formato inválido (não é lista, `rect` sem 4 números finitos, `camera.pos`/`target` sem 3 números finitos, `fov` não finito).

- [ ] **Step 1: Teste do validador (Node)** — crie `tools/teste_cameras.js` (as tasks seguintes acrescentam seções nele):

```js
#!/usr/bin/env node
// Testa as câmeras novas sem navegador (spec docs/superpowers/specs/2026-10-18-cameras-minigames-design.md).
// Uso: node tools/teste_cameras.js
const { rodada, aperta, solta, passo, segundos, gravador, textos, estilos, ok, fim } = require('./_harness.js');
// finge o 3D para os HUDs que só desenham com WebGL; project aceita o índice da vista e desloca para a faixa dela
function com3d(g, fn) {
  const u = g.uses3d, pr = TN.R3.project;
  g.uses3d = () => true;
  TN.R3.project = (x, y, z, vista = 0) => ({ x: 480 + (x - 480) * 0.8, y: (vista ? 262 : 34) + 100 + (z - 270) * 0.3, visible: true });
  try { return fn(); } finally { g.uses3d = u; TN.R3.project = pr; }
}

// --- motor: validador de viewports ---
function secaoMotor() {
  const base = { def: { draw3d() {} }, time: 0, _particles: [], _shake: 0 };
  ok(TN.R3.validate(base).length === 0, 'motor: sem viewports o validador não reclama');
  const bom = { ...base, def: { draw3d() {}, viewports: () => [{ rect: [0, 34, 960, 228], camera: { pos: [0, 1, 2], target: [3, 4, 5], fov: 40 } }, { rect: [0, 262, 960, 278], camera: { pos: [0, 1, 2], target: [3, 4, 5], fov: 40 } }] } };
  ok(TN.R3.validate(bom).length === 0, 'motor: duas vistas bem formadas passam');
  const ruins = [
    ['não é lista', () => ({ rect: [0, 0, 1, 1] })],
    ['rect curto', () => [{ rect: [0, 0, 1], camera: { pos: [0, 0, 0], target: [0, 0, 0] } }]],
    ['pos NaN', () => [{ rect: [0, 0, 1, 1], camera: { pos: [NaN, 0, 0], target: [0, 0, 0] } }]],
    ['sem camera', () => [{ rect: [0, 0, 1, 1] }]],
  ];
  for (const [nome, vp] of ruins) {
    const errs = TN.R3.validate({ ...base, def: { draw3d() {}, viewports: vp } });
    ok(errs.length === 1 && /^viewports:/.test(errs[0]), `motor: viewports ${nome} → 1 erro "viewports: ..." (${errs[0]})`);
  }
  // o validador aceita o índice da vista em project/unproject
  const tr = TN.R3.trace((r) => { r.project(1, 2, 3, 1); r.unproject(1, 2, 0, 1); });
  ok(tr.errs.length === 0, 'motor: r.project/r.unproject aceitam o índice da vista');
}

fim([secaoMotor]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_cameras.js`
Expected: `✗ motor: viewports não é lista → 1 erro` (e os outros três `ruins`; hoje `validate` ignora `viewports`).

- [ ] **Step 3: Implementar no `engine/render3d.js`**

- `makeValidator`: `api.project = (x, y, z, vista = 0) => ({ x: 0, y: 0, visible: true })`; `api.unproject = (sx, sy, py = 0, vista = 0) => ...`.
- Função `conferirViewports(def, round)` (módulo, usada pelo validador e pelo backend): se `def.viewports` existe, chama `def.viewports(round)`; devolve `{ vistas, erro }` com `erro` = `'viewports: deve devolver uma lista com ao menos 1 vista'`, `'viewports: vista N sem rect [x, y, w, h] finito'`, `'viewports: vista N sem camera.pos/target de 3 números'` ou `'viewports: vista N com fov inválido'`. `validate` empurra o erro em `errs`.
- Backend: `let vistaCams = [], vistasAtuais = null;` `camParaVista(i, v)`: cria/reaproveita `vistaCams[i] = new THREE.PerspectiveCamera(v.camera.fov || 38, v.rect[2] / v.rect[3], 5, 6000)`, aplica `pos`/`lookAt`, `fov`, `updateProjectionMatrix`.
- `renderRound`: depois de `def.draw3d(round, api)` e de esconder o que não foi usado:
  - `vistasAtuais = def.viewports ? conferirViewports(def, round).vistas : null` (erro → `console.warn` uma vez e segue com uma vista).
  - Sem vistas: caminho de hoje.
  - Com vistas: `const tam = rt ? { w: RW, h: RH } : renderer.getDrawingBufferSize(new THREE.Vector2())`, `sx = tam.w / TN.W`, `sy = tam.h / TN.H`; `renderer.setScissorTest(true)`; para cada vista `i`: câmera `camParaVista(i, v)` (+ tremor como hoje), `px = round(rect[0]*sx)`, `py = round(tam.h - (rect[1] + rect[3]) * sy)`, `pw = round(rect[2]*sx)`, `ph = round(rect[3]*sy)`; `setViewport(px, py, pw, ph)`; `setScissor(px, py, pw, ph)`; `setRenderTarget(rt || null)`; `render(scene, cam)`. Depois: `setScissorTest(false)`; `setViewport(0, 0, tam.w, tam.h)`; se `rt`: `setRenderTarget(null); render(postScene, postCam)` (o pós-processo cobre o canvas inteiro com o `rt` já composto).
  - Rótulos: para cada `l` e cada vista `i`: `s = project(l.x, l.y, l.z, i)`; se `s.visible` e `s` dentro do `rect` (com folga de 20 px em x e 10 em y): `c.save(); c.beginPath(); c.rect(...rect); c.clip(); TN.draw.text(...); c.restore()`. Sem vistas, como hoje.
- `project(x, y, z, vista = 0)`: câmera = `vistasAtuais ? vistaCams[vista] : camera`; `rect = vistasAtuais ? vistasAtuais[vista].rect : [0, 0, TN.W, TN.H]`; `x = rect[0] + (ndc.x + 1) / 2 * rect[2]`, `y = rect[1] + (1 - ndc.y) / 2 * rect[3]`. `unproject(sx, sy, planeY = 0, vista = 0)`: o inverso (NDC a partir do `rect`), mesma câmera.
- Exports: `project: (x, y, z, v) => project(x, y, z, v)`, `unproject: (sx, sy, py, v) => unproject(sx, sy, py, v)`.
- `tools/simular.js`: nas duas chamadas de `TN.R3.validate` (l.80 e l.90) nada muda (o `validate` já confere `viewports`); confira que a mensagem "draw3d: viewports: ..." aparece quando o formato é inválido (teste manual: não precisa de código).

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_cameras.js && node tools/simular.js && node tools/teste_cenarios.js`
Expected: `Tudo certo.` em cada um.

- [ ] **Step 5: Teste de render (Chrome)** — em `tools/teste_render.js`, antes do bloco "tempo médio de quadro":

```js
  // viewports: a mesma cena em duas vistas lado a lado; cada metade mostra outra coisa, é determinística e não custa mais que 1,5×
  try {
    const metade = (x0) => {   // FNV-1a só da faixa horizontal [x0, x0 + metade)
      const t = document.createElement('canvas'); t.width = c3.width; t.height = c3.height;
      const x = t.getContext('2d'); x.drawImage(c3, 0, 0);
      const w = Math.floor(t.width / 2), d = x.getImageData(x0 * w, 0, w, t.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619); }
      return h >>> 0;
    };
    const cena = (g, r) => { r.room(40, 20, 920, 520); r.box(200, 0, 300, 60, 60, 60, '#ff2020', { glow: true }); r.box(760, 0, 300, 60, 60, 60, '#2020ff', { glow: true }); };
    const duas = () => [
      { rect: [0, 0, 480, 540], camera: { pos: [200, 300, 700], target: [200, 0, 300], fov: 40 } },
      { rect: [480, 0, 480, 540], camera: { pos: [760, 300, 700], target: [760, 0, 300], fov: 40 } },
    ];
    const rodadaV = (time) => ({ def: { draw3d: cena, viewports: duas }, time, _particles: [], _shake: 0 });
    TN.R3.renderRound(rodadaV(1), ctx); const e1 = metade(0), d1 = metade(1);
    TN.R3.renderRound(rodadaV(1), ctx); const e2 = metade(0), d2 = metade(1);
    ok(e1 !== d1, 'viewports: as duas metades mostram coisas diferentes');
    ok(e1 === e2 && d1 === d2, 'viewports: determinístico (mesmo time = mesmos pixels nas duas vistas)');
    const s = TN.R3.project(760, 0, 300, 1);
    ok(s.x >= 480 && s.x <= 960 && s.visible, `viewports: project(..., 1) cai dentro do rect da vista 1 (x ${s.x.toFixed(0)})`);
    const s0 = TN.R3.project(200, 0, 300, 0);
    ok(s0.x >= 0 && s0.x < 480, `viewports: project(..., 0) cai na vista 0 (x ${s0.x.toFixed(0)})`);
    const u = TN.R3.unproject(s.x, s.y, 0, 1);
    ok(Math.abs(u.x - 760) < 2 && Math.abs(u.z - 300) < 2, 'viewports: unproject desfaz o project na vista 1');
    const rodada1 = (time) => ({ def: { draw3d: cena, camera: duas()[0].camera }, time, _particles: [], _shake: 0 });
    for (let i = 0; i < 5; i++) { TN.R3.renderRound(rodada1(i / 60), ctx); TN.R3.renderRound(rodadaV(i / 60), ctx); }
    hash();
    let t0 = performance.now(); for (let i = 0; i < 30; i++) TN.R3.renderRound(rodada1(i / 60), ctx); hash(); const t1v = (performance.now() - t0) / 30;
    t0 = performance.now(); for (let i = 0; i < 30; i++) TN.R3.renderRound(rodadaV(i / 60), ctx); hash(); const t2v = (performance.now() - t0) / 30;
    ok(t2v <= t1v * 1.5 + 2, `viewports: duas vistas custam ${t2v.toFixed(1)} ms contra ${t1v.toFixed(1)} ms de uma (teto 1,5× + 2 ms)`);
    TN.R3.renderRound(rodada1(1), ctx);   // volta ao modo de uma vista para os blocos seguintes
  } catch (e) { ok(false, 'viewports: exceção ' + e.message); }
```

- [ ] **Step 6: Rodar o render**

Run: `bash tools/teste_render.sh`
Expected: as linhas `✓ viewports: ...` nos dois visuais e `Tudo certo.` (o retrô passa pelo `rt`: se a metade direita sair vazia, o scissor não foi escalado por `RW/TN.W`).

- [ ] **Step 7: Documentar** em `docs/COMO_CRIAR_MINIGAME.md`: na seção da câmera (l.120), um parágrafo "Várias vistas": `viewports(g)`, formato, `rect` em coordenadas virtuais, aspecto por vista, rótulos recortados por vista, `TN.R3.project(x, y, z, vista)`/`unproject(..., vista)`, moldura por conta do `drawOverlay`, validado pelo `simular.js`. Na tabela da API, a linha de `r.project`/`r.unproject` ganha o 4º argumento.

- [ ] **Step 8: Commit**

```bash
git add engine/render3d.js tools/teste_cameras.js tools/teste_render.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Motor: viewports (várias vistas da mesma cena, project/unproject por vista, validador)"
```

---

### Task 2: Pisa Leve: pelas costas, com cães

**Arquivos:**
- Modificar: `minigames/pisa_leve.js` (cabeçalho, `brief`, constantes l.19–28, `init` l.35, `update` l.108–118 e 143–148, `bot` l.166, `camera`/`env` l.210–211, `draw3d` l.213–300, `drawHarvester3d` → `drawCaes3d`, `drawOverlay`, `draw` 2D)
- Modificar: `engine/audio.js` (som `latido`, ao lado de `cough` l.50; lista do cabeçalho l.2), `docs/COMO_CRIAR_MINIGAME.md` (lista de sons, se houver)
- Teste: `tools/teste_cameras.js` (`secaoPisaLeve`)

**Interfaces:**
- Produz: `d.caes = { x, on, latidoT }` (substitui `d.harv`); constantes `CAES_DELAY = 5`, `CAES_V0 = 16`, `CAES_V1 = 56`, `CAES_PERTO = 80`, `REVEAL = 1.4`; `p.data.mordido` (true em quem os cães pegaram); `gapCaes(g, p)` → distância em x entre `p` e a matilha (999 se não soltos); `drawCaes3d(g, r)` desenha só os dois cães sobre cada `mordido`; `camera` com `pos[0] < d.startX` e `target[0] > pos[0]`.

- [ ] **Step 1: Teste**

```js
// --- pisa leve: câmera pelas costas e cães de guarda ---
function secaoPisaLeve() {
  const def = TN.minigames.pisa_leve;
  ok(def.REVEAL === 1.4 && def.CAES_DELAY === 5 && def.CAES_V0 === 16 && def.CAES_V1 === 56 && def.CAES_PERTO === 80 && !def.drawHarvester3d, 'pisa leve: REVEAL 1,4 s, cães com a curva da colheitadeira, sem colheitadeira');
  ok(/cães/i.test(def.brief.join(' ')) && !/colheitadeira/i.test(def.brief.join(' ')), 'pisa leve: o briefing fala dos cães');
  const g = rodada('pisa_leve'), d = g.data, P = g.players;
  ok(def.camera.pos[0] < d.startX && def.camera.target[0] > def.camera.pos[0] && def.camera.pos[1] < 300, 'pisa leve: câmera atrás da largada, baixa, olhando para a van');
  ok(d.caes && !d.caes.on && d.harv === undefined, 'pisa leve: a matilha começa presa; não há mais colheitadeira');
  const sons = {}; g.sfx = (n) => { sons[n] = (sons[n] || 0) + 1; };
  segundos(g, def.CAES_DELAY + 0.1);
  ok(d.caes.on && g._message && /CÃES/.test(g._message.text), `pisa leve: aos 5 s soltam os cães (${g._message && g._message.text})`);
  // latidos: mais frequentes quando a matilha está perto
  for (const p of P) { p.x = d.caes.x + 400; p.y = 275; }
  sons.latido = 0; segundos(g, 3); const longe = sons.latido;
  for (const p of P) { p.x = d.caes.x + 90; p.y = 275; }
  sons.latido = 0; segundos(g, 3); const perto = sons.latido;
  ok(longe >= 1 && perto > longe, `pisa leve: latidos aumentam ao se aproximar (longe ${longe}, perto ${perto} em 3 s)`);
  // a vinheta vermelha pulsa só com um cão a menos de 80 px de alguém
  for (const p of P) p.x = d.caes.x + 200;
  const semVinheta = com3d(g, () => estilos((c) => def.drawOverlay(g, c))).some((s) => /rgba\(255,\s*(0|2\d|3\d|4\d),/.test(String(s)));
  P[0].x = d.caes.x + 60;
  const comVinheta = com3d(g, () => estilos((c) => def.drawOverlay(g, c))).some((s) => /rgba\(255,\s*(0|2\d|3\d|4\d),/.test(String(s)));
  ok(!semVinheta && comVinheta, 'pisa leve: vinheta vermelha só com cão a menos de 80 px');
  // mordida: mata no contato e marca `mordido`; a matilha estoura as minas por onde passa
  const m = d.mines.find((k) => !k.dead); m.x = d.caes.x - 10; m.y = 275;
  P[1].x = d.caes.x - 2; P[1].y = 275;
  passo(g);
  ok(!P[1].alive && P[1].data.mordido === true && m.dead, `pisa leve: cão pega quem fica para trás e estoura as minas atrás (vivo ${P[1].alive}, mina ${m.dead})`);
  // 3D: a matilha não é desenhada; os cães aparecem só sobre quem foi mordido
  const antes = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  P[1].data.mordido = false;
  const depois = TN.R3.trace((r) => def.drawCaes3d(g, r)).counts.box || 0;
  ok(antes >= 2 && depois === 0, `pisa leve: cães só em cima do mordido (${antes} caixas com mordido, ${depois} sem)`);
  ok(TN.R3.trace((r) => def.draw3d(g, r)).errs.length === 0, 'pisa leve: draw3d passa no validador');
  const t2 = textos((c) => def.draw(g, c));
  ok(!/COLHEITADEIRA/i.test(t2), 'pisa leve: 2D sem colheitadeira');
}
```

Acrescente `secaoPisaLeve` ao `fim([...])`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_cameras.js`
Expected: `✗ pisa leve: REVEAL 1,4 s, cães ...` e `✗ pisa leve: a matilha começa presa`.

- [ ] **Step 3: Implementar**

- `engine/audio.js`: `latido: () => { tone({ type: 'sawtooth', f: 420, f2: 180, dur: 0.09, vol: 0.28 }); noise({ dur: 0.08, vol: 0.18, filter: 900, delay: 0.02 }); }`; acrescente `latido` à lista do cabeçalho.
- `pisa_leve.js`:
  - Constantes: trocar `HARV_DELAY/HARV_V0/HARV_V1/HARV_W` por `CAES_DELAY: 5, CAES_V0: 16, CAES_V1: 56, CAES_PERTO: 80, LATIDO_LONGE: 1.6, LATIDO_PERTO: 0.35`; `REVEAL: 1.4`.
  - `init`: `d.caes = { x: a.x - 30, on: false, latidoT: 1 }`.
  - `gapCaes(g, p)`: `d.caes.on ? p.x - d.caes.x : 999`.
  - `update`: a matilha anda como a colheitadeira (mesmo `prog`, mesmas velocidades), estoura as minas com `m.x < caes.x + 6` (fumaça + `sfx('hit')`), mata com `p.x - p.r * 0.6 < caes.x` → `p.data.mordido = true; g.eliminate(p, { sound: 'hurt', msg: 'MORDIDO!' })`. Latidos: `d.caes.latidoT -= dt`; ao zerar, `g.sfx('latido')` e `latidoT = U.lerp(LATIDO_PERTO, LATIDO_LONGE, U.clamp(menorGap / 400, 0, 1))` com `menorGap` = menor `gapCaes` entre os ativos (sem ativos: `LATIDO_LONGE`). Mensagem aos 5 s: `'SOLTARAM OS CÃES!'` (sfx `latido` 2×, `buzz`).
  - `bot`: `harvGap` → `this.gapCaes(g, p)`.
  - `camera: { pos: [-190, 230, 275], target: [460, 0, 275], fov: 48 }` (260 atrás da largada, que fica em x=70); `env.fog: [1400, 2600]`.
  - `draw3d`: tira a colheitadeira; o `r.yard` passa a cobrir de `a.x - 320` a `a.x + a.w + 160` (a câmera fica dentro do pátio); muro alto e holofotes nas laterais (dois `r.cyl` de poste com `r.light` quente a cada 300 em x nas duas cercas); portão/van ao fundo como hoje. Vista pelas costas: `p.dir` já é 0 (olhando +x). Chama `drawCaes3d(g, r)`.
  - `drawCaes3d(g, r)`: para cada jogador `mordido`: dois `r.box` pretos baixos (24×12×12) sobre o corpo, com `r.sphere` vermelha de olhos (glow) e um `r.box` de cauda; nada da matilha em si.
  - `drawOverlay`: vidas como hoje; vinheta: se algum ativo tem `gapCaes < CAES_PERTO`, `c.fillStyle = 'rgba(255,30,30,' + (0.22 + 0.18 * Math.sin(g.time * 14)) + ')'` em gradiente radial transparente no centro (`createRadialGradient` → parar de usar `estilos` nesse caso; use `c.fillStyle = 'rgba(255,30,30,0.3)'` nas bordas com 4 retângulos de 60 px, que é o que o teste vê); texto "CÃES!" pulsando embaixo.
  - 2D `draw`: no lugar de `drawHarvester`, `drawCaes2d`: 5 elipses pretas com olhos em `caes.x`, espalhadas em y; cães sobre o mordido.
  - Textos: brief `['Atravesse o campo minado até a van.', 'Segure AÇÃO para o sonar revelar as minas.', 'A coleira fica vermelha perto de uma mina.', 'Em 5 s soltam os cães. Não olhe para trás.']`; cabeçalho do arquivo.
- `grep -n "harv\|HARV" minigames/pisa_leve.js tools/*.js` tem de voltar vazio.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_cameras.js && node tools/simular.js pisa_leve --vezes 3 && node tools/simular.js pisa_leve --parado && node tools/teste_ajustes.js`

- [ ] **Step 5: Screenshot de conferência** (servidor em 8765): `bash tools/screenshot.sh pisa_leve 12 /Users/caravieri/.claude/jobs/a5c5acd8/tmp/pl.png` — van ao fundo, 4 detentos de costas, minas reveladas legíveis. Ajuste `camera`/`fov` até caber.

- [ ] **Step 6: Commit**

```bash
git add minigames/pisa_leve.js engine/audio.js tools/teste_cameras.js docs/COMO_CRIAR_MINIGAME.md
git commit -m "Pisa leve: câmera pelas costas, cães de guarda invisíveis (latidos e vinheta) e mina revelada por 1,4 s"
```

---

### Task 3: Hora do Trem: câmera de frente, eixos transpostos

**Arquivos:**
- Modificar: `minigames/hora_do_trem.js` (tudo que mexe em eixos: `init`, `nookOf`, `isSafeIn`, `update`, `shove`, `resolveWalls`, `bot`, `pickNook`, `camera`, `draw3d`, `drawNook3d`, `drawTrain3d`, `drawOverlay`, `draw`)
- Modificar: `tools/teste_ajustes.js:203–225` (`secaoTrem` transposta)
- Teste: `tools/teste_cameras.js` (`secaoTrem`)

**Interfaces:**
- Produz: constantes `Y0 = -200`, `Y1 = 540` (eixo do túnel, em y), `HALF = 150` (meia largura do chão); `d.floorL = 330`, `d.floorR = 630`; nichos `{ side: -1|1, cy, w, state }` (side −1 = parede esquerda, 1 = direita); `d.train = { front }` com `front` em y crescendo (vem do fundo, `Y0 - 200`, para a câmera); `d.saida = { front }|null` (o trem continua visível depois de passar, até `front - TRAIN_LEN > 1100`); `bounds(g)` → `{ x: floorL - NOOK_D, y: Y0, w: 2*HALF + 2*NOOK_D, h: Y1 - Y0 }`.

- [ ] **Step 1: Teste** (em `teste_cameras.js`)

```js
// --- hora do trem: trem vindo do fundo, nichos nas paredes laterais ---
function secaoTrem() {
  const def = TN.minigames.hora_do_trem;
  ok(def.Y0 === -200 && def.Y1 === 540 && def.HALF === 150, 'trem: túnel em y de -200 a 540, 150 de meia largura');
  ok(def.camera.pos[2] > def.Y1 && def.camera.target[2] < def.camera.pos[2] && Math.abs(def.camera.pos[0] - 480) < 1, 'trem: câmera atrás do fim do túnel, olhando para o fundo');
  const g = rodada('hora_do_trem'), d = g.data, P = g.players;
  ok(d.floorL === 330 && d.floorR === 630 && d.nooks.length === 12 && d.nooks.filter((n) => n.side < 0).length === 6, 'trem: paredes em x=330/630, 6 nichos de cada lado');
  const cys = d.nooks.map((n) => n.cy);
  ok(Math.min(...cys) > def.Y0 && Math.max(...cys) < def.Y1 && Math.max(...cys) - Math.min(...cys) > 500, 'trem: nichos distribuídos em profundidade');
  ok(P.every((p) => p.x > d.floorL && p.x < d.floorR && p.y > def.Y0 && p.y < def.Y1), 'trem: todos começam no chão do túnel');
  // nookOf / isSafeIn nas paredes laterais
  const n = d.nooks.find((k) => k.side < 0), p = P[0];
  p.x = d.floorL - 20; p.y = n.cy;
  ok(def.nookOf(g, p) === n && def.isSafeIn(g, p, n), 'trem: dentro do nicho da esquerda, fundo o bastante');
  p.x = d.floorL + 30;
  ok(def.nookOf(g, p) === null, 'trem: no chão não está em nicho');
  // parede: empurrando para a esquerda fora de um nicho, fica no chão
  p.x = d.floorL + p.r + 1; p.y = (d.nooks[0].cy + d.nooks[2].cy) / 2;   // entre dois nichos da esquerda (56 px de cada centro, fora das colunas de 54)
  aperta(0, { x: -1 }); passo(g, 1 / 60, 30); solta();
  ok(p.x >= d.floorL + p.r - 0.5, `trem: a parede segura quem empurra fora do nicho (x ${p.x.toFixed(1)})`);
  // trem: pega quem está no chão dentro do comboio e poupa quem está num nicho aberto
  const h = rodada('hora_do_trem'), e = h.data, Q = h.players;
  const aberto = e.nooks.find((k) => k.side > 0); aberto.state = 'open';
  Q[0].x = 480; Q[0].y = 300; Q[1].x = e.floorR + 20; Q[1].y = aberto.cy; Q[2].x = 480; Q[2].y = 500; Q[3].x = 400; Q[3].y = 500;   // Q2/Q3 à frente do trem (front 320)
  e.phase = 'warn'; e.phaseT = 1.5; e.opened = true; e.train = { front: 320 };
  passo(h);
  ok(!Q[0].alive && Q[1].alive && Q[2].alive && Q[3].alive, `trem: atropela no chão (Q0 ${Q[0].alive}), poupa o nicho aberto (Q1 ${Q[1].alive}) e quem está à frente do comboio (Q2 ${Q[2].alive})`);
  // o trem some da lógica ao passar do fim e continua visível (d.saida) até sair de trás da câmera
  e.train.front = def.Y1 + def.TRAIN_LEN + 30; passo(h);
  ok(!e.train && e.saida && e.phase === 'closing', 'trem: passou → fase closing e sobra só o comboio visual');
  segundos(h, 1.6);
  ok(!e.saida, 'trem: o comboio visual some depois de passar da câmera');
  ok(TN.R3.trace((r) => def.draw3d(h, r)).errs.length === 0, 'trem: draw3d passa no validador');
  const t3 = com3d(h, () => textos((c) => def.drawOverlay(h, c)));
  ok(/NICHOS ABERTOS|PRÓXIMO TREM/.test(t3), `trem: overlay mostra o estado (${t3.slice(0, 40)})`);
}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_cameras.js`
Expected: `✗ trem: túnel em y de -200 a 540 ...`.

- [ ] **Step 3: Implementar** (troca mecânica de eixos; regras iguais)

- Constantes: `Y0: -200, Y1: 540, HALF: 150` (o `WALL` sai); `bounds(g)` conforme a interface.
- `init`: `d.floorL = 480 - HALF; d.floorR = 480 + HALF`; nichos: `step = (Y1 - Y0 - 120) / 6`, `cy = Y0 + 60 + step * (i + 0.5) ∓ 18` (esquerda −18, direita +18); `g.placeInCircle(480, 330, 90)`; `d.saida = null`.
- `nookOf`: `|p.y - n.cy| > n.w/2` pula; `side < 0 ? p.x < floorL + p.r - 2 : p.x > floorR - p.r + 2`. `isSafeIn`: `side < 0 ? p.x + p.r <= floorL + 6 : p.x - p.r >= floorR - 6`.
- `update`: trem entra com `d.train = { front: Y0 - 200 }` quando `phaseT >= TRAIN_ENTER - 240 / TRAIN_V`; passa quando `front - TRAIN_LEN > Y1 + 20` → `d.saida = { front }`, `d.train = null`, fase `closing`; `d.saida.front += TRAIN_V * dt` e some quando `front - TRAIN_LEN > 1100`. Fechamento cospe em x: `p.x = side < 0 ? floorL + p.r + 2 : floorR - p.r - 2; p.vy = 0; p.vx = -side * 320`. Mortes: nicho fechado `side < 0 ? p.x < floorL - 2 : p.x > floorR + 2`; trem `p.y + p.r > front - TRAIN_LEN && p.y - p.r < front`. `movePlayer(p, v, dt, this.bounds(g))`.
- `shove`: em nicho, `o.vy = 0; o.vx = -n.side * SHOVE`.
- `resolveWalls`: `wallX`, `pen` em x, `pushing` por `p.input.x`, funil aproxima `p.y` de `n.cy`, clamp de `p.y` dentro do nicho.
- `bot`/`pickNook`: `midX = 480`; `trainPassed = t && t.front - TRAIN_LEN > p.y + 30`; afundar: `{ x: cur.side, y: (cur.cy - p.y) / 10 }`; `mouthX`/`deepX` em x; sem nicho: `{ x: (midX - p.x) / 100, y: 1 }` (foge do trem, que vem do fundo); espera: `tx = 480 + b.noise.y * 70, ty = 260 + b.noise.x * 180`; `pickNook`: `dist = |p.y - n.cy| + |p.x - mouthX|`, `trainT = (n.cy - front) / TRAIN_V` ou `TRAIN_ENTER - phaseT + (n.cy - Y0) / TRAIN_V`.
- `camera: { pos: [480, 150, 1000], target: [480, 50, 100], fov: 45 }`; `env` como hoje.
- `draw3d`: chão de cascalho de `Y0 - 700` a `1200`; trilhos em `x = 480 ± 55` (dormentes em y a cada 34); paredes laterais altas (160) de tijolo de `x = floorL - NOOK_D - 60` a `floorL` (e simétrica) com segmentos entre os nichos em y; teto escuro; boca do túnel ao fundo (`r.box` preto em `y = Y0 - 60`); lâmpadas de aviso nas paredes entre os nichos; `drawNook3d` com `(mid, n.cy)`; farol antes de o trem aparecer: luz em `[480, 50, Y0 - 100 + 300 * k]` crescendo com `k = phaseT / TRAIN_ENTER` durante `warn`; `drawTrain3d(front)`: dois comboios em `x = 480 ± 72` (largura 130), vagões de `front - TRAIN_LEN` a `front - 90`, cabine na frente (y maior) com para-brisa virado para a câmera, faróis, facho `r.plane` à frente; desenha `d.train` e `d.saida`.
- `drawOverlay`: aviso '▼ TREM' projetado em `(480, 0, Y0 + 60)`; painel de baixo igual.
- `draw` 2D: `c.save(); c.translate(0, 34); c.scale(1, 506 / (Y1 - Y0)); c.translate(0, -Y0);` e desenha em coordenadas do mundo: paredes verticais em `floorL/floorR`, nichos, trilhos verticais, trem de cima para baixo; jogadores com `g.drawPlayer`; `c.restore()` antes do painel de texto.
- `tools/teste_ajustes.js` `secaoTrem`: `v.x = lado < 0 ? d.floorL - 20 : d.floorR + 20; v.y = n.cy`; `a.y = n.cy + 30; a.x = lado < 0 ? d.floorL + 10 : d.floorR - 10`; a asserção do empurrão vira `Math.abs(v.vy) < 1 && Math.sign(v.vx) === -lado && Math.abs(v.vx) > 300`; os teleportes de volta usam `v.x`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_cameras.js && node tools/teste_ajustes.js && node tools/simular.js hora_do_trem --vezes 3 && node tools/simular.js hora_do_trem --parado`

- [ ] **Step 5: Screenshots**: `bash tools/screenshot.sh hora_do_trem 7 .../ht1.png` (trem no fundo, faróis), `... 9 .../ht2.png` (trem no meio), `... 10 .../ht3.png` (passando). Ajuste só câmera/fov e tamanhos do cenário.

- [ ] **Step 6: Commit**

```bash
git add minigames/hora_do_trem.js tools/teste_cameras.js tools/teste_ajustes.js
git commit -m "Hora do trem: câmera de frente, trem vindo do fundo e nichos nas paredes laterais"
```

---

### Task 4: Temporada de Caça: regras, bots, duas vistas e 2D

**Arquivos:**
- Reescrever: `minigames/temporada_de_caca.js` (lógica inteira; o `draw3d` novo fica para a Task 5 — nesta task o `draw3d` desenha só o pátio e os bonecos, sem erro no validador)
- Teste: `tools/teste_cameras.js` (`secaoTemporada`)

**Interfaces:**
- Produz: constantes `FIELD = { x0: 150, x1: 810 }`, `START_Y = 720`, `WALL_Y = 80`, `RUN_SPEED = 150`, `MERGULHO = 0.5`, `LASER = 0.5`, `RECARGA = 1.5`, `AIM_LOCK = 2`, `MAX_TIME = 40`, `AIM_SPEED = 300`, `ZOOM_SPEED = 110`, `ALVO_PE = { w: 32, h: 44 }`, `ALVO_AGACHADO = { w: 24, h: 24 }` (caixas no chão, centradas em `p.x, p.y`, em x × y); `d = { guardaId, mira: {x, y}, zoom, tiro: { t }|null, recarga, escapou (bool), firstOut, over, covers: [{ x, y, w, d, h, kind }] }`; `p.data` do fugitivo `{ out, baleado, baleadoT, escapou, mergulho, agachado }` (`baleadoT` = `g.time` do tiro, para a pose `hit`); `guarda(g)`, `fugitivos(g)`, `ativos(g)`; `protegido(g, p)` → agachado e atrás de uma cobertura (`|p.x - cv.x| <= cv.w/2 + 6 && cv.y - 50 < p.y < cv.y`); `alvoNaMira(g)` → fugitivo cuja caixa contém `d.mira` e não está protegido (o mais perto do muro primeiro), ou `null`; `travar(g)` (começa o laser), `disparar(g)`; `viewports(g)` → `[{ rect: [0, 34, 960, 228], camera: guarda }, { rect: [0, 262, 960, 278], camera: fugitivos }]`; câmera do guarda `pos [480, 260, 980]`, `target` = centro do campo `[480, 0, 400]` sem zoom e `[mira.x, 0, mira.y]` com zoom, `fov` 38 / 16; câmera dos fugitivos `pos [480, 110, 950]`, `target [480, 20, 250]`, `fov 44`.

- [ ] **Step 1: Teste**

```js
// --- temporada de caça: guarda em cima, fugitivos embaixo ---
function secaoTemporada() {
  const def = TN.minigames.temporada_de_caca;
  ok(def.LASER === 0.5 && def.RECARGA === 1.5 && def.AIM_LOCK === 2 && def.MAX_TIME === 40 && def.MERGULHO === 0.5 && def.rounds === 4 && def.fixedRounds === true && !def.screenSpace, 'temporada: constantes da spec, 4 rodadas fixas, coordenadas de mundo');
  ok(def.tagline === 'O guarda da torre tem uma bala para cada um.' && /muro/.test(def.brief[0]) && /EXTRA/.test(def.brief[1]) && /AÇÃO/.test(def.brief[2]), 'temporada: textos novos');
  const g = rodada('temporada_de_caca'), d = g.data, G = def.guarda(g), F = def.fugitivos(g);
  ok(G === g.players[0] && F.length === 3 && F.every((p) => p.y === def.START_Y && !p.data.out), 'temporada: rodada 1 → P1 é o guarda; fugitivos na largada');
  const vp = def.viewports(g);
  ok(vp.length === 2 && vp[0].rect[1] === 34 && vp[0].rect[3] === 228 && vp[1].rect[1] === 262 && vp[1].rect[1] + vp[1].rect[3] === 540 && TN.R3.validate(g).length === 0, 'temporada: duas vistas empilhadas (45 % / 55 %) válidas');
  ok(vp[0].camera.fov === 38 && (d.zoom = true, def.viewports(g)[0].camera.fov === 16) && (d.zoom = false, true), 'temporada: zoom fecha a luneta (fov 38 → 16)');
  // mira travada nos 2 s iniciais
  const m0 = { ...d.mira }; aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(d.mira.x === m0.x, 'temporada: mira travada na largada');
  segundos(g, def.AIM_LOCK); aperta(0, { x: 1 }); passo(g, 1 / 60, 10); solta();
  ok(d.mira.x > m0.x, 'temporada: depois de 2 s a mira anda');
  // laser 0,5 s antes do tiro; acerta quem está de pé na mira; recarga 1,5 s
  const alvo = F[0]; alvo.x = 480; alvo.y = 500; d.mira = { x: 482, y: 505 };
  aperta(0, { a: true }); passo(g); solta();
  ok(d.tiro && d.tiro.t > 0.45 && alvo.alive, 'temporada: AÇÃO acende o laser e ainda não atira');
  aperta(0, { x: 1 }); const mx = d.mira.x; passo(g); solta();
  ok(d.mira.x - mx > 0 && d.mira.x - mx < def.AIM_SPEED * 0.5 / 60 + 0.01, 'temporada: com o laser aceso a mira anda a 40 %');
  d.mira = { x: 482, y: 505 }; segundos(g, def.LASER);
  ok(!alvo.alive && alvo.data.baleado && G.score === 1 && !d.tiro && d.recarga > 1.3, `temporada: tiro sai depois de 0,5 s (vivo ${alvo.alive}, guarda ${G.score}, recarga ${d.recarga.toFixed(2)})`);
  aperta(0, { a: true }); passo(g); solta();
  ok(!d.tiro, 'temporada: AÇÃO na recarga não acende outro laser');
  segundos(g, def.RECARGA);
  // agachado atrás de cobertura: invisível; de pé atrás: alvo; agachado no aberto: caixa menor
  const cv = d.covers[0], f1 = F[1]; f1.x = cv.x; f1.y = cv.y - 20; d.mira = { x: f1.x, y: f1.y };
  f1.data.agachado = true;
  ok(def.protegido(g, f1) && def.alvoNaMira(g) === null, 'temporada: agachado atrás da cobertura não é alvo');
  f1.data.agachado = false;
  ok(!def.protegido(g, f1) && def.alvoNaMira(g) === f1, 'temporada: de pé atrás da cobertura ainda é alvo');
  f1.x = 300; f1.y = 400; f1.data.agachado = true; d.mira = { x: 300 + 14, y: 400 };
  ok(def.alvoNaMira(g) === null, 'temporada: agachado no aberto tem caixa menor (14 px ao lado escapa)');
  f1.data.agachado = false;
  ok(def.alvoNaMira(g) === f1, 'temporada: de pé, 14 px ao lado ainda acerta');
  // EXTRA: mergulho de 0,5 s sem andar
  aperta(2, { b: true, x: 1 }); passo(g, 1 / 60, 6); solta();   // f1 = F[1] = players[2] → dispositivo 2
  ok(f1.data.mergulho > 0 && f1.data.agachado && f1.x === 300, 'temporada: EXTRA mergulha (0,5 s parado)');
  // chegar ao muro: +1 e +1 para o primeiro; fim quando todos saíram
  const f2 = F[2]; f2.y = def.WALL_Y + 2; f1.data.mergulho = 0; f1.y = def.WALL_Y + 2;
  aperta(2, { y: -1 }); aperta(3, { y: -1 }); passo(g, 1 / 60, 10); solta();
  ok(f1.data.escapou && f2.data.escapou && f1.score + f2.score === 3, `temporada: dois escaparam, um deles com o bônus de primeiro (${f1.score} + ${f2.score})`);
  segundos(g, 2);
  ok(g.finished && G.score === 1, 'temporada: todos fora → acabou; guarda sem o bônus porque alguém escapou');
  // ninguém escapou → +1 para o guarda; e o relógio de 40 s encerra sozinho com humanos parados
  const h = rodada('temporada_de_caca'); segundos(h, def.MAX_TIME + 2);
  ok(h.finished && def.guarda(h).score === 1, 'temporada: 40 s com todos parados → acaba e o guarda ganha o bônus de ninguém ter escapado');
  // bots: em 6 rodadas alguém é baleado e alguém escapa
  let baleados = 0, escapados = 0;
  for (let r = 0; r < 6; r++) { const z = rodada('temporada_de_caca', { humanos: 0, rodadaN: 1 + (r % 4), total: 4 }); segundos(z, def.MAX_TIME + 2); ok(z.finished, `temporada: rodada ${r + 1} com bots termina`); for (const p of def.fugitivos(z)) { if (p.data.baleado) baleados++; if (p.data.escapou) escapados++; } }
  ok(baleados >= 1 && escapados >= 1, `temporada: bots → ${baleados} baleados e ${escapados} escapados em 6 rodadas`);
  // 3D e 2D passam; a mira só aparece na vista do guarda (overlay com vista 0)
  const z = rodada('temporada_de_caca', { humanos: 0 }); segundos(z, 3);
  ok(TN.R3.trace((r) => def.draw3d(z, r)).errs.length === 0, 'temporada: draw3d passa no validador');
  const t3 = com3d(z, () => textos((c) => def.drawOverlay(z, c)));
  ok(/GUARDA/.test(t3) && /MURO|EXTRA/.test(t3), `temporada: overlay tem o painel do guarda e a dica dos fugitivos`);
  ok(/GUARDA/.test(textos((c) => def.draw(z, c))), 'temporada: 2D desenha');
}
```

Confira a assinatura de `rodada(id, { humanos, rodadaN, total })` em `tools/_harness.js:29` (já existe).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_cameras.js`
Expected: `✗ temporada: constantes da spec ...`.

- [ ] **Step 3: Implementar** (reescrita; manter cabeçalho com `inspiredBy`, `icon`, `color`, `rounds: 4`, `fixedRounds`, `scoring: 'points'`, `endWhenOneLeft: false`, `controls: { move: 'andar / mirar', a: 'travar o tiro (guarda)', b: 'mergulhar (fugitivo) / zoom (guarda)' }`)

- Mundo: x lateral (`FIELD.x0..x1`), y = avanço: largada em `START_Y = 720` (perto da torre e das câmeras), muro em `WALL_Y = 80`. `init`: `d.guardaId = g.players[(g.round - 1) % g.playerCount].id`; fugitivos em `x = 300 + 180 * i` (3) ou `x = 240 + 160 * i` (4 jogadores → 3 fugitivos; use `F.length`), `y = START_Y`, `dir = -Math.PI / 2`; `p.data = { out: false, baleado: false, escapou: false, mergulho: 0, agachado: false }`; guarda `p.data = { guarda: true }`, `p.x/p.y` = mira (popups). Coberturas: 5 fileiras em `y = 600, 500, 400, 300, 200` com 2 por fileira em x sorteado (`U.rand(x0 + 60, x1 - 60)`, distância mínima 140 na fileira), `kind` entre `'caixote'` (w 70, d 40, h 60), `'barril'` (w 44, d 44, h 50), `'terra'` (w 96, d 50, h 36). `d.mira = { x: 480, y: 450 }; d.zoom = false; d.tiro = null; d.recarga = 0; d.escapou = false; d.firstOut = false; d.over = false`.
- `update`: guarda: `recarga -= dt`; `bPressed` alterna `zoom`; se `g.time >= AIM_LOCK`: mira anda a `(zoom ? ZOOM_SPEED : AIM_SPEED) * (tiro ? 0.4 : 1)`, presa em `[x0, x1] × [WALL_Y - 20, START_Y + 40]`; `aPressed && !tiro && recarga <= 0` → `travar(g)` (`d.tiro = { t: LASER }`, sfx `laser`); `tiro.t -= dt`, ao zerar `disparar(g)`: `alvo = alvoNaMira(g)`; acertou → `alvo.data.out = alvo.data.baleado = true; alvo.data.baleadoT = g.time; g.eliminate(alvo, { sound: 'shoot', msg: 'BALEADO!' }); g.addScore(guarda, 1)`; errou → `sfx('shoot')`, partículas na mira; `d.recarga = RECARGA; d.tiro = null`. Fugitivos ativos: `mergulho -= dt`; `bPressed && mergulho <= 0 → mergulho = MERGULHO`; `agachado = mergulho > 0 || !!p.input.b`; se agachado, parado (`movePlayer(p, 0, dt)` com input zerado), senão `movePlayer(p, RUN_SPEED, dt, bounds)` com `bounds = { x: x0, y: WALL_Y - 10, w: x1 - x0, h: START_Y + 40 - WALL_Y + 10 }`; coberturas bloqueiam pela pegada (`circleRect` no retângulo `{ x: cv.x - w/2, y: cv.y - d/2, w, h: d }`, mesma técnica de hoje); `p.y <= WALL_Y` → `escapou = out = true`, `+1` (+1 extra e popup 'PRIMEIRO! +2' para o primeiro), `d.escapou = true`. Fim: sem ativos ou `g.time >= MAX_TIME` → `endRound` (`+1` guarda se `!d.escapou`, mensagem 'NINGUÉM ESCAPOU. +1 GUARDA') e `g.finish(1.5)`.
- `alvoNaMira(g)`: entre os ativos não `protegido`, caixa `ALVO_AGACHADO` se agachado senão `ALVO_PE`, centrada em `(p.x, p.y)`; devolve o de menor `y`.
- Bots: guarda bot (`guardaBot`): a cada 0,6–1,2 s escolhe o ativo mais exposto (não protegido; empate → menor `y`); mira para `alvo + erro` (`erro` sorteado em `U.rand(-22, 22)` por alvo, ×0,4 com zoom); zoom quando a distância da mira ao alvo < 60; ao ficar a < 12 do alvo, espera `bAtraso = U.rand(0.3, 0.8)` e aperta `a`; nunca mira em protegido. Fugitivo bot (`fugitivoBot`): alvo = próxima cobertura com `cv.y < p.y - 40` e `|cv.x - p.x| < 220` (senão o muro em `x` atual); chegou (dist < 14) → `b` por `U.rand(0.3, 1.2)` e troca de alvo; se `d.tiro` e `dist(mira, p) < 40`: com cobertura a < 30, `b`; senão inverte o sinal de `x` por 0,4 s; zigue-zague leve em campo aberto.
- `viewports(g)` conforme a interface; `camera` do `def` = a dos fugitivos (fallback).
- `draw3d` provisório: `r.yard` do pátio à noite (muro ao fundo em `y = WALL_Y - 40`, holofote varrendo: `r.plane` claro de 220×900 girando com `g.time`), coberturas como caixas simples, bonecos com `dir`, `pose` (`crouch` se agachado, `hit`/`dead` por `baleado`), o ponto do laser (`r.sphere` vermelha glow em `(mira.x, 2, mira.y)` + `r.ring`) só com `d.tiro`. Sem `screenSpace`.
- `drawOverlay`: faixa escura `c.fillRect(0, 258, 960, 4)`; vista do guarda (`project(..., 0)`): retículo na mira (sem zoom) ou no centro da vista (com zoom) com vinheta de luneta recortada ao `rect` 0; painel `CAÇADOR ${label}` → `GUARDA ${label}` com estado (`MIRA EM N`, `LASER`, `RECARGA`, `ZOOM`, `PRONTO`); vista dos fugitivos: dica `'EXTRA = MERGULHAR · CHEGUE AO MURO'` discreta no rodapé e o relógio.
- `draw` 2D: campo de cima (x lateral, y avanço com `c.scale` para caber em 34..540), coberturas, fugitivos (`g.drawPlayer`), ponto do laser e retículo; painel do guarda.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_cameras.js && node tools/simular.js temporada_de_caca --vezes 3 && node tools/simular.js temporada_de_caca --parado && node tools/simular.js --sessao 2>&1 | tail -1`
Expected: `Tudo certo.` em todos e, no `--vezes 3`, "compatível com rede · 3D ok".

- [ ] **Step 5: Commit**

```bash
git add minigames/temporada_de_caca.js tools/teste_cameras.js
git commit -m "Temporada de caça: refeita — guarda na torre com laser de 0,5 s, fugitivos até o muro, duas vistas"
```

---

### Task 5: Temporada de Caça: as duas vistas em 3D

**Arquivos:**
- Modificar: `minigames/temporada_de_caca.js` (`draw3d`, `drawCobertura3d`, `drawOverlay` da vista do guarda)

**Interfaces:**
- Consome: `viewports(g)`, `d.mira`, `d.tiro`, `d.zoom`, `covers`, `protegido` da Task 4; `TN.R3.project(x, y, z, vista)` da Task 1.

- [ ] **Step 1: Teste** (acrescente ao fim de `secaoTemporada`)

```js
  // 3D: coberturas de 3 tipos, ponto do laser só com tiro, torre atrás das câmeras
  const tr0 = TN.R3.trace((r) => def.draw3d(z, r));
  z.data.tiro = { t: 0.4 };
  const tr1 = TN.R3.trace((r) => def.draw3d(z, r));
  ok((tr1.counts.sphere || 0) > (tr0.counts.sphere || 0), 'temporada 3D: o ponto do laser só aparece com o tiro travado');
  ok(z.data.covers.every((cv) => ['caixote', 'barril', 'terra'].includes(cv.kind)), 'temporada 3D: coberturas são caixote, barril ou monte de terra');
  const torre = tr1.calls.find(([k, a]) => k === 'character' && a[1] && a[1].key === 'guarda');
  ok(torre && torre[1][0].y > def.viewports(z)[0].camera.pos[2], 'temporada 3D: o guarda fica na torre atrás das duas câmeras (fora de vista)');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node tools/teste_cameras.js`
Expected: `✗ temporada 3D: o guarda fica na torre ...` (o `draw3d` provisório não desenha a torre).

- [ ] **Step 3: Implementar**

- Pátio à noite: `r.yard(FIELD.x0 - 400, WALL_Y - 260, FIELD.x1 + 400, START_Y + 500, { quadra: false, holofote: false, postes: 0 })`; muro alto em `y = WALL_Y - 30` (`r.box` 1400 × 160 × 40, tex `concreto`) com arame (`r.beam`) e dois holofotes nos cantos (`r.light`); linha do muro no chão (`r.plane` verde glow em `WALL_Y`); largada (`r.plane` cinza em `START_Y`).
- Torre atrás da largada em `(480, START_Y + 280)`: 4 pernas, plataforma a 240, guarda `r.character({ ..., key: 'guarda', x: 480, y: START_Y + 280 }, { y: 246, dir: -Math.PI / 2, pose: d.tiro ? 'aim' : 'gun', label: false })` — fica atrás das duas câmeras, mas o facho do holofote da torre (um `r.plane` claro, 60 × 900, de `opacity` 0,1, girando ±0,35 rad com `Math.sin(g.time * 0.5)`) varre o pátio e é visto pelos fugitivos.
- Coberturas: `caixote` (duas `r.box` de madeira empilhadas), `barril` (`r.cyl` azul com aros), `terra` (`r.cone` baixo marrom). Pegada = o retângulo da colisão.
- Laser: com `d.tiro`: `r.sphere(mira.x, 2, mira.y, 4, '#ff2020', { glow: true })`, `r.ring(mira.x, 1, mira.y, 10, 13, '#ff2020', { glow: true, opacity })` pulsando com `tiro.t`, e `r.light` vermelha fraca; o feixe não é desenhado (os fugitivos não veem a torre).
- Fugitivos: `r.character(p, { pose: !p.alive ? 'dead' : p.data.agachado ? 'crouch' : 'auto', dir })`, baleado recente (`g.time - p.data.baleadoT < 0.4`) → `'hit'`.
- `drawOverlay` do guarda: retículo em `project(mira.x, 0, mira.y, 0)` (sem zoom) ou no centro do `rect` 0 (com zoom, a câmera olha para a mira); luneta: vinheta escura recortada (`c.clip` no `rect` 0) com círculo de raio 95 em volta do retículo; durante `d.tiro`, o retículo fica vermelho e um arco mostra o tempo que falta.

- [ ] **Step 4: Rodar e ver passar**

Run: `node tools/teste_cameras.js && node tools/simular.js temporada_de_caca --vezes 3`

- [ ] **Step 5: Screenshots** (servidor em 8765): `bash tools/screenshot.sh temporada_de_caca 6 .../tc1.png` (largada, duas vistas), `... 12 .../tc2.png` (laser aceso, se o bot travou; senão repita em 14/16). Conferir: faixa de 4 px entre as vistas, retículo só em cima, muro visível nas duas, bonecos de costas na de baixo, nada do guarda. Ajustar só câmeras/fov/tamanhos.

- [ ] **Step 6: Commit**

```bash
git add minigames/temporada_de_caca.js tools/teste_cameras.js
git commit -m "Temporada de caça: pátio à noite em duas vistas, torre fora de cena, laser e luneta"
```

---

### Task 6: Screenshots, documentação e bateria

**Arquivos:**
- Modificar: `CLAUDE.md` (lista de testes: `node tools/teste_cameras.js`); só se a conferência pedir, coordenadas em `minigames/`

- [ ] **Step 1: Screenshots** (servidor rodando)

```bash
mkdir -p screenshots/cameras
for par in pisa_leve:4 pisa_leve:12 pisa_leve:20 hora_do_trem:7 hora_do_trem:9 hora_do_trem:10 temporada_de_caca:6 temporada_de_caca:12; do id=${par%%:*}; t=${par##*:}; bash tools/screenshot.sh $id $t screenshots/cameras/${id}_$t.png; done
```

Conferir: Pisa Leve com van ao fundo, 4 de costas, mina revelada legível aos 12 s, cães sobre o mordido aos 20 s; Hora do Trem com faróis no fundo, trem crescendo, nichos legíveis dos dois lados; Temporada com as duas vistas e o laser. Ajuste só coordenadas (`screenshots/` é ignorado pelo git).

- [ ] **Step 2: Documentar**: `CLAUDE.md` acrescenta `node tools/teste_cameras.js` à lista de testes.

- [ ] **Step 3: Bateria**

Run: `node tools/teste_cameras.js && node tools/teste_mecanicas.js && node tools/teste_ajustes.js && node tools/teste_menus.js && node tools/teste_cenarios.js && node tools/teste_detento.js && node tools/simular.js && node tools/simular.js --sessao 2>&1 | tail -1 && bash tools/teste_render.sh && node tools/teste_rede.js`
Expected: `Tudo certo.` em cada um e `Rede OK.`

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md minigames/
git commit -m "Câmeras: revisão visual e documentação"
```
