#!/usr/bin/env bash
# Install only the toolchains used by the server-backed browser build.
set -euo pipefail
cd "$(dirname "$0")/.."

# Native modules in remote run in the same Node process as the web server.
if [[ -z "${npm_config_nodedir:-}" ]]; then
	version="$(node -p 'process.versions.node')"
	headers="$PWD/.build/keyline-headers"
	export npm_config_nodedir="$headers/node-v$version"
	if [[ ! -f "$npm_config_nodedir/include/node/node.h" ]]; then
		mkdir -p "$headers"
		(
			cd "$headers"
			archive="node-v$version-headers.tar.gz"
			curl -fsSLO --retry 2 "https://nodejs.org/dist/v$version/$archive"
			curl -fsSL --retry 2 "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o SHASUMS256.txt
			python3 - "$archive" <<'PY'
import hashlib
from pathlib import Path
import sys
archive = Path(sys.argv[1])
checksums = {name: digest for digest, name in (line.split() for line in Path("SHASUMS256.txt").read_text().splitlines())}
if hashlib.sha256(archive.read_bytes()).hexdigest() != checksums[archive.name]:
	raise SystemExit("Node header archive checksum mismatch")
PY
			tar -xzf "$archive"
		)
	fi
fi

corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm -C build install --frozen-lockfile --ignore-scripts
corepack pnpm -C remote install --frozen-lockfile
