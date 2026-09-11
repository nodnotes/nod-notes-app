#!/usr/bin/env bash
# One-shot: push launch env from .env.local and deploy production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SCOPE="${VERCEL_SCOPE:-evan-sayanis-projects}"
PROJECT="${VERCEL_PROJECT:-nod-notes}"

if ! vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: vercel login"
  exit 1
fi

echo "→ Using existing Vercel link (skip link — it overwrites .env.local)"
if [[ ! -f .vercel/project.json ]]; then
  echo "No .vercel/project.json — run: vercel link --yes --project $PROJECT --scope $SCOPE"
  echo "Then restore .env.local from backup before continuing."
  exit 1
fi

# Read KEY from .env.local via Python (handles quotes/spaces; never prints values)
env_get() {
  local key="$1"
  python3 - "$key" <<'PY'
import sys
from pathlib import Path
key = sys.argv[1]
for line in Path('.env.local').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#') or '=' not in s:
        continue
    k, v = s.split('=', 1)
    if k == key:
        v = v.strip()
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        print(v, end='')
        break
PY
}

upsert_env() {
  local key="$1"
  local value="$2"
  local target="$3"
  if [[ -z "$value" ]]; then
    echo "  skip $key (empty)"
    return 0
  fi
  vercel env rm "$key" "$target" --yes --scope "$SCOPE" >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" "$target" --scope "$SCOPE" >/dev/null
  echo "  set $key ($target)"
}

echo "→ Writing production env"
for key in \
  NEXT_PUBLIC_SUPABASE_URL \
  NEXT_PUBLIC_SUPABASE_ANON_KEY \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  SUPABASE_SECRET_KEY \
  OPENAI_API_KEY \
  NOTION_CLIENT_ID \
  NOTION_CLIENT_SECRET \
  RESEND_API_KEY \
  RESEND_FROM_EMAIL \
  EARLY_ACCESS_EMAILS \
  HOMEPAGE_BOARD_ID \
  NEXT_PUBLIC_HOMEPAGE_BOARD_ID \
  STRIPE_SECRET_KEY \
  STRIPE_WEBHOOK_SECRET \
  STRIPE_PRICE_ID
do
  upsert_env "$key" "$(env_get "$key")" production
done

upsert_env COMING_SOON "true" production
upsert_env COMING_SOON "true" preview
upsert_env EARLY_ACCESS_EMAILS "$(env_get EARLY_ACCESS_EMAILS)" preview

echo "→ Deploying production (SITE_URL set after first URL is known)"
vercel deploy --prod --yes --scope "$SCOPE"
