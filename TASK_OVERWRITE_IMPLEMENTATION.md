
# Task Overwrite Implementation

## Oversigt

Denne opdatering gør det muligt at overskrive eksisterende opgaver på aktiviteter når du gemmer en opgaveskabelon igen. Dette er en måde at opdatere eksisterende opgaver på.

## Hvad er ændret?

### 1. Database Funktioner Opdateret

#### `create_tasks_for_activity()`
- **Før**: Sprang over hvis en opgave allerede eksisterede
- **Nu**: Opdaterer eksisterende opgaver med de nyeste data fra skabelonen
- Opdaterer: titel, beskrivelse, påmindelsestid
- Genskaber alle delopgaver fra skabelonen

#### `create_tasks_for_external_event()`
- **Før**: Brugte `ON CONFLICT DO NOTHING` for at undgå duplikater
- **Nu**: Opdaterer eksisterende opgaver med de nyeste data fra skabelonen
- Samme opdateringslogik som for aktivitetsopgaver

### 2. Nye Database Funktioner

#### `update_all_tasks_from_template(p_template_id)`
Denne funktion:
- Finder alle aktiviteter der har opgaver fra en specifik skabelon
- Finder alle eksterne events der har opgaver fra en specifik skabelon
- Opdaterer alle disse opgaver med de nyeste data fra skabelonen

### 3. Automatiske Triggers

#### `trigger_update_tasks_on_template_change`
- Aktiveres når en opgaveskabelon opdateres
- Tjekker om titel, beskrivelse eller påmindelsestid er ændret
- Opdaterer automatisk alle relaterede opgaver på aktiviteter

#### `trigger_update_tasks_on_subtask_change`
- Aktiveres når delopgaver på en skabelon ændres (INSERT, UPDATE, DELETE)
- Opdaterer automatisk alle relaterede opgaver på aktiviteter

## Hvordan virker det?

### Scenario 1: Opdatering af opgaveskabelon
```
1. Du redigerer en opgaveskabelon i "Opgaver" fanen
2. Du ændrer titel, beskrivelse eller påmindelsestid
3. Du klikker "Gem"
4. Trigger aktiveres automatisk
5. Alle eksisterende opgaver på aktiviteter opdateres med de nye data
```

### Scenario 2: Opdatering af delopgaver
```
1. Du redigerer delopgaver på en opgaveskabelon
2. Du tilføjer, ændrer eller sletter delopgaver
3. Du klikker "Gem"
4. Trigger aktiveres automatisk
5. Alle eksisterende delopgaver på aktiviteter slettes og genskabes
```

### Scenario 3: Tildeling af kategori til skabelon
```
1. Du tildeler en ny kategori til en opgaveskabelon
2. Eksisterende trigger (on_task_template_category_added) aktiveres
3. Opgaver oprettes på alle aktiviteter i den kategori
4. Hvis opgaven allerede findes, opdateres den i stedet
```

## Vigtige Detaljer

### Hvad bevares?
- **Completed status**: Om opgaven er fuldført eller ej bevares
- **Activity_id**: Opgaven forbliver knyttet til samme aktivitet
- **Task_template_id**: Linket til skabelonen bevares

### Hvad opdateres?
- **Titel**: Opdateres til skabelonens titel
- **Beskrivelse**: Opdateres til skabelonens beskrivelse
- **Påmindelsestid**: Opdateres til skabelonens påmindelsestid
- **Delopgaver**: Alle delopgaver slettes og genskabes fra skabelonen
- **Updated_at**: Tidsstempel opdateres til nu

### Hvad slettes og genskabes?
- **Delopgaver**: Alle delopgaver slettes og genskabes for at sikre korrekt rækkefølge og indhold

## Fordele

1. **Nem opdatering**: Rediger skabelonen én gang, og alle relaterede opgaver opdateres automatisk
2. **Konsistens**: Alle opgaver fra samme skabelon har altid samme indhold
3. **Ingen duplikater**: Systemet sikrer at der ikke oprettes duplikerede opgaver
4. **Automatisk**: Ingen manuel handling krævet - det sker automatisk når du gemmer

## Eksempel

### Før implementering:
```
1. Opret opgaveskabelon "Forberedelse" med beskrivelse "Husk at tage støvler med"
2. Opgaven oprettes på 10 aktiviteter
3. Du opdager en fejl og ændrer beskrivelsen til "Husk at tage støvler og handsker med"
4. De 10 eksisterende opgaver forbliver uændrede med den gamle beskrivelse
5. Kun nye aktiviteter får den opdaterede beskrivelse
```

### Efter implementering:
```
1. Opret opgaveskabelon "Forberedelse" med beskrivelse "Husk at tage støvler med"
2. Opgaven oprettes på 10 aktiviteter
3. Du opdager en fejl og ændrer beskrivelsen til "Husk at tage støvler og handsker med"
4. Alle 10 eksisterende opgaver opdateres automatisk med den nye beskrivelse
5. Alle fremtidige aktiviteter får også den opdaterede beskrivelse
```

## Teknisk Implementation

### Database Migrationer
To migrationer er blevet anvendt:
1. `update_existing_activity_tasks_on_template_save` - Opdaterer hovedfunktionerne
2. `trigger_update_tasks_on_subtask_change` - Tilføjer trigger for delopgaver

### Funktioner der er ændret:
- `create_tasks_for_activity()` - Nu opdaterer i stedet for at springe over
- `create_tasks_for_external_event()` - Nu opdaterer i stedet for at springe over

### Nye funktioner:
- `update_all_tasks_from_template()` - Opdaterer alle opgaver fra en skabelon
- `trigger_update_tasks_on_template_change()` - Trigger funktion for skabelon ændringer
- `trigger_update_tasks_on_subtask_change()` - Trigger funktion for delopgave ændringer

### Nye triggers:
- `update_tasks_on_template_change` på `task_templates` tabellen
- `update_tasks_on_subtask_change` på `task_template_subtasks` tabellen

## Test Scenarie

For at teste funktionaliteten:

1. **Opret en opgaveskabelon**:
   - Gå til "Opgaver" fanen
   - Klik "Ny skabelon"
   - Titel: "Test opgave"
   - Beskrivelse: "Original beskrivelse"
   - Tildel til en kategori (fx "Træning")
   - Gem

2. **Opret en aktivitet**:
   - Gå til "Hjem" fanen
   - Opret en ny aktivitet med kategorien "Træning"
   - Opgaven "Test opgave" skulle automatisk være tilføjet

3. **Opdater skabelonen**:
   - Gå tilbage til "Opgaver" fanen
   - Rediger "Test opgave" skabelonen
   - Ændre beskrivelsen til "Opdateret beskrivelse"
   - Gem

4. **Verificer opdatering**:
   - Gå til aktiviteten du oprettede
   - Opgaven skulle nu have beskrivelsen "Opdateret beskrivelse"

## Bemærkninger

- Denne funktionalitet virker både for normale aktiviteter og eksterne kalender events
- Completed status på opgaver bevares, så hvis en bruger har fuldført en opgave, forbliver den fuldført efter opdatering
- Delopgaver genskabes altid for at sikre korrekt rækkefølge og indhold
- Triggers kører automatisk i baggrunden og kræver ingen brugerinteraktion

## Fremtidige Forbedringer

Mulige fremtidige forbedringer kunne inkludere:
- Mulighed for at vælge om en specifik opgave skal opdateres eller ej
- Historik over opgave opdateringer
- Notifikationer til brugere når opgaver opdateres automatisk
- Mulighed for at rulle tilbage til tidligere versioner af opgaver
