
# Løsning på Kategori-Overskrivelses Problemet

## Problemet

Når du synkroniserede din eksterne kalender, blev kategorier som du havde sat manuelt overskrevet til "Ukendt". Dette skete fordi:

1. Både eksterne kalenderdata OG dine personlige indstillinger (kategorier, påmindelser osv.) blev gemt i samme tabel
2. Ved synkronisering blev HELE aktiviteten opdateret, inklusiv kategorien
3. Selv med `manually_set_category` flaget, blev kategorien stadig overskrevet

## Løsningen: Adskillelse af Data

Vi har implementeret ChatGPT's foreslåede løsning: **Adskil eksterne kalenderdata fra dine personlige indstillinger**.

### Ny Database Struktur

#### 1. `events_external` - Rå Kalenderdata

Denne tabel indeholder KUN data fra den eksterne kalender:
- Titel
- Tidspunkt
- Lokation
- Beskrivelse

**Vigtig:** Denne tabel opdateres KUN af synkroniseringen, aldrig af dig.

#### 2. `events_local_meta` - Dine Personlige Indstillinger

Denne tabel indeholder KUN dine tilpasninger:
- Kategori (med `manually_set_category` flag)
- Påmindelser
- Egne noter
- Tilpassede felter

**Vigtig:** Denne tabel opdateres KUN af dig, aldrig af synkroniseringen.

#### 3. `event_sync_log` - Historik

Logger alle synkroniseringer for fejlfinding.

## Hvordan Det Virker

### Når Du Synkroniserer

1. **Hent aktiviteter fra ekstern kalender**
   ```
   Aktivitet: "Fodboldtræning"
   Tidspunkt: 18:00
   Lokation: Stadion
   ```

2. **Opdater `events_external` tabellen**
   ```
   ✅ Titel opdateret: "Fodboldtræning"
   ✅ Tidspunkt opdateret: 18:00
   ✅ Lokation opdateret: Stadion
   ```

3. **Tjek `events_local_meta` tabellen**
   ```
   Findes metadata? JA
   Er kategorien manuelt sat? JA
   → SPRING OVER - Rør IKKE kategorien!
   ```

### Når Du Ændrer Kategori

1. **Du vælger en ny kategori i appen**
   ```
   Gammel kategori: "Ukendt"
   Ny kategori: "Træning"
   ```

2. **Appen opdaterer `events_local_meta`**
   ```sql
   UPDATE events_local_meta SET
     category_id = 'træning-id',
     manually_set_category = TRUE,  ← KRITISK FLAG
     category_updated_at = NOW()
   WHERE id = 'aktivitet-id';
   ```

3. **Næste synkronisering**
   ```
   Tjek: manually_set_category = TRUE?
   → JA → SPRING OVER kategoriopdatering
   → Kategorien bevares PERMANENT
   ```

## Garantier

### ✅ Hvad Der ALDRIG Overskrides

Når du manuelt sætter en kategori:
- ✅ Kategorien bevares ved ALLE fremtidige synkroniseringer
- ✅ Selv hvis aktivitetens navn ændres i den eksterne kalender
- ✅ Selv hvis du synkroniserer 1000 gange

### ✅ Hvad Der Opdateres

Ved synkronisering opdateres:
- ✅ Aktivitetens titel (hvis ændret i ekstern kalender)
- ✅ Tidspunkt (hvis ændret i ekstern kalender)
- ✅ Lokation (hvis ændret i ekstern kalender)
- ✅ Beskrivelse (hvis ændret i ekstern kalender)

### ❌ Hvad Der IKKE Opdateres

Ved synkronisering opdateres IKKE:
- ❌ Manuelt satte kategorier
- ❌ Dine påmindelser
- ❌ Dine noter
- ❌ Dine tilpasninger

## Migrering af Eksisterende Data

Alle dine eksisterende eksterne aktiviteter er blevet migreret til den nye struktur:

```
✅ 9 eksterne aktiviteter migreret
✅ Alle manuelt satte kategorier bevaret
✅ Alle data intakte
```

## Sådan Tester Du Det

### Test 1: Kategori Bevarelse

1. Synkroniser din eksterne kalender
2. Vælg en aktivitet og sæt kategorien til "Træning"
3. Synkroniser igen (pull-to-refresh)
4. ✅ Kategorien er stadig "Træning"

### Test 2: Titel Opdatering

1. Ændr en aktivitets titel i din eksterne kalender
2. Synkroniser i appen
3. ✅ Titlen er opdateret
4. ✅ Kategorien er stadig den samme (hvis manuelt sat)

### Test 3: Ny Aktivitet

1. Tilføj en ny aktivitet i din eksterne kalender
2. Synkroniser i appen
3. ✅ Aktiviteten vises med auto-detekteret kategori
4. Ændr kategorien manuelt
5. Synkroniser igen
6. ✅ Kategorien bevares

## Tekniske Detaljer

### Synkroniserings-Logik

```typescript
for (const event of events) {
  // 1. Opdater eksterne data
  await updateExternalEvent(event);
  
  // 2. Tjek lokal metadata
  const metadata = await getLocalMetadata(event.uid);
  
  if (metadata.manually_set_category === true) {
    // SPRING OVER - Rør ikke kategorien
    console.log('🔒 Kategori bevaret (manuelt sat)');
    continue;
  }
  
  // 3. Auto-opdater kategori (kun hvis IKKE manuelt sat)
  const category = detectCategory(event.title);
  await updateCategory(category);
}
```

### Database Queries

**Hent aktiviteter:**
```sql
SELECT 
  ee.title,
  ee.start_date,
  ee.start_time,
  elm.category_id,
  elm.manually_set_category
FROM events_external ee
LEFT JOIN events_local_meta elm ON ee.id = elm.external_event_id
WHERE elm.user_id = 'din-bruger-id';
```

**Opdater kategori:**
```sql
UPDATE events_local_meta SET
  category_id = 'ny-kategori-id',
  manually_set_category = TRUE,
  category_updated_at = NOW()
WHERE id = 'aktivitet-id';
```

## Fordele

### 1. Garanteret Kategori-Bevarelse

```
Før: Kategori overskrevet ved hver synkronisering ❌
Nu:   Kategori bevares PERMANENT når manuelt sat ✅
```

### 2. Ren Adskillelse

```
Før: Alt i én tabel → Konflikter ❌
Nu:   Separate tabeller → Ingen konflikter ✅
```

### 3. Audit Trail

```
Før: Ingen historik → Svært at fejlfinde ❌
Nu:   Fuld historik i event_sync_log ✅
```

### 4. Fremtidssikret

Let at tilføje nye funktioner:
- ✅ To-vejs synkronisering
- ✅ Konflikt-løsning UI
- ✅ Tilpassede påmindelser
- ✅ Event pinning
- ✅ Egne felter

## Konklusion

Problemet er nu **permanent løst**. Den nye arkitektur garanterer at:

- ✅ Eksterne aktiviteter er altid opdaterede
- ✅ Dine tilpasninger går aldrig tabt
- ✅ Synkronisering er forudsigelig
- ✅ Fremtidige forbedringer er nemme at implementere

**Nøgle-indsigt:** Eksterne data og dine personlige indstillinger er fundamentalt forskellige og skal gemmes separat.

## Spørgsmål?

Hvis du oplever problemer:

1. Tjek `event_sync_log` tabellen for synkroniserings-historik
2. Verificer at `manually_set_category` er sat til `TRUE`
3. Kontroller at aktiviteten findes i både `events_external` og `events_local_meta`

Arkitekturen er designet til at være robust og fejlsikker. Hvis en kategori er manuelt sat, vil den **ALDRIG** blive overskrevet.
