
# Automatisk Kalender Synkronisering og Intelligent Kategori-tildeling

## Oversigt

Denne funktion gør det muligt for appen automatisk at importere og opdatere aktiviteter fra eksterne kalendere (iCal format) med intelligent kategori-tildeling baseret på kalenderaktiviteternes kategorier.

## Funktioner

### 1. Automatisk Kategori-tildeling

Når aktiviteter importeres fra eksterne kalendere, læser systemet kategori-information fra iCal-begivenhederne (CATEGORIES property) og tildeler automatisk den rigtige interne kategori:

- **Eksakt Match**: Hvis en ekstern kategori matcher en eksisterende intern kategori (case-insensitive), bruges denne
- **Delvis Match**: Hvis ingen eksakt match findes, søger systemet efter delvis match (f.eks. "Training" matcher "Træning")
- **Automatisk Oprettelse**: Hvis ingen match findes, oprettes en ny kategori automatisk med:
  - Navn fra den eksterne kategori
  - Automatisk genereret farve baseret på kategorinavnet
  - Intelligent emoji-valg baseret på almindelige kategorinavne (⚽ for træning, 🏆 for kamp, osv.)

### 2. Kategori-mappings

Systemet husker kategori-tildelinger i `category_mappings` tabellen:

- Første gang en ekstern kategori importeres, oprettes en mapping
- Fremtidige importer af samme eksterne kategori bruger den gemte mapping
- Brugere kan se alle kategori-mappings i UI'et
- Mappings er bruger-specifikke og sikret med RLS

### 3. Auto-synkronisering

Hver kalender kan konfigureres til automatisk synkronisering:

- **Auto-sync Toggle**: Aktiver/deaktiver auto-sync per kalender
- **Sync Interval**: Standard 60 minutter (kan tilpasses i databasen)
- **Manuel Sync**: "Auto-synkroniser alle" knap synkroniserer alle kalendere med ét klik
- **Individuel Sync**: Hver kalender kan synkroniseres individuelt

### 4. Edge Functions

#### `sync-external-calendar`
- Henter og parser iCal data
- Ekstraherer kategorier fra begivenheder
- Mapper eksterne kategorier til interne kategorier
- Opretter nye kategorier hvis nødvendigt
- Konverterer tidszoner til København tid
- Indsætter aktiviteter i databasen

#### `auto-sync-calendars`
- Finder alle kalendere der skal synkroniseres
- Tjekker sync interval for hver kalender
- Kalder `sync-external-calendar` for hver kalender
- Returnerer resultat med antal synkroniserede kalendere

## Database Struktur

### Nye Kolonner i `activities`
```sql
external_category TEXT -- Gemmer den originale kategori fra den eksterne kalender
```

### Nye Kolonner i `external_calendars`
```sql
auto_sync_enabled BOOLEAN DEFAULT true
sync_interval_minutes INTEGER DEFAULT 60
```

### Ny Tabel: `category_mappings`
```sql
CREATE TABLE category_mappings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  external_category TEXT NOT NULL,
  internal_category_id UUID REFERENCES activity_categories(id),
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, external_category)
);
```

## Bruger Interface

### ExternalCalendarManager Komponenten

Nye funktioner:
- **Auto-synkroniser alle** knap øverst
- **Kategori-tildelinger** sektion der viser alle mappings
- **Auto-synkronisering** toggle for hver kalender
- Forbedret feedback med antal synkroniserede aktiviteter

### Kategori-mappings Visning

Viser en liste over alle kategori-mappings:
```
Ekstern Kategori → Intern Kategori
Training → ⚽ Træning
Match → 🏆 Kamp
Meeting → 📋 Møde
```

## Sådan Bruges Det

### For Brugere

1. **Tilføj en ekstern kalender**:
   - Klik på "Tilføj ekstern kalender"
   - Indtast navn og iCal URL
   - Kalenderen oprettes med auto-sync aktiveret

2. **Første synkronisering**:
   - Klik på "Synkroniser" for at importere aktiviteter
   - Systemet læser kategorier fra kalenderbegivenheder
   - Kategorier tildeles automatisk eller oprettes

3. **Se kategori-mappings**:
   - Klik på "Kategori-tildelinger" for at se hvordan eksterne kategorier mappes
   - Mappings gemmes og genbruges ved fremtidige synkroniseringer

4. **Auto-synkronisering**:
   - Brug "Auto-synkroniser alle" for at synkronisere alle kalendere
   - Eller lad systemet synkronisere automatisk hver time
   - Toggle auto-sync per kalender efter behov

### For Udviklere

#### Kald Edge Functions

```typescript
// Manuel synkronisering af én kalender
const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
  body: { calendarId: 'uuid' }
});

// Auto-synkroniser alle kalendere
const { data, error } = await supabase.functions.invoke('auto-sync-calendars', {
  body: {}
});
```

#### Tjek om kalendere skal synkroniseres

```typescript
import { checkCalendarsNeedSync } from '@/utils/calendarAutoSync';

const needsSync = await checkCalendarsNeedSync();
if (needsSync) {
  // Trigger sync
}
```

## Kategori-mapping Logik

Systemet bruger følgende prioritering:

1. **Eksisterende Mapping**: Tjek om der allerede er en mapping for denne eksterne kategori
2. **Eksakt Match**: Søg efter intern kategori med samme navn (case-insensitive)
3. **Delvis Match**: Søg efter intern kategori der indeholder eller er indeholdt i det eksterne navn
4. **Opret Ny**: Opret en ny intern kategori med intelligent farve og emoji

### Emoji-mapping

```typescript
const emojiMap = {
  'træning': '⚽',
  'training': '⚽',
  'kamp': '🏆',
  'match': '🏆',
  'game': '🏆',
  'møde': '📋',
  'meeting': '📋',
  'event': '📅',
  'begivenhed': '📅',
  'default': '📌',
};
```

## Sikkerhed

- Alle tabeller er beskyttet med Row Level Security (RLS)
- Brugere kan kun se og redigere deres egne kalendere og mappings
- Edge Functions verificerer bruger-autentificering
- Service role key bruges kun i Edge Functions

## Performance

- Kategori-mappings caches i databasen for hurtig lookup
- Batch insert af aktiviteter for bedre performance
- Index på `category_mappings(user_id, external_category)` for hurtige søgninger

## Fremtidige Forbedringer

Potentielle forbedringer:
- Background sync med expo-background-fetch (kræver ekstra dependencies)
- Push notifikationer når nye aktiviteter importeres
- Mulighed for at redigere kategori-mappings manuelt
- Konflikt-håndtering når eksterne aktiviteter ændres
- Synkronisering af ændringer tilbage til eksterne kalendere (hvis understøttet)

## Troubleshooting

### Kategorier oprettes ikke korrekt
- Tjek at iCal begivenheder har CATEGORIES property
- Se Edge Function logs for parsing fejl
- Verificer at kategori-mappings tabellen er tilgængelig

### Auto-sync virker ikke
- Tjek at `auto_sync_enabled` er true for kalenderen
- Verificer at `sync_interval_minutes` er sat korrekt
- Se Edge Function logs for fejl

### Aktiviteter importeres med forkert tid
- Systemet konverterer alle tider til København timezone
- Tjek at iCal begivenheder har korrekt timezone information
- Se Edge Function logs for timezone konvertering
