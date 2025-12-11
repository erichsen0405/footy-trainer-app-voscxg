
# Guide til Synkronisering med Ustabile UIDs

## Problemet

DBU's iCal-feed genererer **ustabile UIDs** - den samme begivenhed kan have forskellige UIDs på tværs af forskellige hentninger. Dette bryder den traditionelle synkroniseringslogik, der er afhængig af UIDs som stabile identifikatorer.

## Løsningen

Vi har implementeret en **multi-step matching proces**, der kan håndtere ustabile UIDs ved at bruge flere matchningsstrategier med fallback-logik.

## Sådan Virker Det

### 1. Trin: Match via Provider UID

Først forsøger systemet at finde begivenheden via dens UID i `external_event_mappings` tabellen.

```
Eksempel:
- Begivenhed har UID: "abc123"
- System finder mapping: abc123 → external_event_id: 42
- ✅ Match fundet!
```

### 2. Trin: Eksakt Match (Titel + Starttid)

Hvis UID ikke findes, forsøger systemet at matche på eksakt titel og starttid.

```
Eksempel:
- Begivenhed: "U15 Træning" kl. 10:00
- System finder eksisterende begivenhed med samme titel og tid
- ✅ Match fundet!
- System opretter ny mapping med den nye UID
```

### 3. Trin: Fuzzy Match (Token Overlap + Tidstolerance)

Hvis ingen eksakt match findes, bruger systemet fuzzy matching.

```
Eksempel:
- Ny begivenhed: "U15 - Træning i København" kl. 10:05
- Eksisterende: "U15 Træning København" kl. 10:00
- Token overlap: 100% (u15, træning, københavn)
- Tidsforskel: 5 minutter (inden for 15 min tolerance)
- ✅ Match fundet!
- System opretter ny mapping med den nye UID
```

## Database Struktur

### `external_events`
Gemmer den kanoniske eksterne begivenhedsdata.

**Vigtige felter:**
- `id`: Unik identifikator (auto-increment)
- `provider`: Kilde (f.eks. 'ics', 'google')
- `primary_provider_uid`: Nuværende/primære UID
- `dtstart_utc`: Starttid i UTC
- `summary`: Begivenhedstitel
- `location`: Begivenhedssted
- `first_seen`: Hvornår først importeret
- `last_seen`: Sidste sync hvor begivenheden var til stede

### `external_event_mappings`
Mapper flere provider UIDs til samme eksterne begivenhed.

**Vigtige felter:**
- `external_event_id`: Reference til external_events
- `provider`: Kilde
- `provider_uid`: Enhver UID der er set for denne begivenhed
- `mapped_at`: Hvornår mappingen blev oprettet

**Nøgleindsigt:** Når en begivenheds UID ændres, opretter vi en ny mapping-post i stedet for at miste forbindelsen til den eksisterende begivenhed.

### `local_event_meta`
Gemmer brugerspecifik metadata og overrides for eksterne begivenheder.

**Vigtige felter:**
- `external_event_id`: Reference til external_events
- `user_id`: Bruger-ID
- `category_id`: Kategori tildelt af bruger
- `overrides`: Bruger-overrides (titel, tid, osv.)

## Sådan Bruges Det

### 1. Tilføj Ekstern Kalender

Gå til "Aktiviteter" → "Eksterne Kalendere" → "Tilføj ekstern kalender"

```
Navn: DBU Træningskalender
URL: webcal://example.com/dbu-calendar.ics
```

### 2. Synkroniser Kalender

Klik på "Synkroniser" knappen for at hente begivenheder.

Systemet vil:
1. Hente iCal-feedet
2. Parse begivenheder
3. For hver begivenhed:
   - Forsøge at matche med eksisterende begivenheder
   - Opdatere eksisterende eller oprette nye
   - Oprette/opdatere mappings
   - Sikre at lokal metadata eksisterer

### 3. Auto-Synkronisering

Aktiver "Auto-synkronisering" for at synkronisere automatisk hver time.

## Fordele

✅ **Håndterer Ustabile UIDs:** Flere UIDs kan pege på samme begivenhed via mappings.

✅ **Robust Matching:** Tre-trins fallback sikrer høj match-rate.

✅ **Ingen Datatab:** Begivenheder duplikeres eller mistes aldrig på grund af UID-ændringer.

✅ **Bruger Metadata Bevares:** Lokale overrides og kategorier vedligeholdes på tværs af syncs.

✅ **Audit Trail:** Mappings-tabellen giver historik over alle UIDs set for hver begivenhed.

## Fejlfinding

### Problem: Duplikerede Begivenheder

**Årsag:** Fuzzy matching threshold er for lav.

**Løsning:** Juster token overlap threshold i `sync-external-calendar-v2` Edge Function:

```typescript
// Øg threshold fra 0.6 til 0.7 for strengere matching
if (tokenOverlap >= 0.7 && withinTimeTolerance) {
  // ...
}
```

### Problem: Manglende Matches

**Årsag:** Fuzzy matching threshold er for høj, eller tidstolerance er for lav.

**Løsning:** Juster parametre:

```typescript
// Sænk threshold fra 0.6 til 0.5 for mere fleksibel matching
if (tokenOverlap >= 0.5 && withinTimeTolerance) {
  // ...
}

// Øg tidstolerance fra 15 til 30 minutter
const withinTimeTolerance = isWithinTimeTolerance(dtstartUtc, candidate.dtstart_utc, 30);
```

### Problem: Langsom Synkronisering

**Årsag:** For mange kandidater i fuzzy matching.

**Løsning:** Reducer tidsvinduet:

```typescript
// Reducer fra ±1 time til ±30 minutter
const windowStart = new Date(startTime.getTime() - 30 * 60 * 1000);
const windowEnd = new Date(startTime.getTime() + 30 * 60 * 1000);
```

## Tekniske Detaljer

### Token Overlap Algoritme

```typescript
function tokenize(text: string): Set<string> {
  // 1. Konverter til lowercase
  // 2. Fjern specialtegn (behold æ, ø, å)
  // 3. Split på whitespace
  // 4. Filtrer tokens kortere end 3 tegn
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  // Jaccard similarity: |intersection| / |union|
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}
```

### Eksempel på Token Overlap

```
Tekst 1: "U15 Træning København"
Tokens 1: {u15, træning, københavn}

Tekst 2: "U15 - Træning i København"
Tokens 2: {u15, træning, københavn}

Intersection: {u15, træning, københavn} (3 tokens)
Union: {u15, træning, københavn} (3 tokens)

Overlap: 3/3 = 100%
```

## API Reference

### Edge Function: `match-external-event`

Matcher en ekstern begivenhed ved hjælp af den nye ustabile UID matching logik.

**Input:**
```json
{
  "event": {
    "provider": "ics",
    "provider_uid": "abc123",
    "dtstart_utc": "2024-01-15T10:00:00Z",
    "summary": "U15 Træning",
    "location": "Stadion"
  }
}
```

**Output:**
```json
{
  "success": true,
  "result": {
    "matched": true,
    "external_event_id": 42,
    "action": "updated",
    "match_method": "fuzzy"
  }
}
```

### Edge Function: `sync-external-calendar-v2`

Fuld synkroniseringsfunktion der bruger matching logikken til at synkronisere en hel kalender.

**Input:**
```json
{
  "calendarId": "uuid-of-calendar"
}
```

**Output:**
```json
{
  "success": true,
  "eventCount": 25,
  "eventsCreated": 5,
  "eventsUpdated": 20,
  "mappingsCreated": 5,
  "message": "Successfully synced 25 events using unstable UID matching."
}
```

## Support

Hvis du oplever problemer med synkroniseringen, kontakt support med følgende information:

1. Kalender navn og URL
2. Antal begivenheder i kalenderen
3. Beskrivelse af problemet
4. Screenshots af fejlmeddelelser

Vi vil hjælpe dig med at justere matching-parametrene for din specifikke kalender.
