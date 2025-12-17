
# Update 478 - Diagnostic Guide

## Hvad er Update 478?

Baseret på kodebasen ser det ud til, at "Update 478" refererer til følgende funktionaliteter:

1. **Abonnementsstatus visning** - Viser brugerens aktuelle abonnement på profil-siden
2. **Opgaveskabelon filtrering** - Filtrerer opgaveskabeloner baseret på valgt spiller/team kontekst
3. **Spiller søgning og tilføjelse** - Mulighed for at søge efter eksisterende brugere og tilføje dem som spillere
4. **Kontekst-baseret data filtrering** - Filtrerer aktiviteter, kategorier og kalendere baseret på valgt kontekst

## Verifikation af Implementation

### 1. Abonnementsstatus (SubscriptionContext + SubscriptionManager)

**Implementeret i:**
- `contexts/SubscriptionContext.tsx` - Henter og håndterer abonnementsstatus
- `components/SubscriptionManager.web.tsx` - Viser abonnementsinformation
- `supabase/functions/get-subscription-status/index.ts` - Edge Function der henter data

**Sådan verificerer du:**
1. Log ind som admin/træner
2. Gå til Profil-siden
3. Du skulle se en orange boks med dit aktuelle abonnement
4. Boksen viser:
   - Plan navn (f.eks. "Spiller Plan", "Bronze", "Silver", "Gold")
   - Status (Prøveperiode eller Aktiv)
   - Antal spillere (nuværende/maksimum)
   - Udløbsdato

**Debugging:**
- Åbn browser console (F12)
- Søg efter log-beskeder der starter med `[SubscriptionContext]` eller `[SubscriptionManager.web]`
- Du skulle se detaljerede logs om abonnementsstatus

### 2. Opgaveskabelon Filtrering (useFootballData)

**Implementeret i:**
- `hooks/useFootballData.ts` - Filtrerer opgaveskabeloner baseret på valgt kontekst
- `contexts/TeamPlayerContext.tsx` - Håndterer valgt spiller/team kontekst

**Sådan verificerer du:**
1. Log ind som træner
2. Gå til Opgaver-siden
3. Vælg en spiller i "Administrer for:" dropdown
4. Du skulle kun se opgaveskabeloner for den valgte spiller
5. Skift til en anden spiller - opgaveskabelonerne skulle opdateres

**Debugging:**
- Åbn browser console
- Søg efter log-beskeder: `Loading task templates ONLY for selected player:`
- Verificer at `player_id` matcher den valgte spiller

### 3. Spiller Søgning og Tilføjelse (CreatePlayerModal)

**Implementeret i:**
- `components/CreatePlayerModal.tsx` - UI for at søge og tilføje spillere
- `supabase/functions/create-player/index.ts` - Edge Function der håndterer søgning og tilføjelse

**Sådan verificerer du:**
1. Log ind som admin/træner
2. Gå til Træner-siden
3. Klik på "Tilføj Spiller" knappen
4. Indtast en email-adresse og klik "Søg"
5. Hvis brugeren findes, skulle du se deres information
6. Klik "Tilføj spiller" for at tilføje dem

**Debugging:**
- Åbn browser console
- Søg efter log-beskeder: `Searching for user with email:` og `Adding player:`
- Verificer at Edge Function returnerer korrekt data

### 4. Kontekst-baseret Data Filtrering (useFootballData)

**Implementeret i:**
- `hooks/useFootballData.ts` - Filtrerer alle data baseret på valgt kontekst
- Filtrerer: Aktiviteter, Kategorier, Opgaveskabeloner, Eksterne Kalendere

**Sådan verificerer du:**
1. Log ind som træner
2. Vælg en spiller i "Administrer for:" dropdown
3. Gå til Hjem-siden - du skulle kun se aktiviteter for den valgte spiller
4. Gå til Opgaver-siden - du skulle kun se opgaveskabeloner for den valgte spiller
5. Gå til Admin-siden - du skulle kun se kategorier og kalendere for den valgte spiller

**Debugging:**
- Åbn browser console
- Søg efter log-beskeder:
  - `Loading activities ONLY for selected player:`
  - `Loading categories ONLY for selected player:`
  - `Loading task templates ONLY for selected player:`
  - `Loading calendars ONLY for selected player:`

## Almindelige Problemer og Løsninger

### Problem 1: Abonnementsstatus vises ikke

**Mulige årsager:**
1. Edge Function fejler
2. Ingen abonnement i databasen
3. RLS policies blokerer adgang

**Løsning:**
1. Tjek browser console for fejl
2. Verificer at brugeren har et abonnement i `subscriptions` tabellen
3. Kør SQL query: `SELECT * FROM subscriptions WHERE admin_id = 'USER_ID';`

### Problem 2: Opgaveskabeloner filtreres ikke korrekt

**Mulige årsager:**
1. `player_id` eller `team_id` er ikke sat korrekt på opgaveskabeloner
2. Valgt kontekst er ikke korrekt
3. RLS policies blokerer adgang

**Løsning:**
1. Tjek browser console for log-beskeder om filtrering
2. Verificer at opgaveskabeloner har korrekt `player_id` eller `team_id`
3. Kør SQL query: `SELECT * FROM task_templates WHERE player_id = 'PLAYER_ID';`

### Problem 3: Kan ikke tilføje spillere

**Mulige årsager:**
1. Edge Function fejler
2. Bruger er ikke admin
3. Spiller findes ikke i systemet
4. Spiller er allerede tilføjet

**Løsning:**
1. Tjek browser console for fejl fra Edge Function
2. Verificer at brugeren har `admin` rolle i `user_roles` tabellen
3. Verificer at spilleren har oprettet en konto i appen
4. Tjek om relationen allerede eksisterer: `SELECT * FROM admin_player_relationships WHERE admin_id = 'ADMIN_ID' AND player_id = 'PLAYER_ID';`

### Problem 4: Data filtreres ikke baseret på valgt kontekst

**Mulige årsager:**
1. `selectedContext` er ikke sat korrekt
2. Data har ikke korrekt `player_id` eller `team_id`
3. RLS policies blokerer adgang

**Løsning:**
1. Tjek browser console for log-beskeder om valgt kontekst
2. Verificer at data har korrekt `player_id` eller `team_id`
3. Tjek RLS policies for de relevante tabeller

## Test Scenarie

For at verificere at alt fungerer korrekt, følg disse trin:

### Som Admin/Træner:

1. **Opret et abonnement:**
   - Gå til Profil-siden
   - Vælg en plan og start prøveperiode
   - Verificer at abonnementsstatus vises korrekt

2. **Tilføj en spiller:**
   - Gå til Træner-siden
   - Klik "Tilføj Spiller"
   - Søg efter en eksisterende bruger
   - Tilføj spilleren

3. **Vælg spilleren i kontekst:**
   - Vælg spilleren i "Administrer for:" dropdown
   - Verificer at kun spillerens data vises

4. **Opret data for spilleren:**
   - Opret en kategori
   - Opret en opgaveskabelon
   - Opret en aktivitet
   - Verificer at alt er knyttet til spilleren

5. **Skift kontekst:**
   - Vælg en anden spiller eller "Mig selv"
   - Verificer at data opdateres korrekt

### Som Spiller:

1. **Log ind som spiller:**
   - Du skulle kun se dine egne data
   - Du skulle også se data som din træner har oprettet for dig

2. **Verificer data:**
   - Gå til Hjem-siden - se dine aktiviteter
   - Gå til Opgaver-siden - se dine opgaveskabeloner
   - Verificer at du ikke kan se andre spilleres data

## Konklusion

Baseret på kodegennemgangen er **Update 478 fuldt implementeret** med:

✅ Abonnementsstatus visning
✅ Opgaveskabelon filtrering
✅ Spiller søgning og tilføjelse
✅ Kontekst-baseret data filtrering

Hvis du oplever problemer, følg debugging-guiden ovenfor og tjek browser console for detaljerede log-beskeder.

## Næste Skridt

Hvis problemet fortsætter:

1. **Tjek browser console** - Alle komponenter logger detaljeret information
2. **Verificer database** - Tjek at data er korrekt i databasen
3. **Test Edge Functions** - Kald Edge Functions direkte for at verificere at de virker
4. **Tjek RLS policies** - Verificer at RLS policies tillader adgang til data

Hvis du stadig har problemer, giv venligst:
- Specifikke fejlbeskeder fra browser console
- Hvilken platform (web/iOS/Android)
- Hvilken brugerrolle (admin/træner/spiller)
- Hvilke specifikke funktioner der ikke virker
