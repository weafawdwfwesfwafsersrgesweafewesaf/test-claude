#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js n'est pas installé."
  echo "  Télécharge la version LTS sur https://nodejs.org puis relance ce fichier."
  open https://nodejs.org
  read -n 1 -s -r -p "Appuie sur une touche pour fermer…"
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Première installation, patiente une minute…"
  npm install --omit=dev || { echo "L'installation a échoué."; read -n 1; exit 1; }
fi
node server/index.js
