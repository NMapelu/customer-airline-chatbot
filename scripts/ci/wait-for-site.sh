#!/usr/bin/env bash
# Smoke test for a deployed site: /login answers 200 with the security headers (CSP, HSTS).
# Retries for about a minute while the new version reaches Cloudflare's edge.
#   scripts/ci/wait-for-site.sh https://kq-policy-assistant.example.workers.dev
set -euo pipefail
url="${1:?usage: wait-for-site.sh <base url>}"
for attempt in 1 2 3 4 5 6; do
  headers=$(curl -sS -D - -o /dev/null --max-time 20 "$url/login" || true)
  if grep -q '^HTTP/[0-9.]* 200' <<<"$headers" &&
    grep -qi '^content-security-policy:.*nonce-' <<<"$headers" &&
    grep -qi '^strict-transport-security:' <<<"$headers"; then
    echo "$url is up with its security headers."
    exit 0
  fi
  echo "Attempt $attempt: $url/login isn't ready yet."
  sleep 10
done
echo "$url/login did not answer 200 with the security headers." >&2
exit 1
