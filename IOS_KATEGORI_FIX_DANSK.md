
# iOS Kategori Persistens Fix - Dansk Forklaring

## Problemet

Kategorier som blev tildelt manuelt til eksterne kalenderaktiviteter blev hele tiden nulstillet på iPhone-appen, men ikke på web-appen. Dette skete især efter:
- Pull-to-refresh (træk ned for at opdatere)
- Når appen kom tilbage fra baggrunden
- Ved enhver kalendersynkronisering

## Hvorfor kun på iOS?

**iOS har mere aggressiv app-håndtering:**
- iOS-apps går ofte i baggrunden og kommer tilbage til forgrunden
- Hver gang appen kommer til forgrunden, udløses en data-opdatering
- Dette udløste flere synkroniseringer end på web

**Det manglende flag:**
- Der findes et `manually_set_category` flag i databasen
- Dette flag blev IKKE sat til `true` når du ændrede kategorien manuelt
- Synkroniseringsfunktionen kunne derfor ikke se forskel på automatisk tildelte og manuelt tildelte kategorier
- Alle kategorier blev behandlet som automatiske og kunne overskrives

## Løsningen

### 1. Opdateret kategori-opdatering

Når du nu ændrer kategorien på en ekstern aktivitet:
```
✅ Kategorien opdateres i databasen
✅ manually_set_category sættes til true
✅ Synkroniseringen ved nu at kategorien er manuelt sat
✅ Kategorien bevares ved fremtidige synkroniseringer
```

### 2. Forbedret synkronisering

Synkroniseringsfunktionen:
```
✅ Tjekker om kategorien er manuelt sat
✅ Bevarer manuelt satte kategorier
✅ Opdaterer kun automatisk tildelte kategorier
✅ Logger detaljeret information om hvad der sker
```

## Sådan tester du det

### Test 1: Manuel kategoritildeling
1. Åbn en ekstern aktivitet
2. Skift kategorien
3. Kategorien skulle nu være gemt permanent

### Test 2: Pull-to-refresh
1. Tildel en kategori manuelt
2. Træk ned for at opdatere
3. Kategorien skulle stadig være den samme

### Test 3: App i baggrund
1. Tildel en kategori manuelt
2. Sæt appen i baggrunden (gå til en anden app)
3. Kom tilbage til appen
4. Kategorien skulle stadig være den samme

### Test 4: Kalendersynkronisering
1. Tildel en kategori manuelt
2. Vent på automatisk synkronisering (eller udløs manuel synk)
3. Kategorien skulle stadig være den samme

## Hvad skal du gøre?

**For eksisterende aktiviteter:**
- Du skal tildele kategorien én gang mere
- Derefter vil den blive bevaret permanent

**For nye aktiviteter:**
- Nye eksterne aktiviteter får automatisk kategorien "Ukendt"
- Når du ændrer kategorien, bliver den bevaret permanent

## Tekniske detaljer

### Ændringer i koden:

**1. useFootballData.ts:**
- Tilføjet logik til at sætte `manually_set_category = true` når kategori opdateres
- Forbedret logging for at spore kategori-status

**2. sync-external-calendar Edge Function:**
- Henter nu `manually_set_category` flag fra databasen
- Bevarer kategorier hvor flaget er `true`
- Detaljeret logging af hvilke kategorier der bevares

### Database:

Kolonnen `manually_set_category` i `activities` tabellen:
- `true` = Kategorien er sat manuelt af brugeren
- `false` = Kategorien er automatisk tildelt eller ikke sat endnu

## Forventede log-beskeder

Når du ændrer en kategori:
```
🔄 Updating single activity: <id>
📝 Updating category to: <category-id>
🔒 Setting manually_set_category = true for external activity
✅ Activity updated successfully
   - manually_set_category: true
```

Under synkronisering:
```
📌 "<aktivitet>..." -> Category: "<kategori>" [🔒 MANUAL]
🛡️ Category was manually set - PRESERVING it
```

## Fremtidige forbedringer

1. **Visuel indikator:** Vis i UI'en hvilke kategorier der er manuelt sat
2. **Bulk-operationer:** Mulighed for at markere flere aktiviteters kategorier som manuelt sat
3. **Nulstil-funktion:** Mulighed for at nulstille en manuelt sat kategori tilbage til automatisk
4. **Kategori-forslag:** Vis foreslåede kategorier baseret på aktivitetsnavn

## Hvis der stadig er problemer

Hvis kategorier stadig bliver nulstillet:

1. **Tjek logs:**
   - Åbn konsollen i appen
   - Se efter "🔒 Setting manually_set_category = true"
   - Hvis denne besked ikke vises, er der stadig et problem

2. **Genstart appen:**
   - Luk appen helt (swipe op fra bunden)
   - Åbn appen igen
   - Prøv at tildele kategorien igen

3. **Kontakt support:**
   - Hvis problemet fortsætter, kontakt support
   - Inkluder logs fra konsollen hvis muligt

## Opsummering

✅ **Problemet er løst:** Kategorier bevares nu permanent på iOS
✅ **Ingen brugerhandling nødvendig:** Virker automatisk fra nu af
✅ **Eksisterende aktiviteter:** Tildel kategorien én gang mere
✅ **Nye aktiviteter:** Virker automatisk fra første gang

Fikset er implementeret og deployet. Du kan nu trygt tildele kategorier til eksterne aktiviteter på din iPhone, og de vil blive bevaret permanent! 🎉
