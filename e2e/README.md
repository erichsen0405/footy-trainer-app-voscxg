# Maestro smoke flows (iOS)

## Required env vars

- `MAESTRO_EMAIL`: entitled test user email (can reach home)
- `MAESTRO_PASSWORD`: entitled test user password
- `MAESTRO_LOCKED_EMAIL`: non-entitled test user email (should be gated)
- `MAESTRO_LOCKED_PASSWORD`: non-entitled test user password
- `MAESTRO_FEEDBACK_NOTE`: note text used in feedback smoke

## Load env vars in PowerShell

- `. e2e/maestro.env.ps1`

## Run all smoke flows via script (PowerShell)

- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1`
- `powershell -ExecutionPolicy Bypass -File e2e/run-smoke.ps1 -Repeat 3`
- Scriptet finder automatisk alle `.yaml/.yml` filer i `e2e/flows` (alfabetisk rækkefølge).

## Run single flow

- `maestro test e2e/flows/auth_smoke.yaml`
- `maestro test e2e/flows/paywall_gating_smoke.yaml`
- `maestro test e2e/flows/activity_completion_smoke.yaml`
- `maestro test e2e/flows/feedback_task_smoke.yaml`

## Run smoke set 3 times

```bash
for i in 1 2 3; do
  maestro test e2e/flows/auth_smoke.yaml || exit 1
  maestro test e2e/flows/paywall_gating_smoke.yaml || exit 1
  maestro test e2e/flows/activity_completion_smoke.yaml || exit 1
  maestro test e2e/flows/feedback_task_smoke.yaml || exit 1
done
```
