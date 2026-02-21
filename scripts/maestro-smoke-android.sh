#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "Error: Not inside a git repository."
  exit 1
fi
cd "${REPO_ROOT}"

MAESTRO_ENV_FILE="${MAESTRO_ENV_FILE:-e2e/maestro.env.android.sh}"
if [[ ! -f "${MAESTRO_ENV_FILE}" && -f "e2e/maestro.env.sh" ]]; then
  MAESTRO_ENV_FILE="e2e/maestro.env.sh"
fi
if [[ -f "${MAESTRO_ENV_FILE}" ]]; then
  # shellcheck disable=SC1091
  source "${MAESTRO_ENV_FILE}"
fi

DEFAULT_ANDROID_APP_ID="$(node -e "try {const p=require('./app.json').expo?.android?.package; if (p) process.stdout.write(String(p));} catch {}" 2>/dev/null || true)"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-${DEFAULT_ANDROID_APP_ID:-com.anonymous.FootballCoach}}"
export MAESTRO_PLATFORM_SUFFIX="${MAESTRO_PLATFORM_SUFFIX:-android}"
export MAESTRO_TEAM_PLAYER_EMAIL="${MAESTRO_TEAM_PLAYER_EMAIL:-${MAESTRO_PLAYER_EMAIL:-}}"

missing_env=()
for required_var in MAESTRO_EMAIL MAESTRO_PASSWORD; do
  if [[ -z "${!required_var:-}" ]]; then
    missing_env+=("${required_var}")
  fi
done

requires_role_vars=false
if [[ -z "${FLOW_PATH:-}" || "${FLOW_PATH:-}" == *"role_based_ui_smoke.yaml" ]]; then
  requires_role_vars=true
fi
if [[ "${requires_role_vars}" == "true" ]]; then
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

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb not found in PATH."
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
REPEAT_COUNT="${REPEAT_COUNT:-1}"
FLOW_PATH="${FLOW_PATH:-}"

adb start-server >/dev/null 2>&1 || true

resolve_device_id() {
  local emulator_id
  emulator_id="$(adb devices | awk '$2=="device" && $1 ~ /^emulator-/{print $1; exit}')"
  if [[ -n "${emulator_id}" ]]; then
    echo "${emulator_id}"
    return
  fi
  adb devices | awk '$2=="device"{print $1; exit}'
}

DEVICE_ID="${MAESTRO_DEVICE_ID:-${ANDROID_DEVICE_ID:-}}"
if [[ -z "${DEVICE_ID}" ]]; then
  DEVICE_ID="$(resolve_device_id)"
fi

if [[ -z "${DEVICE_ID}" ]]; then
  echo "Error: No booted Android emulator/device found."
  echo "Tip: Start an emulator first (or set MAESTRO_DEVICE_ID / ANDROID_DEVICE_ID)."
  adb devices
  exit 1
fi

SAFE_DEVICE_ID="${DEVICE_ID//[^[:alnum:]._-]/_}"
DEBUG_OUTPUT_DIR="${MAESTRO_DEBUG_OUTPUT_DIR:-e2e/maestro/artifacts/debug/android/${SAFE_DEVICE_ID}}"
mkdir -p "${DEBUG_OUTPUT_DIR}"

if [[ -n "${FLOW_PATH}" && ! -f "${FLOW_PATH}" ]]; then
  echo "Error: Flow file not found: ${FLOW_PATH}"
  exit 1
fi

if [[ -z "${FLOW_PATH}" ]]; then
  maestro --device "${DEVICE_ID}" test e2e/flows --include-tags smoke --debug-output "${DEBUG_OUTPUT_DIR}"
  exit 0
fi

i=1
while [[ "${i}" -le "${REPEAT_COUNT}" ]]; do
  echo "Running ${FLOW_PATH} on ${DEVICE_ID} (${i}/${REPEAT_COUNT})..."
  maestro --device "${DEVICE_ID}" test "${FLOW_PATH}" --debug-output "${DEBUG_OUTPUT_DIR}"
  i=$((i + 1))
done
