#!/bin/bash
# Block direct edits to lock files — use package manager commands instead
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$(basename "$FILE")" in
  package-lock.json|yarn.lock|pnpm-lock.yaml)
    echo "BLOCKED: Do not edit lock files directly — use npm/yarn/pnpm install" >&2
    exit 2
    ;;
esac

exit 0
