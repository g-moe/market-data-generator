#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

. "$SCRIPT_DIR/require-corepack.sh"

activate_corepack "$REPO_ROOT"
pnpm install --frozen-lockfile
