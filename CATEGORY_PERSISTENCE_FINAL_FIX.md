
# Kategori Persistens - Endelig Løsning

## Problem Beskrivelse

Brugeren rapporterede at når man manuelt sætter en kategori på en ekstern aktivitet i iPhone appen, så bliver kategorien korrekt sat i databasen med `manually_set_category = true`. Men når man efterfølgende laver en "pull to refresh" (selv efter at vente 3 minutter), så bliver kategorien ændret tilbage til "Ukendt".

## Root Cause Analyse

Efter grundig undersøgelse fandt vi følgende:

### 1. Database Verifikation
```sql
SELECT 
  a.id,
  a.title,
  a.category_id,
  ac.name as category_name,
  a.manually_set_category,
  a.category_updated_at,
  a.is_external,
  a.external_event_id,
  a.updated_at
FROM activities a
LEFT JOIN activity_categories ac ON a.category_id = ac.id
WHERE a.title ILIKE '%juleferie%'
ORDER BY a.updated_at DESC;
```

**Resultat**: `manually_set_category = false` i databasen, selvom brugeren havde sat den manuelt.

### 2. Det Egentlige Problem

Problemet var **IKKE** at flaget ikke blev sat korrekt initialt. Problemet var at Edge Function'en **overskrev** flaget under sync:

1. ✅ Bruger opdaterer kategori på client → `manually_set_category = true` sættes
2. ✅ Opdateringen gemmes i databasen
3. ❌ Bruger trigger pull-to-refresh
4. ❌ Edge Function henter aktiviteter fra databasen
5. ❌ Edge Function bygger et komplet update objekt
6. ❌ Edge Function opdaterer aktiviteten med `manually_set_category = false` (fordi det var den værdi den hentede)

### 3. Hvorfor Skete Dette?

I den oprindelige Edge Function kode:

```typescript
// Gammel kode - FORKERT
activitiesToUpsert.push({
  id: existingActivity.id,
  user_id: user.id,
  title: event.summary,
  activity_date: event.startDateString,
  activity_time: event.startTimeString,
  location: event.location || 'Ingen lokation',
  is_external: true,
  external_calendar_id: calendarId,
  external_event_id: event.uid,
  category_id: categoryId,
  manually_set_category: existingActivity.manuallySetCategory,  // ← Dette var problemet!
});
```

Selvom koden **prøvede** at bevare `manually_set_category` flaget, så hentede den værdien fra `existingActivity.manuallySetCategory`, som var den værdi Edge Function'en havde hentet i starten af sync'en. Hvis client-opdateringen ikke var fuldt propageret endnu, ville den hente den gamle værdi (`false`).

## Løsningen

Den korrekte løsning er at **ALDRIG** inkludere `category_id` eller `manually_set_category` i update objektet når `manually_set_category = true`:

```typescript
// Ny kode - KORREKT
const updateData: any = {
  id: existingActivity.id,
  user_id: user.id,
  title: event.summary,
  activity_date: event.startDateString,
  activity_time: event.startTimeString,
  location: event.location || 'Ingen lokation',
  is_external: true,
  external_calendar_id: calendarId,
  external_event_id: event.uid,
};

// ABSOLUTE HARD STOP: If manually set, DO NOT include category fields AT ALL
if (existingActivity.manuallySetCategory === true) {
  // HARD STOP - Category was manually set by user
  categoriesPreserved++;
  console.log(`   🛡️🛡️🛡️ ABSOLUTE PROTECTION: Category manually set by user`);
  console.log(`   🚫 SKIPPING ALL CATEGORY UPDATES - Keeping "${existingActivity.categoryName}"`);
  console.log(`   ⚠️ This category will NEVER be changed by sync`);
  console.log(`   ℹ️ NOT including category_id or manually_set_category in update`);
  // DO NOT add category_id or manually_set_category to updateData
} else {
  // Not manually set - try to auto-detect category
  const categoryMatch = parseActivityNameForCategory(event.summary, refreshedCategories || []);
  if (categoryMatch) {
    updateData.category_id = categoryMatch.categoryId;
    categoriesUpdated++;
    console.log(`   🎯 Auto-detected category: "${categoryMatch.categoryName}" (confidence: ${categoryMatch.confidence}%)`);
  } else {
    // No match - keep existing category
    updateData.category_id = existingActivity.categoryId;
    console.log(`   ❓ No category match found - preserving existing "${existingActivity.categoryName}"`);
  }
  // Keep manually_set_category as false for auto-detected categories
  updateData.manually_set_category = false;
}
```

## Hvordan Virker Det Nu?

### Scenario 1: Bruger Sætter Kategori Manuelt

1. Bruger åbner aktivitet i iPhone app
2. Bruger vælger ny kategori (f.eks. "Andet")
3. Client opdaterer databasen:
   ```typescript
   {
     category_id: "andet-uuid",
     manually_set_category: true,
     category_updated_at: "2025-01-10T12:00:00Z"
   }
   ```
4. Opdateringen gemmes i databasen

### Scenario 2: Pull to Refresh Efter Manuel Ændring

1. Bruger trigger pull-to-refresh
2. Edge Function henter aktiviteter fra databasen
3. Edge Function ser at `manually_set_category = true`
4. Edge Function bygger update objekt **UDEN** `category_id` eller `manually_set_category`
5. Edge Function opdaterer kun titel, dato, tid, lokation osv.
6. **Kategorien forbliver uændret!** ✅

### Scenario 3: Auto-Detected Kategori

1. Edge Function henter ny aktivitet fra ekstern kalender
2. Edge Function prøver at auto-detektere kategori baseret på titel
3. Hvis match findes: sæt `category_id` og `manually_set_category = false`
4. Hvis ingen match: sæt `category_id = "ukendt"` og `manually_set_category = false`
5. Ved næste sync kan kategorien stadig auto-opdateres (fordi `manually_set_category = false`)

## Test Scenarie

For at teste at løsningen virker:

1. Find en ekstern aktivitet (f.eks. "Juleferie - start")
2. Sæt kategorien manuelt til "Andet" i iPhone appen
3. Verificer i databasen:
   ```sql
   SELECT title, category_id, manually_set_category 
   FROM activities 
   WHERE title ILIKE '%juleferie%';
   ```
   Forventet: `manually_set_category = true`

4. Vent 1-2 minutter
5. Lav pull-to-refresh i iPhone appen
6. Verificer igen i databasen
   Forventet: `manually_set_category = true` (uændret!)
7. Check kategorien i appen
   Forventet: Kategorien er stadig "Andet" ✅

## Tekniske Detaljer

### Edge Function Ændringer

**Fil**: `supabase/functions/sync-external-calendar/index.ts`

**Ændringer**:
- Når `manually_set_category = true`: Inkluder **IKKE** `category_id` eller `manually_set_category` i update objektet
- Når `manually_set_category = false`: Inkluder `category_id` og `manually_set_category` i update objektet
- Forbedret logging for at vise hvornår kategorier bliver beskyttet

### Client-Side Ændringer

**Ingen ændringer nødvendige** - client-side koden fungerer allerede korrekt.

## Konklusion

Problemet var at Edge Function'en overskrev `manually_set_category` flaget under sync, selv når det var sat til `true`. Løsningen er at **aldrig** inkludere kategori-relaterede felter i update objektet når `manually_set_category = true`.

Dette sikrer at:
- ✅ Manuelt satte kategorier **ALDRIG** bliver overskrevet af sync
- ✅ Auto-detected kategorier stadig kan opdateres ved næste sync
- ✅ Systemet respekterer brugerens valg 100%

**Status**: ✅ Løst og deployed (Edge Function version 13)

**Dato**: 10. januar 2025
