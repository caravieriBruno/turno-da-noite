# Nomes dos jogadores: especificação

## 1. Intenção

Pedido do usuário em 2026-10-18: "colocar nome nos personagens", com **cada jogador escolhendo o próprio nome no lobby**. Hoje sobre o boneco aparece "P1".."P4" (`label` em `engine/minigame.js`), e `p.name` é só a cor (VERMELHO, AZUL...).

## 2. Decisões

- O nome é escolhido **no lobby**, dentro da cela do jogador, com o próprio dispositivo (teclado, controle ou cliente de rede), por uma **roda de letras** estilo fliperama. Assim funciona igual para teclado, gamepad e jogador remoto, sem precisar de texto digitado pela rede.
- Até **8 caracteres**, maiúsculas A–Z, 0–9, espaço e `-`. Nome vazio não é aceito.
- O nome fica guardado por dispositivo em `localStorage` (`turno-da-noite-nomes`, `{ kb1: 'BRUNO', gp0: ... }`), então na próxima partida ele já vem preenchido. No cliente de rede, o padrão é o nome salvo naquele computador: ao entrar na sala o cliente manda **uma mensagem nova** `{ t: 'nomes', nomes: { kb1: 'BRUNO', ... } }` (pequena mudança no protocolo do `net.js`), e o host usa esses nomes como padrão nas celas daquele cliente (`n<cliente>:kb1`). A edição pela roda continua sendo só entrada abstrata. *(Escolha minha.)*
- Padrão quando não há nome salvo: um apelido de detento sorteado de uma lista (ex.: BIGODE, SOMBRA, FAÍSCA, MUDO, CANHOTO, PIOLHO, TRINTA, FUMAÇA...), sem repetir entre as 4 celas.

## 3. Fluxo no lobby

1. AÇÃO: entra na cela. A cela mostra a **roda de letras** com o nome padrão e o cursor já em **✓**.
   - Quem aceita o padrão: AÇÃO de novo → "na cela…".
   - Quem quer trocar: ← → movem o cursor entre as posições do nome e o ✓; ↑ ↓ trocam o caractere da posição (A…Z, 0…9, espaço, −, ciclo); AÇÃO em ✓ confirma; EXTRA apaga o último caractere (se vazio, EXTRA sai da cela).
2. "na cela…": AÇÃO = PRONTO PRA FUGIR!; EXTRA = volta a editar o nome.
3. PRONTO: EXTRA = volta para "na cela…" (como hoje).
4. A contagem para começar só roda quando todos que entraram estão PRONTOS (como hoje). Quem está editando não está pronto.

A tecla `T` (bots) e o `Esc` continuam do host.

## 4. Onde o nome aparece

- **Sobre o boneco** no jogo: `label` passa a ser o nome (em vez de "P1"). O motor desenha o rótulo como hoje (`o.label` em `r.character`).
- **HUD do motor** (placar da barra de cima, mensagens tipo "`${p.label}` CHEGOU PRIMEIRO!"): recebem o nome automaticamente, porque usam `p.label`.
- **Menus** (briefing, fim da tentativa, placar, pódio): mostram o nome no lugar de "P1"; a cor continua identificando. Bots: o apelido sorteado + "BOT".
- **Lobby**: o nome aparece na cela e substitui "CELA N" quando confirmado.
- `p.name` passa a ser o nome escolhido (e `TN.PLAYER_NAMES` continua como fallback das cores).

## 5. Motor e arquivos

- `engine/session.js`: roda de letras no `Lobby` (estado por slot: `nome`, `editando`, `cursor`), lista de apelidos, persistência, `buildRoster` passa `name`; menus usam `p.name`.
- `engine/minigame.js`: `label: r.name` (com fallback "P1" se vazio).
- `engine/giz.js`: desenho da roda (`G.rodaDeLetras`) e do nome na cela.
- Nada muda nos minigames: os que desenham `p.label` em 2D passam a mostrar o nome. Conferir por screenshot os que têm pouco espaço (contramão, triagem, empilhadeira): o rótulo tem `maxWidth`.
- Rede: `name` já viaja no roster e nos slots do lobby (string simples).

## 6. Testes

- `tools/teste_menus.js`: entrar, editar (↑ troca letra, → move, EXTRA apaga), confirmar; nome vazio não confirma; 8 caracteres no máximo; o padrão vem do `localStorage` quando existe e é apelido sorteado sem repetição quando não; o jogador remoto edita o próprio nome pela entrada abstrata; `buildRoster` leva o nome e `TN.Round` põe no `label`.
- `simular.js` completo (os bots têm apelido) e `teste_rede.js` (o cliente vê o nome que escolheu).
- Screenshots do lobby editando e de 3 jogos com rótulo (contramão, triagem, aspiradores).

## 7. Fora do escopo

- Nome digitado por texto livre no teclado físico (poderia entrar depois como atalho para quem usa `kb1`).
- Perfis, avatares ou cores escolhidas pelo jogador.

## 8. Riscos

| risco | mitigação |
|---|---|
| Nome longo quebra HUDs apertados | 8 caracteres e `maxWidth` nos rótulos; screenshots dos jogos apertados |
| Dois jogadores escolhem o mesmo nome | aceito; a cor diferencia. Se igual a outro da sala, acrescenta-se " 2" na confirmação |
| Roda de letras lenta para digitar | o padrão já vem pronto (2 toques para aceitar) e o nome fica salvo por dispositivo |
