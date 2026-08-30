#!/usr/bin/env bash
#
# Provisions Cloud SQL for PostgreSQL and points the app at it.
#
# This is the project's Google Cloud infrastructure dependency: every request
# (shows, transcripts, chat, memory bank, pgvector retrieval) reads the database
# configured here.
#
# Safe to re-run. Every step checks for existing state first.
#
#   ./scripts/provision-cloud-sql.sh
#
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-gen-lang-client-0573852365}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
INSTANCE="${CLOUD_SQL_INSTANCE:-ic-pg}"
DB_NAME="interdimensional_cable"
TIER="${CLOUD_SQL_TIER:-db-custom-1-3840}"
PROXY_PORT="${PROXY_PORT:-5433}"
ENV_FILE=".env.local"

export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"

say()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }

# ─── Preflight ───────────────────────────────────────────────────────────────
say "Preflight"

command -v gcloud >/dev/null || die "gcloud not found. Run: brew install --cask google-cloud-sdk"

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q .; then
  die "Not authenticated. Run: gcloud auth login"
fi
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
ok "authenticated as $ACCOUNT"

gcloud config set project "$PROJECT" --quiet >/dev/null 2>&1
ok "project set to $PROJECT"

# Cloud SQL cannot be created without an attached billing account. Fail here
# with a clear message rather than deep inside instance creation.
BILLING=$(gcloud billing projects describe "$PROJECT" \
  --format="value(billingEnabled)" 2>/dev/null || echo "UNKNOWN")
if [ "$BILLING" = "True" ]; then
  ok "billing is enabled"
elif [ "$BILLING" = "UNKNOWN" ]; then
  warn "could not read billing status (the Billing API may be disabled)"
  warn "continuing; instance creation will fail clearly if billing is off"
else
  die "Billing is NOT enabled on $PROJECT.
    Attach a billing account here, then re-run:
    https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
fi

# ─── APIs ────────────────────────────────────────────────────────────────────
say "Enabling APIs (takes ~30s)"
gcloud services enable sqladmin.googleapis.com --quiet
ok "sqladmin.googleapis.com"

# ─── Instance ────────────────────────────────────────────────────────────────
say "Cloud SQL instance: $INSTANCE"

if gcloud sql instances describe "$INSTANCE" --format="value(name)" >/dev/null 2>&1; then
  ok "instance already exists, reusing it"
else
  warn "creating instance — this takes 10-15 minutes, leave it running"
  if ! gcloud sql instances create "$INSTANCE" \
      --database-version=POSTGRES_16 \
      --edition=ENTERPRISE \
      --tier="$TIER" \
      --region="$REGION" \
      --storage-size=10GB \
      --storage-type=SSD \
      --no-backup \
      --quiet; then
    warn "tier $TIER was rejected, retrying with db-g1-small"
    gcloud sql instances create "$INSTANCE" \
      --database-version=POSTGRES_16 \
      --tier=db-g1-small \
      --region="$REGION" \
      --storage-size=10GB \
      --no-backup \
      --quiet
  fi
  ok "instance created"
fi

CONNECTION_NAME=$(gcloud sql instances describe "$INSTANCE" --format="value(connectionName)")
ok "connection name: $CONNECTION_NAME"

# ─── Password ────────────────────────────────────────────────────────────────
say "Database credentials"

# Reuse the password already in .env.local if this script has run before, so a
# re-run does not invalidate a working connection string.
EXISTING_PW=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_PW=$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null \
    | sed -n 's#^DATABASE_URL=postgresql://postgres:\([^@]*\)@127\.0\.0\.1.*#\1#p' || true)
fi

if [ -n "$EXISTING_PW" ]; then
  DB_PASSWORD="$EXISTING_PW"
  ok "reusing the password already in $ENV_FILE"
else
  # Generated without a pipeline on purpose: `... | head -c 32` closes the pipe,
  # the upstream process takes SIGPIPE, and under `set -euo pipefail` that aborts
  # the whole script.
  DB_PASSWORD=$(python3 -c "import secrets, string; print(''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32)))")
  ok "generated a 32-character password"
fi

gcloud sql users set-password postgres --instance="$INSTANCE" --password="$DB_PASSWORD" --quiet
ok "postgres password set"

# ─── Database ────────────────────────────────────────────────────────────────
say "Database: $DB_NAME"
if gcloud sql databases describe "$DB_NAME" --instance="$INSTANCE" >/dev/null 2>&1; then
  ok "database already exists"
else
  gcloud sql databases create "$DB_NAME" --instance="$INSTANCE" --quiet
  ok "database created"
fi

# ─── Auth Proxy ──────────────────────────────────────────────────────────────
say "Cloud SQL Auth Proxy"

PROXY_BIN="./cloud-sql-proxy"
if [ ! -x "$PROXY_BIN" ]; then
  ARCH=$(uname -m); [ "$ARCH" = "x86_64" ] && ARCH="amd64" || ARCH="arm64"
  curl -sSfLo "$PROXY_BIN" \
    "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.darwin.$ARCH"
  chmod +x "$PROXY_BIN"
  ok "downloaded proxy (darwin/$ARCH)"
else
  ok "proxy already present"
fi

# The proxy needs Application Default Credentials, which are separate from the
# gcloud CLI login.
if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then
  die "Application Default Credentials are missing.
    Run this, then re-run the script:
    gcloud auth application-default login"
fi
ok "application default credentials present"

if lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  ok "something is already listening on :$PROXY_PORT, assuming the proxy is up"
else
  "$PROXY_BIN" "$CONNECTION_NAME" --port "$PROXY_PORT" >/tmp/cloud-sql-proxy.log 2>&1 &
  for _ in $(seq 1 30); do
    lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
    sleep 1
  done
  lsof -nP -iTCP:"$PROXY_PORT" -sTCP:LISTEN >/dev/null 2>&1 \
    || die "proxy failed to start — see /tmp/cloud-sql-proxy.log"
  ok "proxy listening on 127.0.0.1:$PROXY_PORT (log: /tmp/cloud-sql-proxy.log)"
fi

NEW_URL="postgresql://postgres:${DB_PASSWORD}@127.0.0.1:${PROXY_PORT}/${DB_NAME}"

# ─── pgvector ────────────────────────────────────────────────────────────────
say "pgvector"
psql "$NEW_URL" -qc "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null
VECTOR_VERSION=$(psql "$NEW_URL" -tAc "SELECT extversion FROM pg_extension WHERE extname='vector';")
ok "pgvector $VECTOR_VERSION enabled"

# HNSW indexes, which db/schema.ts declares, need pgvector >= 0.5.0.
MAJOR=${VECTOR_VERSION%%.*}
MINOR=$(echo "$VECTOR_VERSION" | cut -d. -f2)
if [ "$MAJOR" -eq 0 ] && [ "${MINOR:-0}" -lt 5 ]; then
  die "pgvector $VECTOR_VERSION is too old for the HNSW index in db/schema.ts (need >= 0.5.0)"
fi
ok "version supports the HNSW index"

# ─── Report ──────────────────────────────────────────────────────────────────
say "Provisioned"
printf '  instance        %s\n' "$INSTANCE"
printf '  connection      %s\n' "$CONNECTION_NAME"
printf '  database        %s\n' "$DB_NAME"
printf '  proxy           127.0.0.1:%s\n' "$PROXY_PORT"
printf '  pgvector        %s\n' "$VECTOR_VERSION"
printf '\n  Next: ./scripts/migrate-to-cloud-sql.sh\n\n'

# Hand the connection string to the migration step without printing the password.
printf '%s' "$NEW_URL" > .cloud-sql-url
chmod 600 .cloud-sql-url
