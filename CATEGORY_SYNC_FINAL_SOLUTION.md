
# Kategori Synkronisering - Endelig Løsning

## Problem Beskrivelse

Når brugeren manuelt satte en kategori på en ekstern aktivitet, blev kategorien overskrevet til "Ukendt" ved næste pull-to-refresh synkronisering. Dette skete på trods af tidligere forsøg på at forhindre kategori-opdateringer.

## Rod Årsag

Efter grundig undersøgelse blev den reelle årsag identificeret:

**Edge Function'en opdaterede ALLE eksisterende aktiviteter**, uanset om brugeren havde sat kategorien manuelt eller ej. Selvom `category_id` ikke blev inkluderet i opdateringen, blev aktiviteten stadig opdateret, hvilket potentielt kunne udløse andre mekanismer.

Det kritiske problem var:
- Edge Function'en hentede eksisterende aktiviteter fra databasen
- Den byggede opdateringsobjekter for ALLE eksisterende aktiviteter
- Den udførte database-opdateringer på ALLE aktiviteter
- **Den checkede IKKE `manually_set_category` flaget før opdatering**

## Løsningen

### 1. Edge Function Ændring

Edge Function'en er nu ændret til at:

1. **Hente `manually_set_category` flaget** fra databasen sammen med eksisterende aktiviteter
2. **Springe HELE opdateringen over** for aktiviteter hvor `manually_set_category = true`
3. **Kun opdatere aktiviteter** hvor `manually_set_category = false` eller `null`

### Kode Ændringer

```typescript
// Hent eksisterende aktiviteter MED manually_set_category flag
const { data: existingActivities } = await supabaseClient
  .from('activities')
  .select('id, external_event_id, category_id, manually_set_category, activity_categories(name)')
  .eq('external_calendar_id', calendarId)
  .eq('user_id', user.id);

// Gem i map med manually_set_category flag
existingActivitiesMap.set(activity.external_event_id, {
  id: activity.id,
  categoryId: activity.category_id,
  categoryName: activity.activity_categories?.name || 'Unknown',
  manuallySetCategory: activity.manually_set_category || false,
});

// KRITISK FIX: Spring HELE opdateringen over hvis manually_set_category er true
if (existingActivity.manuallySetCategory === true) {
  activitiesSkipped++;
  console.log(`   🛡️ SKIPPING ENTIRE UPDATE - User has manually set category`);
  console.log(`   ⚠️ This activity will NOT be touched by sync at all`);
  continue; // Spring til næste event
}
```

### 2. Client-Side Ændringer (Allerede Implementeret)

Client-side koden i `useFootballData.ts` sætter allerede `manually_set_category = true` når brugeren ændrer kategorien:

```typescript
if (updates.categoryId !== undefined) {
  updateData.category_id = updates.categoryId;
  updateData.manually_set_category = true; // Sæt for ALLE aktiviteter
  updateData.category_updated_at = new Date().toISOString();
  console.log('   🔒 Setting manually_set_category = TRUE (user manually changed category)');
}
```

## Hvordan Det Virker Nu

### Når Brugeren Sætter En Kategori Manuelt:

1. Brugeren ændrer kategorien i appen
2. `updateActivitySingle` kaldes med den nye `categoryId`
3. Databasen opdateres med:
   - `category_id` = ny kategori
   - `manually_set_category` = `true`
   - `category_updated_at` = nuværende tidspunkt
4. Opdateringen verificeres med retry-logik

### Når Pull-to-Refresh Synkronisering Kører:

1. Edge Function'en henter alle events fra den eksterne kalender
2. For hver event:
   - Hvis aktiviteten IKKE eksisterer: Opret ny med auto-detekteret kategori
   - Hvis aktiviteten eksisterer OG `manually_set_category = false`: Opdater titel, dato, tid, lokation (IKKE kategori)
   - Hvis aktiviteten eksisterer OG `manually_set_category = true`: **SPRING HELE OPDATERINGEN OVER**
3. Aktiviteter med `manually_set_category = true` bliver ALDRIG rørt af synkroniseringen

## Fordele Ved Denne Løsning

1. **Komplet Beskyttelse**: Aktiviteter med manuelt satte kategorier bliver slet ikke opdateret
2. **Performance**: Færre database-opdateringer da vi springer aktiviteter over
3. **Logging**: Detaljeret logging viser præcis hvad der sker med hver aktivitet
4. **Verificerbar**: Man kan se i logs om aktiviteter bliver sprunget over

## Test Procedure

For at verificere at løsningen virker:

1. **Sæt en kategori manuelt på en ekstern aktivitet**
   - Åbn en ekstern aktivitet
   - Skift kategorien til f.eks. "Kamp"
   - Verificer i logs at `manually_set_category = true` bliver sat

2. **Vent 3-5 minutter**
   - Giv databasen tid til at propagere ændringen

3. **Udfør pull-to-refresh**
   - Træk ned for at synkronisere
   - Check Edge Function logs (i Supabase Dashboard)
   - Du skulle se: `🛡️ SKIPPING ENTIRE UPDATE - User has manually set category`

4. **Verificer kategorien er bevaret**
   - Kategorien skulle stadig være "Kamp"
   - Den skulle IKKE være ændret til "Ukendt"

## Database Struktur

Relevante kolonner i `activities` tabellen:

```sql
- category_id (uuid): Reference til activity_categories
- manually_set_category (boolean): Flag der indikerer om brugeren har sat kategorien manuelt
- category_updated_at (timestamp): Tidspunkt for sidste kategori-ændring
```

## Edge Function Version

Den opdaterede Edge Function er deployed som version 16:
- Function ID: `d04420bd-6fa7-4d88-8904-683162f52b63`
- Version: 16
- Status: ACTIVE
- Deployed: 2025-01-10

## Konklusion

Problemet var at Edge Function'en opdaterede ALLE eksisterende aktiviteter uden at checke `manually_set_category` flaget. 

Løsningen er at:
1. Hente `manually_set_category` flaget fra databasen
2. Springe HELE opdateringen over for aktiviteter hvor flaget er `true`
3. Kun opdatere aktiviteter hvor flaget er `false` eller `null`

Dette sikrer at manuelt satte kategorier ALDRIG bliver overskrevet af synkroniseringen.
