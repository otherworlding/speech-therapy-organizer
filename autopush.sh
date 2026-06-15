#!/bin/bash
# Auto-commit and push any changes in the Financial Vault project

REPO="/Users/otherworlding/Asset calulation app"
LOG="$REPO/autopush.log"

cd "$REPO" || exit 1

# Only proceed if there are changes
if ! git diff --quiet || git ls-files --others --exclude-standard | grep -q .; then
    git add -A
    git commit -m "Auto-save: $(date '+%Y-%m-%d %H:%M')"
    git push origin main >> "$LOG" 2>&1
    echo "$(date '+%Y-%m-%d %H:%M') — pushed changes" >> "$LOG"
fi
