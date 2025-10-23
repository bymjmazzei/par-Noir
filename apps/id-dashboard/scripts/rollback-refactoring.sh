#!/bin/bash

# Rollback script for modal refactoring
# Usage: ./scripts/rollback-refactoring.sh [modal-name]

MODAL_NAME=$1

if [ -z "$MODAL_NAME" ]; then
    echo "Usage: ./scripts/rollback-refactoring.sh [modal-name]"
    echo "Example: ./scripts/rollback-refactoring.sh export-auth"
    echo ""
    echo "Available backups:"
    ls -la src/App.tsx.backup-* 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="src/App.tsx.backup-${MODAL_NAME}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    echo ""
    echo "Available backups:"
    ls -la src/App.tsx.backup-* 2>/dev/null || echo "No backups found"
    exit 1
fi

echo "🔄 Rolling back modal refactoring: $MODAL_NAME"

# Show current line count
CURRENT_LINES=$(wc -l < src/App.tsx)
echo "📊 Current App.tsx line count: $CURRENT_LINES"

# Restore from backup
cp "$BACKUP_FILE" src/App.tsx

# Show new line count
NEW_LINES=$(wc -l < src/App.tsx)
echo "📊 Restored App.tsx line count: $NEW_LINES"

# Remove the component file if it exists
COMPONENT_FILE="src/components/modals/${MODAL_NAME^}Modal.tsx"
if [ -f "$COMPONENT_FILE" ]; then
    echo "🗑️ Removing component file: $COMPONENT_FILE"
    rm "$COMPONENT_FILE"
fi

# Clean up empty directories
if [ -d "src/components/modals" ] && [ -z "$(ls -A src/components/modals)" ]; then
    echo "🗑️ Removing empty modals directory"
    rmdir src/components/modals
fi

echo "✅ Rollback complete!"
echo ""
echo "🚀 Next steps:"
echo "   1. Test the application to ensure everything works"
echo "   2. If needed, debug the issue that caused the rollback"
echo "   3. Try the extraction again with fixes"
echo ""
echo "💡 To retry the extraction:"
echo "   ./scripts/backup-before-refactor.sh $MODAL_NAME"
echo "   # Then follow the extraction process again"
echo ""
