#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4100}"

curl -sS "$BASE_URL/api/health" | grep '"ok":true' >/dev/null

curl -sS -c /tmp/paper-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"name":"Smoke User","email":"smoke@example.com","password":"password123"}' \
  "$BASE_URL/api/auth/register" >/tmp/paper-register.json || true

curl -sS -c /tmp/paper-cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"password123"}' \
  "$BASE_URL/api/auth/login" | grep '"user"' >/dev/null

curl -sS -b /tmp/paper-cookies.txt "$BASE_URL/api/papers" | grep '"papers"' >/dev/null
