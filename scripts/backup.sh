#!/usr/bin/env bash
# Relève — database backup.
#
# The free Supabase tier keeps no backups. This makes your own, onto this Mac,
# and costs nothing. Run it whenever, or let the schedule below do it.
#
#   ./scripts/backup.sh
#
# One-time setup: put your database connection string in .env.local as
# SUPABASE_DB_URL. Find it in Supabase under Project Settings > Database >
# Connection string > URI, and swap [YOUR-PASSWORD] for the database password.
# .env.local is never committed, so the password stays on this machine.
#
# To run it automatically every day at 9am, in Terminal:
#   crontab -e
# then add this line and save:
#   0 9 * * * cd ~/Releve/releve-app && ./scripts/backup.sh >> ~/Releve/backup.log 2>&1

set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${BACKUP_DIR:-$HOME/Releve/backups}"
KEEP=30                        # keep a month of dailies, delete the rest

if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env.local; set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is not set. Add it to .env.local — see the notes at the"
  echo "top of this file for where to find it. Nothing was backed up."
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump is not installed. Install it once with:  brew install libpq"
  echo "then:  brew link --force libpq"
  exit 1
fi

mkdir -p "$OUT"
STAMP=$(date +%Y-%m-%d_%H%M)
FILE="$OUT/releve_$STAMP.sql.gz"

echo "Backing up to $FILE"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges | gzip > "$FILE"

# A backup you have not checked is a guess. Fail loudly on an empty one.
SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 1000 ]; then
  echo "That backup is only $SIZE bytes, which means it did not work. Keeping it"
  echo "so you can look, but do not trust it."
  exit 1
fi

echo "Done — $(du -h "$FILE" | cut -f1)"

# prune old ones
ls -1t "$OUT"/releve_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "Removing old backup $(basename "$old")"
  rm -f "$old"
done
