#!/usr/bin/env bash
set -euo pipefail

FLOW_PATH="${FLOW_PATH:-e2e/flows/auth_flow_smoke.yaml}"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "Error: Not inside a git repository."
  exit 1
fi
cd "${REPO_ROOT}"

MAESTRO_ENV_FILE="${MAESTRO_ENV_FILE:-e2e/maestro.env.ios.sh}"
if [[ ! -f "${MAESTRO_ENV_FILE}" && -f "e2e/maestro.env.sh" ]]; then
  MAESTRO_ENV_FILE="e2e/maestro.env.sh"
fi
if [[ -f "${MAESTRO_ENV_FILE}" ]]; then
  # shellcheck disable=SC1091
  source "${MAESTRO_ENV_FILE}"
fi

export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.erichsen.footballcoach}"
export MAESTRO_PLATFORM_SUFFIX="${MAESTRO_PLATFORM_SUFFIX:-ios}"
export MAESTRO_TEAM_PLAYER_EMAIL="${MAESTRO_TEAM_PLAYER_EMAIL:-${MAESTRO_PLAYER_EMAIL:-}}"
APP_ID="${MAESTRO_APP_ID}"

missing_env=()
for required_var in MAESTRO_EMAIL MAESTRO_PASSWORD; do
  if [[ -z "${!required_var:-}" ]]; then
    missing_env+=("${required_var}")
  fi
done

if [[ "${FLOW_PATH}" == *"role_based_ui_smoke.yaml" ]]; then
  for required_var in MAESTRO_PLAYER_EMAIL MAESTRO_PLAYER_PASSWORD MAESTRO_TRAINER_EMAIL MAESTRO_TRAINER_PASSWORD MAESTRO_TEAM_PLAYER_EMAIL; do
    if [[ -z "${!required_var:-}" ]]; then
      missing_env+=("${required_var}")
    fi
  done
fi

if [[ ${#missing_env[@]} -gt 0 ]]; then
  echo "Error: Missing required env var(s): ${missing_env[*]}"
  echo "Set them in ${MAESTRO_ENV_FILE} or export them before running tests."
  exit 1
fi

JAVA_17_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
if [[ -z "${JAVA_17_HOME}" ]]; then
  echo "Error: Java 17 is required for Maestro. Install it with: brew install openjdk@17"
  exit 1
fi
export JAVA_HOME="${JAVA_17_HOME}"
export PATH="${JAVA_HOME}/bin:${PATH}"

export MAESTRO_DRIVER_STARTUP_TIMEOUT=900000

UDID="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/{print $2; exit}')"
if [[ -z "${UDID}" ]]; then
  echo "Error: No booted iOS simulator found. Boot a simulator first, then rerun."
  exit 1
fi

DEBUG_OUTPUT_DIR="${MAESTRO_DEBUG_OUTPUT_DIR:-e2e/maestro/artifacts/debug/ios/${UDID}}"
mkdir -p "${DEBUG_OUTPUT_DIR}"

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
maestro --device "${UDID}" test "${FLOW_PATH}" --debug-output "${DEBUG_OUTPUT_DIR}"
