#!/bin/bash

echo "=== COMPREHENSIVE FIX FOR ALL BROKEN FILES ==="

# Function to fix JSX syntax errors
fix_jsx_syntax() {
  local file="$1"
  echo "Fixing JSX syntax in: $file"
  
  # Fix broken JSX syntax patterns
  sed -i.bak 's|<[A-Za-z]*Props> = (|{ isOpen, onClose, settings, onSettingsChange }|g' "$file"
  sed -i.bak 's|<[A-Za-z]*Props> = (|{ isOpen, onClose }|g' "$file"
  sed -i.bak 's|<[A-Za-z]*Props> = (|{ isOpen, onClose, settings }|g' "$file"
}

# Function to fix import paths
fix_import_paths() {
  local file="$1"
  echo "Fixing import paths in: $file"
  
  # Fix all wrong import paths
  sed -i.bak 's|from "\.\./utils/|from "../../utils/|g' "$file"
  sed -i.bak 's|from "\.\./workers/|from "../../workers/|g' "$file"
  sed -i.bak 's|from "\./utils/|from "../../utils/|g' "$file"
  sed -i.bak 's|from "\./workers/|from "../../workers/|g' "$file"
}

# Find and fix all broken files
echo "Finding all broken files..."

# Fix JSX syntax errors
find src/components/ -name "*.tsx" -exec grep -l "<[A-Za-z]*Props> = (" {} \; | while read file; do
  fix_jsx_syntax "$file"
done

# Fix import paths in app components
find src/components/app/ -name "*.tsx" -o -name "*.ts" | while read file; do
  fix_import_paths "$file"
done

echo "=== COMPREHENSIVE FIX COMPLETED ==="
echo "Now trying to build to see what other errors remain..."
