# TURNO DA NOITE

Party game de navegador em **3D com câmera fixa**, com minigames curtos e mortais para 1–4 jogadores. É inspirado no **Machine Party**.

## Como jogar

- **Neste computador:** abra o `index.html` no navegador (Chrome, Edge ou Firefox, com WebGL). Não precisa instalar nada. Com `?2d=1` no endereço, o jogo usa os gráficos 2D simples.
- **Em rede local:**
  1. Num computador com [Node.js](https://nodejs.org), dê dois cliques em `JOGAR_EM_REDE.bat` (ou rode `node tools/servidor.js`).
  2. Nesse computador, escolha **CRIAR SALA EM REDE LOCAL**.
  3. Nos outros computadores ou notebooks da mesma rede, abra o endereço que o servidor mostrar (ex.: `http://192.168.0.10:8765`) e escolha **ENTRAR EM SALA**.
  4. No lobby, cada pessoa aperta **AÇÃO** para pegar uma vaga. Dá para misturar jogadores locais e da rede, e as vagas que sobrarem viram bots.
  5. Se o Windows perguntar sobre o Firewall, permita "redes privadas".

| Jogador | Mover | Ação | Extra |
|---|---|---|---|
| Teclado 1 | WASD / Setas | Espaço / clique esquerdo | Shift / G / clique direito |
| Teclado 2 | IJKL | U | O |
| Teclado 3 | Numpad 8456 | Num 0 | Num . |
| Gamepad | analógico/d-pad | A | B |

ESC pausa o jogo. As vagas vazias são preenchidas por bots, que dá para desligar no lobby com a tecla T.

## Minigames (23)

**Adaptados do Machine Party:** Aspiradores Assassinos, Tragada Certa, Linha de Montagem, Contramão, Escultor, Pisa Leve, Hora do Trem, Piso Falso, Bons Modos, Serviço Interno, Temporada de Caça, Plataformas de Sucata, Carrapato, Empilhadeira, Triagem. Também há três jogos que ficaram inacabados no original e foram completados aqui: Corte Exato, Dança das Cadeiras e Caminho da Memória.

**Originais (brincadeiras desconstruídas):** Batata Quente, Morto-Vivo, Pular Corda, Cabo de Guerra, Estátua.

## Criar um minigame novo

Um minigame é **um arquivo** em `minigames/`, que descreve a cena 3D a cada quadro com chamadas simples (`r.box`, `r.character`, `r.light`...). O guia completo está em [`docs/COMO_CRIAR_MINIGAME.md`](docs/COMO_CRIAR_MINIGAME.md). Com o Claude Code, basta descrever a ideia: a skill `/novo-minigame` cria o jogo, o bot, testa e registra.

```bash
node tools/simular.js            # testa todos os minigames com bots (inclui compatibilidade com a rede)
node tools/simular.js <id>       # testa um
node tools/simular.js --sessao   # simula uma partida completa
node tools/teste_rede.js         # teste de rede de ponta a ponta (servidor precisa estar rodando)
```

Para jogar um minigame específico, abra `index.html?game=<id>`. Também funcionam os parâmetros `&humans=2`, `&humans=0` (só bots) e `&speed=3`.

## Créditos

- [three.js](https://threejs.org) r158 (licença MIT), em `vendor/`.
