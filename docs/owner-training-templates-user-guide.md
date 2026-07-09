# Vejledning: Ny Traenernavigation Og Training Templates

Denne vejledning beskriver, hvordan traenere bruger den nye bundmenu og de nye
training-template features i mobilappen.

## Ny Bundmenu For Traenere

Traenerens bundmenu er samlet i fire hovedomraader:

- `Overblik`: dashboard, alerts, dagens traeninger, aabne opgaver og hurtige handlinger.
- `Spillere`: spiller-/holdoverblik, CRM, tags, noter, udvikling og feedback.
- `Plan`: opgaver, skabeloner, programmer og tildelinger.
- `Bibliotek`: oevelser, inspiration, egne oevelser og FootballCoach-content.

`Profile` ligger ikke laengere i bundmenuen for traenere. Du aabner profil,
abonnement, workspace/ejer, notifikationer og logout via profilknappen i toppen
af `Overblik` eller `Plan`.

## Hvor Finder Man Training Templates?

Training templates ligger i:

```text
Plan > Skabeloner
```

Her kan traeneren oprette og administrere fire typer skabeloner:

- `Task`: en genbrugelig opgave.
- `Exercise`: en genbrugelig opgave med intervaltimer.
- `Session`: en samlet traeningssession med flere items.
- `Week`: en ugeplan med sessioner/items fordelt paa dage.

## Grundbegreber

`Task template`  
En enkelt genbrugelig opgave, fx "First touch wall passes". Den har samme
felter som normale opgaver: beskrivelse, medier, reminder og feedback.

`Exercise template`
En genbrugelig opgave med samme opgavefelter som en normal task og en
intervaltimer med aktiv arbejdstid, pause og antal runder.

`Session template`  
En traeningssession, fx "Finishing session". Sessionen er det, der senere kan
blive til en aktivitet i kalenderen, og den kan have standardkategori som
"Training". Den kan bestaa af task items, exercise items, feedback, fokusnoter
og varighed.

`Week template`  
En ugeplan, fx "U13 finishing week", hvor sessioner kan have day offset, saa de
ligger paa dag 1, dag 2 osv.

`Exercise item`
En opgaveblok inde i en session eller week med samme opgavefelter som en normal
opgave og en ekstra intervaltimer: aktiv arbejdstid, pause og antal runder.

`Version`  
Hver gang en skabelon oprettes, redigeres, duplikeres, arkiveres eller
gendannes, gemmes et snapshot. Det sikrer, at senere assignments kan pege paa en
stabil version, selvom skabelonen bliver redigeret bagefter.

## Opret En Ny Skabelon

1. Aabn `Plan`.
2. Vaelg `Skabeloner`.
3. Tryk paa den type, du vil oprette:
   - `Task`
   - `Exercise`
   - `Session`
   - `Week`
4. Udfyld titel.
5. Tilfoej evt. beskrivelse.
6. Tilfoej evt. fokusomraader, adskilt med komma.
7. Tilfoej evt. starttidspunkt og samlet varighed, hvis det er en `Session`.
8. Tilfoej items, hvis typen er `Session` eller `Week`.
9. Tryk `Save template`.

Titel er paakraevet. Beskrivelse, fokusomraader, sessionstid, varighed og items
kan tilfoejes loebende.

## Tilfoej Items Til En Skabelon

I en `Session` kan du tilfoeje:

- `Task`
- `Exercise`
- `Feedback`
- `Focus`
- `Note`

I en `Week` kan du tilfoeje:

- `Task`
- `Exercise`
- `Session`
- `Focus`
- `Note`

For hvert item kan du angive placering:

- titel
- noter/beskrivelse

`Day` vises kun, naar du arbejder med en `Week` skabelon. En `Session`
er altid samme dag som aktiviteten, saa session-items har ikke day-vaelger.
Starttid og varighed saettes paa selve `Session` skabelonen. I en `Week` vises
starttid og varighed kun paa `Session` items, fordi de repraesenterer planlagte
sessioner i ugen. `Task` og `Exercise` har ikke eget tidspunkt eller egen
varighed.

For `Task` og `Exercise` kan du derudover angive de samme felter som paa normale
opgaver:

- video-, billede- og PDF-link
- upload af billede, video eller PDF
- medienavne og sortering
- reminder foer start
- post-training feedback
- score-forklaring til feedback

For `Exercise` kan du ogsaa angive:

- aktiv arbejdstid i sekunder
- pause mellem arbejde i sekunder
- antal runder

## Vaelg Kilde Til Task Og Exercise Items

Naar du tilfoejer `Task` eller `Exercise` i en `Session` eller `Week`, kan du
vaelge mellem tre kilder:

- `New`: opret itemet direkte i skabelonen med medier, feedback og reminder.
- `Saved`: vaelg en eksisterende gemt `Task` eller `Exercise` skabelon.
- `Library`: vaelg en oevelse fra biblioteket.

Paa mobil aabner `Saved` og `Library` en popup med kort, saa du kan gennemse
gemte tasks, exercises og library-oevelser i samme kortstil som resten af
Plan/Bibliotek.

Hvis du bruger `New` eller `Library`, bliver itemet automatisk gemt som sin egen
selvstaendige `Task` eller `Exercise` skabelon, naar du gemmer sessionen eller
ugen. Derefter kan den vaelges under `Saved` i andre aktiviteter, sessioner eller
weeks.

Hvis du bruger `Saved`, linker sessionen eller ugen direkte til den gemte
skabelon. Retter du selve den gemte task/exercise senere, er det den
selvstaendige skabelon, du redigerer.

Brug pilene paa item-raekken til at flytte items op og ned. Brug skraldespanden
til at fjerne et item fra skabelonen.

## Rediger En Skabelon

1. Aabn `Plan > Skabeloner`.
2. Find skabelonen paa listen.
3. Tryk `Edit`.
4. Ret titel, beskrivelse, fokusomraader, varighed eller items.
5. Tryk `Save template`.

Naar du gemmer, oprettes en ny version/snapshot.

## Dupliker En Skabelon

1. Aabn `Plan > Skabeloner`.
2. Find skabelonen.
3. Tryk `Copy`.

Der oprettes en aktiv kopi med samme indhold. Kopien faar sin egen version, saa
den kan redigeres uden at aendre originalen.

## Arkiver Og Gendan

Arkivering bruges, naar en skabelon ikke laengere skal bruges i daglig drift,
men stadig skal bevares historisk.

Arkiver:

1. Aabn `Plan > Skabeloner`.
2. Find skabelonen.
3. Tryk `Archive`.

Gendan:

1. Skift filter til `Archived`.
2. Find skabelonen.
3. Tryk `Restore`.

Arkiverede skabeloner slettes ikke. De bevarer versionshistorik og kan gendannes.

## Filtre

I `Plan > Skabeloner` kan du filtrere paa:

- `Active`
- `Archived`
- `All types`
- `Task`
- `Exercise`
- `Session`
- `Week`

Brug `Active` til daglig drift og `Archived` til gamle skabeloner.

## Opgaver, Programmer Og Tildelinger

I `Plan` findes ogsaa:

- `Opgaver`: aabner det eksisterende task-template bibliotek.
- `Programmer`: reserveret til program builder.
- `Tildelinger`: reserveret til bulk assignment.

Training templates er fundamentet for de senere program- og bulk-assignment
flows.

## Adgang Og Roller

Training templates er owner-scopede. Det betyder, at skabeloner hoerer til et
bestemt `OwnerAccount`.

Adgang gives til:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Players og guardians har ikke template-admin adgang.

Hvis en bruger har adgang til flere owners, kan workspace/ejer vaelges i toppen
af `Plan`.

## Web/Base44

Webdelen skal bruge samme Supabase backend som mobilappen. Base44-prompten til
implementation ligger her:

```text
docs/base44-owner-training-templates-prompt.md
```

Webappen skal genbruge eksisterende KlubAdmin/Base44 flow og ikke bygge en ny
portal.

## Fejl Og Troubleshooting

`Coach access required`  
Brugeren har ikke en aktiv owner rolle med coach-adgang.

`Template not saved`  
Kontroller titel, owner access og at payloaden er gyldig.

`No templates in this view`  
Skift mellem `Active`, `Archived` eller typefiltrene.

`401` fra endpointet  
Brugeren er ikke logget ind, eller access token mangler.

`403` fra endpointet  
Brugeren har ikke adgang til den valgte owner.

`404` paa template/folder  
Skabelonen eller folderen findes ikke i den valgte owner. Refetch listen.

## Hurtig QA

Test dette flow som traener:

1. Log ind som traener.
2. Bekraeft at bundmenuen viser `Overblik`, `Spillere`, `Plan`, `Bibliotek`.
3. Aabn `Plan`.
4. Opret en `Session` skabelon.
5. Tilfoej et nyt `Task` item med media.
6. Tilfoej et `Exercise` item fra `Library` med aktiv tid, pause og runder.
7. Gem skabelonen.
8. Bekraeft at task/exercise nu findes som selvstaendige templates under `Saved`.
9. Opret en `Week` skabelon og tilfoej den gemte task/exercise.
10. Rediger skabelonen og gem igen.
11. Dupliker skabelonen.
12. Arkiver kopien.
13. Skift til `Archived` og gendan kopien.
