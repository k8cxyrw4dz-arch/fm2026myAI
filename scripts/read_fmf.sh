#!/usr/bin/env bash

set -euo pipefail
set +H 2>/dev/null || true

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-file.fmf> [output-dir]"
  exit 1
fi

INPUT_FILE="$1"
OUT_DIR="${2:-./fmf_extracted}"

if [[ ! -f "$INPUT_FILE" ]]; then
  echo "File not found: $INPUT_FILE"
  exit 1
fi

echo "== Basic Info =="
echo "Path: $INPUT_FILE"
echo "Size: $(wc -c < "$INPUT_FILE") bytes"
echo "Type: $(file -b "$INPUT_FILE")"
echo

MAGIC_HEX="$(xxd -p -l 8 "$INPUT_FILE" | tr -d '\n')"
echo "Magic (first 8 bytes): $MAGIC_HEX"

# ZIP signature: 50 4b 03 04
if [[ "$MAGIC_HEX" == 504b0304* ]]; then
  echo
  echo "Detected ZIP-like container. Listing entries:"
  unzip -l "$INPUT_FILE" || true
  mkdir -p "$OUT_DIR"
  if unzip -o "$INPUT_FILE" -d "$OUT_DIR" >/dev/null 2>&1; then
    echo "Extracted to: $OUT_DIR"
  else
    echo "Failed to extract ZIP contents."
  fi
  exit 0
fi

# GZIP signature: 1f 8b
if [[ "$MAGIC_HEX" == 1f8b* ]]; then
  echo
  echo "Detected GZIP stream. Previewing decompressed header:"
  if command -v gzip >/dev/null 2>&1; then
    gzip -cd "$INPUT_FILE" | head -c 256 | xxd -g 1
  else
    echo "gzip command not found."
  fi
  exit 0
fi

echo
echo "Unknown/proprietary format. Showing text and hex preview:"
echo "--- strings preview (first 80 lines) ---"
strings "$INPUT_FILE" | head -n 80 || true
echo "--- hex preview (first 256 bytes) ---"
xxd -g 1 -l 256 "$INPUT_FILE"
