# Ajustes rápidos em 11 minigames: especificação

## 1. Intenção

Em 2026-10-18 o usuário jogou a playlist inteira e anotou o que incomoda em cada minigame. Esta spec cobre os apontamentos que se resolvem com **números, regras de pontuação e feedback de tela**, sem mecânica nova e sem mexer no motor. As mecânicas novas estão em `2026-10-18-mecanicas-minigames-design.md`, as mudanças de câmera em `2026-10-18-cameras-minigames-design.md` e os nomes dos jogadores em `2026-10-18-nomes-jogadores-design.md`.

O objetivo é que cada jogo premie jogar bem, dê a informação certa no momento certo e não castigue por detalhe de controle.

## 2. Regras gerais

- Só `minigames/<id>.js` muda. Nada no motor.
- O estado continua em `g.data`/`p.data` como dado simples (rede).
- Os textos (briefings, mensagens) mudam só onde a regra mudou, e seguem o tom atual.
- Cada jogo alterado passa em `node tools/simular.js <id> --vezes 3` e `--parado`, e ganha um screenshot de conferência quando a tela muda.
- Os bots são ajustados sempre que a regra que eles seguem muda.

## 3. Jogos

### 3.1 Contramão (`contramao`)
**Hoje:** o topo dá 2/1 pontos; cada queda alheia dá +1 a todos ainda na escada; o último na escada ganha +1. Ficar na escada rende até 4, chegar ao topo no máximo 2. A seta a apertar fica num painel de 32 px preso à cabeça do boneco, que se move e sobrepõe a pista de trás; a câmera está a ~830 unidades.

**Muda:**
- Pontuação só por **ordem de chegada ao topo**: 4/3/2/1 com 4 jogadores (com menos jogadores, `n`, `n-1`, ...). Queda = 0. Somem o +1 por queda alheia e o +1 de "último na escada". Quando o tempo acaba, quem ainda está na escada marca 0.
- O jogo termina quando todos chegaram ou caíram, ou quando sobra um só na escada. O último na escada ganha **1 ponto de consolação**, sempre (mesmo que ninguém tenha chegado): sobreviver nunca vale mais que chegar. *(Escolha minha.)*
- A seta sai da cabeça: cada jogador ganha um **painel fixo de ~64 px na borda inferior**, na cor do jogador, com a seta grande e o medidor de ritmo ao lado. Sobre o boneco fica só um marcador pequeno (triângulo na cor) para achar quem é quem.
- Câmera mais perto: `pos.z` de 1080 para cerca de 900, alvo ajustado para manter as 4 escadas na tela. Confirmar por screenshot.
- Brief: "Só a chegada conta. Cair é 0."

### 3.2 Serviço interno (`servico_interno`)
**Hoje:** portador da seringa a 1,0× (igual à presa); infectado descongelado a 1,25× (mais rápido que o portador); arena 880×410 com 23 móveis sólidos e corredores de 63 a 104 px para um boneco de 32; infectar exige AÇÃO a 44 px (12 px entre as bordas); escuro a 0,86 com lanterna de 72 px; congelamento de 5 s.

**Muda:**
- `HOLDER_MULT` 1,0 → **1,3** e `HUNTER_MULT` 1,25 → **1,15**: o portador é sempre o mais rápido.
- Planta mais aberta: de 23 para **16 a 18 móveis** (saem 2 mesas do meio e os 3 vasos; corredores laterais livres). Arena ampliada no `init` para cerca de `{x:20, y:44, w:920, h:480}`, com câmera e pontos de nascimento ajustados.
- `INFECT_RANGE` 44 → **56**, `LIGHT_R` 72 → **95**, `FREEZE` 5 → **3** s.
- O bot de caçador passa a usar a nova velocidade.

### 3.3 Triagem (`triagem`)
**Hoje:** entre turnos há o banner do juiz (1,3 + 1,4 s) e o turno seguinte começa na hora, com uma mensagem de 1 s.

**Muda:** nova fase `pause` depois do julgamento: "TURNO N" grande no centro, contagem **3-2-1** com `tick` a cada número (~1,5 s no total) e "JÁ!" com `go` e um flash. Nenhuma entrada é aceita durante a pausa (hoje `update` já ignora fora de `play`). O placar de cada baia zera com destaque (pisca uma vez).

### 3.4 Linha de montagem (`fabrica_de_armas`)
**Hoje:** 10 peças no início; a reposição (3 s) só acontece quando alguém insere uma peça certa, e o tipo é sorteado ao acaso. Falta justamente o tipo que alguém precisa.

**Muda:**
- Reposição **pela necessidade**: o tipo reposto é o de maior demanda não atendida, `demanda(T) = vivos cuja receita pede T agora − peças de T no chão − peças de T carregadas`. Se nenhuma demanda for positiva, sorteia.
- Reposição **por tempo** além da por inserção: se o chão tem menos de 8 peças, entra 1 a cada 2 s.
- `START_PARTS` 10 → **14**, garantindo no início 1 peça do primeiro item da receita de cada jogador. `MAX_FLOOR` 12 → 14, `RESPAWN` 3 → 2 s.

### 3.5 Carrapato (`carrapato`)
**Hoje:** arena inteira com 4 pilares de raio 30; o tempo de ativação (15 s) aparece com décimos em 2 lugares e como número inteiro sobre o dispositivo em outros 2.

**Muda:**
- Some a contagem numérica (os 4 lugares). Fica o pisca da luz e o bip, cada vez mais rápidos; nos últimos 3 s a luz fica vermelha contínua. O painel do topo diz só "O CARRAPATO VAI DISPARAR…" (o texto "ARMADO!" do estado já disparado continua).
- `ACTIVATION` passa a ser sorteado entre **11 e 17 s** a cada ativação. A duração sorteada fica guardada em `g.data` (o pisca e o bip são calculados como fração dela).
- Obstáculos: de 4 para **8 a 10 pilares** (raio 22 a 34) numa grade 3×3 irregular, sem bloquear passagem. Continuam circulares, para reaproveitar `pillarPush`, as rotas do carrapato e o bot.
- Leitura de "mapa pequeno" adotada: falta de esconderijo, não a área (ampliar além da tela exigiria motor).

### 3.6 Caminho da memória (`caminho_da_memoria`)
**Hoje:** a prévia acende uma esfera de raio 7 no alto de cada porta, verde (segura) ou vermelha (errada); 42 lâmpadas minúsculas; a porta que já explodiu fica num vermelho parecido.

**Muda:**
- **Forma, mantendo as cores**: segura = **✓ verde** (`#46e27b`), errada = **✗ vermelho** (`#ff3b3b`), num painel de ~26×26 sobre a porta, virado para a câmera (`r.label` ou `r.box` + letra). *(Correção do usuário em 2026-10-18: o verde e o vermelho ficam; o que melhora é o destaque.)*
- Durante a prévia o **chão da porta** também é pintado na cor (plano com `glow`, opacidade ~0,35), para ficar óbvio qual painel pertence a qual porta.
- Porta que explodiu: fuligem preta com ✗ cinza, para não confundir com a prévia.
- A prévia continua única (segura e erradas acesas ao mesmo tempo, como hoje). O pisca ao atravessar passa para as mesmas cores novas. O 2D (`draw`) segue a mesma regra.

### 3.7 Piso falso (`piso_falso`)
**Hoje:** a queda testa só o centro do boneco, sem folga, e cada ladrilho sorteia o símbolo sozinho (seguros esparsos, ~20% sem vizinho seguro). Tempos fixos.

**Muda:**
- Teste de queda por **área**: o jogador só cai se nenhum de 5 pontos (centro e ±10 px em x e y) estiver sobre piso, com **0,15 s de tolerância** (campo novo, p.ex. `p.data.semChao`; `fallT` já existe e é a animação de queda) antes de eliminar.
- **Padrões por ciclo**, sorteados: blocos 2×2 ou 1×2 (símbolo por bloco), faixas (linhas ou colunas), anéis, tabuleiro. A proporção de pisos seguros vai de ~45% no 1º ciclo a ~30% no 4º.
- **Garantia:** depois do sorteio, cada jogador vivo tem ao menos um ladrilho seguro a até `SPEED × duração da fase final × 0,8`; se não tiver, o mais próximo vira seguro.
- Cadência com variação de ±0,3 s na espera e na fase final (mínimo de 1,0 s mantido). A morte súbita a partir do 5º ciclo continua.

### 3.8 Tragada certa (`tragada`)
**Hoje:** o pulmão enche de forma quadrática e tosse por 3 s acima de 1,0; a janela útil é de ~0,1 s. A barra de fôlego é a mecânica inteira.

**Muda (tira a mecânica, não só o desenho):**
- Lotar o pulmão **não dá mais tosse**: força a exalação com 0,3 s de atordoamento.
- Fica só a tosse de **apertar antes de terminar de soltar**, com `CHOKE_TIME` 3 → **1,2 s**.
- A barra de fôlego some. No lugar, um indicador simples da tragada (a brasa que acende e a fumaça), sem linha vermelha.
- O pulmão continua existindo como estado interno (é o que define quando a exalação é forçada), mas o jogador vê só a **brasa**, que acende conforme a tragada avança e apaga ao soltar. Não há linha vermelha nem punição por lotar.
- O cigarro acaba mais rápido: `CIG_MULT` 0,15 → **~0,3** (cada tragada cheia gasta ~0,3 do cigarro; jogo limpo em ~10 a 12 s). `MAX_DRAG` não muda (o teto nunca é atingido). *(Escolha minha; o revisor mostrou que mexer em `MAX_DRAG` não teria efeito.)*
- A disputa vira ritmo: tragar, deixar a exalação terminar, tragar de novo. Os pontos continuam 2/1/1 por ordem de término.
- Bot: traga até a exalação forçada e espera a exalação terminar, com erro de reação.

### 3.9 Batata quente (`batata_quente`)
**Hoje:** não custa nada segurar; o pavio (4 a 12 s, secreto) só corre.

**Muda:** a batata **esquenta na mão**: `pot.heldT` conta o tempo com o portador atual (zera ao passar); o pavio queima a `1 + 0,6 × heldT` vezes a velocidade, teto 3×. A partir de 1,5 s aparece "QUEIMANDO!" sobre o portador e a batata pisca mais rápido. O pavio continua secreto. O bot passa a soltar um pouco mais cedo.

### 3.10 Cabo de guerra (`cabo_de_guerra`)
**Hoje:** alternar AÇÃO/EXTRA com intervalo entre 0,12 e 0,32 s dá força 1; mais rápido dá 0,6 e gasta pegada; mais devagar dá 0,7. Martelar rende mais força por segundo que o ritmo certo até a pegada acabar, e nada na tela mostra o ritmo.

**Muda:**
- A janela de ritmo bom estreita para **0,20 a 0,32 s** entre toques (3 a 5 toques/s; hoje é 0,12 a 0,32, o que faz 8 toques/s render o dobro de 4). Mais rápido que isso é "afobado": `IMP_FAST` 0,6 → **0,3** e `GRIP_COST` 0,13 → **0,18**. Assim 4 toques/s é de fato o centro da janela. *(Escolha minha.)*
- **Medidor de cadência** no HUD de cada jogador: um anel que pulsa a ~4 Hz (o ritmo ideal) e a cor do último toque (verde no ritmo, vermelho afobado, cinza devagar), com popups "AFOBADO" / "DEVAGAR" quando muda. A barra de pegada cresce e ganha o rótulo "PEGADA".
- Brief: "Alterne AÇÃO e EXTRA, uns 4 toques por segundo. Martelar escorrega." Nos primeiros 5 s da rodada, um metrônomo pisca no centro.
- O ritmo continua livre (sem metrônomo obrigatório).

### 3.11 Hora do trem, só o empurrão (`hora_do_trem`)
**Hoje:** o empurrão existe (AÇÃO, alcance 60, cone de ~157° no total, recarga 0,5 s), mas o ocupante fica fundo no nicho e a parede o segura; a vítima volta em ~0,4 s.

**Muda:** se a vítima está num nicho, o impulso é **sempre para fora** do nicho (para o trilho), ignorando a direção do atacante. `SHOVE_RANGE` 60 → **72**, `SHOVE_LOCK` 0,5 → **0,35**, e a vítima fica **0,3 s sem poder reentrar** depois do atordoamento. A câmera de frente fica na spec de câmeras.

## 4. Fora do escopo
- Mecânicas novas (laser alto, policial que anda, corte único, empilhadeira automática, escultor em quadrantes).
- Câmeras (pisa leve, hora do trem de frente, temporada de caça).
- Nomes dos jogadores.
- Danca das cadeiras, sucata, morto-vivo, aspiradores e estátua: aprovados pelo usuário, não mudam.

## 5. Testes
- `node tools/simular.js` completo e, por jogo alterado, `--vezes 3` e `--parado`.
- Screenshots dos jogos com mudança de tela: contramão, serviço interno, caminho da memória, cabo de guerra, tragada, carrapato.
- `node tools/teste_rede.js` no fim (o estado continua simples).

## 6. Riscos
| risco | mitigação |
|---|---|
| Contramão sem o +1 por queda fica curto ou "morno" | rodadas continuam 2; se precisar, `START` maior para o topo ser alcançável |
| Serviço interno com arena maior sai do enquadramento | câmera ajustada no `init` e conferida por screenshot |
| Piso falso com garantia de piso seguro fica fácil demais | a garantia é de 1 ladrilho a até 80% do alcance; a proporção cai por ciclo |
| Tragada sem tosse por enchimento vira só "segure até acabar" | `MAX_DRAG` maior e tosse de apertar cedo mantêm o ritmo como habilidade; rever após jogar |
