#!/usr/bin/env bash
set -euo pipefail
HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
chmod +x "$0" 2>/dev/null || true
INPUT="${1:-$HERE/crawler-live-translations.jsonl}"
exec python3 "$HERE/live_dictionary.py" --input "$INPUT" --watch
