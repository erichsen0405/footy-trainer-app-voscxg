# Email deliverability (confirm signup)

- Hvorfor havner i Junk: nyt/lavt domæne-omdømme + meget “tynd” mail (kun link) ligner phishing, selv med SPF/DKIM/DMARC = PASS.
- Hvad vi ændrede: brandet HTML-template med mere tekst, kontekst (“du får den fordi…”), tydelig CTA, fallback-link, ignore-hvis-ikke-dig, kort supportlinje.
- Vi gør det reproducérbart: PowerShell-script der PATCH’er Supabase Auth config via Management API (subject + template).

## Kør scriptet
```powershell
$env:SUPABASE_ACCESS_TOKEN="ey...din token..."   # Hent i Supabase Dashboard: Project Settings -> API -> Access Token
pwsh ./scripts/supabase-update-email-templates.ps1
```
- Scriptet læser project ref fra `supabase/.temp/project-ref` og HTML fra `supabase/email-templates/confirm-signup.html`.
- PATCH sender kun `mailer_subjects_confirmation` og `mailer_templates_confirmation_content`.
- Output viser HTTP status og evt. response body.

## Hvad du kan forvente
- Der kan stadig være Junk i starten; omdømme bygges op over tid.
- Markér “Not Junk” i Outlook/Gmail på testmails for at hjælpe omdømme.
- Test: kør scriptet, trig en ny signup-mail, verificér at indholdet matcher den nye template (titel, CTA, fallback-link, ignore-tekst).
