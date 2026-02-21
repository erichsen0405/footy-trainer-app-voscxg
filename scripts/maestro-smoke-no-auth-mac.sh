#!/usr/bin/env bash
set -euo pipefail

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
FLOW_PATH="${FLOW_PATH:-e2e/flows/activity_task_flow_smoke.yaml}"

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
REPEAT_COUNT="${REPEAT_COUNT:-3}"

UDID="$(xcrun simctl list devices booted | awk -F '[()]' '/Booted/{print $2; exit}')"
if [[ -z "${UDID}" ]]; then
  echo "Error: No booted iOS simulator found. Boot a simulator first, then rerun."
  exit 1
fi

DEBUG_OUTPUT_DIR="${MAESTRO_DEBUG_OUTPUT_DIR:-e2e/maestro/artifacts/debug/ios/${UDID}}"
mkdir -p "${DEBUG_OUTPUT_DIR}"

if [[ ! -f "${FLOW_PATH}" ]]; then
  echo "Error: Flow file not found: ${FLOW_PATH}"
  exit 1
fi

i=1
while [ "${i}" -le "${REPEAT_COUNT}" ]; do
  echo "Running ${FLOW_PATH} (${i}/${REPEAT_COUNT})..."
  maestro --device "${UDID}" test "${FLOW_PATH}" --debug-output "${DEBUG_OUTPUT_DIR}"
  i=$((i + 1))
done
