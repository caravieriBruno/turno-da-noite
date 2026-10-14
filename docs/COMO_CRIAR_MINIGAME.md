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
| `draw(g, c)` | sim | desenha com Canvas 2D em 960×540 virtuais |
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
- `g.sfx(nome)`. Sons disponíveis: blip, select, confirm, back, tick, go, hit, boom, pickup, coin, jump, shoot, laser, hurt, win, lose, whoosh, buzz, cough, step.
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
