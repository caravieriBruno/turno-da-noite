---
name: novo-minigame
description: Cria e adiciona um minigame novo ao Turno da Noite a partir de uma ideia do usuário (regras, bot, desenho, teste no simulador e screenshot). Use quando o usuário descrever uma ideia de minigame ou pedir "cria um minigame".
---

# Criar um minigame novo

Entrada: a ideia do usuário, que pode ser só uma frase.

1. **Contexto.** Leia `docs/COMO_CRIAR_MINIGAME.md` (API) e `minigames/aspiradores.js` (referência de estilo). Se a ideia lembrar um jogo do Machine Party, consulte `research/specs/`.
2. **Desenho de regras.** Antes de codar, escreva para você mesmo:
   - objetivo e como se morre ou perde;
   - controles: andar, AÇÃO, EXTRA (no máximo esses três);
   - modo de pontuação (`survival`, `rank` ou `points`) e bônus;
   - duração-alvo de 20 a 60 s por rodada e como ela termina sozinha;
   - estratégia do bot.

   Só pergunte algo ao usuário se a ideia for ambígua de verdade. Caso contrário, decida e siga.
3. **Implementação.**
   - Crie `minigames/<id>.js`, com o id em snake_case sem acentos, a partir de `minigames/_modelo.js`.
   - Textos em pt-BR, tom sombrio-cômico.
   - Use `icon` e `color`.
   - Desenhe em **3D** com `draw3d(g, r)` e câmera fixa (`camera`). Use `drawOverlay` para medidores, textos e placares fixos na tela. Siga o estilo de `minigames/aspiradores.js`: instalação industrial escura, luzes quentes e o personagem `r.character`.
   - Escreva um bot competente.
4. **Registro.** Acrescente `'<id>.js'` em `minigames/manifest.js`.
5. **Validação.** Ambos os comandos precisam passar:
   - `node tools/simular.js <id> --vezes 3`
   - `node tools/simular.js <id> --parado --vezes 2`

   Confira se a duração e a distribuição de pontos fazem sentido; ajuste o balanceamento se os bots sempre morrem juntos ou nunca morrem.
6. **Checagem visual.**
   - Suba o servidor em background: `node tools/servidor.js 8765`.
   - Rode `bash tools/screenshot.sh <id> 8 a.png` e `bash tools/screenshot.sh <id> 20 b.png`.
   - Leia os PNGs e corrija o que estiver feio: composição, personagens visíveis e câmera enquadrando a ação. Uma faixa vermelha "ERRO" na tela indica exceção.
7. **Resposta ao usuário.** Inclua as regras finais, os controles, como testar (`index.html?game=<id>`) e as decisões de design que você tomou.
