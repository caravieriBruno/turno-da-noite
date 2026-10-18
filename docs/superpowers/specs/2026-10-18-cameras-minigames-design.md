# Câmeras pelas costas, duas vistas e a Temporada de Caça refeita: especificação

## 1. Intenção

Três apontamentos do usuário de 2026-10-18 pedem outra câmera:
- **Pisa Leve:** câmera pelas costas dos jogadores, com a van lá na frente. O que vem por trás não se vê, e passa a ser cães de guarda.
- **Hora do Trem:** câmera de frente, com o trem vindo ao fundo, como no jogo original.
- **Temporada de Caça:** refeito. O atirador (um guarda) tem a câmera dele; os fugitivos têm outra, pelas costas. Os fugitivos só veem o laser um instante antes do tiro.

A Temporada de Caça exige **duas câmeras ao mesmo tempo**, coisa que o motor não faz. Por isso esta spec tem uma parte de motor (viewports) e três de minigame.

Companheiras: `2026-10-18-ajustes-minigames-design.md`, `2026-10-18-mecanicas-minigames-design.md`, `2026-10-18-nomes-jogadores-design.md`.

## 2. Decisões já tomadas com o usuário

- Pisa Leve **mantém a mecânica** (sonar, coleira, minas, pontos). Muda a câmera, a ameaça por trás e o tempo que a mina fica marcada.
- Temporada de Caça é refeito com duas vistas. O atirador é o **guarda da prisão**.
- Hora do Trem ganha a câmera de frente; o empurrão para fora do nicho está na spec de ajustes.

## 3. Motor: viewports

### 3.1 O que entra
- `def.viewports(g)` (opcional) devolve uma lista de vistas: `{ rect: [x, y, w, h], camera: { pos, target, fov } }`, com `rect` em coordenadas de tela virtuais (`TN.W` × `TN.H`). Sem `viewports`, tudo continua como hoje (uma câmera, `def.camera`).
- `renderRound` desenha a **mesma cena** uma vez por vista, com `setViewport` + `setScissor` (`scissorTest` ligado), nas duas versões: direto no canvas e, no visual retrô, dentro do `rt` de 640×360, com os `rect` escalados.
- Rótulos (`labels`) são projetados **por vista** e desenhados só dentro do `rect` da vista em que caem (clip 2D). Partículas e tremor de tela valem para todas.
- `TN.R3.project(x, y, z, vista = 0)` e `unproject(..., vista = 0)` ganham o índice da vista. Minigames de uma vista não mudam.
- Entre as vistas o motor não desenha nada: a moldura é do `drawOverlay` do minigame.
- O validador do `simular.js` aceita `viewports` (chama a função e confere o formato).

### 3.2 Testes do motor
- `tools/teste_render.js`: uma cena com 2 vistas desenha algo diferente em cada metade (hash por metade difere), é determinística e não é mais lenta que 1,5× a cena de uma vista.
- `project(..., 1)` devolve coordenadas dentro do `rect` da vista 1.
- Documentar em `docs/COMO_CRIAR_MINIGAME.md`.

## 4. Pisa Leve (`pisa_leve`): pelas costas, com cães

**Hoje:** câmera alta e inclinada; a corrida vai da esquerda para a direita; a colheitadeira vem por trás, visível; a mina revelada fica marcada 2,2 s.

**Muda:**
- **Câmera pelas costas:** fica atrás da largada, olhando ao longo do campo até a van, baixa o bastante para dar a sensação de estar entre os detentos (ponto de partida: `pos` a ~260 unidades atrás da largada e ~230 de altura, alvo no meio do campo; `fov` ~48). Os jogadores e o campo ficam em perspectiva, a van pequena no horizonte. Ajuste final por screenshot: as minas (espalhadas com distância mínima) e os 4 jogadores precisam caber e ser distinguíveis.
- O eixo da lógica não muda (x = avanço, y = lateral). Só a câmera e o cenário mudam: a van e o portão ao fundo, muro e holofotes nas laterais.
- **Cães de guarda no lugar da colheitadeira:** uma matilha avança por trás com a mesma curva de velocidade (`HARV_V0`/`HARV_V1`, começa em `HARV_DELAY`) e mata no contato. Como vêm de trás da câmera, **não aparecem na tela** até alcançar alguém. O que o jogador tem é som: latidos cada vez mais altos e frequentes conforme a matilha se aproxima, e a vinheta das bordas pulsa vermelha quando um cão está a menos de ~80 px de quem está atrás. Mensagem inicial: "SOLTARAM OS CÃES!".
- Quem é pego aparece derrubado (pose `dead`) com dois cães (caixas baixas pretas com olhos) em cima, para o resto da tela entender.
- Os cães **continuam detonando as minas** por onde passam (como a colheitadeira): o estouro fica atrás da câmera, então é só som, mais uma pista de onde a matilha está; e deixa o caminho atrás limpo, como hoje. *(Escolha minha.)*
- `REVEAL` 2,2 → **1,4 s**: a mina revelada some mais rápido, como o usuário pediu. Sonar e coleira continuam iguais.
- Bot: igual, só perde a referência visual da colheitadeira (já usa posição).
- 2D (`draw`): continua de cima, com os cães desenhados.

## 5. Hora do Trem (`hora_do_trem`): câmera de frente

**Hoje:** vista inclinada de cima, trem cruzando da esquerda para a direita; nichos nas paredes de cima e de baixo da tela.

**Muda:**
- **Eixos transpostos:** x vira a largura do túnel (travessia) e y vira o eixo do túnel. O trem avança em y, **do fundo em direção à câmera**, e some atrás dela. Os nichos ficam nas **paredes laterais**, 6 de cada lado, distribuídos em profundidade.
- Câmera baixa e de frente, no eixo do túnel: `pos` ≈ `[480, 150, 1000]`, `target` ≈ `[480, 50, 100]`, `fov` ~45. O túnel se estende em y de cerca de −200 a 540 (`bounds` próprios; `g.arena` padrão não serve).
- O que muda na lógica: `init` (nichos, paredes), `nookOf`, `isSafeIn`, `resolveWalls`, `bounds`, a colisão com o trem (frente em y) e o bot (`pickNook`, tempo até o trem). É uma troca mecânica de eixos; as regras (nichos abertos por ciclo, empurrão, pontos) não mudam.
- `draw3d` reescrito: paredes laterais com os nichos, trilhos em perspectiva, o trem crescendo ao vir do fundo, faróis que iluminam o túnel antes de aparecer (aviso visual que substitui parte do que a vista de cima mostrava).
- O 2D (`draw`) é rotacionado para o mesmo mapeamento (trem de cima para baixo da tela).
- O empurrão para fora do nicho (spec de ajustes) é feito antes e sobrevive à troca de eixos.

## 6. Temporada de Caça (`temporada_de_caca`): refeito

### 6.1 Papéis e rodadas
- 4 rodadas, **um guarda por rodada** (rotação como hoje, `fixedRounds`). Os demais são **fugitivos**. Com bots preenchendo, um bot pode ser o guarda.
- Cenário: o pátio à noite. O guarda está numa **torre atrás da largada**, atirando nas costas de quem foge; os fugitivos correm da largada até o **muro ao fundo**, com coberturas pelo caminho (caixotes, barris, montes de terra). As duas vistas olham na mesma direção (para o muro): a do guarda de cima e com luneta, a dos fugitivos baixa e pelas costas. Os fugitivos **não veem a torre nem o guarda**; só o facho do holofote da torre varrendo o pátio por trás e o ponto do laser. *(Escolha minha.)*

### 6.2 Duas vistas (viewports do motor)
- **Vista do guarda** (topo, ~45% da altura): câmera na torre, mira/luneta; EXTRA alterna zoom.
- **Vista dos fugitivos** (base, ~55%): câmera pelas costas, baixa, olhando para o muro. Os fugitivos veem uns aos outros, as coberturas e **o ponto do laser**; nada do guarda.
- A divisão é uma faixa de 4 px escura no `drawOverlay`. Em **rede local, todos veem as duas vistas** (o cliente desenha o snapshot como sempre).
- **Decisão do usuário (2026-10-18):** num monitor só, os fugitivos veem a vista do guarda e, com ela, para onde ele olha. Isso é **aceito**: a luneta é fechada (zoom), ler a direção dela no meio da correria é parte do jogo, e o laser continua sendo o único aviso exato. O retículo do guarda aparece normalmente na vista dele.

### 6.3 Fugitivos
- Andar (8 direções, ~150 px/s); **EXTRA = mergulhar/agachar** atrás de cobertura (0,5 s, não se move; atrás de cobertura fica invisível para o tiro; fora de cobertura só reduz o alvo).
- Chegar ao muro = **escapou**: +1, e +1 extra para o primeiro. Quem é baleado sai da rodada (um tiro basta; o aviso do laser compensa).
- Fim da rodada: todos escaparam ou foram baleados, ou **40 s**; quem não chegou marca 0.

### 6.4 Guarda
- Direções movem a mira (velocidade de mira como hoje; mais lenta com zoom).
- **AÇÃO = travar o tiro:** o **laser acende no alvo** e fica visível para todos por **0,5 s** (a mira ainda move, a 40%), depois o tiro sai. Recarga 1,5 s. Sem rajada.
- O tiro acerta se o ponto do laser está no corpo do fugitivo no instante do disparo (caixa maior em pé, menor agachado, nenhuma atrás de cobertura). Dispersão zero: a dificuldade é o aviso.
- Pontos: +1 por acerto, +1 se nenhum fugitivo escapou.
- Nos primeiros 2 s da rodada a mira fica travada (largada livre).

### 6.5 Bots
- Guarda bot: mira no fugitivo mais exposto, com erro e um atraso de 0,3 a 0,8 s antes de travar; não mira em quem está agachado atrás de cobertura.
- Fugitivo bot: corre de cobertura em cobertura; quando o laser aparece a menos de ~40 px, mergulha se há cobertura perto, senão muda de direção.

### 6.6 Textos
- Título continua TEMPORADA DE CAÇA. Tagline: "O guarda da torre tem uma bala para cada um."
- Brief: "Corra até o muro.", "O laser aparece meio segundo antes do tiro: mergulhe (EXTRA) atrás de algo.", "Na torre: mire, trave com AÇÃO e reze para ele não se mexer."

## 7. Fora do escopo
- Escultor em 4 vistas 3D (fica como possibilidade futura; a spec de mecânicas o resolve em 2D).
- Qualquer outra câmera.

## 8. Testes
- Motor: `teste_render.sh` (cena de 2 vistas), `teste_cenarios`, `teste_detento`, `teste_menus`, `simular.js` completo.
- Pisa leve: `simular` (`--vezes 3`, `--parado`), screenshots em t=4, 12 e 20 s (cães soltos).
- Hora do trem: `simular` e screenshots com o trem no fundo, no meio e passando.
- Temporada de caça: `simular` (o guarda bot acerta alguém às vezes; os fugitivos bots escapam às vezes; a rodada termina em ≤ 40 s), screenshots das duas vistas com o laser aceso.
- `teste_rede.js` no fim.

## 9. Riscos
| risco | mitigação |
|---|---|
| Viewports com o `rt` retrô de 640×360: scissor errado, sombra cortada | teste de render por metade; se o `rt` complicar, as vistas podem ser renderizadas em sequência no mesmo `rt` com scissor escalado |
| Pisa leve pelas costas esconde minas pela perspectiva | câmera alta o bastante; `REVEAL` menor só depois de conferir no screenshot que a mina revelada é visível |
| Cães invisíveis parecem injustos | latidos com volume proporcional e a vinheta vermelha; a velocidade é a mesma da colheitadeira de hoje |
| Hora do trem: túnel longo em y foge da `g.arena` | `bounds` próprios já são parâmetro de `movePlayer`; rótulos usam `worldPos` |
| Temporada de caça com um tiro = eliminação fica curto | 40 s, 1,5 s de recarga e 0,5 s de laser: um guarda perfeito elimina 3 em ~6 s, mas o laser dá tempo de mergulhar; ajustar a recarga após jogar |
