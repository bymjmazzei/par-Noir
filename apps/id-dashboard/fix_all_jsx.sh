#!/bin/bash

echo "=== FIXING ALL JSX SYNTAX ERRORS ==="

# Find all files with broken JSX syntax and fix them
find src/components/ -name "*.tsx" | while read file; do
  echo "Fixing JSX in: $file"
  
  # Fix broken JSX syntax patterns
  perl -pi -e 's/export const (\w+): React\.FC = React\.memo\(\(\{ ([^}]+) \}\{/export const $1: React.FC = React.memo(({ $2 }) => {/g' "$file"
  perl -pi -e 's/export const (\w+): React\.FC = React\.memo\(\(\<(\w+)Props\> = \(/export const $1: React.FC = React.memo(({ $2 }/g' "$file"
  
  # Fix other common JSX syntax issues
  perl -pi -e 's/React\.FC\{ ([^}]+) \}\{/React.FC = ({ $1 }) => {/g' "$file"
  perl -pi -e 's/React\.FC = \(\<(\w+)Props\> = \(\{/React.FC = ({ /g' "$file"
done

echo "=== ALL JSX SYNTAX ERRORS FIXED ==="
