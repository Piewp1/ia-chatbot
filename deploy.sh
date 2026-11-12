#!/usr/bin/env bash
# Despliegue en la EC2: ejecutar desde el clon del repo (ej. ~/ia-chatbot).
#   git pull && ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
BACKEND=/home/ubuntu/ia-backend

# Backend: sincroniza el codigo y reinicia el servicio (el .venv se conserva)
cp -r app/. "$BACKEND/app/"
cp requirements.txt "$BACKEND/"
"$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"
sudo systemctl restart ia-backend

# Frontend: servido por nginx en /, la API queda en /api/
sudo cp frontend/index.html frontend/style.css frontend/app.js /var/www/html/
sudo nginx -t && sudo systemctl reload nginx

sleep 2
curl -fsS http://127.0.0.1/api/health && echo && echo "OK: abre http://<ip-publica>/"
