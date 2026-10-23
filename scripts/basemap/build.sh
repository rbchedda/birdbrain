#!/usr/bin/env bash
# Builds every Terrain asset into basemap-out/ (gitignored; never commit tiles).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
node "$here/fetch-dem.mjs" "$@"
node "$here/build-glyphs.mjs"
bash "$here/build-pmtiles.sh"
du -sh "${BASEMAP_OUT:-$here/../../basemap-out}"/{dem,fonts,basemap}
