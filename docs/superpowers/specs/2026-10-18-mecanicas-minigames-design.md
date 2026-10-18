# Mecânicas novas em 5 minigames: especificação

## 1. Intenção

Dos apontamentos do usuário de 2026-10-18, estes cinco pedem uma mecânica nova ou refeita, mas continuam sem mexer no motor. Companheiras: `2026-10-18-ajustes-minigames-design.md` (ajustes rápidos), `2026-10-18-cameras-minigames-design.md` (câmeras e viewports) e `2026-10-18-nomes-jogadores-design.md`.

## 2. Regras gerais

- Só `minigames/<id>.js` muda. Estado simples em `g.data`/`p.data`.
- Toda mecânica nova tem bot que a usa (regra do projeto: o jogo termina sozinho e os bots jogam de verdade).
- Briefing e `controls` são atualizados quando um botão ganha função.
- Cada jogo passa em `simular.js --vezes 3` e `--parado`, com screenshot de conferência.

## 3. Jogos

### 3.1 Pular corda (`pular_corda`): laser alto e agachar
**Hoje:** um laser rente ao chão gira; aos 20 s entra um segundo braço baixo oposto ("CORDA DUPLA") e a partir de ~27 s o sentido inverte de vez em quando. Só existe pular (AÇÃO). EXTRA não é usado. A pose `crouch` já existe no motor.

**Muda:**
- Os braços do laser passam a ter altura: `{ off, high }`. O **braço baixo** (y ≈ 8) mata quem está no chão; o **braço alto** (y ≈ 34) mata quem está em pé **ou no ar**, e poupa quem está agachado.
- **EXTRA = agachar**: toque com duração fixa de 0,45 s, movimento a 70 px/s enquanto agachado, recarga 0,25 s. Não dá para pular agachado nem agachar no ar.
- O braço alto **substitui o segundo braço baixo**: entra aos **~12 s** (no lugar dos 20 s), com aviso "LASER ALTO." em ciano. Ele tem **ângulo e velocidade próprios** (`thetaAlto`, `OMEGA` ~0,8× do baixo) e gira no sentido oposto; as inversões de sentido continuam e valem para os dois. Assim as passagens dos dois braços se desencontram e o jogador decide pular ou agachar a cada uma. *(Escolha minha.)*
- Visual: o braço alto tem poste de montagem próprio e sombra no chão.
- Bot: calcula a chegada do braço como hoje; se for alto, agacha, se for baixo, pula, com o mesmo erro.
- Brief e `controls`: `b: 'agachar'`.

### 3.2 Bons modos (`bons_modos`): o guarda que anda
**Hoje:** o anfitrião está parado atrás de um jornal; o ciclo é ler 3 a 6 s → (20% finta) → baixar 0,35 s → graça 0,4 s → olhar 1 a 4 s → levantar. O aviso de 0,75 s com som é aprendível.

**Muda:**
- O anfitrião vira um **guarda da prisão que anda atrás da mesa**, de um lado para o outro (x entre ~160 e ~800, na profundidade da mesa), a 60 a 140 px/s, de costas para os pratos enquanto anda.
- Estados: `walk` (inofensivo) → `turn` (vira para a mesa em **0,3 s**, única pista, sem som) → `look` (vigia por 0,7 a 2,5 s; qualquer AÇÃO ou EXTRA é tiro) → `walk`.
- **Sem padrão de tempo:** a cada quadro o guarda tem uma chance de virar (taxa ~0,4/s, distribuição exponencial: média ~2,5 s de caminhada, pode ser 0,2 s ou 7 s), com `MIN_WALK` 0,6 s e `MAX_WALK` 8 s como limites.
- **Fintas** continuam (20%): o guarda para e olha de lado 40°, sem virar de frente.
- A arma e o tiro partem da posição atual do guarda. O bot reage ao `turn` com 0,05 a 0,3 s de atraso.
- O guarda é um `r.character` com `key: 'guarda'`, uniforme azul-escuro e quepe simples (caixa). O jornal some.
- Textos: "ELE ESTÁ OLHANDO" vira "O GUARDA VIROU".

### 3.3 Corte exato (`corte_exato`): figura única e eliminação
**Hoje:** turnos sequenciais, cada jogador com a própria figura (injusto: círculo contra triângulo invertido), `scoring: 'rank'` pela nota, ninguém morre.

**Muda:**
- Uma **figura por rodada, a mesma para todos** (`d.shape`), e **todos cortam ao mesmo tempo**, cada um no seu quadrante da tela (decisão do usuário em 2026-10-18). O quadrante tem o papel, o alvo em miniatura e o próprio cursor; com menos de 4 vivos os quadrantes se reorganizam (2: lado a lado; 3: dois em cima, um embaixo). O 3D vira fundo, como no Escultor (§3.5).
- No fim da rodada, **morre quem tirou a menor nota** (`scoring` passa a `'survival'`, com `g.eliminate`). Empate na menor nota: morrem todos os empatados, **a não ser que todos os vivos empatem**; aí ninguém morre e vem outra rodada. *(Escolha minha.)*
- Se sobra mais de um, nova rodada com figura **diferente da anterior** e prévia 0,3 s mais curta (mínimo 1 s).
- Duração: por rodada, prévia 2 s + corte **8 s** + resultado 2,2 s ≈ 12 s; 3 rodadas com 4 jogadores ≈ 40 s. Quem não entrega (EXTRA) até o fim é avaliado com o que cortou.
- Sem nota mínima de "passou": sempre morre o pior (leitura adotada do apontamento "se os 4 passarem, troca a figura": troca a cada rodada).
- HUD: figura da rodada no topo, a nota de cada um no próprio quadrante ao fim do corte, e "ÚLTIMO LUGAR SAI" no cabeçalho.
- Estado por jogador em `p.data` (polígono cortado, cursor, entregue); `d.shape`, `d.round` e `d.phase` em `g.data`. O bot corta no próprio quadrante como hoje.
- Classificação: é a maior mudança desta spec (o fluxo de turnos some).

### 3.4 Empilhadeira (`empilhadeira`): controle e eliminação
**Hoje:** controle de tanque (o giro é proporcional à velocidade, parada não gira, a ré inverte o volante), pegar e soltar com AÇÃO a 24 px; no fim de cada turno só o líder e os empatados sobrevivem (3 de 4 saem).

**Muda:**
- **Giro mínimo** de 0,35 da taxa máxima mesmo parada ou devagar; `PEDAL_RATE` e `STEER_RATE` 5 → 8; `GRAB` 24 → 34.
- **Pegar e soltar automáticos:** a ponta do garfo que encosta numa caixa livre a pega, **exceto caixas que já estão na própria zona**; entrar com a caixa no centro da própria zona a solta, e depois de soltar há **0,6 s** sem pegar nada. Roubar da zona rival continua: basta encostar. AÇÃO vira "soltar aqui" (para largar fora da zona de propósito). `controls` atualizado. *(Escolha minha.)*
- **Eliminação só do pior:** no fim do turno sai quem tem menos caixas (empate no mínimo: todos os empatados, a não ser que todos empatem; aí ninguém sai e vem outro turno). Os turnos seguintes continuam, cada um 1 s mais curto, até sobrar um ou acabar `MAX_SUBS`. *(Escolha minha.)*
- Bot: hoje solta apertando AÇÃO dentro da zona; passa a contar com a soltura automática e a usar o giro mínimo.

### 3.5 Escultor (`cinzel`): visão individual
**Hoje:** câmera única fixa, 4 bancadas lado a lado; o bloco hexagonal tem ~60 unidades de largura a 630 de distância e fica minúsculo. Já existe um desenho 2D em 4 quadrantes, usado só sem WebGL.

**Muda (sem motor):**
- No 3D, o cenário continua (bancadas, escultores, telão), mas por cima dele o `drawOverlay` desenha **4 painéis 2D** de ~420×220, um por quadrante, com margens de ~20 px por onde o 3D aparece, cada um com o bloco do jogador grande (~S=17 por célula), o cursor, o alvo em miniatura e o nome. Reaproveita `drawQuadrant`/`drawBoard`/`drawMemo` com os tamanhos ajustados. O 3D vira moldura/fundo, e isso é aceito. *(Escolha minha.)*
- Os painéis têm fundo escuro a ~85% de opacidade.
- Com menos de 4 jogadores, os quadrantes ocupam a tela em 2 colunas (2 jogadores: lado a lado; 3: dois em cima, um embaixo).
- Observação: quando o motor ganhar viewports (spec de câmeras), este jogo pode migrar para 4 vistas 3D. Não é escopo daqui.

## 4. Fora do escopo
- Tudo que está nas outras três specs.
- Novos minigames.

## 5. Testes
- `simular.js` por jogo (`--vezes 3`, `--parado`) e completo; `teste_rede.js` no fim.
- Screenshots: pular corda com o laser alto ativo (t ≥ 14 s), bons modos com o guarda virado, corte exato na eliminação, empilhadeira num turno, escultor com os 4 quadrantes.

## 6. Riscos
| risco | mitigação |
|---|---|
| Pular corda fica injusto se o alto e o baixo passam juntos | `off = π` e velocidades diferentes; o bot confirma que dá para sobreviver 60 s |
| Bons modos sem aviso vira sorte | 0,3 s de giro visível; `MIN_WALK` evita viradas em sequência; medir a taxa de mortes dos bots |
| Corte exato: ranking antigo em `results` | `scoring: 'survival'` usa a ordem de eliminação; `scoreLast` só no HUD |
| Escultor: quadrantes 2D escondem o 3D | o 3D vira fundo; quadrantes com alpha 0,8 e margens |
