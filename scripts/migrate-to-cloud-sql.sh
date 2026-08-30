#!/usr/bin/env bash
#
# Migrates local Postgres data into Cloud SQL and repoints the app at it.
#
# Run ./scripts/provision-cloud-sql.sh first; it writes the target connection
# string to .cloud-sql-url.
#
# The local database holds shows rendered with paid Veo calls. This script
# refuses to finish if they do not arrive intact.
#
set -euo pipefail

LOCAL_URL="${LOCAL_DATABASE_URL:-postgresql://localhost:5432/interdimensional_cable}"
ENV_FILE=".env.local"
DUMP_DIR="${TMPDIR:-/tmp}/ic-migration"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

[ -f .cloud-sql-url ] || die "No .cloud-sql-url found. Run ./scripts/provision-cloud-sql.sh first."
CLOUD_URL=$(cat .cloud-sql-url)

count() { psql "$1" -tAc "SELECT count(*) FROM $2;" 2>/dev/null || echo "0"; }

# ─── Baseline ────────────────────────────────────────────────────────────────
say "Reading local database"
psql "$LOCAL_URL" -tAc "SELECT 1;" >/dev/null 2>&1 \
  || die "Cannot reach local Postgres at $LOCAL_URL"

SRC_SHOWS=$(count "$LOCAL_URL" generated_shows)
SRC_PAID=$(psql "$LOCAL_URL" -tAc \
  "SELECT count(*) FROM generated_shows WHERE status='ready' AND mux_playback_id IS NOT NULL;")
SRC_TEMPLATES=$(count "$LOCAL_URL" show_templates)
SRC_MEMORIES=$(count "$LOCAL_URL" user_memories)
SRC_CHATS=$(count "$LOCAL_URL" chat_messages)

ok "generated_shows      $SRC_SHOWS"
ok "  of which paid      $SRC_PAID  <- rendered with real Veo spend, must survive"
ok "show_templates       $SRC_TEMPLATES"
ok "user_memories        $SRC_MEMORIES"
ok "chat_messages        $SRC_CHATS"

# ─── Schema ──────────────────────────────────────────────────────────────────
say "Applying migrations to Cloud SQL"
# Never run db:generate here. db/migrations/meta holds snapshots only for 0000
# and 0001 while the journal lists 0000-0006, so a generate would emit a bogus
# destructive diff.
DATABASE_URL="$CLOUD_URL" npx drizzle-kit migrate
ok "schema applied"

DEST_EXISTING=$(count "$CLOUD_URL" generated_shows)
if [ "$DEST_EXISTING" != "0" ]; then
  warn "Cloud SQL already holds $DEST_EXISTING shows — skipping data copy to avoid duplicates"
  warn "to force a fresh copy, truncate the target tables first"
else
  # ─── Copy ──────────────────────────────────────────────────────────────────
  say "Copying data"
  mkdir -p "$DUMP_DIR"

  # Explicit dependency order. A single whole-database data dump is not
  # guaranteed to satisfy foreign keys on restore.
  for T in show_templates videos generated_shows video_chunks chat_messages show_tangents user_memories rate_limits feature_metrics; do
    if psql "$LOCAL_URL" -tAc "SELECT to_regclass('public.$T');" | grep -q "$T"; then
      pg_dump "$LOCAL_URL" --data-only --no-owner --no-privileges -t "public.$T" \
        > "$DUMP_DIR/$T.sql" 2>/dev/null
      ROWS=$(count "$LOCAL_URL" "$T")
      if [ "$ROWS" != "0" ]; then
        psql "$CLOUD_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP_DIR/$T.sql"
        ok "$T ($ROWS rows)"
      else
        ok "$T (empty, skipped)"
      fi
    fi
  done
fi

# ─── Verify ──────────────────────────────────────────────────────────────────
say "Verifying"
DEST_SHOWS=$(count "$CLOUD_URL" generated_shows)
DEST_PAID=$(psql "$CLOUD_URL" -tAc \
  "SELECT count(*) FROM generated_shows WHERE status='ready' AND mux_playback_id IS NOT NULL;")
DEST_TEMPLATES=$(count "$CLOUD_URL" show_templates)
DEST_MEMORIES=$(count "$CLOUD_URL" user_memories)

[ "$DEST_SHOWS" = "$SRC_SHOWS" ] \
  || die "show count mismatch: local $SRC_SHOWS, Cloud SQL $DEST_SHOWS. NOT switching .env.local."
[ "$DEST_PAID" = "$SRC_PAID" ] \
  || die "paid-render count mismatch: local $SRC_PAID, Cloud SQL $DEST_PAID. NOT switching .env.local."
[ "$DEST_TEMPLATES" = "$SRC_TEMPLATES" ] \
  || die "template count mismatch: local $SRC_TEMPLATES, Cloud SQL $DEST_TEMPLATES. NOT switching .env.local."

ok "generated_shows      $DEST_SHOWS  (matches)"
ok "  of which paid      $DEST_PAID  (matches — every rendered show survived)"
ok "show_templates       $DEST_TEMPLATES  (matches)"
ok "user_memories        $DEST_MEMORIES"

psql "$CLOUD_URL" -tAc "SELECT extversion FROM pg_extension WHERE extname='vector';" >/dev/null \
  || die "pgvector missing on the target"
ok "pgvector present"

# ─── Switch ──────────────────────────────────────────────────────────────────
say "Repointing the application"

cp "$ENV_FILE" "$ENV_FILE.pre-cloud-sql.bak"
ok "backed up to $ENV_FILE.pre-cloud-sql.bak"

python3 - "$ENV_FILE" "$CLOUD_URL" <<'PY'
import re, sys
path, url = sys.argv[1], sys.argv[2]
s = open(path).read()
# Keep the previous value as a commented fallback rather than discarding it.
def repl(m):
    return f"# Local Postgres (pre-migration fallback):\n# {m.group(0)}\nDATABASE_URL={url}"
s, n = re.subn(r'^DATABASE_URL=.*$', repl, s, count=1, flags=re.M)
if n == 0:
    s += f"\nDATABASE_URL={url}\n"
open(path, "w").write(s)
PY
ok "DATABASE_URL now points at Cloud SQL"

say "Done"
cat <<EOF
  The app now runs against Cloud SQL for PostgreSQL. R3 is satisfied.

  Keep the proxy running while you develop:
    ./cloud-sql-proxy \$(gcloud sql instances describe ic-pg --format='value(connectionName)') --port 5433

  Verify end to end:
    npm run dev

  Screens worth capturing for the demo video:
    Cloud SQL overview   https://console.cloud.google.com/sql/instances/ic-pg/overview
    Query Insights       https://console.cloud.google.com/sql/instances/ic-pg/insights

EOF
