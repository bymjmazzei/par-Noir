#!/bin/bash

# Testing script for modal extraction verification
# Usage: ./scripts/test-modal-extraction.sh [modal-name]

MODAL_NAME=$1

if [ -z "$MODAL_NAME" ]; then
    echo "Usage: ./scripts/test-modal-extraction.sh [modal-name]"
    echo "Example: ./scripts/test-modal-extraction.sh export-auth"
    exit 1
fi

echo "🧪 Testing modal extraction: $MODAL_NAME"

# Check if development server is running
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "❌ Development server not running. Start it with: npm run dev"
    exit 1
fi

echo "✅ Development server is running"

# Check for TypeScript errors
echo "🔍 Checking for TypeScript errors..."
if npm run type-check 2>&1 | grep -q "error"; then
    echo "❌ TypeScript errors found:"
    npm run type-check
    exit 1
else
    echo "✅ No TypeScript errors"
fi

# Check for console errors in browser
echo "🔍 Checking for runtime errors..."
echo "📝 Manual verification needed:"
echo "   1. Open browser to http://localhost:3000"
echo "   2. Navigate to functionality that uses $MODAL_NAME modal"
echo "   3. Open browser dev tools console"
echo "   4. Trigger the modal and check for errors"
echo "   5. Test all modal interactions"
echo "   6. Verify modal closes properly"

# Show current App.tsx line count
LINE_COUNT=$(wc -l < src/App.tsx)
echo "📊 Current App.tsx line count: $LINE_COUNT"

# Check if component file exists
COMPONENT_FILE="src/components/modals/${MODAL_NAME^}Modal.tsx"
if [ -f "$COMPONENT_FILE" ]; then
    echo "✅ Component file exists: $COMPONENT_FILE"
else
    echo "❌ Component file missing: $COMPONENT_FILE"
    exit 1
fi

# Check if import exists in App.tsx
if grep -q "import.*${MODAL_NAME^}Modal" src/App.tsx; then
    echo "✅ Import found in App.tsx"
else
    echo "❌ Import missing in App.tsx"
    exit 1
fi

echo ""
echo "🎯 Next steps:"
echo "   1. Test the modal functionality manually"
echo "   2. If everything works, commit the changes:"
echo "      git add . && git commit -m \"Extract ${MODAL_NAME^}Modal component\""
echo "   3. If there are issues, restore from backup:"
echo "      cp src/App.tsx.backup-${MODAL_NAME} src/App.tsx"
echo ""
