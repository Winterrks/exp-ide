#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .build/keyline-web/out/server-main.js ]]; then
	echo "Build the workbench with scripts/keyline-web-build.sh first." >&2
	exit 1
fi
folder="${KEYLINE_WORKSPACE:-$PWD/.keyline/taskboard}"
if [[ ! -d "$folder" && -z "${KEYLINE_WORKSPACE:-}" ]]; then
	mkdir -p .keyline
	cp -R extensions/keyline/sample "$folder"
fi
exec node .build/keyline-web/out/server-main.js --host "${KEYLINE_HOST:-127.0.0.1}" --port "${KEYLINE_PORT:-5173}" --server-data-dir "$PWD/.keyline/server" --default-folder "$folder" "$@"
