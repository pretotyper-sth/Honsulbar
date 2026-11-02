#!/bin/bash
set -euo pipefail
HB_APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HB_APP_ROOT"
if command -v node >/dev/null 2>&1; then
  HB_NODE="$(command -v node)"
else
  HB_NODE='/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node'
fi
if [ ! -x "$HB_NODE" ]; then
  echo 'Node.js 22 이상을 설치해 주세요.' >&2
  exit 1
fi
export PATH="$(dirname "$HB_NODE"):$PATH"
export JAVA_HOME="$HB_APP_ROOT/.android-tools/jdk-21.0.13+9/Contents/Home"
export ANDROID_HOME="$HB_APP_ROOT/.android-tools/sdk"
export GRADLE_USER_HOME="$HB_APP_ROOT/.android-tools/gradle"
case "${1:-apk}" in
  server) exec "$HB_NODE" scripts/android-test-server.js ;;
  web) exec "$HB_NODE" node_modules/vite/bin/vite.js build --config vite.android.config.js ;;
  sync|apk|aab)
    "$HB_NODE" node_modules/vite/bin/vite.js build --config vite.android.config.js
    "$HB_NODE" node_modules/@capacitor/cli/bin/capacitor sync android
    if [ "${1:-apk}" = apk ]; then
      cd android
      exec ./gradlew assembleDebug --console=plain
    fi
    if [ "${1:-apk}" = aab ]; then
      cd android
      exec ./gradlew bundleRelease --console=plain
    fi
    ;;
  *) echo '사용법: bash scripts/android-local.sh [server|web|sync|apk]' >&2; exit 1 ;;
esac
