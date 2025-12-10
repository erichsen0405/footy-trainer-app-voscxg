
# Test Guide - Kategori Persistens Fix

## Formål
Denne guide hjælper dig med at teste at kategorier nu forbliver de samme efter pull-to-refresh.

## Forudsætninger
- Du skal have en ekstern kalender tilsluttet
- Du skal have mindst én ekstern aktivitet synlig i appen

## Test Scenarie 1: Ændre Kategori på Ekstern Aktivitet

### Trin 1: Find en Ekstern Aktivitet
1. Åbn appen på din iPhone
2. Gå til "Aktiviteter" siden (side 4)
3. Find en ekstern aktivitet (f.eks. "Træning")
4. Noter den nuværende kategori

### Trin 2: Skift Kategorien
1. Tryk på aktiviteten for at åbne detaljer
2. Tryk på "Rediger" knappen
3. Vælg en ANDEN kategori (f.eks. skift fra "Ukendt" til "Træning")
4. Gem ændringerne
5. **VIGTIGT**: Vent 5 sekunder for at sikre at opdateringen er gemt

### Trin 3: Verificer i Appen
1. Gå tilbage til aktivitetslisten
2. Verificer at kategorien er ændret korrekt
3. Noter den nye kategori

### Trin 4: Pull-to-Refresh
1. Træk ned fra toppen af skærmen for at refreshe
2. Vent på at refresh er færdig (spinner forsvinder)
3. **FORVENTET RESULTAT**: Kategorien skal STADIG være den samme som du satte i Trin 2

### Trin 5: Verificer Persistens
1. Luk appen helt (swipe op fra bunden og swipe appen væk)
2. Åbn appen igen
3. Gå til aktiviteten
4. **FORVENTET RESULTAT**: Kategorien skal STADIG være den samme

## Test Scenarie 2: Ny Ekstern Aktivitet

### Trin 1: Tilføj Ny Aktivitet i Ekstern Kalender
1. Gå til din eksterne kalender (f.eks. Google Calendar)
2. Tilføj en ny aktivitet med titlen "Test Aktivitet"
3. Gem aktiviteten

### Trin 2: Sync i Appen
1. Åbn appen på din iPhone
2. Gå til "Aktiviteter" siden
3. Træk ned for at refreshe
4. **FORVENTET RESULTAT**: Den nye aktivitet vises med en auto-detekteret kategori eller "Ukendt"

### Trin 3: Skift Kategorien
1. Tryk på den nye aktivitet
2. Tryk på "Rediger"
3. Vælg en kategori (f.eks. "Møde")
4. Gem ændringerne
5. Vent 5 sekunder

### Trin 4: Verificer Persistens
1. Træk ned for at refreshe
2. **FORVENTET RESULTAT**: Kategorien skal STADIG være "Møde"

## Test Scenarie 3: Auto-Detektering

### Trin 1: Tilføj Aktivitet med Nøgleord
1. Gå til din eksterne kalender
2. Tilføj en ny aktivitet med titlen "Fodbold Træning"
3. Gem aktiviteten

### Trin 2: Sync i Appen
1. Åbn appen
2. Træk ned for at refreshe
3. **FORVENTET RESULTAT**: Aktiviteten vises med kategorien "Træning" (auto-detekteret)

### Trin 3: Verificer at Auto-Detektering Kan Overskrives
1. Tryk på aktiviteten
2. Tryk på "Rediger"
3. Skift kategorien til "Kamp"
4. Gem ændringerne
5. Vent 5 sekunder
6. Træk ned for at refreshe
7. **FORVENTET RESULTAT**: Kategorien skal STADIG være "Kamp" (ikke tilbage til "Træning")

## Fejlfinding

### Hvis Kategorien Stadig Ændres Tilbage:

1. **Check Console Logs**:
   - Åbn Xcode
   - Kør appen fra Xcode
   - Se efter fejl i console når du ændrer kategori
   - Se efter fejl i console når du refresher

2. **Check Database**:
   ```sql
   -- Find aktiviteten i databasen
   SELECT 
     id,
     title,
     category_id,
     manually_set_category,
     category_updated_at
   FROM activities
   WHERE title = 'DIN_AKTIVITET_TITEL'
     AND is_external = true;
   ```
   - `manually_set_category` skal være `true` efter du har ændret kategorien
   - `category_updated_at` skal være opdateret til det tidspunkt du ændrede kategorien

3. **Check Edge Function Logs**:
   - Gå til Supabase Dashboard
   - Gå til "Edge Functions"
   - Klik på "sync-external-calendar"
   - Se logs for fejl

4. **Verificer RLS Policies**:
   ```sql
   -- Check RLS policies
   SELECT * FROM pg_policies WHERE tablename = 'activities';
   ```
   - Verificer at der er en policy der tillader UPDATE for brugeren

## Forventede Resultater

✅ **Korrekt Adfærd**:
- Når du ændrer en kategori manuelt, forbliver den den samme efter refresh
- Når du ændrer en kategori manuelt, forbliver den den samme efter app genstart
- Nye eksterne aktiviteter får auto-detekteret kategori eller "Ukendt"
- Auto-detekterede kategorier kan overskrives manuelt

❌ **Forkert Adfærd**:
- Kategorien ændres tilbage til "Ukendt" efter refresh
- Kategorien ændres tilbage til auto-detekteret værdi efter refresh
- Kategorien ændres ikke når du gemmer ændringer

## Support

Hvis problemet stadig opstår efter at have fulgt denne guide:
1. Tag screenshots af console logs
2. Noter præcist hvilke trin der fejler
3. Check database state med SQL queries ovenfor
4. Kontakt support med alle detaljer
