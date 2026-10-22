#!/usr/bin/env bash
# Writes app/.env with the public URL + anon/publishable key for the hosted project.
# Key source: $SUPABASE_ANON_KEY, else fetched read-only via the Management API with
# $SUPABASE_ACCESS_TOKEN. Refuses service_role/secret keys. Never prints the key.
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-ipvcrygkulrwopgtdkwd}"
URL="https://${REF}.supabase.co"
KEY="${SUPABASE_ANON_KEY:-}"
if [ -z "$KEY" ]; then
  : "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ANON_KEY or SUPABASE_ACCESS_TOKEN}"
  KEY=$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$REF/api-keys" | node -e '
      const k=JSON.parse(require("fs").readFileSync(0,"utf8"));
      const pick=k.find(x=>x.name==="anon")||k.find(x=>x.type==="publishable");
      if(!pick) process.exit(2); process.stdout.write(pick.api_key);')
fi
case "$KEY" in sb_secret_*) echo "refusing secret key" >&2; exit 1;; esac
if printf %s "$KEY" | cut -d. -f2 | base64 -d 2>/dev/null | grep -q service_role; then
  echo "refusing service_role key" >&2; exit 1; fi
DIR="$(cd "$(dirname "$0")/.." && pwd)/app"
umask 077
printf 'EXPO_PUBLIC_SUPABASE_URL=%s\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$URL" "$KEY" > "$DIR/.env"
echo "wrote $DIR/.env (key length ${#KEY})"
