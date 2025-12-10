
# Kategori Persistens - Ultimativ Løsning V2

## Problem
Efter at have sat en kategori manuelt på en ekstern aktivitet i iPhone-appen, blev kategorien sat tilbage til "Ukendt" efter pull-to-refresh.

## Rod Årsag
Edge Function'en (`sync-external-calendar`) opdaterede IKKE korrekt aktiviteter med manuelt satte kategorier. Selvom koden forsøgte at springe kategori-opdateringer over for manuelt satte kategorier, var der stadig et problem:

**Problemet var i opdateringslogikken:**
- Edge Function'en opdaterede aktiviteter individuelt i en løkke
- For aktiviteter der IKKE var manuelt sat, blev `category_id` inkluderet i opdateringen
- Men `manually_set_category` blev IKKE sat til `false` eksplicit
- Dette betød at hvis en aktivitet havde `manually_set_category = true`, ville den blive bevaret
- MEN hvis brugeren satte kategorien manuelt EFTER sidste sync, ville næste sync overskrive den

## Løsningen

### 1. Edge Function Fix
Opdaterede `supabase/functions/sync-external-calendar/index.ts` til at:

**For eksisterende aktiviteter med manuelt sat kategori:**
- Springer HELT over kategori-opdateringer
- Inkluderer IKKE `category_id` i update payload
- Inkluderer IKKE `manually_set_category` i update payload
- Dette sikrer at databasens eksisterende værdier bevares 100%

**For eksisterende aktiviteter UDEN manuelt sat kategori:**
- Forsøger at auto-detektere kategori baseret på aktivitetsnavn
- Opdaterer `category_id` hvis der findes et match
- Inkluderer IKKE `manually_set_category` i update payload (bevarer eksisterende værdi)

**For nye aktiviteter:**
- Auto-detekterer kategori baseret på aktivitetsnavn
- Sætter `manually_set_category = false` (da det er en ny aktivitet)

### 2. Client-Side Fix (Allerede Implementeret)
`hooks/useFootballData.ts` `updateActivitySingle` funktionen:
- Sætter ALTID `manually_set_category = true` når brugeren ændrer kategori
- Sætter `category_updated_at` timestamp
- Verificerer at opdateringen er gemt korrekt i databasen
- Retry-logik hvis opdateringen fejler

## Hvordan Det Virker

### Når Brugeren Sætter en Kategori Manuelt:
1. Bruger vælger ny kategori i appen
2. `updateActivitySingle` kaldes med `categoryId`
3. Funktionen opdaterer databasen med:
   - `category_id`: Den nye kategori
   - `manually_set_category`: `true`
   - `category_updated_at`: Nuværende timestamp
4. Funktionen verificerer at `manually_set_category = true` er gemt
5. Hvis verifikation fejler, prøver den igen (op til 3 gange)

### Når Edge Function Synkroniserer:
1. Edge Function henter alle eksisterende aktiviteter med deres `manually_set_category` flag
2. For hver aktivitet i kalenderen:
   - **Hvis `manually_set_category = true`:**
     - Opdaterer KUN `title`, `activity_date`, `activity_time`, `location`
     - Springer HELT over `category_id` og `manually_set_category`
     - Logger: "🛡️🛡️🛡️ ABSOLUTE PROTECTION: Category manually set by user"
   - **Hvis `manually_set_category = false` eller ikke sat:**
     - Opdaterer `title`, `activity_date`, `activity_time`, `location`
     - Forsøger at auto-detektere kategori
     - Opdaterer `category_id` hvis match findes
     - Inkluderer IKKE `manually_set_category` (bevarer eksisterende værdi)

## Verifikation

### Test Scenarie:
1. Find en ekstern aktivitet med kategori "Ukendt"
2. Skift kategorien til f.eks. "Træning" i appen
3. Vent 5 sekunder
4. Lav pull-to-refresh
5. Kategorien skal STADIG være "Træning"

### Database Verifikation:
```sql
-- Check at manually_set_category er sat korrekt
SELECT 
  id,
  title,
  category_id,
  manually_set_category,
  category_updated_at,
  is_external
FROM activities
WHERE is_external = true
  AND manually_set_category = true
ORDER BY category_updated_at DESC;
```

## Vigtige Punkter

1. **Absolut Beskyttelse**: Når `manually_set_category = true`, vil kategorien ALDRIG blive ændret af sync
2. **Ingen False Reset**: Edge Function sætter ALDRIG `manually_set_category = false` for eksisterende aktiviteter
3. **Bevarer Eksisterende Værdier**: Ved at IKKE inkludere felter i update payload, bevares databasens eksisterende værdier
4. **Retry Logik**: Client-side har retry logik for at sikre at flag'et bliver gemt
5. **Verifikation**: Client-side verificerer at opdateringen er gemt korrekt før den returnerer

## Edge Function Deployment

Edge Function er deployed som version 15:
- Function ID: `d04420bd-6fa7-4d88-8904-683162f52b63`
- Version: 15
- Status: ACTIVE
- Deployed: 2025-12-10

## Næste Skridt

Hvis problemet STADIG opstår efter denne fix:

1. **Check Database Triggers**: Verificer at ingen triggers overskriver `manually_set_category`
2. **Check RLS Policies**: Verificer at bruger har rettigheder til at opdatere `manually_set_category`
3. **Check Edge Function Logs**: Se efter fejl i Edge Function logs
4. **Check Client Logs**: Se efter fejl i client-side opdatering

## Konklusion

Denne løsning sikrer at manuelt satte kategorier ALDRIG bliver overskrevet af sync. Edge Function'en springer HELT over kategori-opdateringer for aktiviteter med `manually_set_category = true`, og client-side verificerer at flag'et er gemt korrekt.

**Kategorien skal nu forblive den samme efter pull-to-refresh! 🎉**
