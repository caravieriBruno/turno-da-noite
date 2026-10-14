#!/usr/bin/env bash
# Screenshot de uma cena do tools/teste_render.js (sem servidor), para conferir cenários com os olhos.
# Uso: bash tools/ver_cena.sh <trecho-do-nome> [saida.png] [antigo]
#   ex.: bash tools/ver_cena.sh oficina /tmp/oficina.png
#        bash tools/ver_cena.sh pátio /tmp/patio_antigo.png antigo
cd "$(dirname "$0")/.."
source tools/_chrome.sh
CENA="$1"; OUT="${2:-/tmp/tn_cena.png}"; Q="?ver=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$CENA")"
[ "$3" = "antigo" ] && Q="$Q&visual=antigo"
P="$(pwd)"; command -v cygpath >/dev/null && P="$(cygpath -m "$P")"
OUTW="$OUT"; command -v cygpath >/dev/null && OUTW="$(cygpath -w "$OUT")"
$TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --allow-file-access-from-files --window-size=980,560 \
  --screenshot="$OUTW" "file:///${P#/}/tools/teste_render.html$Q" 2>/dev/null
echo "salvo em $OUT"
