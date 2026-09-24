#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONFIGURATION="${CONFIGURATION:-release}"
APP_NAME="CBCT Viewer"
BUNDLE_ID="local.cbctviewer.prototype"
VERSION="0.2.1"
BUILD_NUMBER="3"
OUT_DIR="$ROOT/dist"
APP_DIR="$OUT_DIR/$APP_NAME.app"

rm -rf "$OUT_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

swift build -c "$CONFIGURATION"
BIN_DIR="$(swift build -c "$CONFIGURATION" --show-bin-path)"
BIN="$BIN_DIR/CBCTViewerMac"

if [[ ! -x "$BIN" ]]; then
  echo "Expected executable not found: $BIN" >&2
  exit 2
fi

cp "$BIN" "$APP_DIR/Contents/MacOS/CBCTViewerMac"
chmod 755 "$APP_DIR/Contents/MacOS/CBCTViewerMac"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>CBCTViewerMac</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

plutil -lint "$APP_DIR/Contents/Info.plist"
codesign --force --deep --sign - "$APP_DIR"
codesign --verify --deep --strict --verbose=2 "$APP_DIR"

# Verify that LaunchServices can inspect the app bundle.
/usr/bin/mdls "$APP_DIR" >/dev/null

cd "$OUT_DIR"
ditto -c -k --sequesterRsrc --keepParent "$APP_NAME.app" "CBCT_Viewer_macOS_${VERSION}.zip"
unzip -t "CBCT_Viewer_macOS_${VERSION}.zip"

echo "Built: $APP_DIR"
echo "Archive: $OUT_DIR/CBCT_Viewer_macOS_${VERSION}.zip"
