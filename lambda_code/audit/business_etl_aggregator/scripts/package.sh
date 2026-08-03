#!/usr/bin/env bash
# Empaqueta src/ → dist/ + business_etl_aggregator.zip (handler en raíz del zip).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf dist
mkdir -p dist
# Solo módulos Python del runtime (sin scripts/tests)
cp -a src/. dist/
# Limpiar caches
find dist -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find dist -type f -name '*.pyc' -delete 2>/dev/null || true
rm -f business_etl_aggregator.zip
(
  cd dist
  zip -qr ../business_etl_aggregator.zip .
)
echo "packed $(wc -c < business_etl_aggregator.zip) bytes → business_etl_aggregator.zip"
