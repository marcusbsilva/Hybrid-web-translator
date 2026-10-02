#!/usr/bin/env bash
set -e

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [[ ! -x "$SCRIPT_PATH" ]]; then
    chmod +x "$SCRIPT_PATH" 2>/dev/null || true
fi

cd "$PROJECT_ROOT"

exec python3 tools/corpus_crawler.py \
    --zh-dictionary dictionaries/zh.js \
    --vi-dictionary dictionaries/vi.js \
    "$@"
