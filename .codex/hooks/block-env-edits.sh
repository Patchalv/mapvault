#!/bin/bash
# Block edits to .env files to prevent accidental secret exposure
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE" == *.env || "$FILE" == *.env.* ]] && [[ "$FILE" != *.env.example ]]; then
  echo "BLOCKED: Do not edit .env files — they contain secrets" >&2
  exit 2
fi

exit 0
