#!/usr/bin/env bash
# Teste do render 3D num Chrome headless, abrindo tools/teste_render.html direto do arquivo (sem servidor).
# Roda as cenas no visual novo e no antigo (?visual=antigo) e compara o tempo médio de quadro.
# Uso: bash tools/teste_render.sh      → termina com "Tudo certo." (código 0) ou "FALHOU." (código 1)
cd "$(dirname "$0")/.."
source tools/_chrome.sh
P="$(pwd)"; command -v cygpath >/dev/null && P="$(cygpath -m "$P")"
PAGE="file:///${P#/}/tools/teste_render.html"
rodar() {
  $TIMEOUT "$BROWSER" "${CHROME_FLAGS[@]}" --allow-file-access-from-files --dump-dom "$PAGE$1" 2>/dev/null \
    | sed -n '/RESULTADO-INICIO/,/RESULTADO-FIM/p' | sed '1d;$d'
}
NOVO=$(rodar "")
ANTIGO=$(rodar "?visual=antigo")
echo "== visual novo";   echo "$NOVO"   | grep -v '^TEMPO_QUADRO_MS='
echo "== visual antigo"; echo "$ANTIGO" | grep -v '^TEMPO_QUADRO_MS='
TNOVO=$(echo "$NOVO" | sed -n 's/^TEMPO_QUADRO_MS=//p')
TANT=$(echo "$ANTIGO" | sed -n 's/^TEMPO_QUADRO_MS=//p')
FALHOU=0
if [ -z "$TNOVO" ] || [ -z "$TANT" ]; then echo "✗ a página de teste não rodou até o fim"; FALHOU=1
else
  echo "tempo médio de quadro: novo ${TNOVO} ms · antigo ${TANT} ms"
  awk -v n="$TNOVO" -v a="$TANT" 'BEGIN { exit !(n <= a * 1.10) }' || { echo "✗ visual novo mais lento que o antigo (tolerância 10%)"; FALHOU=1; }
fi
printf '%s\n%s\n' "$NOVO" "$ANTIGO" | grep -q '^✗' && FALHOU=1
[ "$FALHOU" = 0 ] && echo "Tudo certo." || { echo "FALHOU."; exit 1; }
