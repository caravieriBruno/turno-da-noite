#!/usr/bin/env bash
# Screenshot de todos os minigames do manifesto, no visual novo e no antigo (?visual=antigo), para revisão.
# Uso: bash tools/screenshots.sh [pasta] [segundos]    (padrão: screenshots e 12; pasta relativa à raiz)
# Saída: <pasta>/<id>.png e <pasta>/<id>_antigo.png. Precisa do servidor: node tools/servidor.js 8765
cd "$(dirname "$0")/.."
DIR="${1:-screenshots}"; T="${2:-12}"
mkdir -p "$DIR"
IDS=$(node -e "global.TN={};require('./minigames/manifest.js');console.log(TN.MINIGAME_FILES.map((f)=>f.replace(/\.js$/,'')).join(' '))")
for ID in $IDS; do
  bash tools/screenshot.sh "$ID" "$T" "$DIR/$ID.png" >/dev/null
  EXTRA_PARAMS="&visual=antigo" bash tools/screenshot.sh "$ID" "$T" "$DIR/${ID}_antigo.png" >/dev/null
  echo "ok $ID"
done
echo "salvo em $DIR/"
