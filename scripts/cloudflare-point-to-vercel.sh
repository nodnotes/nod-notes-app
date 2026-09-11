#!/usr/bin/env bash
# Point Cloudflare DNS for nodnotes.com at Vercel (A 76.76.21.21, DNS-only).
# Requires: export CLOUDFLARE_API_TOKEN=… with Zone.DNS Edit on nodnotes.com
set -euo pipefail

TOKEN="${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN with Zone DNS Edit}"
ZONE_ID="${CLOUDFLARE_ZONE_ID:-0e1f546e3979a9c677cf7c22af774dbf}"
TARGET_IP="76.76.21.21"

upsert_a() {
  local name="$1" # @ or www
  local fqdn="$2"
  local existing
  existing=$(curl -sS "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=A&name=${fqdn}" \
    -H "Authorization: Bearer ${TOKEN}" | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('result') or [{}])[0].get('id',''))")
  local body
  body=$(python3 - <<PY
import json
print(json.dumps({
  "type": "A",
  "name": "$name",
  "content": "$TARGET_IP",
  "ttl": 1,
  "proxied": False,
  "comment": "Vercel — nod-notes",
}))
PY
)
  if [[ -n "$existing" ]]; then
    curl -sS -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${existing}" \
      -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
      --data "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print('updated', '$fqdn', d.get('success'), d.get('errors'))"
  else
    curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
      -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
      --data "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print('created', '$fqdn', d.get('success'), d.get('errors'))"
  fi
}

# Also remove conflicting CNAMEs on apex/www if present
for fqdn in nodnotes.com www.nodnotes.com; do
  curl -sS "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=CNAME&name=${fqdn}" \
    -H "Authorization: Bearer ${TOKEN}" | python3 - <<'PY'
import json,sys,os,urllib.request
d=json.load(sys.stdin)
token=os.environ["CLOUDFLARE_API_TOKEN"]
zone=os.environ.get("CLOUDFLARE_ZONE_ID","0e1f546e3979a9c677cf7c22af774dbf")
for r in d.get("result") or []:
    rid=r["id"]; name=r["name"]
    req=urllib.request.Request(f"https://api.cloudflare.com/client/v4/zones/{zone}/dns_records/{rid}", method="DELETE",
      headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:
        print("deleted CNAME", name, resp.status)
PY
done

upsert_a "@" "nodnotes.com"
upsert_a "www" "www.nodnotes.com"
echo "Done. Verify: dig +short nodnotes.com A"
