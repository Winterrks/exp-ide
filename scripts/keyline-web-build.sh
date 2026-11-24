#!/usr/bin/env bash
# Build the native server-backed web workbench without an Electron toolchain.
set -euo pipefail
cd "$(dirname "$0")/.."
corepack pnpm run gulp copy-codicons compile-extensions-build
corepack pnpm run gulp compile-extension-media-build
node build/next/index.ts bundle --target server-web --nls --out .build/keyline-web/out
node scripts/keyline-web-layout.mts
