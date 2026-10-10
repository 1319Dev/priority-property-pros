#!/usr/bin/env bash
# Dry-run the admin dashboard migration. Never connects to production.
# With no DATABASE_URL, it only checks that the migration and rollback exist.
# With a local DATABASE_URL, it applies both inside a transaction and rolls back.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
migration="$root/supabase/migrations/20261014120000_admin_dashboard_rpcs.sql"
rollback="$root/supabase/rollbacks/20261014120000_admin_dashboard_rpcs_rollback.sql"

echo "DRY RUN ONLY. This script does not apply SQL to production."
test -f "$migration"
test -f "$rollback"

if [[ "${DATABASE_URL:-}" == *bersftkjpbzpgtahbqwd* || "${DATABASE_URL:-}" == *supabase.co* || "${DATABASE_URL:-}" == *supabase.com* ]]; then
  echo "Refusing: DATABASE_URL points at a hosted Supabase database." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "No local DATABASE_URL set. Nothing was applied."
  echo "Migration: $migration"
  echo "Rollback:  $rollback"
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Nothing was applied." >&2
  exit 1
fi

echo "Applying migration and rollback inside a transaction that will roll back."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\\i $migration
\\i $rollback
ROLLBACK;
SQL
echo "Dry run finished. The transaction was rolled back."
