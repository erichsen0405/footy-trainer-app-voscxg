
# Kategori-bevarelse ved kalendersynkronisering

## Opdatering gennemført

Kalendersystemet er nu opdateret til at bevare manuelt tildelte kategorier ved efterfølgende synkroniseringer.

## Hvordan det virker

### Før opdateringen
- Alle eksterne aktiviteter blev slettet og genoprettet ved hver synkronisering
- Manuelt tildelte kategorier blev overskrevet og sat tilbage til "Ukendt"

### Efter opdateringen
- Systemet tjekker om en aktivitet allerede eksisterer (via `external_event_id`)
- Hvis aktiviteten har en manuelt tildelt kategori (ikke "Ukendt"), bevares denne kategori
- Kun nye aktiviteter eller aktiviteter med "Ukendt" får automatisk tildelt kategorier

## Kategori-tildeling prioritering

1. **Bevarede kategorier** (højeste prioritet)
   - Aktiviteter med manuelt tildelte kategorier (ikke "Ukendt")
   - Disse kategorier ændres ALDRIG ved synkronisering

2. **Eksplicitte kalenderkategorier**
   - Kategorier fra den eksterne kalender
   - Mappes til eksisterende kategorier i systemet

3. **Navne-parsing**
   - Intelligent matching baseret på aktivitetens navn
   - Bruger nøgleord til at finde den bedste kategori

4. **"Ukendt"** (laveste prioritet)
   - Tildeles kun hvis ingen match findes
   - Kan senere ændres manuelt

## Synkroniseringsstatistik

Efter hver synkronisering vises:
- ✨ Antal nye aktiviteter oprettet
- 🔄 Antal aktiviteter opdateret
- 🗑️ Antal aktiviteter slettet (ikke længere i kalenderen)
- 📊 Kategori-tildeling:
  - Manuelt tildelte kategorier bevaret
  - Via navne-parsing
  - Via eksplicitte kategorier
  - Tildelt "Ukendt"

## Workflow

1. **Første synkronisering**
   - Alle aktiviteter importeres
   - Kategorier tildeles automatisk baseret på navne og nøgleord
   - Aktiviteter uden match får "Ukendt"

2. **Manuel kategori-tildeling**
   - Gå ind på en aktivitet
   - Vælg den korrekte kategori
   - Gem ændringen

3. **Efterfølgende synkroniseringer**
   - Systemet opdaterer aktivitetens dato, tid, titel, etc.
   - Den manuelt tildelte kategori bevares
   - Nye aktiviteter får automatisk tildelt kategorier

## Tekniske detaljer

### Edge Function ændringer
- Henter eksisterende aktiviteter før synkronisering
- Opretter et map af aktiviteter baseret på `external_event_id`
- Tjekker om kategori er "Ukendt" før automatisk tildeling
- Opdaterer eksisterende aktiviteter i stedet for at slette og genoprette

### Database operationer
- **Før**: DELETE alle → INSERT alle
- **Efter**: SELECT eksisterende → UPDATE eksisterende + INSERT nye + DELETE fjernede

### Ydeevne
- Mere effektiv da kun ændrede aktiviteter opdateres
- Bevarer relationer til opgaver og andre data
- Reducerer unødvendige database operationer

## Eksempel

### Scenario
1. Du importerer en kalender med aktiviteten "Fodboldtræning"
2. Systemet tildeler automatisk kategorien "Træning"
3. Du ændrer manuelt kategorien til "Fysisk træning"
4. Næste synkronisering opdaterer aktiviteten
5. Din manuelle kategori "Fysisk træning" bevares ✅

### Tidligere adfærd
1. Du importerer en kalender med aktiviteten "Fodboldtræning"
2. Systemet tildeler automatisk kategorien "Træning"
3. Du ændrer manuelt kategorien til "Fysisk træning"
4. Næste synkronisering sletter og genopretter aktiviteten
5. Kategorien sættes tilbage til "Træning" ❌

## Deployment

- **Edge Function**: `sync-external-calendar` (version 5)
- **Deployment dato**: 2025-01-26
- **Status**: ✅ Aktiv

## Test

For at teste funktionaliteten:
1. Synkroniser en ekstern kalender
2. Vælg en aktivitet og ændr kategorien manuelt
3. Synkroniser kalenderen igen
4. Verificer at den manuelle kategori er bevaret
