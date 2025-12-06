
# Automatisk Kalender Synkronisering med Intelligent Kategori-tildeling

## 🎉 Nye Funktioner

Din app kan nu automatisk importere og opdatere aktiviteter fra eksterne kalendere med intelligent kategori-tildeling!

## ✨ Hvad er Nyt?

### 1. **Intelligent Kategori-tildeling**

Når aktiviteter importeres fra dine eksterne kalendere, læser systemet automatisk kategori-information fra kalenderbegivenhederne og tildeler den rigtige kategori:

- **Eksakt Match**: Hvis en kalender-kategori matcher en af dine eksisterende kategorier (f.eks. "Træning"), bruges denne automatisk
- **Delvis Match**: Systemet er smart nok til at finde lignende kategorier (f.eks. "Training" matcher "Træning")
- **Automatisk Oprettelse**: Hvis ingen match findes, oprettes en ny kategori automatisk med:
  - Navn fra kalender-kategorien
  - Automatisk genereret farve
  - Intelligent emoji-valg (⚽ for træning, 🏆 for kamp, osv.)

### 2. **Kategori-mappings**

Systemet husker hvordan eksterne kategorier skal mappes:

- Første gang en kategori importeres, gemmes tildelingen
- Fremtidige importer bruger den gemte tildeling
- Du kan se alle kategori-tildelinger i UI'et
- Mappings er personlige og sikre

### 3. **Auto-synkronisering**

Hver kalender kan konfigureres til automatisk synkronisering:

- **Auto-sync Toggle**: Slå auto-sync til/fra per kalender
- **Sync Interval**: Standard hver time (kan tilpasses)
- **Manuel Sync**: "Auto-synkroniser alle" knap synkroniserer alle kalendere med ét klik
- **Individuel Sync**: Hver kalender kan også synkroniseres individuelt

## 🚀 Sådan Bruger Du Det

### Tilføj en Ekstern Kalender

1. Gå til **Admin** siden
2. Find sektionen **Eksterne Kalendere**
3. Klik på **"Tilføj ekstern kalender"**
4. Indtast:
   - **Navn**: F.eks. "Træningskalender"
   - **iCal URL**: Din kalenders webcal:// eller https:// URL
5. Klik **"Tilføj"**

### Første Synkronisering

1. Klik på **"Synkroniser"** knappen for din nye kalender
2. Systemet henter alle begivenheder fra kalenderen
3. For hver begivenhed:
   - Læser kategori-information
   - Finder eller opretter den rigtige kategori
   - Importerer aktiviteten med korrekt kategori
4. Du får besked om hvor mange aktiviteter der blev importeret

### Se Kategori-tildelinger

1. Klik på **"Kategori-tildelinger"** for at se hvordan eksterne kategorier mappes
2. Du ser en liste som:
   ```
   Training → ⚽ Træning
   Match → 🏆 Kamp
   Meeting → 📋 Møde
   ```
3. Disse mappings genbruges automatisk ved fremtidige synkroniseringer

### Auto-synkronisering

- **Auto-synkroniser alle**: Klik på denne knap for at synkronisere alle dine kalendere på én gang
- **Auto-sync per kalender**: Brug toggle-knappen for at aktivere/deaktivere auto-sync for hver kalender
- **Automatisk opdatering**: Kalendere med auto-sync aktiveret opdateres automatisk hver time

## 📋 Eksempler på Kategori-mapping

### Eksempel 1: Eksakt Match
```
Kalender-kategori: "Træning"
Din eksisterende kategori: "Træning"
→ Bruger din eksisterende "Træning" kategori
```

### Eksempel 2: Delvis Match
```
Kalender-kategori: "Training"
Din eksisterende kategori: "Træning"
→ Finder match og bruger "Træning" kategorien
```

### Eksempel 3: Ny Kategori
```
Kalender-kategori: "Fysioterapi"
Ingen match fundet
→ Opretter ny kategori "Fysioterapi" med 🏥 emoji
```

## 🎨 Automatisk Emoji-valg

Systemet vælger intelligent emojis baseret på kategori-navne:

- **Træning/Training** → ⚽
- **Kamp/Match/Game** → 🏆
- **Møde/Meeting** → 📋
- **Event/Begivenhed** → 📅
- **Standard** → 📌

## 🔄 Hvordan Virker Auto-sync?

1. **Interval Check**: Systemet tjekker hver time om kalendere skal synkroniseres
2. **Smart Synkronisering**: Kun kalendere der ikke er blevet synkroniseret inden for deres interval opdateres
3. **Batch Processing**: Alle kalendere synkroniseres effektivt i én operation
4. **Fejlhåndtering**: Hvis én kalender fejler, fortsætter de andre

## 💡 Tips og Tricks

### Find din iCal URL

**Google Calendar:**
1. Åbn Google Calendar på computer
2. Klik på de tre prikker ved din kalender
3. Vælg "Indstillinger og deling"
4. Scroll ned til "Hemmelig adresse i iCal-format"
5. Kopier URL'en

**Apple Calendar:**
1. Åbn Calendar app på Mac
2. Højreklik på kalenderen
3. Vælg "Deling" → "Offentlig kalender"
4. Kopier webcal:// URL'en

**Outlook:**
1. Åbn Outlook Calendar
2. Højreklik på kalenderen
3. Vælg "Publicer" → "Publicer til WebDAV-server"
4. Kopier ICS URL'en

### Optimér Kategori-mappings

- **Konsistente Navne**: Brug samme kategori-navne i din eksterne kalender for bedre matching
- **Dansk vs. Engelsk**: Systemet håndterer både danske og engelske navne
- **Gennemse Mappings**: Tjek kategori-tildelinger regelmæssigt for at sikre korrekt mapping

### Fejlfinding

**Aktiviteter importeres ikke:**
- Tjek at iCal URL'en er korrekt
- Verificer at kalenderen er offentlig tilgængelig
- Se Edge Function logs i Supabase dashboard

**Forkerte kategorier:**
- Tjek kategori-mappings i UI'et
- Slet og genimporter kalenderen hvis nødvendigt
- Opret kategorier med samme navn som i din eksterne kalender før import

**Tider er forkerte:**
- Systemet konverterer automatisk til København timezone
- Tjek at din eksterne kalender har korrekt timezone information

## 🔒 Sikkerhed

- Alle data er beskyttet med Row Level Security (RLS)
- Du kan kun se og redigere dine egne kalendere
- Kategori-mappings er personlige og private
- Edge Functions verificerer din identitet før hver operation

## 📊 Database Struktur

### Nye Felter i `activities` tabellen:
- `external_category`: Gemmer den originale kategori fra kalenderen

### Nye Felter i `external_calendars` tabellen:
- `auto_sync_enabled`: Om auto-sync er aktiveret
- `sync_interval_minutes`: Hvor ofte kalenderen skal synkroniseres

### Ny Tabel: `category_mappings`
Gemmer hvordan eksterne kategorier mappes til dine interne kategorier

## 🎯 Fremtidige Forbedringer

Potentielle forbedringer vi kan tilføje senere:

- **Background Sync**: Automatisk synkronisering i baggrunden (kræver ekstra dependencies)
- **Push Notifikationer**: Få besked når nye aktiviteter importeres
- **Manuel Mapping**: Mulighed for at redigere kategori-mappings manuelt
- **Konflikt-håndtering**: Håndter når eksterne aktiviteter ændres
- **To-vejs Sync**: Synkroniser ændringer tilbage til eksterne kalendere

## 📞 Support

Hvis du oplever problemer:

1. Tjek Edge Function logs i Supabase dashboard
2. Verificer at din iCal URL er korrekt og tilgængelig
3. Se kategori-mappings for at forstå hvordan kategorier tildeles
4. Prøv at slette og genimportere kalenderen

## 🎊 Konklusion

Med denne nye funktion kan du:

✅ Automatisk importere aktiviteter fra eksterne kalendere
✅ Få intelligent kategori-tildeling baseret på kalender-kategorier
✅ Spare tid med auto-synkronisering
✅ Holde dine aktiviteter opdaterede uden manuel indsats
✅ Se klart hvordan kategorier mappes

Nyd din nye automatiske kalender-synkronisering! ⚽🏆📅
