#!/bin/bash
# Hosting security headers live in repo-root firebase.json (./deploy.sh).
# Do not firebase deploy --only hosting from this directory — it skips root headers.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/apps/id-dashboard"

echo "Deploying Firebase Functions (app-local)..."
echo "7" | firebase deploy --only functions

echo "Deploying all Firebase Hosting targets via root ./deploy.sh..."
cd "$ROOT"
./deploy.sh
