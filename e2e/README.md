# Maestro smoke / golden paths

## Golden paths (7)

- `e2e/flows/auth_flow_smoke.yaml`
- `e2e/flows/paywall_gating_smoke.yaml`
- `e2e/flows/activity_task_flow_smoke.yaml`
- `e2e/flows/library_add_to_tasks_smoke.yaml`
- `e2e/flows/notifications_permission_smoke.yaml`
- `e2e/flows/role_based_ui_smoke.yaml`
- `e2e/flows/error_retry_smoke.yaml`

Alle ovenstående har `tags: [smoke]`.

## Required env vars

- `MAESTRO_EMAIL`: entitled test user email
- `MAESTRO_PASSWORD`: entitled test user password
- `MAESTRO_LOCKED_EMAIL`: non-entitled user email (paywall-gated)
- `MAESTRO_LOCKED_PASSWORD`: non-entitled user password
- `MAESTRO_FEEDBACK_NOTE`: note text used in feedback smoke
- `MAESTRO_PLAYER_EMAIL`: player account (role-based UI flow)
- `MAESTRO_PLAYER_PASSWORD`: player password
- `MAESTRO_TRAINER_EMAIL`: trainer/admin account (role-based UI flow)
- `MAESTRO_TRAINER_PASSWORD`: trainer/admin password

## Load env vars in PowerShell

- `. e2e/maestro.env.ps1`

## Run all smoke/golden paths

- `maestro test --include-tags smoke e2e/flows`
- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1`
- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1 -Repeat 3`

## Run single flow

- `maestro test e2e/flows/library_add_to_tasks_smoke.yaml`
- `maestro test e2e/flows/notifications_permission_smoke.yaml`
- `maestro test e2e/flows/role_based_ui_smoke.yaml`
- `maestro test e2e/flows/error_retry_smoke.yaml`

## Debug output path

- Scripted smoke run skriver debug artifacts til: `e2e/results/maestro-debug/run-<n>`
- Manuel kørsel med debug output:
  - `maestro test --include-tags smoke --debug-output e2e/results/maestro-debug/local e2e/flows`

## iOS limitation (offline/error-retry)

- `error_retry_smoke.yaml` bruger deterministisk netværksfejl på Android via `setAirplaneMode`.
- iOS Simulator understøtter ikke airplane mode i Maestro på samme måde.
- Manuel iOS workaround:
  1. Log ind og gå til Bibliotek.
  2. Slå Wi-Fi/net fra i simulatoren.
  3. Bekræft fejlstate + `Prøv igen`.
  4. Slå net til igen.
  5. Tryk `Prøv igen` og bekræft at biblioteket loader igen.
