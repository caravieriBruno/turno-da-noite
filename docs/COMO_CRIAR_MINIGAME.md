# Como criar um minigame

Cada minigame é **um único arquivo** em `minigames/<id>.js` que chama `TN.registerMinigame({...})`.
O motor cuida do resto: lobby, bots, roleta, briefing, rodadas, contagem 3-2-1, HUD, pausa, pontuação e pódio.

## Passo a passo

1. Copie `minigames/_modelo.js` para `minigames/<id>.js` (o `id` em minúsculas, sem espaços e igual ao nome do arquivo).
2. Escreva `init`, `update`, `draw` e `bot`.
3. Acrescente `'<id>.js'` em `minigames/manifest.js`.
4. Teste sem navegador: `node tools/simular.js <id>`. Ele precisa terminar com **Tudo certo**.
5. Teste jogando: abra `index.html?game=<id>`. Com `&humans=0` só bots jogam, com `&humans=2` entra um segundo jogador e com `&speed=3` tudo roda 3× mais rápido.

## Campos da definição

| campo | obrigatório | descrição |
|---|---|---|
| `id` | sim | identificador único, igual ao nome do arquivo |
| `title` | sim | nome em MAIÚSCULAS |
| `tagline` | | frase curta de efeito |
| `brief` | | lista de 2 a 4 frases curtas com as regras, mostrada no briefing |
| `controls` | | `{ move: 'andar', a: 'empurrar', b: 'agachar' }`; omita o que não for usado |
| `icon`, `color` | | 1 caractere para o cartão da roleta e a cor de destaque |
| `rounds` | | rodadas padrão (normalmente 1 a 3) |
| `fixedRounds` | | `true` faz o jogo ignorar o ajuste "rodadas por jogo" do lobby (ex.: uma rodada por caçador) |
| `timeLimit` | | segundos; ao acabar chama `onTimeUp(g)` (opcional) e termina a rodada. Pode ser uma função `(g) => n` |
| `scoring` | | `'survival'` (padrão), `'rank'` ou `'points'` (veja abaixo) |
| `endWhenOneLeft` | | termina quando resta ≤1 vivo; o padrão é `true` em `survival` |
| `hud` | | `false` esconde o HUD padrão |
| `hudValue(g, p)` | | o que mostrar no HUD para cada jogador; o padrão é `p.score` |
| `inspiredBy` | | texto livre de referência |
| `init(g)` | sim | prepara a rodada; é chamado a cada rodada |
| `update(g, dt)` | sim | lógica a 60 Hz fixos (`dt` = 1/60) |
| `draw3d(g, r)` | sim* | desenha a cena 3D (câmera fixa); veja "Gráficos 3D" |
| `draw(g, c)` | | alternativa 2D (Canvas 960×540); *é obrigatório ter `draw3d` ou `draw` |
| `drawOverlay(g, c)` | | camada 2D por cima (placares, barras e textos fixos na tela) |
| `camera`, `env` | | câmera fixa e iluminação do 3D |
| `viewports(g)` | | (opcional) várias vistas da mesma cena: lista de `{ rect, camera }` (veja "Várias vistas" abaixo) |
| `worldPos(g, p)` | | posição 3D `{x,y,z}` do jogador quando `p.x/p.y` não são o chão (jogos de visão lateral); usado nos rótulos do motor |
| `screenSpace` | | `true` quando a lógica é em coordenadas de TELA (ex.: mira 2D); partículas e popups ficam em 2D e o jogo usa `r.unproject` |
| `bot(g, p, dt)` | | IA do bot; retorna `{x, y, a, b}`. Sem ela o bot anda à toa |
| `onTimeUp(g)` | | chamado quando o tempo acaba, antes do fim da rodada |
| `results(g, pts)` | | gancho final para ajustar o objeto de pontos `{id: n}` |

Dentro dos métodos, `this` é a própria definição. Isso permite guardar constantes como `SPEED: 180` e usar `this.SPEED`.

## Pontuação (como no Machine Party original)

- **`survival`**: o 1º eliminado ganha 0, o 2º ganha 1, e assim por diante; quem termina vivo ganha o número de jogadores (4). Quem é eliminado no mesmo instante empata (use `g.eliminateGroup(lista)`). Os pontos de `g.addScore` somam por cima (bônus).
- **`rank`**: ordena por `p.score`. O 1º ganha 3, o 2º 2, o 3º 1 e o 4º 0, e empates dividem a mesma colocação. Use quando o placar interno é grande (ex.: ervilhas comidas).
- **`points`**: cada jogador ganha exatamente `p.score`. Use para pontos por evento, como "+1 por abate e +1 por chegar".

## O objeto `g` (a rodada)

**Dados:**
- `g.players`: lista de jogadores.
- `g.data`: estado livre do minigame.
- `g.time`: segundos desde o início da rodada.
- `g.timeLeft`.
- `g.round` e `g.totalRounds`.
- `g.W`, `g.H` (960, 540).
- `g.arena`: `{x:40, y:70, w:880, h:410}`, a área útil abaixo do HUD.
- `g.playerCount`.

**Jogadores:**
- `g.alive()`: jogadores vivos.
- `g.others(p)`: todos menos `p`.
- `g.eliminate(p, {sound, particles, msg})`: mata `p` e registra a ordem.
- `g.addScore(p, n)`: soma pontos e mostra um "+n" na tela.
- `g.movePlayer(p, velocidade, dt, limites?)`: anda pelo input com a diagonal normalizada, presa em `g.arena` (ou em `limites`, ou `null` para ficar solto). Atualiza `p.dir` e aplica o impulso `p.vx/p.vy`.
- `g.push(p, ix, iy)` e `g.decayPush(p, dt, taxa)`: impulsos que decaem, para empurrões e explosões.
- `g.placeInCircle(cx, cy, r)` e `g.placeInRow(y, x0, x1)`: posições iniciais.
- `g.drawPlayer(c, p, {flash})`: desenha o robô padrão do jogador.

**Fluxo:**
- `g.finish(atraso=1.2)`: termina a rodada.
- `g.after(seg, fn)`: executa `fn` depois de `seg` segundos de jogo.

**Efeitos:**
- `g.sfx(nome, ganho?)`. Sons disponíveis: blip, select, confirm, back, tick, go, hit, boom, pickup, coin, jump, shoot, laser, hurt, win, lose, whoosh, buzz, cough, step, latido. `ganho` (0..1, padrão 1) multiplica o volume (ex.: latidos mais altos conforme os cães se aproximam) e vai junto para os clientes de rede.
- `g.particles(x, y, cor, n, vel)`.
- `g.shake(força)`.
- `g.flash(cor)`.
- `g.message(texto, dur, cor)`: aviso grande no centro.
- `g.popup(texto, x, y, cor)`.

## O jogador `p`

**Campos:**
- `p.id` (0 a 3), `p.color`, `p.label` ("P1"), `p.isBot`.
- `p.x`, `p.y`, `p.r` (raio 16), `p.dir`, `p.vx`, `p.vy`.
- `p.alive`, `p.score`.
- `p.data`: estado livre por jogador.

**Entrada (`p.input`):**
- `x` e `y` vão de -1 a 1.
- `a` e `b` indicam botão segurado.
- `aPressed` e `bPressed` indicam que o botão foi apertado neste frame; `aReleased` e `bReleased`, que foi solto.
- `upPressed`, `downPressed`, `leftPressed` e `rightPressed` indicam que a direção foi apertada neste frame (bom para jogos de sequência de setas).
- Bots e humanos usam a mesma interface. Por isso o minigame nunca precisa saber quem é bot.

## Utilidades

**`TN.util`:**
- `clamp`, `lerp`, `rand(a,b)`, `randInt(a,b)`, `chance(p)`, `pick(arr)`, `shuffle(arr)`.
- `dist`, `angle`, `norm(x,y)`, `approach`.
- Colisões: `circles(a,b)`, `inRect(px,py,r)`, `rects(a,b)`, `circleRect(c,r)`, `segCircle(...)`.
- `separate(lista)`: impede que os jogadores se sobreponham.
- `formatTime`.

**`TN.draw`:**
- `robot`, `robotSide` (visão lateral).
- `text`, `lines`, `panel`, `bar`.
- `floor` (piso quadriculado), `hazardStripes`.

## Gráficos 3D (câmera fixa): `draw3d(g, r)`

Os minigames são desenhados em **3D com câmera fixa**, como no Machine Party. A lógica continua 2D, e o plano da lógica vira o **chão** do mundo 3D:

- **X** = `p.x` (direita), **Z** = `p.y` (em direção à câmera), **Y** = altura. 1 unidade = 1 pixel da lógica. O chão fica em `y = 0`.
- Defina `camera: { pos: [x,y,z], target: [x,y,z], fov }`. O padrão é `{ pos: [480, 640, 860], target: [480, 0, 300], fov: 38 }`, que mostra a `g.arena` inteira em ângulo de cima.
- **Várias vistas (opcional):** `viewports(g)` devolve uma lista de vistas `{ rect: [x, y, w, h], camera: { pos, target, fov } }`, com `rect` em coordenadas virtuais (`TN.W` × `TN.H`, como o HUD 2D). O motor monta a cena uma vez (`draw3d`) e a desenha uma vez por vista, recortada no seu `rect` (também no visual retrô), cada uma com a própria câmera e o aspecto do próprio retângulo. Os rótulos (`r.label`, nomes dos personagens) são projetados por vista e aparecem só dentro da vista em que caem. `TN.R3.project(x, y, z, vista)` e `TN.R3.unproject(sx, sy, alturaY, vista)` recebem o índice da vista (padrão 0). Entre as vistas o motor não desenha nada: a moldura é do `drawOverlay`. Com `viewports`, `def.camera` só serve de reserva. O `tools/simular.js` confere o formato (erro `viewports: ...`). Exemplo: `minigames/temporada_de_caca.js`.
- Ajuste a luz com `env: { bg, fog: [perto, longe], ambient, sun, sunDir: [x,y,z], sunColor, envMap, spot, spotColor, spotPos: [x,y,z], spotTarget: [x,y,z], spotAngle }`. `spot` é o holofote de teto (intensidade; `0` desliga) que deixa o centro claro e as bordas escuras. Use `envMap: 0` para desligar os reflexos do ambiente e deixar a cena escura de verdade (ex.: apagão); `r.env({...})` dentro do `draw3d` muda a luz por fase. O padrão é a cadeia: pouca luz ambiente, tom quente e holofote no centro.
- `draw3d` é chamado **a cada quadro** e descreve a cena inteira, como o `draw` 2D. O motor reaproveita os objetos 3D, então não há nada para criar ou destruir.

**Visual de cadeia (padrão):** a cena é desenhada em 640×360 e ampliada com pixel duro, com redução de cores, texturas sujas e luz dura. `?visual=antigo` na URL volta ao visual liso (para comparar, ou em máquina sem fôlego). `TN.R3.RETRO` diz qual está ativo.
- Toda primitiva sem `glow` ganha uma textura suja que **multiplica** a cor pedida. Pisos (`plane`, `disc`, `ring`) usam `piso` em coordenadas do mundo; o resto usa `concreto`, presa ao objeto (não escorrega quando ele anda); `metal >= 0.4` vira `metal`.
- `o.tex` escolhe a textura (`'concreto' | 'piso' | 'metal' | 'tinta' | 'tecido' | 'tijolo' | 'azulejo' | 'caquinho' | 'madeira' | 'taco'`) ou desliga (`false`); nome errado é acusado pelo `tools/simular.js`. `o.texWorld: true` amarra a textura ao mundo em vez do objeto, o que deixa contínuos os ladrilhos vizinhos.
- O que precisa saltar aos olhos (perigo, alvo, símbolo, seta) deve usar `glow: true`: não recebe textura nem luz, então o verde e o vermelho continuam puros no escuro.

| chamada | o que faz |
|---|---|
| `r.box(x, y, z, w, h, d, cor, o)` | caixa com **base** em `y` e centro em `x,z` |
| `r.cyl(x, y, z, raio, h, cor, o)` / `r.cone(...)` | cilindro ou cone com base em `y`; `o.sides: 6` faz um prisma hexagonal |
| `r.sphere(x, y, z, raio, cor, o)` | esfera com **centro** em `y` |
| `r.plane(x, y, z, w, d, cor, o)` | retângulo horizontal (piso, ladrilho, faixa) |
| `r.disc(x, y, z, raio, cor, o)` | círculo horizontal (sombra, marcador, área) |
| `r.ring(x, y, z, raioInt, raioExt, cor, {arc})` | anel horizontal; `arc` de 0 a 1 vira barra de progresso circular |
| `r.beam(x1,y1,z1, x2,y2,z2, espessura, cor, o)` | barra quadrada entre dois pontos (laser, cabo, corda, trilho) |
| `r.tube(x1,y1,z1, x2,y2,z2, raio, cor, o)` | cilindro entre dois pontos (cano, roda, rolo, eixo, tronco) |
| `r.light(x, y, z, cor, intensidade, alcance, o)` | luz pontual, com no máximo 6 por quadro; `o.fundo: true` = luz de cenário, que só acende se sobrar vaga |
| `r.label(x, y, z, texto, cor, tamanho)` | texto 2D preso a um ponto 3D |
| `r.character(p, o)` | **personagem** (detento de uniforme na cor do jogador), animado sozinho (veja abaixo) |
| `r.room(x1, z1, x2, z2, o)` | ambiente interno de cadeia em volta da arena (chão, paredes do fundo e laterais, detalhes, luminárias); `o.estilo`: `cela` (padrão), `oficina`, `refeitorio`, `subsolo`, `escritorio`; outras opções: `h`, `paint`, `top`, `floor` (cor, ou `false` para sem chão: o jogo desenha o piso com poço/buraco), `windows`, `lamps`, `lights`, `bars`, `frente`, `props: false`. Deixe ~60 de margem entre `z1` e a arena (objetos de canto). Acende até 2 luzes de fundo |
| `r.yard(x1, z1, x2, z2, o)` | pátio de cadeia à noite (muros com arame farpado, postes de vapor de sódio, guarita com holofote que varre); opções: `h`, `floor` (cor, ou `false` para sem chão nem quadra), `wall`, `quadra: false`, `guarita: false \| 'esquerda' \| 'direita'`, `holofote: false`, `postes`, `frente`. Acende até 2 luzes de fundo |
| `r.prop(nome, x, z, o)` | objeto de cenário: `beliche`, `vaso`, `banco`, `mesa`, `tambor`, `pneu`, `colchao`, `grade` (`o.w`, `o.h`), `poste` (`o.luz`), `arquivo`; `o: { rotY, scale, y, color }` |
| `r.camera(pos, target, fov)` | muda a câmera neste quadro (ex.: tremor, foco); normalmente use `def.camera` |
| `r.project(x, y, z, vista=0)` | converte para a posição na tela 2D: `{x, y, visible}`; `vista` é o índice em `viewports` |
| `r.unproject(sx, sy, alturaY=0, vista=0)` | ponto da tela → ponto no plano horizontal do mundo `{x, y, z}` |

**Opções `o`** das primitivas:
- `rotY`, `rotX`, `rotZ` (rotação em rad; caixa, cilindro e cone giram em torno da **base**);
- `glow: true` (brilha, sem sombra: luzes, lasers, telas);
- `opacity`;
- `emissive: '#cor'`;
- `metal` e `rough` (de 0 a 1);
- `shadow: false`.
- Cores e opacidades que mudam continuamente criam materiais novos. Prefira poucas cores fixas; a opacidade é arredondada em passos de 0,05.
- `r.beam` calcula a própria rotação, então ignora `rotX`, `rotY` e `rotZ`.

**Personagem `r.character(p, o)`:**
- Aceita o jogador `p`, que já tem `x, y, dir, alive, color, label`, ou qualquer objeto com `x, y`. `p.label` (igual a `p.name`) é o **nome que o jogador escolheu no lobby**, com até 8 caracteres; textos que concatenam `p.label` precisam prever 8 letras, não "P1".
- Por padrão a pose é automática: anda quando o jogador se move, fica parado ou cai morto quando `p.alive` é falso.
- `o.pose` força uma pose. Além das básicas (`'idle' | 'walk' | 'dead' | 'lie' | 'sit' | 'crouch' | 'fall'`, em que `lie` é deitar de propósito, vivo), há uma para cada ação comum dos minigames: `'hold'` (carregando algo numa mão), `'work'` (mãos ocupadas à frente: esteira, bancada, maçarico, alavanca), `'arms'` (empurrar) e `'pull'` (puxar), `'statue'` (congelado em T), `'dance'`, `'swing'` (golpe com bastão, toca uma vez), `'gun'` (arma na mão, relaxado), `'aim'` (apontando) e `'shoot'` (tiro, uma vez), `'drive'` (ao volante), `'hit'` (levou pancada, uma vez), `'jump'` (impulso que emenda no pulo) e `'land'` (aterrissagem, uma vez). As de "uma vez" param no último quadro e só recomeçam quando a pose muda e volta. `walk` escolhe andar/correr/sprint pela velocidade e `crouch` anda agachado quando o boneco se move. Veja todas em `?game=_teste3d`.
- Outras opções: `o.y` (elevação: pulo, cadeira, queda), `o.dir` (direção em rad), `o.lean` (inclinação do corpo em rad; positivo = para trás), `o.scale`, `o.flash`, `o.label` (texto ou `false`) `o.key` (id para a animação, quando não é um jogador) e `o.number` (número de prontuário nas costas; padrão: 171, 155, 157 e 180 para os jogadores).
- `p.dir` segue o padrão da lógica: 0 olha para +X e π/2 olha para +Z (em direção à câmera).
- **Detento animado (visual novo):** o `r.character` desenha um modelo low-poly com esqueleto (manequim CC0 da Quaternius, `assets/detento.glb.js`, 22 clipes da Universal Animation Library a 15 quadros-chave/s; a lista pose → clipe é `POSE_CLIPE` em `engine/detento.js`). `walk` anima mais rápido quanto mais rápido o boneco anda (Walk_Loop abaixo de 90 px/s, Jog até 330, Sprint acima); `dead`/`lie` tocam Death01 uma vez e param no fim (`lie` 3× mais rápido, para deitar na hora); `pull` é o Push_Loop ao contrário; `jump` toca Jump_Start e emenda no Jump_Loop. A troca tem crossfade de 0,15 s. A altura continua cerca de 60, com frente para +X, e `scale`, `y`, `dir`, `lean`, `flash`, `label`, `number` e `alive` funcionam igual. A animação é só local (não vai para `g.data`); cada `key` (ou `p.id`) mantém a sua animação mesmo mudando a ordem de desenho, um salto grande de posição (início de rodada, renascer) não vira corrida, e o boneco volta ao idle cerca de 0,1 s depois de parar. O corpo morto fica centrado na posição. Enquanto o modelo carrega, ou se falhar, aparece o boneco de caixas. O `?visual=antigo` usa sempre as caixas. Ao prender enfeites no boneco (chapéu do anfitrião, cigarro...), confira no screenshot do visual novo.

**Outras regras:**
- Partículas (`g.particles`), popups (`g.addScore`), mensagens, flash e tremor do motor funcionam sozinhos no 3D.
- Textos, placares e barras que precisam ficar fixos na tela vão em `drawOverlay(g, c)`, que é 2D e é desenhado por cima do 3D. Ele **só é chamado no modo 3D**; no modo 2D o `draw` já desenha tudo.
- O tamanho do personagem acompanha `p.r` (16 = normal). Para outro tamanho, use `o.scale`.
- Jogos de visão lateral (mesa, cabo de guerra, escada) também usam 3D: monte o cenário com a câmera de frente ou de lado e converta as coordenadas da lógica como for mais natural, por exemplo `Y = altura`.
- `draw(g, c)` em 2D é **opcional**: serve de alternativa quando não há WebGL ou com `?2d=1`. Minigames novos podem ter só `draw3d`.
- Para conferir as poses do personagem, use a cena de teste: `index.html?game=_teste3d&extra=_teste3d&humans=0&t=4`.
- **Menus (fora do minigame):** são desenhados com `TN.giz` (`engine/giz.js`, tema "mapa de fuga a giz") e só o host navega neles (`TN.donoDoMenu(roster)`: o P1 no mesmo computador; jogador remoto nunca). Um minigame não precisa mexer nisso: o `title`, a `tagline` e o `brief` dele aparecem na roleta e no briefing como estão.

## Compatibilidade com o modo em rede (obrigatória)

No modo em rede local, só o **host** roda `init/update/bot`. Cerca de 30 vezes por segundo ele serializa a rodada inteira (`g`, incluindo `g.data`, os jogadores e `p.data`) e os clientes chamam o **mesmo `draw(g, c)`** numa cópia. Para isso funcionar:

- Guarde todo o estado em `g.data`, `p.data` ou nos campos dos jogadores. **Nunca altere `this`** (a definição) durante o jogo; constantes em `this` são permitidas.
- O estado precisa ser dado simples: objetos, arrays, números, textos e booleanos. Referências entre objetos são permitidas. Funções são descartadas. Não guarde canvas, gradientes, imagens ou elementos DOM: crie gradientes dentro do `draw`.
- O `draw` só lê o estado. Ele não deve alterá-lo nem sortear coisas que afetem o jogo.
- O som é repassado automaticamente: `g.sfx(...)` e `TN.audio.beep(...)` tocados no host também tocam nos clientes.
- `node tools/simular.js <id>` verifica tudo isso automaticamente, com a linha "compatível com rede".

## Regras de ouro (para a IA e para humanos)

- Tudo fica no arquivo do minigame. **Não edite o motor** (`engine/`) para criar um jogo. Se faltar algo genérico, adicione no motor com cuidado e documente aqui.
- Use apenas o input abstrato (`p.input`), nunca teclas diretamente, porque assim funciona com qualquer teclado, gamepad ou bot.
- Todo minigame precisa **terminar sozinho**, mesmo se um humano ficar parado. Use `timeLimit` ou alguma regra que force o fim.
- Escreva um `bot` decente: os bots preenchem as vagas e o simulador depende deles.
- Desenhe só com Canvas 2D e formas simples, sem imagens externas, para manter tudo em um arquivo.
- Escreva os textos em português.
- Rode `node tools/simular.js <id>` antes de dar como pronto.
