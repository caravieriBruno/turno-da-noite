#!/usr/bin/env bash
# Tira um screenshot do jogo num momento específico usando Chrome/Edge headless (com WebGL via SwiftShader).
# Uso: bash tools/screenshot.sh <id-do-minigame> <segundos> [saida.png]
#   ex.: bash tools/screenshot.sh aspiradores 12 shot.png
#   EXTRA_PARAMS="&visual=antigo" bash tools/screenshot.sh aspiradores 12 antigo.png
# Funciona mesmo para minigames fora do manifesto (carrega minigames/<id>.js via ?extra=).
# Precisa do servidor rodando: node tools/servidor.js 8765
source "$(dirname "$0")/_chrome.sh"
ID="$1"; T="${2:-10}"; OUT="${3:-screenshot_$1_$2.png}"
OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$(pwd)/$OUT")"
URL="http://127.0.0.1:${PORT:-8765}/index.html?game=$ID&extra=$ID&humans=0&t=$T${EXTRA_PARAMS}"
$TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --window-size=1280,720 --virtual-time-budget=3000 \
  --screenshot="$OUTW" "$URL" 2>/dev/null
echo "salvo em $OUT"
