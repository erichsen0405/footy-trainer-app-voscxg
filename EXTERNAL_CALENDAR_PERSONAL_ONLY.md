
# Eksterne Kalendere - Kun Personlig Profil

## Ændringer Implementeret

Vi har ændret funktionaliteten for eksterne kalendere, så brugere (både spillere og admins/trænere) **kun kan tilføje eksterne kalendere til deres egen profil**.

### Hvad er ændret?

1. **ExternalCalendarManager Component**
   - Komponenten henter nu kun kalendere for den aktuelt loggede ind bruger
   - Fjernet al kontekst-baseret logik (team/spiller valg)
   - Kalendere tilføjes altid til `user_id` (den loggede ind bruger)
   - Opdateret beskeder til at forklare at kalenderen tilføjes til brugerens egen profil

2. **Database Struktur**
   - Fjernet `team_id` og `player_id` kolonner fra `external_calendars` tabellen
   - Fjernet `team_id` og `player_id` fra `events_local_meta` for eksterne kalender events
   - Opdateret RLS policies til kun at tillade brugere at administrere deres egne kalendere

3. **RLS Policies**
   - **external_calendars**: Brugere kan kun se, oprette, opdatere og slette deres egne kalendere
   - **events_local_meta**: Brugere kan kun se og administrere metadata for deres egne eksterne kalender events
   - **events_external**: Brugere kan kun se eksterne events fra deres egne kalendere

4. **UI Ændringer**
   - Fjernet "Eksterne Kalendere" sektion fra Admin og Træner siderne
   - Tilføjet info-tekst der henviser brugere til Profil-siden for at tilføje eksterne kalendere
   - Eksterne kalendere er nu tilgængelige for alle brugere via Profil-siden i en collapsible sektion

### Hvordan virker det nu?

1. **For alle brugere (spillere, trænere, admins)**:
   - Gå til Profil-siden
   - Udvid "Kalender Synkronisering" sektionen
   - Tilføj eksterne kalendere (iCal/webcal URLs)
   - Kalendere synkroniseres automatisk hver time
   - Aktiviteter fra eksterne kalendere vises kun for den bruger der tilføjede kalenderen

2. **Aktiviteter fra eksterne kalendere**:
   - Vises på brugerens egen hjemmeside
   - Tildeles automatisk kategorier baseret på aktiviteternes navne
   - Manuelt tildelte kategorier bevares ved synkronisering
   - Kan ikke deles med andre brugere eller teams

### Fordele ved denne tilgang

1. **Enklere**: Ingen forvirring om hvem kalenderen tilhører
2. **Mere privat**: Hver bruger har kontrol over deres egne eksterne kalendere
3. **Bedre sikkerhed**: RLS policies sikrer at brugere kun kan se deres egne data
4. **Konsistent**: Samme funktionalitet for alle brugertyper

### Migrationer Anvendt

1. `external_calendars_personal_only_v2`: Fjernede team_id og player_id fra external_calendars
2. `events_local_meta_personal_only`: Opdaterede RLS policies for events_local_meta

### Test Guide

1. **Som spiller**:
   - Log ind som spiller
   - Gå til Profil-siden
   - Tilføj en ekstern kalender
   - Synkroniser kalenderen
   - Verificer at aktiviteter vises på din hjemmeside

2. **Som træner/admin**:
   - Log ind som træner/admin
   - Gå til Profil-siden (ikke Admin/Træner siden)
   - Tilføj en ekstern kalender
   - Synkroniser kalenderen
   - Verificer at aktiviteter vises på din hjemmeside
   - Verificer at kalenderen IKKE vises for spillere eller teams

3. **Verificer isolation**:
   - Log ind som to forskellige brugere
   - Tilføj forskellige eksterne kalendere til hver bruger
   - Verificer at hver bruger kun kan se deres egne kalendere og aktiviteter

### Bemærkninger

- Eksisterende eksterne kalendere er blevet opdateret til at fjerne team_id og player_id
- Alle aktiviteter fra eksterne kalendere er nu kun tilknyttet den bruger der tilføjede kalenderen
- Hvis en træner vil dele aktiviteter med spillere, skal de oprette aktiviteter manuelt eller bruge aktivitetsserier
