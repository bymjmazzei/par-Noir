#!/bin/bash

# Backup script for modal refactoring
# Usage: ./scripts/backup-before-refactor.sh [modal-name]

MODAL_NAME=$1

if [ -z "$MODAL_NAME" ]; then
    echo "Usage: ./scripts/backup-before-refactor.sh [modal-name]"
    echo "Example: ./scripts/backup-before-refactor.sh export-auth"
    exit 1
fi

echo "🛡️ Creating backup before refactoring: $MODAL_NAME"

# Create backup directory if it doesn't exist
mkdir -p backups

# Create timestamped backup
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backups/App.tsx.backup-${MODAL_NAME}-${TIMESTAMP}"

# Copy current App.tsx to backup
cp src/App.tsx "$BACKUP_FILE"

echo "✅ Backup created: $BACKUP_FILE"

# Also create a symlink for easy access
ln -sf "$BACKUP_FILE" "src/App.tsx.backup-${MODAL_NAME}"

echo "🔗 Symlink created: src/App.tsx.backup-${MODAL_NAME}"

# Show current App.tsx line count
LINE_COUNT=$(wc -l < src/App.tsx)
echo "📊 Current App.tsx line count: $LINE_COUNT"

echo ""
echo "🚀 Ready to refactor! If anything goes wrong, restore with:"
echo "   cp src/App.tsx.backup-${MODAL_NAME} src/App.tsx"
echo ""
