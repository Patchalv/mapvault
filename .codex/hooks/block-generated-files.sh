#!/bin/bash
# Block edits to generated files — these are auto-generated and should not be manually modified
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE" in
  */supabase/types/database.ts)
    echo "BLOCKED: database.ts is generated. Run 'supabase gen types' instead." >&2
    exit 2
    ;;
  */nativewind-env.d.ts|*/.expo/types/*)
    echo "BLOCKED: This is a generated file. Do not edit manually." >&2
    exit 2
    ;;
esac

exit 0
