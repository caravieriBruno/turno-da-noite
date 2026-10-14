#!/usr/bin/env bash
# Tira um screenshot do jogo num momento específico usando Chrome/Edge headless.
# Uso: bash tools/screenshot.sh <id-do-minigame> <segundos> [saida.png]
#   ex.: bash tools/screenshot.sh aspiradores 12 shot.png
# Precisa do servidor rodando: node tools/servidor.js 8765
ID="$1"; T="${2:-10}"; OUT="${3:-screenshot_$1_$2.png}"
for B in "/c/Program Files/Google/Chrome/Application/chrome.exe" "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" "$(command -v google-chrome)" "$(command -v chromium)"; do
  [ -x "$B" ] && BROWSER="$B" && break
done
[ -z "$BROWSER" ] && { echo "Chrome/Edge não encontrado"; exit 1; }
OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$(pwd)/$OUT")"
"$BROWSER" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,720 --virtual-time-budget=2000 \
  --screenshot="$OUTW" "http://127.0.0.1:${PORT:-8765}/index.html?game=$ID&extra=$ID&humans=0&t=$T" 2>/dev/null
echo "salvo em $OUT"
