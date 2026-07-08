# AGENTS.md

## QA Bundle Default (macOS)

- Når brugeren skriver `lav qa zip`, skal default-kommandoen være:
  - `./scripts/qa-bundle-mac.sh`
- Scriptet gemmer zip-filer i `.qa-export/` (gitignored).
- Hvis brugeren specifikt beder om at springe QA-checks over:
  - `./scripts/qa-bundle-mac.sh --no-qa`

## Base44 / Webapp Issues

- Når et issue handler om webapp/Base44:
  - Lav Base44-prompt/instruktion i repoets `docs/`.
  - Lav ikke webapp-UI-kode, routes, hooks eller services i Expo/app-repoet, medmindre brugeren eksplicit beder om backend/API-kode her.
  - Genbrug/tilpas eksisterende Base44/KlubAdmin-flow i prompten; beskriv ikke en greenfield portal.

## B2B Coach Master Backlog (#308)

- Når brugeren skriver `start issue xxx`, skal arbejdet altid starte med en opgaveløsning/beskrivelse til brugerens godkendelse.
  - Implementering må først begynde, når brugeren har godkendt opgaveløsningen.
  - Dette gælder også, selvom issue-scope virker tydeligt.
- Før arbejde på B2B Coach issues (#277-#307), skal GitHub master issue #308 læses inkl. kommentarer:
  - `gh issue view 308 --repo erichsen0405/footy-trainer-app-voscxg --json body,comments,labels,state,title,url`
- Den konkrete issue skal derefter læses med kommentarer, og arbejdet skal krydstjekkes mod #308 før det meldes klar.
- Hvis GitHub ikke kan læses, må B2B Coach-arbejde ikke markeres færdigt uden eksplicit brugeraccept.
- #308-regler der altid skal respekteres:
  - Brug `OwnerAccount` som fælles spor med `owner_account_id` og `owner_type: club | private_coach_business`.
  - Genbrug eksisterende Base44/KlubAdmin webapp; byg ikke et parallelt websystem.
  - Base44 er UI/host-lag; Supabase er source of truth for business data.
  - Multi-role skal understøttes: samme bruger/mail kan være `owner`, `admin` og `coach`.
  - Cross-user writes og adminhandlinger skal via Supabase Edge Functions/RPC/server-side flows.
  - Apple trainer subscription skal kobles til `private_coach_business` owner med `owner` + `admin` + `coach`.
  - Webapp-relaterede issues skal have Base44-prompt eller en eksplicit note om at Base44 ikke er relevant.
  - Supabase-relevante issues skal deployes/verificeres remote, medmindre en undtagelse er aftalt.
- Branch workflow fra #308:
  - Start fra seneste `origin/feat/1.2.0-helper`.
  - Opret separat feature branch for issue.
  - PR base er `feat/1.2.0-helper`, medmindre andet aftales.
  - Issue må først kaldes completed, når feature-branchen er merged i helper-branchen eller brugeren eksplicit beder om en anden proces.

## Supabase Endpoint Verification Before Base44 Prompt Is "Ready"

- Hvis en Base44-prompt refererer til Supabase Edge Functions eller RPC'er, må arbejdet ikke meldes klar kun ud fra lokale filer.
- Verificer først remote Supabase-status:
  - `supabase functions list --project-ref <project-ref>` for function-navne.
  - Smoke-test function URL. Uden auth skal et eksisterende protected endpoint typisk returnere `401`, ikke `404`.
  - `supabase migration list --linked` for migrations/RPC'er, som endpointet afhænger af.
- Hvis endpoint/RPC mangler remote:
  - Deploy/opret backend, hvis brugeren har bedt om det.
  - Ellers skriv tydeligt i prompten, at endpointet ikke er klar endnu og skal deployes før Base44 kan bruge det.
- Base44-prompts med deployede endpoints skal angive faktisk base URL, headers, payloads og kendt error-handling.
