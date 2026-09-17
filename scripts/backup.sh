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

# Any unhandled failure (pg_dump itself erroring, a bad connection string)
# still exits via set -e before the explicit report_backup calls below run.
# This trap catches that case too, so a silent crash still shows up on the
# Team page as "last failure: just now" instead of nothing at all.
on_err() {
  local code=$?
  if [ "$code" -ne 0 ] && command -v psql >/dev/null 2>&1 && [ -n "${SUPABASE_DB_URL:-}" ]; then
    psql "$SUPABASE_DB_URL" -q -c "select log_backup(false, null, 'script exited with code ${code}');" >/dev/null 2>&1 || true
  fi
}
trap on_err EXIT

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

# Report into the console (PART 34) so "did last night's backup run" is a
# glance at the Team page instead of a question only this Mac can answer.
# Uses the same SUPABASE_DB_URL already in .env.local — nothing new to set up.
# A failure to report never fails the backup itself.
report_backup() {
  if command -v psql >/dev/null 2>&1; then
    psql "$SUPABASE_DB_URL" -q -c "select log_backup(${1}, ${2}, '${3}');" >/dev/null 2>&1 || true
  fi
}

if [ "$SIZE" -lt 1000 ]; then
  echo "That backup is only $SIZE bytes, which means it did not work. Keeping it"
  echo "so you can look, but do not trust it."
  report_backup false "$SIZE" "backup file too small"
  exit 1
fi

echo "Done — $(du -h "$FILE" | cut -f1)"
report_backup true "$SIZE" "$(basename "$FILE")"

# prune old ones
ls -1t "$OUT"/releve_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  echo "Removing old backup $(basename "$old")"
  rm -f "$old"
done
