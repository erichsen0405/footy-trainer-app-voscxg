#!/usr/bin/env bash
set -euo pipefail

APP_ID="com.erichsen.footballcoach"
FLOW_PATH="${FLOW_PATH:-e2e/flows/auth_flow_smoke.yaml}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "Error: Not inside a git repository."
  exit 1
fi
cd "${REPO_ROOT}"

if [[ -f "e2e/maestro.env.sh" ]]; then
  # shellcheck disable=SC1091
  source "e2e/maestro.env.sh"
fi

JAVA_17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
if [[ -z "${JAVA_17_HOME}" ]]; then
  echo "Error: Java 17 is required for Maestro. Install it with: brew install openjdk@17"
  exit 1
fi
export JAVA_HOME="${JAVA_17_HOME}"
export PATH="${JAVA_HOME}/bin:${PATH}"

export MAESTRO_DRIVER_STARTUP_TIMEOUT=900000

mkdir -p "e2e/maestro/artifacts/debug"

UDID="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/{print $2; exit}')"
if [[ -z "${UDID}" ]]; then
  echo "Error: No booted iOS simulator found. Boot a simulator first, then rerun."
  exit 1
fi

echo "Uninstalling ${APP_ID} from simulator ${UDID}..."
xcrun simctl terminate "${UDID}" "${APP_ID}" || true
xcrun simctl uninstall "${UDID}" "${APP_ID}" || true
if xcrun simctl get_app_container "${UDID}" "${APP_ID}" data >/dev/null 2>&1; then
  echo "Error: App still installed after uninstall attempt."
  exit 1
fi

APP_PATH="${IOS_APP_PATH:-}"
if [[ -z "${APP_PATH}" ]]; then
  APP_PATH="$(find ios/build/Build/Products -type d -name '*.app' -path '*simulator*' -print 2>/dev/null | xargs -I{} ls -td "{}" 2>/dev/null | head -n1 || true)"
fi
if [[ -z "${APP_PATH}" ]]; then
  APP_PATH="$(find "${HOME}/Library/Developer/Xcode/DerivedData" -type d -path '*/Build/Products/*iphonesimulator/*.app' -print 2>/dev/null | xargs -I{} ls -td "{}" 2>/dev/null | head -n1 || true)"
fi

if [[ -z "${APP_PATH}" ]]; then
  echo "Error: No existing simulator .app build found."
  echo "Build once first (example): npx expo run:ios --device <SIMULATOR_UDID>"
  echo "Or pass a path explicitly: IOS_APP_PATH=/path/to/App.app npm run e2e:ios:fresh"
  exit 1
fi

echo "Installing existing build: ${APP_PATH}"
xcrun simctl install "${UDID}" "${APP_PATH}"
if ! xcrun simctl get_app_container "${UDID}" "${APP_ID}" data >/dev/null 2>&1; then
  echo "Error: App is not installed after install step."
  exit 1
fi

echo "Running Maestro flow: ${FLOW_PATH}"
maestro --device "${UDID}" test "${FLOW_PATH}" --debug-output e2e/maestro/artifacts/debug
