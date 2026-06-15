#!/usr/bin/env bash
set -euo pipefail
# Scratch — edit freely. `temp/` is git-ignored.

BASE="${BASE_URL:-http://localhost:3000}"

# Health check
curl -sf "$BASE/health" | jq .

# GET list
# curl -sf "$BASE/api/items" \
#   -H "Authorization: Bearer $TOKEN" | jq .

# POST
# curl -sf -X POST "$BASE/api/items" \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer $TOKEN" \
#   -d '{"name":"example"}' | jq .

# PATCH
# curl -sf -X PATCH "$BASE/api/items/ITEM_ID" \
#   -H "Content-Type: application/json" \
#   -H "Authorization: Bearer $TOKEN" \
#   -d '{"name":"updated"}' | jq .

# DELETE
# curl -sf -X DELETE "$BASE/api/items/ITEM_ID" \
#   -H "Authorization: Bearer $TOKEN" | jq .
