#!/bin/bash

echo "Fixing async issue in localStorage.ts..."

# Fix the generateKey method to be async
sed -i.bak 's/private generateKey(): string {/private async generateKey(): Promise<string> {/' apps/id-dashboard/src/utils/localStorage.ts

echo "Fixed localStorage.ts async issue"
