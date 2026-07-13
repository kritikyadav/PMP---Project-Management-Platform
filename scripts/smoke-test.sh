#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://your-production-domain.com}"

echo "Checking frontend..."
curl --fail --silent --show-error "${BASE_URL}/" >/dev/null

echo "Checking backend health..."
curl --fail --silent --show-error "${BASE_URL}/health" >/dev/null

echo "Checking auth redirect..."
curl --fail --silent --show-error --head "${BASE_URL}/auth/login" >/dev/null

echo "Smoke checks passed for ${BASE_URL}"
