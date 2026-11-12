#!/usr/bin/env bash
# Smoke test for the local IA API (run on the EC2 instance).
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"

echo "== GET /health"
curl -s "$BASE_URL/health"
echo
echo "== GET /models"
curl -s "$BASE_URL/models" | head -c 500
echo
echo "== GET / (info)"
curl -s "$BASE_URL/"
echo
echo "== POST /chat"
time curl -s -X POST "$BASE_URL/chat" \
  -H 'Content-Type: application/json' \
  -d '{"message":"Responde solo con la palabra: hola","temperature":0}'
echo
