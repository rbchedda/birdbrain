#!/usr/bin/env bash
# PA-only Protomaps vector basemap, extracted from the latest daily planet build.
# Usage: scripts/basemap/build-pmtiles.sh [maxzoom=15]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${BASEMAP_OUT:-$here/../../basemap-out}"
maxzoom="${1:-15}"
bin="$out/.bin/pmtiles"
mkdir -p "$out/basemap" "$out/.bin"
if [ ! -x "$bin" ]; then
  ver=1.28.0
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) asset="go-pmtiles_${ver}_Linux_x86_64.tar.gz" ;;
    Darwin-arm64) asset="go-pmtiles-${ver}_Darwin_arm64.zip" ;;
    *) echo "unsupported platform; install pmtiles from github.com/protomaps/go-pmtiles" >&2; exit 1 ;;
  esac
  curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${ver}/${asset}" -o "$out/.bin/$asset"
  (cd "$out/.bin" && { tar xzf "$asset" pmtiles 2>/dev/null || unzip -o -q "$asset" pmtiles; })
fi
build="${PROTOMAPS_BUILD:-$(curl -fsSL https://build-metadata.protomaps.dev/builds.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);console.log(b[b.length-1].key)})')}"
bbox="-80.6,39.65,-74.6,42.35"
echo "extracting $build bbox=$bbox maxzoom=$maxzoom"
"$bin" extract "https://build.protomaps.com/$build" "$out/basemap/pa.pmtiles" --bbox="$bbox" --maxzoom="$maxzoom" --download-threads=8
"$bin" show "$out/basemap/pa.pmtiles" | head -n 20
