#!/bin/bash
# Sobe o servidor da rede local e abre o jogo no navegador (macOS: dois cliques no Finder)
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then
  echo "Node.js não encontrado. Instale em https://nodejs.org e tente de novo."
  read -n 1 -s -r -p "Aperte uma tecla para fechar…"; exit 1
fi
(sleep 1; open "http://localhost:8765") &
node tools/servidor.js 8765
