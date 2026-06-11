#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

. "$SCRIPT_DIR/require-nvm.sh"
. "$SCRIPT_DIR/require-corepack.sh"

require_nvm "$REPO_ROOT"
activate_corepack "$REPO_ROOT"
pnpm install --frozen-lockfile

echo "Setup complete."
echo "Use plain commands now, e.g. pnpm run check"
