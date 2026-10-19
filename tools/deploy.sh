#!/usr/bin/env bash
# Put Pandu's showcase site live on Cloudflare Pages (project "pandu-nav").
#
#   ./tools/deploy.sh            production  -> https://pandu-nav.pages.dev   (branch main)
#   ./tools/deploy.sh staging    preview     -> https://staging.pandu-nav.pages.dev
#
# Uses the Cloudflare login already stored by wrangler (`npx wrangler login` if it expires).
# Builds into public/ first, then uploads a staged copy of it only: tools, notes, docs,
# sources and test output stay on this Mac.
set -euo pipefail

PROJECT="pandu-nav"
BRANCH="${1:-main}"
case "$BRANCH" in main|production) BRANCH="main" ;; staging) ;; *) echo "usage: $0 [main|staging]" >&2; exit 1 ;; esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CLOUDFLARE_ACCOUNT_ID="863c8569b09cb26bbcb75f90f23a26e5"

cd "$ROOT"
[ -d node_modules ] || npm install --silent
node tools/build.mjs

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
rsync -a --exclude '.DS_Store' --exclude '.playwright-cli' --exclude '.taste-skill' public/ "$STAGE/"

cd "$STAGE"
if ! npx --yes wrangler@latest pages project list 2>/dev/null | grep -qw "$PROJECT"; then
  npx --yes wrangler@latest pages project create "$PROJECT" --production-branch main --force
fi
echo "Uploading $(du -sh "$STAGE" | cut -f1) to $PROJECT ($BRANCH)…"
npx --yes wrangler@latest pages deploy "$STAGE" --project-name "$PROJECT" --branch "$BRANCH" \
  --commit-hash "$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo local)" \
  --commit-message "$(git -C "$ROOT" log -1 --pretty=%s 2>/dev/null || echo local build)" --commit-dirty=true
