#!/bin/bash
# One-command production deploy of the Relève app (app.relevestaffing.com).
# Follows the order in the Relève Book's deploy note: build on this Mac,
# then deploy the prebuilt output without Netlify rebuilding it.
# Run from Terminal:  bash ~/Releve/releve-app/scripts/deploy-prod.sh
set -e
cd "$(dirname "$0")/.."
trap 'rm -f netlify.toml' EXIT
rm -f netlify.toml
npx tsc --noEmit
npx netlify build
cat > netlify.toml <<'TOML'
[build]
  command = "echo using-prebuilt-next-output"
  publish = ".next"
TOML
npx netlify deploy --prod
echo
echo "Deployed. Check https://app.relevestaffing.com"
