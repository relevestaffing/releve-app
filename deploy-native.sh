#!/bin/bash
# Relève app: build and deploy (3 November 2026, the new phone app shell).
# Same order as every deploy: clean build, draft, check it, then production.
set -e
cd "$(dirname "$0")"
export NETLIFY_AUTH_TOKEN="$(cat ../.deploy-keys/netlify_token)"
export NETLIFY_SITE_ID=516b5e01-b704-4ba7-aebb-c9ae0cab202d
rm -f netlify.toml
echo "Building the app (about two minutes)..."
npx netlify build
printf '[build]\n  command = "echo using-prebuilt-next-output"\n  publish = ".next"\n' > netlify.toml
echo "Draft deploy..."
DRAFT=$(npx netlify deploy --json | python3 -c "import sys,json;print(json.load(sys.stdin)['deploy_url'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DRAFT/")
echo "Draft $DRAFT answered $CODE"
if [ "$CODE" != "200" ] && [ "$CODE" != "307" ] && [ "$CODE" != "302" ]; then rm -f netlify.toml; echo "Draft did not answer. Stopped before going live."; exit 1; fi
echo "Going live..."
npx netlify deploy --prod
rm -f netlify.toml
echo ""
echo "Done. The new phone app is live for your account."
