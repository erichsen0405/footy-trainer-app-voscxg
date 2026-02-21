# Email deliverability (auth emails)

- Hvorfor havner i Junk: nyt/lavt domaene-omdoemme + meget "tynd" mail (kun link) ligner phishing, selv med SPF/DKIM/DMARC = PASS.
- Hvad vi aendrede: brandet HTML-template med mere tekst, kontekst ("du faar den fordi..."), tydelig CTA, fallback-link, ignore-hvis-ikke-dig, kort supportlinje.
- Vi goer det reproducerbart: PowerShell-script der PATCH'er Supabase Auth config via Management API (subject + template) for baade signup og glemt adgangskode.

## Koer scriptet
```powershell
$env:SUPABASE_ACCESS_TOKEN="ey...din token..."   # Hent i Supabase Dashboard: Project Settings -> API -> Access Token
powershell -ExecutionPolicy Bypass -File .\scripts\supabase-update-email-templates.ps1
```
- Scriptet laeser project ref fra `supabase/.temp/project-ref`.
- Scriptet laeser HTML fra:
  - `supabase/email-templates/confirm-signup.html`
  - `supabase/email-templates/reset-password.html`
- PATCH sender:
  - `mailer_subjects_confirmation`
  - `mailer_templates_confirmation_content`
  - `mailer_subjects_recovery`
  - `mailer_templates_recovery_content`
- Output viser HTTP status og evt. response body.

## Source of truth (recovery template)
- Production source of truth er Management API PATCH via `scripts/supabase-update-email-templates.ps1`.
- Den fil, der bruges til recovery i dette flow, er `supabase/email-templates/reset-password.html`.
- `supabase/templates/recovery.html` findes kun som CLI/lokal reference og kan afvige fra production, hvis scriptet ikke koeres.

## Hvad du kan forvente
- Der kan stadig vaere Junk i starten; omdoemme bygges op over tid.
- Marker "Not Junk" i Outlook/Gmail paa testmails for at hjaelpe omdoemme.
- Test: koer scriptet, trig baade signup-mail og reset-password-mail, verificer at indholdet matcher templates (titel, CTA, fallback-link, ignore-tekst).
