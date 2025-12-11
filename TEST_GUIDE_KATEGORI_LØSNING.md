
# Test Guide - Kategori Bevarelse Løsning

## Formål

Denne guide hjælper dig med at verificere at den nye arkitektur virker korrekt, og at manuelt satte kategorier ALDRIG overskrides ved synkronisering.

## Forudsætninger

- ✅ Database migration er kørt (`migrate_external_activities()`)
- ✅ Ny Edge Function er deployed (`sync-external-calendar`)
- ✅ App er opdateret med ny `useFootballData` hook

## Test 1: Verificer Migrering

### Formål
Sikre at eksisterende data er korrekt migreret til den nye struktur.

### Steps

1. **Tjek antal migrerede aktiviteter:**
   ```sql
   SELECT COUNT(*) FROM events_external;
   -- Forventet: 9 (eller dit antal eksterne aktiviteter)
   ```

2. **Tjek at metadata er oprettet:**
   ```sql
   SELECT COUNT(*) FROM events_local_meta;
   -- Forventet: Samme antal som events_external
   ```

3. **Verificer data integritet:**
   ```sql
   SELECT 
     ee.title,
     elm.category_id,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   LIMIT 5;
   ```

### Forventet Resultat
- ✅ Alle eksterne aktiviteter er i `events_external`
- ✅ Alle har tilsvarende metadata i `events_local_meta`
- ✅ Kategorier er bevaret fra før migreringen

---

## Test 2: Auto-Detektering af Kategorier

### Formål
Verificere at nye aktiviteter får automatisk tildelt kategorier baseret på deres navne.

### Steps

1. **Tilføj en ny aktivitet i din eksterne kalender:**
   - Titel: "Fodboldtræning"
   - Tidspunkt: I morgen kl. 18:00

2. **Synkroniser i appen:**
   - Åbn appen
   - Gå til Admin-siden
   - Klik på "Synkroniser" for din kalender

3. **Verificer kategori:**
   - Find aktiviteten i listen
   - Tjek at kategorien er "Træning" (auto-detekteret)

4. **Tjek database:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title LIKE '%træning%'
   ORDER BY ee.created_at DESC
   LIMIT 1;
   ```

### Forventet Resultat
- ✅ Aktivitet vises i appen
- ✅ Kategori er "Træning"
- ✅ `manually_set_category = FALSE` (auto-detekteret)

---

## Test 3: Manuel Kategori-Ændring

### Formål
Verificere at manuelt satte kategorier markeres korrekt i databasen.

### Steps

1. **Vælg en aktivitet i appen**

2. **Ændr kategorien:**
   - Klik på aktiviteten
   - Vælg "Rediger"
   - Ændr kategorien til "Kamp"
   - Gem

3. **Tjek database:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     elm.category_updated_at,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'DIN-AKTIVITETS-TITEL'
   ORDER BY elm.category_updated_at DESC
   LIMIT 1;
   ```

### Forventet Resultat
- ✅ `manually_set_category = TRUE`
- ✅ `category_updated_at` er sat til nu
- ✅ `category_name = 'Kamp'`

---

## Test 4: Kategori Bevarelse ved Synkronisering

### Formål
**KRITISK TEST** - Verificere at manuelt satte kategorier ALDRIG overskrides.

### Steps

1. **Vælg en aktivitet med manuelt sat kategori**
   - Fra Test 3, eller sæt en ny kategori manuelt

2. **Verificer før synkronisering:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'DIN-AKTIVITETS-TITEL';
   ```
   - Noter kategorien

3. **Synkroniser:**
   - Gå til Admin-siden
   - Klik på "Synkroniser"
   - Vent på at synkroniseringen er færdig

4. **Verificer efter synkronisering:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'DIN-AKTIVITETS-TITEL';
   ```

5. **Tjek sync log:**
   ```sql
   SELECT 
     action,
     details,
     timestamp
   FROM event_sync_log
   WHERE details->>'title' = 'DIN-AKTIVITETS-TITEL'
   ORDER BY timestamp DESC
   LIMIT 1;
   ```

### Forventet Resultat
- ✅ Kategorien er UÆNDRET
- ✅ `manually_set_category = TRUE` (stadig)
- ✅ Sync log viser `"manually_set_preserved": true`

---

## Test 5: Titel Opdatering (Ekstern Ændring)

### Formål
Verificere at eksterne ændringer (titel, tid, lokation) opdateres, mens kategorien bevares.

### Steps

1. **Vælg en aktivitet med manuelt sat kategori**

2. **Noter nuværende data:**
   - Titel
   - Kategori
   - Tidspunkt

3. **Ændr titlen i din eksterne kalender:**
   - Gammel titel: "Fodboldtræning"
   - Ny titel: "Fodboldtræning - Ekstra session"

4. **Synkroniser i appen**

5. **Verificer:**
   ```sql
   SELECT 
     ee.title,
     ee.start_time,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.provider_event_uid = 'DIN-EVENT-UID';
   ```

### Forventet Resultat
- ✅ Titel er opdateret til "Fodboldtræning - Ekstra session"
- ✅ Kategori er UÆNDRET (stadig manuelt sat)
- ✅ `manually_set_category = TRUE`

---

## Test 6: Ny Aktivitet → Manuel Kategori → Synkroniser

### Formål
Fuld end-to-end test af hele flowet.

### Steps

1. **Tilføj ny aktivitet i ekstern kalender:**
   - Titel: "Test Aktivitet"
   - Tidspunkt: I morgen kl. 10:00

2. **Synkroniser i appen**
   - Aktivitet vises med auto-detekteret kategori (sandsynligvis "Ukendt")

3. **Ændr kategori manuelt:**
   - Sæt kategorien til "Træning"

4. **Verificer i database:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'Test Aktivitet';
   ```
   - Forventet: `manually_set_category = TRUE`, `category_name = 'Træning'`

5. **Synkroniser igen**

6. **Verificer kategori bevaret:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'Test Aktivitet';
   ```

### Forventet Resultat
- ✅ Kategori er stadig "Træning"
- ✅ `manually_set_category = TRUE`
- ✅ Ingen ændringer ved synkronisering

---

## Test 7: Stress Test - Mange Synkroniseringer

### Formål
Verificere at kategorien bevares selv efter mange synkroniseringer.

### Steps

1. **Vælg en aktivitet med manuelt sat kategori**

2. **Synkroniser 10 gange:**
   - Klik på "Synkroniser" 10 gange i træk
   - Vent mellem hver synkronisering

3. **Verificer efter hver synkronisering:**
   ```sql
   SELECT 
     ee.title,
     elm.manually_set_category,
     ac.name as category_name,
     elm.category_updated_at
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'DIN-AKTIVITETS-TITEL';
   ```

4. **Tjek sync log:**
   ```sql
   SELECT 
     COUNT(*) as sync_count,
     MAX(timestamp) as last_sync
   FROM event_sync_log
   WHERE details->>'title' = 'DIN-AKTIVITETS-TITEL';
   ```

### Forventet Resultat
- ✅ Kategori er UÆNDRET efter alle 10 synkroniseringer
- ✅ `manually_set_category = TRUE` (stadig)
- ✅ `category_updated_at` er UÆNDRET (ikke opdateret af sync)
- ✅ Sync log viser 10 entries med `"manually_set_preserved": true`

---

## Test 8: Pull-to-Refresh Test

### Formål
Verificere at pull-to-refresh ikke overskriver kategorier.

### Steps

1. **Åbn appen på forsiden**

2. **Vælg en aktivitet og sæt kategori manuelt**

3. **Pull-to-refresh:**
   - Træk ned fra toppen af skærmen
   - Vent på at data opdateres

4. **Verificer aktiviteten:**
   - Tjek at kategorien er uændret

5. **Gentag 5 gange**

### Forventet Resultat
- ✅ Kategori bevares efter hver pull-to-refresh
- ✅ Ingen fejlmeddelelser
- ✅ Data opdateres korrekt

---

## Test 9: App Genstart Test

### Formål
Verificere at kategorier bevares efter app genstart.

### Steps

1. **Sæt en kategori manuelt**

2. **Luk appen fuldstændigt:**
   - iOS: Swipe op og luk appen
   - Android: Luk appen fra recent apps

3. **Åbn appen igen**

4. **Verificer aktiviteten:**
   - Tjek at kategorien er uændret

### Forventet Resultat
- ✅ Kategori er bevaret efter genstart
- ✅ `manually_set_category` flag er stadig TRUE

---

## Test 10: Edge Case - Slet og Genopret

### Formål
Teste hvad der sker hvis en aktivitet slettes fra ekstern kalender og tilføjes igen.

### Steps

1. **Vælg en aktivitet med manuelt sat kategori**

2. **Noter:**
   - Titel
   - Kategori
   - `provider_event_uid`

3. **Slet aktiviteten fra ekstern kalender**

4. **Synkroniser i appen**
   - Aktivitet forsvinder

5. **Tilføj aktiviteten igen i ekstern kalender:**
   - Samme titel
   - Samme tidspunkt

6. **Synkroniser i appen**

7. **Verificer:**
   ```sql
   SELECT 
     ee.title,
     ee.provider_event_uid,
     elm.manually_set_category,
     ac.name as category_name
   FROM events_external ee
   JOIN events_local_meta elm ON ee.id = elm.external_event_id
   LEFT JOIN activity_categories ac ON elm.category_id = ac.id
   WHERE ee.title = 'DIN-AKTIVITETS-TITEL'
   ORDER BY ee.created_at DESC
   LIMIT 1;
   ```

### Forventet Resultat
- ✅ Aktivitet vises igen
- ✅ Kategori er auto-detekteret (IKKE manuelt sat længere)
- ✅ `manually_set_category = FALSE` (ny aktivitet)
- ⚠️ Dette er forventet adfærd - det er en ny aktivitet

---

## Fejlfinding

### Problem: Kategori overskrevet ved synkronisering

**Tjek:**
```sql
SELECT 
  ee.title,
  elm.manually_set_category,
  elm.category_updated_at,
  ac.name as category_name
FROM events_external ee
JOIN events_local_meta elm ON ee.id = elm.external_event_id
LEFT JOIN activity_categories ac ON elm.category_id = ac.id
WHERE ee.title = 'PROBLEM-AKTIVITET';
```

**Hvis `manually_set_category = FALSE`:**
- Kategorien blev ikke sat manuelt i appen
- Sæt kategorien igen og verificer at flaget bliver TRUE

**Hvis `manually_set_category = TRUE` men kategorien er ændret:**
- Dette burde ALDRIG ske
- Tjek Edge Function logs
- Tjek sync log for detaljer

### Problem: Aktivitet vises ikke i appen

**Tjek:**
```sql
-- Findes i events_external?
SELECT * FROM events_external WHERE title = 'MANGLENDE-AKTIVITET';

-- Findes i events_local_meta?
SELECT * FROM events_local_meta 
WHERE external_event_id IN (
  SELECT id FROM events_external WHERE title = 'MANGLENDE-AKTIVITET'
);
```

**Løsning:**
- Hvis kun i `events_external`: Opret metadata manuelt eller synkroniser igen
- Hvis i begge: Tjek RLS policies

### Problem: Sync fejler

**Tjek Edge Function logs:**
```sql
SELECT * FROM event_sync_log 
ORDER BY timestamp DESC 
LIMIT 10;
```

**Tjek for fejl:**
- Ugyldig iCal URL
- Netværksfejl
- Database fejl

---

## Konklusion

Hvis alle tests passerer, er løsningen verificeret og klar til produktion.

**Kritiske tests:**
- ✅ Test 4: Kategori bevarelse ved synkronisering
- ✅ Test 7: Stress test med mange synkroniseringer
- ✅ Test 8: Pull-to-refresh test

Hvis disse tre tests passerer, er løsningen robust og pålidelig.
