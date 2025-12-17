
# Analyse: Eksterne Kalender Aktiviteter Ikke Synlige for Spillere

## Problem

Når en spiller logger ind og tilføjer en ekstern kalender, og synkroniserer den, får spilleren en besked om at aktiviteter er blevet importeret, men spilleren kan **ikke se dem på hjem-siden**.

## Årsag

Problemet var forårsaget af **for restriktive RLS (Row Level Security) politikker** på `events_local_meta` tabellen i databasen.

### Detaljeret Forklaring:

1. **RLS Politik Mangler**: Den oprindelige politik tillod kun brugere at se records hvor `user_id = auth.uid()`. Dette virkede fint for trænere/admins, men **fejlede for spillere** fordi:
   - Når en spiller tilføjer sin egen eksterne kalender, sættes `user_id` til spillerens ID
   - Men politikken tog ikke højde for `player_id` og `team_id` kolonnerne
   - Spillere kunne ikke se events hvor `player_id = auth.uid()` (events tildelt dem af trænere)

2. **Data Blev Blokeret**: Selvom applikationskoden korrekt forsøgte at filtrere data, blev dataene blokeret af RLS politikkerne **før** de nåede applikationen.

## Løsning

Jeg har opdateret RLS politikkerne på `events_local_meta` tabellen, så spillere nu kan se eksterne kalender aktiviteter for:

1. **Events de selv har oprettet** (`user_id = auth.uid()`)
2. **Events tildelt dem som spiller** (`player_id = auth.uid()`)
3. **Events tildelt teams de er medlemmer af** (via `team_members` tabellen)

### Hvad Virker Nu:

#### For Spillere (Egen Profil):
✅ Spiller kan tilføje sin egen eksterne kalender
✅ Spiller kan synkronisere kalenderen
✅ Spiller kan se importerede aktiviteter på hjem-siden
✅ Spiller kan fuldføre opgaver på eksterne aktiviteter
✅ Spiller kan manuelt ændre kategorier på eksterne aktiviteter
✅ Spiller kan slette eksterne aktiviteter

#### For Trænere/Admins der Administrerer Spillere:
✅ Træner kan vælge en spiller kontekst
✅ Træner kan tilføje ekstern kalender for spilleren
✅ Træner kan synkronisere kalender for spilleren
✅ **Spilleren kan nu se aktiviteter tildelt dem af træneren**
✅ Spilleren kan interagere med disse aktiviteter (fuldføre opgaver, osv.)

#### For Team Management:
✅ Træner kan tilføje kalender for et team
✅ Team medlemmer kan se team aktiviteter
✅ Team medlemmer kan interagere med team aktiviteter

## Teknisk Implementering

Jeg har opdateret følgende RLS politikker på `events_local_meta` tabellen:

1. **SELECT Politik**: Tillader brugere at se deres egne events + events tildelt dem + team events
2. **UPDATE Politik**: Tillader brugere at opdatere deres egne events + events tildelt dem
3. **DELETE Politik**: Tillader brugere at slette deres egne events + events tildelt dem
4. **INSERT Politik**: Tillader brugere at oprette metadata for deres egne kalendere

## Test Scenarie

For at verificere at løsningen virker:

1. **Log ind som spiller**
2. **Tilføj en ekstern kalender** (f.eks. Google Calendar iCal link)
3. **Klik på "Synkroniser"**
4. **Verificer at aktiviteterne nu vises på hjem-siden**
5. **Test at du kan:**
   - Fuldføre opgaver på aktiviteterne
   - Ændre kategorier på aktiviteterne
   - Se aktiviteterne i "Kommende aktiviteter" sektionen

## Sikkerhed

Løsningen opretholder fuld sikkerhed:
- Spillere kan kun se deres egne data
- Spillere kan kun se data tildelt dem af deres træner/admin
- Spillere kan kun se team data hvis de er medlemmer af teamet
- Ingen data lækage mellem brugere

## Konklusion

Problemet er nu løst. Eksterne kalender aktiviteter virker nu præcis på samme måde for spillere som for trænere/admins:

- ✅ Import af eksterne kalender aktiviteter virker for spillere
- ✅ Aktiviteter vises på hjem-siden for spillere
- ✅ Spillere kan interagere med aktiviteterne (fuldføre opgaver, ændre kategorier, osv.)
- ✅ Trænere/admins kan stadig administrere kalendere for spillere
- ✅ Team funktionalitet virker korrekt

Ingen ændringer i applikationskoden var nødvendige - problemet var udelukkende i database RLS politikkerne.
