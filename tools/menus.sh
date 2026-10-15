#!/usr/bin/env bash
# Screenshot de todas as telas de menu (atalho ?cena=), para revisar o visual de giz.
# Uso: bash tools/menus.sh [pasta]    (padrão: screenshots/menus). Precisa do servidor: node tools/servidor.js 8765
cd "$(dirname "$0")/.."
source tools/_chrome.sh
DIR="${1:-screenshots/menus}"; mkdir -p "$DIR"
# nome:segundos de avanço (a roleta precisa girar um pouco; o placar precisa encher as barras)
for PAR in Title:1 Controls:1 TestList:1 Lobby:1 Setup:1 Picker:2 Brief:1 Pause:1 RoundOver:1 ScoreScreen:3 Final:2 HostCreate:0 JoinList:0 NetMessage:1; do
  NOME="${PAR%%:*}"; T="${PAR##*:}"
  OUT="$DIR/$NOME.png"; OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$(pwd)/$OUT")"
  $TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --window-size=1280,720 --virtual-time-budget=3000 \
    --screenshot="$OUTW" "http://127.0.0.1:${PORT:-8765}/index.html?cena=$NOME&t=$T" 2>/dev/null
  echo "ok $NOME"
done
echo "salvo em $DIR/"
