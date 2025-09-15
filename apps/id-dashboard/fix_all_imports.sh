#!/bin/bash

echo "=== FIXING ALL WRONG IMPORT PATHS ==="

# Find all files in src/components/app/ that have wrong import paths
find src/components/app/ -name "*.tsx" -o -name "*.ts" | while read file; do
  echo "Fixing imports in: $file"
  
  # Fix all wrong import paths from ../utils/ to ../../utils/
  sed -i.bak 's|from "\.\./utils/|from "../../utils/|g' "$file"
  
  # Fix all wrong import paths from ./utils/ to ../../utils/
  sed -i.bak 's|from "\./utils/|from "../../utils/|g' "$file"
  
  # Fix all wrong import paths from ../workers/ to ../../workers/
  sed -i.bak 's|from "\.\./workers/|from "../../workers/|g' "$file"
  
  # Fix all wrong import paths from ./workers/ to ../../workers/
  sed -i.bak 's|from "\./workers/|from "../../workers/|g' "$file"
done

echo "=== IMPORT PATHS FIXED ==="
