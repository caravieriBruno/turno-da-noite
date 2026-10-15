# Menus "Fuga da Prisão": especificação

## 1. Objetivo

Duas mudanças nos menus (as telas fora do minigame), pedidas juntas pelo usuário em 2026-10-15:

1. **Só o host controla os menus.** Hoje `TN.input.menu()` (`engine/input.js`) soma a navegação de todos os dispositivos: os três teclados, os controles e os jogadores remotos da rede. Na prática todo mundo mexe no menu ao mesmo tempo.
2. **Menus no tema do jogo: fuga da prisão.** O visual e os textos dos menus passam a contar a história de uma fuga.

## 2. Decisões já tomadas com o usuário

- **"Host"** vale nos dois casos:
  - na rede local, só o computador que criou a sala navega;
  - no mesmo computador, só o P1 (o primeiro jogador humano local) navega.
- **Escopo do tema:** visual e textos de **todas as telas de menu**. Ficam de fora os textos, nomes e briefings dos minigames.
- **Direção visual:** um **mapa de fuga a giz**. A parede da cela vira lousa, com a planta da prisão riscada, a contagem de dias e os itens escritos à mão; a seleção é circulada.
- **Narrativa:** um **plano em etapas**.
  - Os detentos têm uma noite para fugir, e cada minigame é uma **etapa do plano**.
  - Os pontos viram **metros de túnel** cavados.
  - No fim, o 1º **fugiu**, os demais foram **recapturados** e o último vai para a **solitária**.
- **Técnica:** o giz é **procedural, em Canvas 2D**. Não há cena 3D atrás dos menus nem imagens prontas.

## 3. Fora do escopo

- Títulos, taglines, briefings e textos internos dos minigames. Os cartões da roleta continuam mostrando `def.title`.
- O HUD durante o jogo (`drawOverlay` dos minigames, a camada 2D do `TN.Round`).
- O boneco 3D e o visual dos cenários.
- A barra do cliente de rede ("REDE · SALA ABCD · VOCÊ: P2") continua igual.

## 4. Quem controla os menus

### 4.1 `TN.input.menu(permitidos)`
- **Sem argumento:** o comportamento de hoje (soma todos os dispositivos), para não quebrar quem já usa.
- **Com uma lista de ids de dispositivo:** só esses contam para `up/down/left/right/ok/back/okDevice`.
- `Escape` e `Backspace` do teclado físico continuam valendo como `back`. O teclado é do computador que roda as cenas, ou seja, do host.

### 4.2 `donoDoMenu()` em `engine/session.js`
A função devolve a lista de dispositivos que podem navegar agora:

| situação | quem navega |
|---|---|
| sem sessão de jogo (título, controles, ensaiar etapa, telas de rede) | todos os dispositivos **locais** (teclados e controles deste computador); nunca os remotos (`n<cliente>:...`) |
| com sessão (configuração, roleta, briefing, pausa, fim de tentativa, placar, pódio) | só o dispositivo do **P1**, o jogador humano local de menor `id` no `TN.session.roster` |
| com sessão, mas sem humano local (o host só assiste e todos os humanos são remotos) | todos os dispositivos locais |

No lobby a sessão ainda não existe. A regra do lobby está em 4.3.

### 4.3 O que continua sendo de cada jogador
- **Lobby:** cada dispositivo entra (AÇÃO), dá PRONTO (AÇÃO) e sai (EXTRA) **pela própria vaga**, inclusive os remotos. Só as teclas `T` (bots) e `Esc` (voltar) são do teclado do host, como hoje.
- **Briefing:** cada jogador dá o seu PRONTO.
- **Mudança de comportamento:** pular a tela de fim de tentativa e o placar apertando AÇÃO passa a ser **só do P1**. Hoje qualquer humano pula. Os tempos que avançam sozinhos (3,5 s e 5 s) continuam.

### 4.4 Rede
- O cliente não roda cenas: ele só envia a entrada e desenha o snapshot. Então o filtro só precisa existir no host, onde os remotos aparecem como `n<cliente>:<kb1|gp0>`.
- Como os remotos nunca são "locais", um cliente nunca navega pelos menus do host. Ele continua entrando no lobby, dando PRONTO e jogando.

## 5. Visual de giz

### 5.1 Kit `engine/giz.js` (`TN.giz`)
Carregado no `index.html` depois de `engine/draw.js`. É desenho 2D puro, sem WebGL, e funciona por `file://`.

- **`parede(c, t)`:** a lousa.
  - O fundo de concreto escuro, com manchas de giz apagado, é gerado uma vez num canvas fora da tela e reaproveitado.
  - Por cima, em traço fraco, vão a planta da prisão (celas, corredor, pátio e muro, com uma seta tracejada até o túnel) e riscos de contagem de dias num canto.
- **`texto(c, str, x, y, opts)`:** letra "à mão".
  - É a fonte atual do `TN.draw` com 2 ou 3 passadas levemente deslocadas e um grão que apaga pedaços do traço.
  - Opções: `size`, `color`, `align` e `maxWidth`, como em `D.text`.
- **`linha`, `retangulo`, `circulo`:** traços tortos de giz. Substituem `D.panel` nos menus.
- **`selecao(c, x, y, w, h, t)`:** uma elipse que se desenha sozinha (cerca de 0,25 s a partir de `t`) em volta do item escolhido, com uma setinha.
- **`detento(c, x, y, tam, cor, opts)`:** um bonequinho de giz colorido com uniforme listrado na cor do jogador. Substitui `D.robot` nos menus.
  - `opts.caido`: deitado.
  - `opts.comemorando`: braços para cima.
  - `opts.dir`: virado para um lado.
- **Determinismo:** todo tremor e todo grão vêm de uma semente derivada do próprio texto ou das coordenadas, nunca de `Math.random()` a cada quadro.
  - Assim o giz não "ferve".
  - O host e os clientes também desenham igual, porque o cliente desenha a mesma cena a partir do snapshot.
  - A única animação usa o tempo da cena (`this.t`).
- **Cores:**
  - giz branco (`#e8e4d8`) para texto e traços;
  - **amarelo** (`#f2d65a`) para destaque e seleção;
  - **vermelho** (`#e0574a`) para avisos e o X do recapturado;
  - `TN.PLAYER_COLORS`, um pouco desbotadas, para os jogadores.
- **Moldura:** nos menus, o `D.crt` (scanlines) sai e entra só uma vinheta leve. O jogo não muda.

### 5.2 Telas

| tela | composição |
|---|---|
| Título | logo TURNO DA NOITE riscado com sublinhado duplo; itens à mão; os 4 detentos de giz andam pelo pé da lousa |
| Controles | os esquemas de teclado como bilhetes riscados; o texto explicativo à mão |
| Ensaiar uma etapa | lista à mão com rolagem; seleção circulada; tagline embaixo |
| Lobby | 4 celas desenhadas lado a lado na planta; quem entra aparece dentro da sua cela, com o rótulo do dispositivo; o painel de sala de rede vira um bilhete |
| Montar o plano | checklist rabiscado `[x]`/`[ ]` das etapas; os valores com `◀ ▶`; os jogadores como detentos à direita |
| Roleta | as etapas como cartões de papel presos com fita na parede; o destaque circula entre eles e o escolhido fica circulado em amarelo |
| Briefing | as instruções num bilhete de papel (o retângulo claro com texto escuro continua legível); ao lado, "TÚNEL CAVADO" com os detentos, os metros e ✔/… de pronto |
| Pausa | por cima do jogo, uma faixa de lousa escura com o título e os itens |
| Fim da tentativa | por cima do jogo, a lousa semitransparente com os detentos e "+N m" |
| Placar | **túneis de giz** descendo do chão da cela, um por jogador, com comprimento proporcional aos metros (animado como as barras de hoje) |
| Pódio | o muro desenhado no meio: o 1º **do lado de fora**, comemorando; os outros dentro; o último com X vermelho e a etiqueta SOLITÁRIA |
| Rede (criar sala, entrar, mensagem) | mesma lousa e letra; mantêm "SALA" e o código para não confundir ao conectar |

### 5.3 Textos
Só os textos das telas de menu. Os minigames não mudam.

| hoje | novo |
|---|---|
| uma festa de minigames para 1–4 unidades de teste | 1 a 4 detentos · uma noite para cavar a saída |
| JOGAR (NESTE COMPUTADOR) / JOGAR (SALA X ABERTA) | PLANEJAR A FUGA / PLANEJAR A FUGA (SALA X ABERTA) |
| CRIAR SALA EM REDE LOCAL / FECHAR SALA X | CHAMAR COMPARSAS (REDE LOCAL) / FECHAR SALA X |
| ENTRAR EM SALA (REDE LOCAL) | ENTRAR NO PLANO (REDE LOCAL) |
| TESTAR UM MINIGAME | ENSAIAR UMA ETAPA |
| CONTROLES | CONTROLES |
| LOBBY / TESTE: <jogo> | ESCOLHA SUA CELA / ENSAIO: <jogo> |
| aguardando… / PRONTO! / vazio / BOT | na cela… / PRONTO PRA FUGIR! / cela vazia / BOT |
| [T] Completar vagas com bots | [T] Celas vazias com bots |
| CONFIGURAR PARTIDA | MONTAR O PLANO |
| ▶▶ COMEÇAR | ▶▶ COMEÇAR A FUGA |
| JOGOS NA PARTIDA | ETAPAS DO PLANO |
| RODADAS POR JOGO | TENTATIVAS POR ETAPA |
| MINIGAMES (AÇÃO liga/desliga) | ETAPAS POSSÍVEIS (AÇÃO liga/desliga) |
| PRÓXIMO TESTE · 3/6 | ETAPA 3 DE 6 |
| PLACAR GERAL / 12 pts | TÚNEL CAVADO / 12 m |
| 3 RODADAS · JOGO 2/6 | 3 TENTATIVAS · ETAPA 2/6 |
| RODADA 2 / 3 | TENTATIVA 2 / 3 |
| PAUSA / CONTINUAR / PULAR ESTE MINIGAME / SAIR PARA O MENU | SILÊNCIO, GUARDA NA RONDA / CONTINUAR / PULAR ESTA ETAPA / DESISTIR DA FUGA |
| FIM DA RODADA / +5 | FIM DA TENTATIVA / +5 m |
| PLACAR | QUANTO CADA UM CAVOU |
| Próximo: jogo 3/6 / Último jogo concluído! | Próxima: etapa 3/6 / Plano completo! Hora de sair. |
| TURNO ENCERRADO | O APITO TOCOU |
| P1 FOI APROVADO. | P1 FUGIU! |
| (pódio, sem rótulo) | 1º FUGIU · 2º e 3º RECAPTURADO · último SOLITÁRIA (com 1 ou 2 jogadores, só o 1º e o último) |
| JOGAR DE NOVO / MENU PRINCIPAL | TENTAR DE NOVO / VOLTAR PRA CELA |
| rodapés de ajuda | os mesmos comandos, com as palavras novas ("ESC volta pra cela", "Começa quando todos estiverem PRONTOS PRA FUGIR") |

As mensagens de rodapé com teclas (WASD, ESPAÇO etc.) continuam diretas: só o vocabulário em volta muda.

## 6. Arquivos

| arquivo | mudança |
|---|---|
| `engine/giz.js` (novo) | o kit `TN.giz` |
| `index.html` | carrega `engine/giz.js` depois de `engine/draw.js` |
| `engine/input.js` | `menu(permitidos)` |
| `engine/session.js` | `donoDoMenu()`, uso do filtro em todas as cenas, regra de pular, telas com `TN.giz`, textos novos e atalho `?cena=` |
| `engine/net.js` | telas `HostCreate`, `JoinList` e `NetMessage` com `TN.giz` |
| `tools/teste_menus.js` (novo) | testes Node do dono do menu e do determinismo do giz |
| `tools/menus.sh` (novo) | screenshots de todas as telas de menu |
| `CLAUDE.md`, `docs/COMO_CRIAR_MINIGAME.md` | registro do `TN.giz`, do dono do menu e dos testes novos |

**Atalho `?cena=<Nome>`** (em `TN.bootScene`): abre direto uma tela de menu (`Title`, `Controls`, `TestList`, `Lobby`, `Setup`, `Picker`, `Brief`, `Pause`, `RoundOver`, `ScoreScreen`, `Final`, `HostCreate`, `JoinList`, `NetMessage`).
- Usa uma sessão de mentira: 4 bots, uma playlist de 6 etapas no meio da partida e placar inventado.
- Serve só para teste e screenshot. Não muda o fluxo normal.

## 7. Testes

- **`node tools/teste_menus.js`** (novo, sem navegador): injeta entradas com `TN.input._inject` e confere:
  1. no título, `kb2` e `gp0` navegam e `n1:kb1` não;
  2. com P1 = `kb2` e P2 = `kb1`, na configuração só `kb2` move a seleção e começa a fuga;
  3. na pausa, o P2 não escolhe nada;
  4. no fim da tentativa e no placar, AÇÃO do P2 não pula e a do P1 pula;
  5. no lobby, o P2 (local ou remoto) entra e dá PRONTO; no briefing, cada um dá o seu PRONTO;
  6. sem humano local, qualquer dispositivo local do host navega;
  7. o giz é determinístico: o mesmo texto ou detento desenhado duas vezes gera a mesma sequência de chamadas num canvas de mentira que as registra.
- Os testes atuais continuam passando:
  - `node tools/simular.js`, também com `--sessao`, que percorre uma partida inteira só com bots e passa por todas as telas com sessão;
  - `node tools/teste_cenarios.js` e `node tools/teste_detento.js`;
  - `bash tools/teste_render.sh`;
  - `node tools/teste_rede.js`: o cliente entra no lobby, joga e o host vê a entrada dele.
- **Checagem visual:** `bash tools/menus.sh` gera um PNG de cada tela da tabela 5.2. Todos são revisados, e os principais vão para o usuário antes de concluir.

## 8. Riscos

| risco | mitigação |
|---|---|
| Letra de giz ilegível em textos pequenos (rodapés, rótulos de dispositivo) | abaixo de cerca de 14 px o grão e o deslocamento ficam mais fracos; conferir nos screenshots |
| Custo do giz por quadro (várias passadas por texto) | parede pré-gerada; grão por padrão fixo; menus são telas leves; medir se alguma tela ficar lenta |
| P1 sai do jogo na rede ou some no meio da partida | `donoDoMenu()` recalcula a cada quadro: sem P1 local, qualquer dispositivo local do host navega |
| Alguém no mesmo PC acha que travou porque seu controle não mexe no menu | o rodapé das telas com sessão diz "só o P1 controla o menu" |
