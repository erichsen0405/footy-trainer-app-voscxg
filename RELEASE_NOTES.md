# Release Notes
## 1.0.4
- Forbedret stabilitet og hurtigere opstart (fix af "uendelig loader").
- Notifikationer åbner nu korrekt den relevante opgave (deep link fix).
- Flere rettelser i opgaver og bibliotek (bl.a. tællere, notefelt, skabeloner/arkiv).
- Diverse mindre fejlrettelser og forbedringer.
- Bugfixes inkluderer:
  - Notefelt starter tomt.
  - Opgaveskabeloner og arkiv-flow.
  - Tilføj opgave på aktivitet samt "sæt intensitet ved opret aktivitet".
  - Tæller i bibliotek.
  - Intensitet tilføjet til kategori.
  - Slet opgaver ved soft delete.
  - Typecheck/lint issues.
- CI/Test-løft:
  - Automatisk testkørsel på PR.
  - Jest + RNTL foundation.
  - TestIDs på kritiske flows.
  - Unit tests for core logic.
  - Screen/component tests.
  - API mocking harness.
  - E2E smoke og udvidelse til 8 golden paths.
- Golden flow release-check (Maestro):
  - Auth.
  - Paywall gating.
  - Activity completion.
  - Feedback task.
  - Library add-to-tasks.
  - Notifications allow/deny + fallback.
  - Role-based UI.
  - Error/retry.

## 1.0.3
- Emailbekræftelse ved oprettelse (#126)
- Notifikationer: iPhone + åbner opgave/deeplink korrekt (#89, #145)
- UI/stabilitet: abonnement/profil/forside (inkl. safe-area og mindre flicker) (#56, #60, #121, #130, #133)
- Performance + eksterne aktiviteter/feedback rettelser (#95, #136, #138)
- Diverse mindre fixes (login-tekst, task modal, opret øvelse, badges/duplication) (#64, #28, #58, #90, #94, #123, #98, #119, #125)

## 1.0.1
- Rettet visning af næste dato for abonnementfornyelse.
- Forbedret flowet for valg af abonnement efter oprettelse.
- Bibliotek: Trænere kan nu oprette øvelser direkte fra biblioteket.
- Bibliotek: Tilføjet redigér- og slet-funktion på øvelser.
- Træner: Mulighed for at tildele øvelser til spillere.
- Aktiviteter: Redigering virker igen.
- Opgaver: “Tilføj til opgaver” knappen virker igen.
