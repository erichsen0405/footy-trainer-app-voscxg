# Base44 Prompt: Improve Recipients Layout In Bulk Assignment (#287)

Brug denne prompt i den eksisterende Base44/KlubAdmin-webapp som en fokuseret
UX-rettelse til Step 2 `Recipients` i det allerede implementerede Bulk
Assignment-flow fra issue #287.

## Formaal

Gør sammenhaengen mellem recipient-filtre og spillerlisten tydeligere ved at
placere spillerlisten under filtersektionen. Brugeren skal foerst definere sit
scope og derefter kunne se, hvilke spillere det lokale roster-view matcher.

Dette er en layout- og interaktionsrettelse. Bevar den eksisterende
recipient-kontrakt, payloads, Supabase Edge Functions, preview/apply-flow og
server-side resolver uændret.

## Vigtige Regler

1. Genbrug den eksisterende `Bulk Assignment`-wizard og Step 2 `Recipients`.
   Opret ikke et nyt flow eller et parallelt recipient-system.
2. Supabase er fortsat source of truth. Den lokale spillerliste og dens count
   er kun en foreloebig visning. Det endelige recipient-resultat kommer altid
   fra serverens `preview`.
3. Bevar kombinationen af direkte valgte spillere og filterbaserede recipients.
   De deduplikeres fortsat server-side.
4. Bevar de eksisterende requestfelter, herunder `includeAllPlayers`,
   `playerIds`, filtergrupper og exclusions.
5. Aendr ikke Supabase-bootstrap, auth, API-klienter, Edge Functions eller
   anden funktionalitet uden for dette layout-scope.
6. Alle nye faste UI-tekster skal vaere paa engelsk og bruge appens
   eksisterende design tokens og komponenter.

## Ny Raekkefoelge I Step 2

Render indholdet i denne raekkefoelge:

### 1. All Eligible Players

Bevar den eksisterende brede mulighed oeverst:

- checkbox/toggle med teksten `All eligible players`
- tydelig warning/helper om det brede scope
- naar valget er aktivt, disable recipient-filtre og direkte player selection
- send fortsat `includeAllPlayers: true`

### 2. Recipient Filters

Flyt hele filtersektionen op, saa den kommer foer spillerlisten.

Bevar de eksisterende filtre:

- CRM status
- Playing level
- Position
- Age range
- Program enrollment
- Enrollment status
- Team og tags, hvis de allerede findes i den aktuelle context-respons

Krav:

- behold aktive filtervalg som removable chips
- vis den eksisterende menneskelaeselige filter-expression, hvis komponenten
  allerede understøtter den
- giv mulighed for at rydde alle filtre
- aendring af et filter skal straks opdatere den lokale spillerliste nedenfor
- aendring af recipients eller filters skal fortsat invalidere et eksisterende
  preview-token

### 3. Matching Players

Placer spillerlisten direkte under filtersektionen.

Brug en tydelig header, for eksempel:

```text
Matching players (12)
```

Counten er lokal og foreloebig. Tilfoej kort helper-tekst:

```text
Final recipients are calculated in Preview.
```

Spillerlisten skal:

- opdateres live ud fra de aktive filtre
- vise hele den owner-scopede roster, naar ingen filtre er aktive
- bevare search-feltet over listen
- lade search indsnævre den viste liste uden at blive sendt som et nyt
  recipient-filter til backend
- bevare eksisterende player rows, checkbox, navn og relevante metadata
- have en tydelig `Select all shown`-handling, hvis bulk-select allerede
  understøttes sikkert
- vise gode loading-, empty- og error-states
- bruge et afgraenset scroll-omraade ved lange lister, saa wizard-footeren ikke
  skubbes unødigt langt ned

Når en spiller markeres direkte, skal spillerens id fortsat ligge i
`playerIds`. Direkte valgte spillere skal bevares, selv hvis et efterfoelgende
filter skjuler dem fra den aktuelle resultatliste.

Vis derfor en kompakt, synlig opsummering, for eksempel:

```text
3 players selected directly
```

Opsummeringen skal give adgang til at se og fjerne direkte valgte spillere,
ogsaa hvis de ikke laengere matcher de aktive filtre. Gør det tydeligt, at
direkte valgte spillere laegges til de filterbaserede matches, og at serveren
deduplikerer overlap.

## Continue-State

Bevar eksisterende validering:

- `Continue` er enabled, naar mindst én af disse er sand:
  - `includeAllPlayers` er aktiv
  - mindst én direkte spiller er valgt
  - mindst ét gyldigt recipient-filter er aktivt
- `Continue` er disabled, hvis ingen recipient-definition er valgt
- den lokale match-count maa ikke bruges som autoritativt grundlag for apply
- endelig no-match/all-excluded validering sker i serverens Preview-step

## Responsive Layout

Desktop:

- behold den eksisterende brede modal/workspace
- filtre vises kompakt i et responsivt grid, hvor det passer
- spillerlisten ligger i fuld bredde under filtrene
- behold den eksisterende sticky footer med `Back` og `Continue`

Mobil/smal visning:

- stack alle filter-controls vertikalt
- behold spillerlisten under filtrene
- undgaa horisontal scrolling
- knapper og checkboxes skal fortsat have brugbare touch targets

## Empty Og Loading States

Brug engelske UI-tekster i stil med:

- `Loading players...`
- `No players match these filters.`
- `Clear filters`
- `No players are available in this workspace.`

Et tomt lokalt resultat maa ikke slette allerede direkte valgte spillere.

## Acceptance Criteria

- `All eligible players` staar fortsat oeverst.
- Filtersektionen vises foer spillerlisten.
- Spillerlisten staar direkte under filtrene og opdateres live.
- Search virker sammen med den lokalt filtrerede liste.
- Direkte valg bevares ved filteraendringer og sendes fortsat som `playerIds`.
- Aktive filtergrupper sendes med samme payload som foer.
- Direkte valg plus filters kan fortsat kombineres og deduplikeres server-side.
- `includeAllPlayers` disabler/ignorerer direkte valg og filters i requesten.
- Den lokale count omtales ikke som det endelige recipient-antal.
- Preview-step viser fortsat serverens autoritative recipient-liste og counts.
- Ingen Supabase-, auth-, bootstrap- eller backend-kontrakter er aendret.
- Direkte reload og navigation gennem hele wizarden virker uden console errors.

## Returner Efter Implementering

Returner:

1. en kort liste over aendrede komponenter
2. en beskrivelse af den nye visuelle raekkefoelge
3. bekraeftelse paa at payload-kontrakten er uændret
4. testresultater for filters, search, direkte valg, filteraendringer,
   `includeAllPlayers`, Preview og responsive layout
5. eventuelle kendte begrænsninger

