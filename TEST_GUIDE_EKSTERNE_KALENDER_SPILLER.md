
# Test Guide: Eksterne Kalender for Spillere

## Formål
Verificere at spillere kan se deres eksterne kalender aktiviteter på hjem-siden efter synkronisering.

## Forudsætninger
- En spiller bruger skal være oprettet og logget ind
- Spilleren skal have en ekstern kalender URL (f.eks. Google Calendar iCal link)

## Test Scenarie 1: Spiller Tilføjer Egen Kalender

### Trin 1: Log ind som Spiller
1. Log ind med spiller credentials
2. Verificer at du er på hjem-siden
3. Verificer at der ikke er nogen eksterne aktiviteter endnu

### Trin 2: Tilføj Ekstern Kalender
1. Naviger til "Bibliotek" siden (eller hvor eksterne kalendere administreres)
2. Klik på "Tilføj ekstern kalender"
3. Indtast:
   - **Navn**: "Min Træningskalender" (eller lignende)
   - **iCal URL**: Din eksterne kalender URL (webcal:// eller https://)
4. Klik "Tilføj"
5. **Forventet resultat**: Kalender tilføjes succesfuldt

### Trin 3: Synkroniser Kalender
1. Find den nyligt tilføjede kalender
2. Klik på "Synkroniser" knappen
3. Vent på synkronisering (kan tage et par sekunder)
4. **Forventet resultat**: Besked vises med antal importerede aktiviteter

### Trin 4: Verificer Aktiviteter på Hjem-siden
1. Naviger til "Hjem" siden
2. **Forventet resultat**: 
   - ✅ Eksterne aktiviteter vises i "I dag" sektionen (hvis der er aktiviteter i dag)
   - ✅ Eksterne aktiviteter vises i "Kommende aktiviteter" sektionen
   - ✅ Aktiviteter har et lille kalender ikon for at indikere de er eksterne
   - ✅ Aktiviteter har korrekt kategori tildelt (automatisk eller "Ukendt")

### Trin 5: Interager med Eksterne Aktiviteter
1. Klik på en ekstern aktivitet
2. **Forventet resultat**: Aktivitetsdetaljer vises
3. Prøv at fuldføre en opgave på aktiviteten
4. **Forventet resultat**: Opgaven markeres som fuldført
5. Prøv at ændre kategorien på aktiviteten
6. **Forventet resultat**: Kategorien ændres og bevares ved næste synkronisering

## Test Scenarie 2: Træner Tilføjer Kalender for Spiller

### Trin 1: Log ind som Træner/Admin
1. Log ind med træner/admin credentials
2. Naviger til "Træner" eller "Admin" siden

### Trin 2: Vælg Spiller Kontekst
1. Klik på "Administrer spiller data"
2. Vælg en spiller fra listen
3. **Forventet resultat**: Gul advarselsbanner vises øverst

### Trin 3: Tilføj Ekstern Kalender for Spilleren
1. Naviger til eksterne kalendere
2. Tilføj en ny kalender (som i Scenarie 1)
3. Synkroniser kalenderen
4. **Forventet resultat**: Aktiviteter importeres for spilleren

### Trin 4: Log ind som Spilleren
1. Log ud som træner
2. Log ind som den valgte spiller
3. Naviger til "Hjem" siden
4. **Forventet resultat**: 
   - ✅ Spilleren kan se aktiviteterne tildelt af træneren
   - ✅ Aktiviteterne vises på samme måde som spillerens egne aktiviteter
   - ✅ Spilleren kan interagere med aktiviteterne

## Test Scenarie 3: Team Kalender

### Trin 1: Opret Team (som Træner)
1. Log ind som træner/admin
2. Opret et nyt team
3. Tilføj spillere til teamet

### Trin 2: Tilføj Kalender for Team
1. Vælg team kontekst
2. Tilføj ekstern kalender for teamet
3. Synkroniser kalenderen

### Trin 3: Verificer som Team Medlem
1. Log ind som en spiller der er medlem af teamet
2. Naviger til "Hjem" siden
3. **Forventet resultat**: 
   - ✅ Team aktiviteter vises på hjem-siden
   - ✅ Spilleren kan interagere med team aktiviteterne

## Fejlfinding

### Problem: Aktiviteter vises ikke efter synkronisering

**Mulige årsager:**
1. **RLS politik ikke opdateret**: Verificer at migrationen `fix_external_calendar_player_visibility` er kørt
2. **Cache problem**: Prøv at pull-to-refresh på hjem-siden
3. **Ingen aktiviteter i kalenderen**: Verificer at den eksterne kalender faktisk indeholder aktiviteter

**Løsning:**
```sql
-- Verificer RLS politikker
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'events_local_meta';

-- Verificer at events_local_meta records eksisterer
SELECT COUNT(*) 
FROM events_local_meta 
WHERE user_id = 'SPILLER_USER_ID';
```

### Problem: "Permission denied" fejl

**Mulige årsager:**
1. RLS politikker er ikke korrekt opdateret
2. Spilleren har ikke adgang til kalenderen

**Løsning:**
Verificer at RLS politikkerne inkluderer:
- `user_id = auth.uid()` (for egne kalendere)
- `player_id = auth.uid()` (for kalendere tildelt spilleren)
- Team membership check (for team kalendere)

## Success Kriterier

Testen er succesfuld hvis:
- ✅ Spillere kan tilføje deres egne eksterne kalendere
- ✅ Spillere kan synkronisere deres kalendere
- ✅ Spillere kan se importerede aktiviteter på hjem-siden
- ✅ Spillere kan interagere med eksterne aktiviteter (fuldføre opgaver, ændre kategorier)
- ✅ Trænere kan tilføje kalendere for spillere
- ✅ Spillere kan se aktiviteter tildelt dem af trænere
- ✅ Team medlemmer kan se team aktiviteter
- ✅ Manuelt tildelte kategorier bevares ved synkronisering

## Teknisk Verifikation

For at verificere at løsningen virker på database niveau:

```sql
-- 1. Verificer at RLS politikker er opdateret
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'events_local_meta'
ORDER BY cmd, policyname;

-- 2. Verificer at eksterne events eksisterer
SELECT COUNT(*) as total_external_events
FROM events_external;

-- 3. Verificer at local metadata eksisterer
SELECT COUNT(*) as total_local_meta
FROM events_local_meta;

-- 4. Verificer at eksterne event tasks eksisterer
SELECT COUNT(*) as total_external_tasks
FROM external_event_tasks;

-- 5. Test RLS som spiller (kør som spiller bruger)
SELECT COUNT(*) as visible_events
FROM events_local_meta
WHERE user_id = auth.uid() 
   OR player_id = auth.uid()
   OR team_id IN (
     SELECT team_id 
     FROM team_members 
     WHERE player_id = auth.uid()
   );
```

## Konklusion

Hvis alle tests passerer, er eksterne kalender funktionaliteten nu fuldt funktionel for spillere, præcis som for trænere/admins.
