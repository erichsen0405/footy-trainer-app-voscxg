# AGENTS.md

## QA Bundle Default (macOS)

- Når brugeren skriver `lav qa zip`, skal default-kommandoen være:
  - `./scripts/qa-bundle-mac.sh`
- Scriptet gemmer zip-filer i `.qa-export/` (gitignored).
- Hvis brugeren specifikt beder om at springe QA-checks over:
  - `./scripts/qa-bundle-mac.sh --no-qa`
