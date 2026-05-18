#!/bin/bash
# Run TypeScript type-check after .ts/.tsx file edits
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0
  OUTPUT=$(npx tsc --noEmit 2>&1)
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "$OUTPUT" | tail -30
  fi
fi

exit 0
