#!/bin/bash

echo "=== FIXING ALL ASYNC FUNCTIONS IN SECURERANDOM ==="

# Fix all static functions to be async and return Promise
sed -i.bak 's|static generateString(.*): string {|static async generateString(\1): Promise<string> {|g' src/utils/secureRandom.ts
sed -i.bak 's|static generateNumber(.*): number {|static async generateNumber(\1): Promise<number> {|g' src/utils/secureRandom.ts
sed -i.bak 's|static generateFloat(.*): number {|static async generateFloat(\1): Promise<number> {|g' src/utils/secureRandom.ts
sed -i.bak 's|static generateHex(.*): string {|static async generateHex(\1): Promise<string> {|g' src/utils/secureRandom.ts
sed -i.bak 's|static generateBytes(.*): Uint8Array {|static async generateBytes(\1): Promise<Uint8Array> {|g' src/utils/secureRandom.ts
sed -i.bak 's|static generateUUID(.*): string {|static async generateUUID(\1): Promise<string> {|g' src/utils/secureRandom.ts

echo "=== ALL ASYNC FUNCTIONS FIXED ==="
