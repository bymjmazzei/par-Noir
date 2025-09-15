#!/bin/bash

echo "=== FINAL JSX SYNTAX FIX ==="

# Find all files with broken JSX syntax and fix them systematically
find src/components/ -name "*.tsx" | while read file; do
  echo "Checking: $file"
  
  # Check if file has broken JSX syntax
  if grep -q "}) => {" "$file"; then
    echo "  Found broken JSX syntax, fixing..."
    
    # Fix the broken pattern: }) => { ... }) => {
    perl -pi -e 's/}\) => \{[\s\S]*?\}\) => \{/}) => {/g' "$file"
    
    # Fix other common patterns
    perl -pi -e 's/React\.FC = React\.memo\(\(\{ ([^}]+) \}\{/React.FC = React.memo(({ $1 }) => {/g' "$file"
    perl -pi -e 's/React\.FC = React\.memo\(\(\<(\w+)Props\> = \(\{/React.FC = React.memo(({ /g' "$file"
  fi
done

echo "=== FINAL JSX FIX COMPLETED ==="
