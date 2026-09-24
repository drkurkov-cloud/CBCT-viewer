#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
./scripts/build_app.sh
open "dist/CBCT Viewer.app"
