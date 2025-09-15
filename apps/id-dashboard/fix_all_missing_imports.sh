#!/bin/bash

echo "=== FINDING AND FIXING ALL MISSING IMPORTS ==="

# Find all files with wrong import paths
find src/components/app/ -name "*.tsx" -o -name "*.ts" | while read file; do
  echo "Checking: $file"
  
  # Find all import statements
  grep -n "from " "$file" | while read line; do
    line_num=$(echo "$line" | cut -d: -f1)
    import_path=$(echo "$line" | sed "s/.*from ['\"]//" | sed "s/['\"].*//")
    
    # Check if the import path is wrong
    if [[ "$import_path" == ../utils/* ]] || [[ "$import_path" == ./utils/* ]]; then
      echo "  Line $line_num: Wrong import path: $import_path"
      
      # Fix the import path
      if [[ "$import_path" == ../utils/* ]]; then
        new_path=$(echo "$import_path" | sed 's|^\.\./utils/|../../utils/|')
      else
        new_path=$(echo "$import_path" | sed 's|^\./utils/|../../utils/|')
      fi
      
      echo "    Fixed to: $new_path"
      
      # Update the file
      sed -i.bak "s|from ['\"]$import_path['\"]|from \"$new_path\"|g" "$file"
    fi
  done
done

echo "=== ALL IMPORTS FIXED ==="
