#!/bin/bash

echo "=== COMPREHENSIVE JSX SYNTAX FIX ==="

# Find all files with broken JSX syntax and fix them systematically
find src/components/ -name "*.tsx" | while read file; do
  echo "Checking: $file"
  
  # Check if file has broken JSX syntax patterns
  if grep -q "}) => {" "$file" && grep -q "}) => {" "$file" | wc -l | grep -q "2"; then
    echo "  Found broken JSX syntax with duplicate }) => {, fixing..."
    
    # Get the line numbers where this occurs
    line1=$(grep -n "}) => {" "$file" | head -1 | cut -d: -f1)
    line2=$(grep -n "}) => {" "$file" | tail -1 | cut -d: -f1)
    
    if [ "$line1" != "$line2" ]; then
      echo "    Lines $line1 and $line2 have broken syntax"
      
      # Remove the duplicate lines between the two }) => { patterns
      sed -i.bak "${line1},${line2}d" "$file"
      
      # Fix the remaining syntax
      sed -i.bak 's/}) => {/}) => {/g' "$file"
    fi
  fi
  
  # Fix other common patterns
  if grep -q "React\.FC = React\.memo\(\(\{ [^}]* \}\{" "$file"; then
    echo "  Found broken React.memo syntax, fixing..."
    perl -pi -e 's/React\.FC = React\.memo\(\(\{ ([^}]+) \}\{/React.FC = React.memo(({ $1 }) => {/g' "$file"
  fi
done

echo "=== COMPREHENSIVE JSX FIX COMPLETED ==="
