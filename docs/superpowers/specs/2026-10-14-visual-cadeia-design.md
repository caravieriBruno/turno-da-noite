# Visual "Cadeia PS2": especificação

Data: 2026-10-14 · Status: aguardando revisão do usuário

## 1. Objetivo

O 3D atual é liso e iluminado por igual, com um vazio em volta das arenas, e parece um protótipo. O objetivo é chegar ao clima do Machine Party (Steam app 4108000) sem copiá-lo. O tema visual passa a ser **detentos disputando a liberdade em minigames dentro de uma cadeia**.

O trabalho está pronto quando:
- os 23 minigames têm cenário de cadeia, textura suja, luz dura e escuridão nas bordas;
- os jogadores são detentos que se distinguem pela cor do uniforme;
- nenhum minigame perde legibilidade de jogo (perigos, alvos e o próprio jogador continuam fáceis de ver);
- o jogo continua abrindo pelo `index.html`, sem build, inclusive via `file://`, e a rede continua funcionando sem mudança.

## 2. Decisões já tomadas com o usuário

- Estética PS2: imagem em baixa resolução ampliada com pixel duro, texturas sujas pixeladas, luz dura e cores sujas, com destaque de jogo em verde CRT e perigo em vermelho.
- Tema de cadeia: meia-parede verde descascada, grades, fluorescente piscando, pátio com muro e arame farpado, vapor de sódio.
- **Sem chapéus.** Os bonecos se diferenciam só pela cor do uniforme.
- **Só o visual por enquanto.** Textos, briefings, títulos e "unidades de teste" não mudam.
- A base continua em JS + Three.js. Não haverá migração para engine em WebAssembly.
- Entra uma etapa de personagem em modelo glTF animado (etapa 4).

## 3. Fora do escopo

- Reescrever textos e narrativa (fica para uma etapa futura, se o usuário pedir).
- Alterar regras, pontuação, bots ou a rede de qualquer minigame.
- Áudio novo.
- Interface 2D (menus, HUD). Ela continua como está, nítida por cima da imagem pixelada.

## 4. Estado atual (protótipo já feito, não commitado)

Em `engine/render3d.js`, valendo para todos os jogos:
- **Pipeline retrô:** a cena vai para um alvo de 640×360 (HalfFloat). Um passo final faz tone mapping, sRGB, leve dessaturação e redução para 28 níveis com dither de Bayer 4×4. O canvas é ampliado pelo CSS com `image-rendering: pixelated`.
- **Texturas procedurais** (`concreto`, `piso`, `metal`, `tinta`, `tecido`): DataTexture 128×128 gerada por código com semente fixa, NearestFilter e projeção triplanar via `onBeforeCompile`. Funcionam como multiplicador da cor pedida pelo minigame.
  - Padrão por primitiva: `plane`/`disc`/`ring` usam `piso` em coordenadas de mundo; as demais usam `concreto` presa ao objeto; `metal >= 0.4` vira `metal`.
  - Opções novas: `o.tex` (nome ou `false`) e `o.texWorld`.
- **Luz:** ambiente baixo, sol fraco e quente, `SpotLight` de teto com sombra. Opções novas no `env`: `spot`, `spotColor`, `spotPos`, `spotTarget`, `spotAngle`.
- **Detento** no `r.character`: cabeça raspada, orelhas, olhos e boca, tom de pele por jogador, uniforme dessaturado 30%, número de prontuário nas costas (171, 155, 157, 180 para os jogadores; `o.number` sobrescreve). A coleira de choque com luz continua.
- **`r.room(x1, z1, x2, z2, o)`:** cela com meia-parede, janelas gradeadas, cano, grade lateral e luminárias (uma pisca de forma determinística por `api.time`).
- **`?visual=antigo`** volta ao visual liso (comparação e fallback).
- Aspiradores Assassinos já usa `r.room()` e teve a câmera ajustada.
- `node tools/simular.js` passou com os 23 jogos.

## 5. Arquitetura

O princípio é o mesmo do CLAUDE.md: **o motor oferece peças genéricas e cada minigame só as usa.** Nada no motor é específico de um jogo.

### 5.1 Pipeline e materiais (etapa 1: consolidar o protótipo)

- Manter o pipeline retrô como está. Expor `TN.R3.RETRO` (já existe) para minigames que precisarem ajustar algo.
- Revisar a legibilidade das cores de destaque. Elementos com `glow: true` não recebem textura nem luz, e assim o verde CRT e o vermelho de perigo continuam puros. Nada muda aqui, só fica documentado como regra.
- Afinar os valores padrão do `env` com base nos 23 screenshots. O critério: o jogador e os perigos sempre visíveis, e o resto pode afundar no escuro.
- Documentar em `docs/COMO_CRIAR_MINIGAME.md`: `o.tex`, `o.texWorld`, as opções de `spot*` do `env`, `o.number` do personagem, `r.room` e `?visual=antigo`.

### 5.2 Kit de cenários de cadeia (etapa 2)

Os 23 jogos se dividem em seis ambientes. Cada ambiente é um preset do motor, para que cada minigame só precise de uma chamada mais alguns props.

**`r.room(x1, z1, x2, z2, { estilo })`**, ambientes internos com a frente aberta para a câmera:

| estilo | parede | piso | detalhes |
|---|---|---|---|
| `cela` (padrão) | meia-parede verde descascada + bege | cimento | janelas gradeadas, grade de cela lateral, fluorescente |
| `oficina` | tijolo aparente + faixa zebrada | cimento manchado de óleo | telhado de zinco, lâmpada pendente, bancada encostada |
| `refeitorio` | azulejo branco encardido até meia altura | caquinho vermelho | passa-pratos gradeado, fluorescente |
| `subsolo` | concreto úmido escuro | concreto molhado | canos grossos, luz vermelha de emergência girando |
| `escritorio` | meia-parede bege + madeira | taco gasto | persiana, arquivo de aço, lâmpada amarelada |

**`r.yard(x1, z1, x2, z2, o)`**, pátio externo à noite:
- muro alto de concreto ao fundo e nas laterais, com rolo de arame farpado (concertina) no topo;
- guarita num canto, com holofote que varre a cena;
- postes de vapor de sódio laranja e chão de cimento com linhas de quadra apagadas;
- a varredura do holofote usa `api.time`, então é igual no host e nos clientes.

**`r.prop(nome, x, z, o)`**, props comuns: `beliche`, `vaso` (inox), `banco` (concreto), `mesa` (refeitório, com bancos), `tambor`, `pneu`, `colchao`, `grade` (trecho de grade avulso), `poste`, `arquivo`. `o` aceita `rotY`, `scale` e `color`. Só entram os props que algum jogo da tabela 5.3 usar.

Restrições do kit:
- máximo de 2 luzes pontuais por cenário (o motor tem limite de 6 por quadro);
- tudo que pisca ou se mexe depende só de `api.time`;
- todas as peças passam pelo validador do `tools/simular.js`, ou seja, `room`, `yard` e `prop` entram na lista do validador.

### 5.3 Ambiente de cada minigame (etapa 3)

| minigame | ambiente | ideia |
|---|---|---|
| aspiradores | `cela` | cela de triagem (feito no protótipo) |
| piso_falso | `cela` | pavilhão central, poço com galerias de celas ao fundo |
| carrapato | `cela` | galeria de celas |
| caminho_da_memoria | `cela` | corredor de celas; as portas das paredes viram portões de grade |
| fabrica_de_armas | `oficina` | oficina de trabalho prisional |
| cinzel | `oficina` | oficina de artesanato |
| empilhadeira | `oficina` | almoxarifado |
| corte_exato | `oficina` | serralheria |
| contramao | `subsolo` | poço de transferência com as escadas |
| triagem | `subsolo` | incinerador do subsolo |
| hora_do_trem | `subsolo` | túnel de serviço sob a cadeia |
| pular_corda | `subsolo` | casa de máquinas |
| cabo_de_guerra | `subsolo` | caldeira com a fornalha |
| bons_modos | `refeitorio` | refeitório; o Anfitrião vira o diretor lendo o jornal (só visual) |
| danca_das_cadeiras | `refeitorio` | refeitório com as cadeiras |
| servico_interno | `escritorio` | sala da administração |
| tragada | `yard` | fumódromo do pátio |
| pisa_leve | `yard` | terreno entre muros até a van da fuga |
| temporada_de_caca | `yard` | pátio visto da guarita (é `screenSpace`, exige cuidado) |
| sucata | `yard` | ferro-velho do pátio |
| batata_quente | `yard` | roda no pátio |
| morto_vivo | `yard` | contagem dos presos no pátio |
| estatua | `yard` | baile no pátio com as torretas na guarita |

Regras do retoque por jogo:
- trocar o fundo vazio pela chamada do ambiente e trocar as cores de chão e paredes próprias pelas da paleta;
- ajustar a câmera **só** se o cenário ficar escondido, e sempre conferir no screenshot que a arena inteira continua visível;
- preservar todo elemento de jogo: escotilhas, nichos, símbolos, setas e marcadores mantêm forma e cor de destaque;
- o retoque é feito em 4 lotes, um por grupo de ambiente: `cela`, `oficina` + `escritorio`, `subsolo` + `refeitorio`, `yard`. Ao fim de cada lote o usuário vê os screenshots antes do próximo.

### 5.4 Personagem glTF animado (etapa 4)

Objetivo: trocar o boneco de caixas por um modelo low-poly com esqueleto e animações, **sem mudar a API** `r.character(p, o)`.

**Asset**
- Só modelos CC0. Primeira opção: os personagens base e a Universal Animation Library da Quaternius (CC0, exportam glTF, 45 animações na versão gratuita). Reserva: Kenney Animated Characters (CC0, mas só com idle, corrida e pulo).
- Na implementação, conferir o conteúdo real do download: formato, nomes dos ossos e das animações.
- Orçamento: até cerca de 3 mil triângulos (combina com o PS2) e até 1,5 MB depois de embutido.
- Se a malha não tiver macacão, todo o corpo abaixo do pescoço recebe o material de uniforme. No estilo PS2 isso lê como macacão.
- Licença e origem registradas em `assets/LICENCAS.md`.

**Empacotamento sem build e funcionando em `file://`**
- O Chrome bloqueia `fetch` de arquivo local e o carregamento de módulos ES via `file://`. Por isso:
  - `vendor/GLTFLoader.js` e `vendor/SkeletonUtils.js` são convertidos uma única vez do `examples/jsm` do Three r158 para script clássico: o `import` vira `const { ... } = THREE`, o export vira `THREE.GLTFLoader = ...`, e a função `toTrianglesDrawMode` de BufferGeometryUtils fica embutida. A licença é MIT, a mesma do Three, e a conversão fica descrita em `vendor/LEIA-ME.md`.
  - `assets/detento.glb` é o arquivo-fonte. `tools/embutir_asset.js` (Node, sem dependências) gera `assets/detento.glb.js` com `TN.ASSETS.detento = '<base64>'`. Esse arquivo gerado é commitado e carregado por `<script>` no `index.html`. Só é preciso rodar o script quando o asset mudar, então isso não é um build para jogar.
- Em `TN.R3.init`, o modelo é decodificado com `GLTFLoader.parse`, de forma assíncrona. Até ficar pronto, ou se falhar, o motor usa o boneco de caixas atual e mostra um `console.warn`.

**Runtime**
- Cada instância do pool vem de `SkeletonUtils.clone` e tem seu próprio `AnimationMixer` e seus próprios materiais (uniforme, pele, número).
- Mapa de pose para animação:

  | pose | animação |
  |---|---|
  | `idle` | idle |
  | `walk` | caminhada ou corrida (`timeScale` proporcional à velocidade) |
  | `dead`, `lie` | morte, tocada uma vez e parada no último quadro |
  | `sit` | sentado |
  | `crouch` | agachado |
  | `fall` | queda |
  | `arms`, `aim` | braços à frente ou mira |

  A transição entre animações é um crossfade de 0,15 s. Se faltar a animação de uma pose, usa idle.
- Continuam funcionando: `o.flash` (emissive), `alive === false` (escurece), `o.scale`, `o.lean`, `o.y`, `o.dir`, `o.label` e `o.number`.
- O número de prontuário vira uma placa presa ao osso do tronco. A coleira de choque vira uma malha presa ao osso do pescoço, com a luz.
- O modelo é normalizado para cerca de 60 unidades de altura e para olhar para +X, igual ao boneco atual, para não mexer na lógica de nenhum jogo.
- Animação é só visual e local: não vai para `g.data` e não passa pela rede.
- `?visual=antigo` continua usando o boneco de caixas com visor.

## 6. Rede e testes

- **Rede:** nada muda no protocolo. Todo o visual sai de `draw3d`, que só lê o estado, e o que se mexe sozinho depende de `api.time`.
- **Testes a cada etapa:**
  1. `node tools/simular.js` (os 23 jogos) termina com "Tudo certo".
  2. Screenshot de cada jogo afetado, no visual novo e com `?visual=antigo`, conferindo legibilidade e enquadramento.
  3. `node tools/teste_rede.js` com o servidor rodando (etapas 1 e 4).
  4. Desempenho: medir o tempo médio de quadro no navegador nos dois visuais, usando o mesmo jogo e o mesmo tempo de partida. O visual novo não pode ficar mais lento que o antigo. Na etapa 4, medir com 8 personagens na tela.
  5. Etapa 4: abrir pelo `file://` (sem servidor) e confirmar que o modelo carrega.
- **Ferramenta:** o `tools/screenshot.sh` só procura Chrome nos caminhos do Windows e do Linux. Ele ganha o caminho do macOS (`/Applications/Google Chrome.app/...`).

## 7. Etapas e entregas

1. **Consolidar o protótipo:** afinar o `env` padrão, documentar no `COMO_CRIAR_MINIGAME.md` e corrigir o `screenshot.sh` no macOS.
2. **Kit de cenários:** estilos do `r.room`, `r.yard`, `r.prop` e o validador.
3. **Retoque dos 23 jogos** em 4 lotes por ambiente, com revisão do usuário a cada lote.
4. **Personagem glTF:** conversão do loader, escolha e embutimento do asset, mapa de animações e fallback.

As etapas 3 e 4 são independentes depois da 2. A 4 pode vir antes da 3 se o usuário preferir.

## 8. Riscos

| risco | mitigação |
|---|---|
| Cena escura demais esconde perigo ou jogador | revisar por screenshot a cada lote; destaque sempre com `glow`; `env` por jogo pode clarear |
| Texturas "nadam" em objetos que se movem | já resolvido: textura presa ao objeto; coordenadas de mundo só para pisos |
| GLTFLoader convertido quebrar numa atualização do Three | o Three está fixo no r158 em `vendor/`; a conversão fica documentada para refazer |
| Asset CC0 sem as animações necessárias | mapa com fallback para idle; Kenney de reserva; animações da Quaternius são compatíveis com outros esqueletos |
| Arquivo embutido pesado | orçamento de 1,5 MB, conferido no script de embutir |
| Máquina fraca | a resolução interna de 640×360 reduz o custo; `?visual=antigo` continua disponível |
