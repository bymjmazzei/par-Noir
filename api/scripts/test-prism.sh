#!/usr/bin/env bash
# Hermetic Prism + publish-safety Jest suite (mocked deps; no network).
set -euo pipefail
cd "$(dirname "$0")/.."

npx jest \
  src/server/modules/prismRoutes.workflows.test.ts \
  src/server/modules/prismReports.prohibited.test.ts \
  src/server/modules/publishSafetyGate.test.ts \
  src/server/modules/geminiModerationService.test.ts \
  --no-coverage
