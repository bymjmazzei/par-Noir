#!/bin/bash
echo "Fixing all async issues in crypto files..."

# Fix all await without async issues
find src/utils/crypto/ -name "*.ts" -exec sed -i.bak "s/static \([^(]*\)(): \([^{]*\) {/static async \1(): Promise<\2> {/g" {} \;

echo "Fixed async issues in crypto files"
