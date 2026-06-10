#!/usr/bin/env bash
set -euo pipefail

# Purpose: one-time repo bootstrap for local development.
# Why this exists:
# - ensure the repo uses the pinned Node version from .nvmrc
# - ensure the repo uses the pinned pnpm version from package.json `packageManager`
# - install dependencies so team members can use plain `pnpm` commands every day
#
# This is intentionally a local developer bootstrap script only.
# CI should use its own standard tooling setup and should not run this script.

# Resolve paths so the script can be run from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Read canonical tool versions from repository config files.
if [ ! -f ".nvmrc" ]; then
	echo "Missing .nvmrc. Cannot determine required Node version."
	exit 1
fi

REQUIRED_NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
REQUIRED_PACKAGE_MANAGER="$(awk -F'"' '/"packageManager"[[:space:]]*:/ { print $4; exit }' package.json)"

if [ -z "$REQUIRED_NODE_VERSION" ]; then
	echo "Could not read Node version from .nvmrc."
	exit 1
fi

if [ -z "$REQUIRED_PACKAGE_MANAGER" ]; then
	echo "Could not read packageManager from package.json."
	exit 1
fi

if [[ "$REQUIRED_PACKAGE_MANAGER" != pnpm@* ]]; then
	echo "This setup script expects the packageManager field to be set to pnpm."
	echo "Found: $REQUIRED_PACKAGE_MANAGER"
	exit 1
fi

# nvm is a shell function, so we need to source it before calling `nvm`.
NVM_FOUND=false

# 1) Prefer an already-loaded nvm session in the current shell.
if [ -n "${NVM_DIR:-}" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
	. "$NVM_DIR/nvm.sh"
	NVM_FOUND=true
fi

# 2) Fall back to the conventional install path used by nvm users.
if [ "$NVM_FOUND" = false ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
	. "$HOME/.nvm/nvm.sh"
	if command -v nvm >/dev/null 2>&1; then
		NVM_FOUND=true
	fi
fi

# 3) We intentionally do not auto-install nvm in bootstrap.
#    Installing global developer tooling varies by team policy and shell setup.
if [ "$NVM_FOUND" = false ]; then
	echo "nvm is required for local setup but was not found."
	echo "Install nvm and rerun this script:"
	echo "  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash"
	echo "  source ~/.nvm/nvm.sh"
	exit 1
fi

# Guarantee this shell is on the project Node version.
nvm install "$REQUIRED_NODE_VERSION"
nvm use "$REQUIRED_NODE_VERSION"

CURRENT_NODE_VERSION="$(node -p 'process.versions.node')"
if [ "$CURRENT_NODE_VERSION" != "$REQUIRED_NODE_VERSION" ]; then
	echo "Could not switch to required Node version. Current: $CURRENT_NODE_VERSION, Required: $REQUIRED_NODE_VERSION"
	exit 1
fi

echo "Using Node $CURRENT_NODE_VERSION"

# Ensure Corepack is active and pnpm is pinned to the repo version.
if ! command -v corepack >/dev/null 2>&1; then
	echo "corepack is not available in this Node installation."
	echo "Please retry with a Node build that includes corepack (Node 16+)."
	exit 1
fi

corepack enable
corepack prepare "$REQUIRED_PACKAGE_MANAGER" --activate

# Install dependencies with a lockfile-safe command.
pnpm install --frozen-lockfile

echo "Setup complete."
echo "Use plain commands now, e.g. pnpm run check"
