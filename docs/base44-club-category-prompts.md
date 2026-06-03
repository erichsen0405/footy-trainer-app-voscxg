# Base44 Prompts: Klubmodul Kategorier

## Prompt 1: Datamodel og API-kontrakt

Du skal udvide klubmodulet med aktivitetskategorier for klubber. Brug kun Supabase Edge Functions, ikke direkte writes til `activity_categories`.

Implementer en "Kategorier" sektion på klub-detaljesiden. Sektionen skal bruge disse endpoints:

- `getClubActivityCategories`
  - body: `{ "clubId": "<uuid>" }`
  - response: `{ success: true, data: { clubId, categories } }`
- `createClubActivityCategory`
  - body: `{ "clubId": "<uuid>", "name": "Recovery", "color": "#4ECDC4", "emoji": "R" }`
- `updateClubActivityCategory`
  - body: `{ "clubId": "<uuid>", "categoryId": "<uuid>", "name": "Recovery", "color": "#4ECDC4", "emoji": "R" }`
- `deleteClubActivityCategory`
  - body: `{ "categoryId": "<uuid>" }`

Kategoriobjektet har denne form:

```ts
{
  id: string;
  clubId: string;
  name: string;
  displayName: string;
  color: string;
  emoji: string;
  memberCopyCount: number;
  createdAt: string;
  updatedAt: string;
}
```

Vis `displayName` i UI. Backend kopierer automatisk kategorien til aktive klubmedlemmer som `Navn (klub)`.

## Prompt 2: UI-flow

Byg en kompakt CRUD UI til klub-kategorier:

- Liste med kategoriens farve, emoji, `displayName` og antal synkroniserede medlemmer (`memberCopyCount`).
- Opret-knap med modal/form: navn, farve, emoji.
- Rediger-knap på hver kategori med samme felter.
- Slet-knap med bekræftelse.
- Efter create/update/delete skal listen refetches via `getClubActivityCategories`.

Validering:

- Navn er påkrævet og må ikke kun være whitespace.
- Farve skal gemmes som hex string.
- Emoji kan være en kort tekst/ikonværdi.
- Hvis backend returnerer `CLUB_CATEGORY_ALREADY_EXISTS`, vis en dansk fejl: "Der findes allerede en klubkategori med dette navn."
- Hvis backend returnerer `FORBIDDEN`, vis: "Du har ikke adgang til at administrere kategorier for denne klub."

## Prompt 3: Adgang og forventet backend-adfærd

Forvent denne backend-adfærd og byg UI efter den:

- Kun platform admins og klub owner/admin kan oprette, redigere og slette klub-kategorier.
- Alle aktive klubmedlemmer kan få kategorierne i appen via synkroniserede kopier.
- Brugere, der allerede havde personlige kategorier før klubtilknytning, beholder dem.
- Nye/tomme kluboprettede profiler får systemkategorier skjult og starter med klub-kategorierne.
- Appen viser kopierede klub-kategorier som `Navn (klub)`.

Der skal ikke bygges logik i Base44 til at kopiere kategorier ud til medlemmer. Det gør backend automatisk.

## Prompt 4: Profilindstillinger og personlige kategorier

Udvid profilsiden, så brugeren kan administrere sine aktivitetskategorier under fanen/sektionen `Indstillinger`.

Placering:

- Gå til `Profil -> Indstillinger`.
- Tilføj en række/knap med titlen `Aktivitetskategorier`.
- Rækken skal åbne en modal eller drawer med kategoriadministration.

Funktionalitet i kategoriadministrationen:

- Brugeren skal kunne oprette en personlig kategori med navn, farve og emoji/ikon.
- Brugeren skal kunne redigere og slette kategorier, som brugeren selv ejer.
- Systemkategorier og klub-kategorier må ikke slettes fysisk. De skal kunne fjernes fra brugerens profil ved at oprette en række i `hidden_activity_categories`.
- Når en kategori fjernes/skjules, skal den ikke længere vises i appens kategori-lister, og den skal ikke bruges i auto-match ved import.
- Hvis en kategori bruges af eksisterende aktiviteter, skal brugeren først vælge en anden kategori, som aktiviteterne flyttes til.

Supabase-tabeller:

- Personlige kategorier ligger i `activity_categories` med `user_id = currentUser.id`, `is_system = false`, `source_category_id = null`.
- Systemkategorier har `is_system = true`.
- Klub-kategorier, der er kopieret til brugeren, har `source_category_id != null` og vises som `Navn (klub)`.
- Skjulte/fjernede kategorier ligger i `hidden_activity_categories` med `{ user_id, category_id }`.

Vigtige regler:

- Brug ikke direkte delete på systemkategorier eller klub-kopier.
- Brug direkte delete kun for personlige kategorier, hvor `user_id = currentUser.id` og `source_category_id` er tom/null.
- Ved skjul/fjern kategori skal der upsertes i `hidden_activity_categories` med conflict key `user_id,category_id`.
- Efter opret/rediger/slet/skjul skal kategorier refetches.
- Auto-match skal arbejde på brugerens synlige kategorier, inklusive personlige kategorier og synlige klub-kopier, men eksklusive skjulte kategorier.

UI-tekst:

- Række i Indstillinger: `Aktivitetskategorier`
- Undertitel når kategorier findes: `<antal> kategorier på din profil`
- Undertitel når ingen kategorier findes: `Opret og administrer kategorier`
- Opret-knap: `Opret ny kategori`
- Fjern-knap for system/klub-kategorier: `Fjern fra profil`
- Slet-knap for egne kategorier: `Slet kategori`

Acceptkriterier:

- En spiller/træner kan oprette en personlig kategori fra profilsidens Indstillinger.
- En spiller/træner kan slette egne kategorier.
- En spiller/træner kan fjerne systemkategorier fra sin profil uden at slette dem globalt.
- En spiller/træner kan fjerne klub-kategorier fra sin profil uden at slette dem for klubben.
- Klub-kategorier vises tydeligt med `(klub)` i navnet.
- Eksisterende personlige kategorier bevares, når brugeren bliver tilknyttet en klub.
- Nye kluboprettede profiler skal ikke have synlige systemkategorier som udgangspunkt, kun klub-kategorier og senere egne kategorier.
