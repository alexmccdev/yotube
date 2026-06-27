#!/bin/sh
# Rebuilds and reinstalls the Electron app to /Applications after every commit.
# Wired up via .git/hooks/post-commit (run `build/install-hooks.sh` once to enable).
set -e

cd "$(dirname "$0")/.."

echo "[post-commit] running tests..."
npx vitest run

echo "[post-commit] building Electron app..."
npx next build
PYTHON_PATH="$PWD/build/python3-dmg-wrapper.sh" npx electron-builder --publish never -c.mac.target=zip

APP_SRC="dist/mac-arm64/Yotube.app"
if [ -d "$APP_SRC" ]; then
  echo "[post-commit] installing to /Applications/Yotube.app..."
  rm -rf /Applications/Yotube.app
  cp -R "$APP_SRC" /Applications/Yotube.app
  echo "[post-commit] done."
else
  echo "[post-commit] build did not produce $APP_SRC, skipping install." >&2
  exit 1
fi
