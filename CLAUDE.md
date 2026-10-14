# Turno da Noite: instruções para a IA

Party game de navegador com minigames (1 a 4 jogadores locais/rede e bots), inspirado no Machine Party. É JS puro, **sem build**: abrir o `index.html` já roda. Os gráficos são **3D com câmera fixa** (Three.js r158 em `vendor/`, carregado como script clássico), e os menus e o HUD ficam numa camada 2D por cima.

## Estrutura
- `engine/`: motor. Contém utilidades, entrada, áudio sintetizado, desenho 2D, **`render3d.js`** (API 3D imediata: `r.box/cyl/sphere/plane/ring/beam/light/character...`), o `TN.Round` (uma rodada de minigame), `session.js` (menus, lobby, roleta, briefing, placar, pódio) e `net.js` (rede).
- `engine/cenarios.js`: kit de cenários de cadeia (`r.room` com estilos, `r.yard`, `r.prop`). O visual padrão é "cadeia PS2" (baixa resolução, texturas sujas, luz dura); `?visual=antigo` volta ao liso.
- `minigames/<id>.js`: **um arquivo por minigame**, registrado com `TN.registerMinigame`. A lista de carregamento fica em `minigames/manifest.js`.
- `minigames/_modelo.js`: modelo para copiar. Não está no manifesto.
- `docs/COMO_CRIAR_MINIGAME.md`: **referência completa da API**. Leia antes de criar ou alterar um minigame.
- `tools/simular.js`: testa minigames sem navegador, com 4 bots. `tools/screenshot.sh` e `tools/servidor.js` servem para a checagem visual.
- `research/`: engenharia reversa do Machine Party. Contém `ANALISE.md`, as especificações em `specs/`, o código decompilado e as ferramentas. **Fica só local: está no `.gitignore` e não pode ser commitada.** Pode não existir num clone.

## Rede local
- `tools/servidor.js` serve os arquivos e tem um WebSocket próprio (sem dependências) com salas. O `JOGAR_EM_REDE.bat` sobe esse servidor.
- `engine/net.js` funciona assim:
  - O **host** roda a simulação e transmite cerca de 30 snapshots por segundo, montados por um serializador genérico de grafo de objetos.
  - Os **clientes** só enviam a entrada e desenham a cópia recebida com o mesmo `draw`.
  - Cada jogador remoto vira o dispositivo `n<cliente>:<kb1|gp0>` no `TN.input` do host.
- Consequência: minigames não precisam de netcode, mas o estado deles precisa ficar em `g.data`/`p.data` como dado simples (detalhes em `docs/COMO_CRIAR_MINIGAME.md`).
- Testes de rede:
  - `node tools/teste_rede.js` faz o teste de ponta a ponta e precisa do servidor rodando.
  - Na URL: `?rede=host` cria a sala e `?rede=entrar[&sala=ABCD]` entra nela.

## Fluxo para criar um minigame novo a partir de uma ideia do usuário
1. Leia `docs/COMO_CRIAR_MINIGAME.md` e `minigames/aspiradores.js`, que é a referência de estilo.
2. Defina as regras: objetivo, como se morre, controles (andar + AÇÃO + EXTRA), pontuação (`survival`/`rank`/`points`), duração e um bot. Planeje também a **cena 3D**: cenário, câmera fixa (`camera`) e o que vai na camada 2D (`drawOverlay`). Monte o cenário com r.room/r.yard/r.prop (veja docs/COMO_CRIAR_MINIGAME.md).
3. Crie `minigames/<id>.js`. O nome do arquivo é igual ao id. Use textos em pt-BR e o tom sombrio-cômico de "instalação de testes". O desenho principal é o `draw3d(g, r)`; o `draw` 2D é opcional.
4. Adicione `'<id>.js'` em `minigames/manifest.js`.
5. Rode `node tools/simular.js <id> --vezes 3` e `node tools/simular.js <id> --parado`. As duas precisam terminar com "Tudo certo".
6. Faça a checagem visual: suba `node tools/servidor.js 8765` em background, rode `bash tools/screenshot.sh <id> <segundos> out.png` e leia o PNG.
7. Para jogar: `index.html?game=<id>`. Também há o menu "TESTAR UM MINIGAME".

## Regras
- Não altere o motor para um jogo específico. Se algo genérico faltar, adicione ao motor e documente em `docs/COMO_CRIAR_MINIGAME.md`.
- Minigames usam só `p.input` (que é abstrato), nunca teclas diretamente.
- Todo minigame precisa terminar sozinho, mesmo com um humano parado.
- Depois de mexer no motor, rode `node tools/simular.js` (todos os minigames), `node tools/teste_cenarios.js` e `bash tools/teste_render.sh` (render 3D no Chrome headless, nos dois visuais).
