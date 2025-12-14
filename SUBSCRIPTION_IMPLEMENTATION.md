
# Abonnementsløsning - Implementeringsguide

## Oversigt

Denne app har nu en komplet abonnementsløsning implementeret med følgende funktioner:

### Abonnementsplaner

1. **Basis** - 9 kr/måned
   - Op til 1 spiller
   - 14 dages gratis prøveperiode
   - Fuld adgang til alle funktioner

2. **Standard** - 19 kr/måned
   - Op til 5 spillere
   - 14 dages gratis prøveperiode
   - Fuld adgang til alle funktioner

3. **Premium** - 39 kr/måned
   - Op til 15 spillere
   - 14 dages gratis prøveperiode
   - Fuld adgang til alle funktioner

## Funktionalitet

### For Admin-brugere

- **Abonnementsstyring**: Admin kan vælge og administrere deres abonnement
- **Prøveperiode**: 14 dages gratis prøveperiode på alle planer
- **Spillerbegrænsning**: Systemet håndhæver automatisk spillergrænser baseret på valgt plan
- **Spilleradministration**: Admin kan oprette og slette spillere inden for deres plan-grænse

### For Spillere

- **Gratis adgang**: Spillere betaler ikke - kun admin betaler
- **Begrænset adgang**: Spillere har kun adgang til Hjem, Performance og Profil
- **Invitation**: Spillere inviteres af admin via email

## Database-struktur

### Nye tabeller

1. **subscription_plans**
   - Indeholder de tre abonnementsplaner
   - Definerer pris og spillergrænser

2. **subscriptions**
   - Holder styr på admin-brugerens aktive abonnement
   - Tracker prøveperiode og betalingsstatus
   - Gemmer Stripe-information (til fremtidig brug)

### Triggers og funktioner

- **check_player_limit()**: Trigger der automatisk tjekker spillergrænser ved oprettelse af nye spillere
- **get_subscription_status()**: Funktion til at hente abonnementsstatus for en bruger

## Edge Functions

### create-subscription
Opretter et nyt abonnement for admin-brugeren med 14 dages prøveperiode.

**Endpoint**: `/functions/v1/create-subscription`

**Request body**:
```json
{
  "planId": "uuid-of-plan"
}
```

**Response**:
```json
{
  "success": true,
  "subscription": {
    "id": "uuid",
    "status": "trial",
    "planName": "Standard",
    "maxPlayers": 5,
    "trialEnd": "2024-02-01T00:00:00Z"
  }
}
```

### get-subscription-status
Henter den aktuelle abonnementsstatus for den indloggede bruger.

**Endpoint**: `/functions/v1/get-subscription-status`

**Response**:
```json
{
  "hasSubscription": true,
  "status": "trial",
  "planName": "Standard",
  "maxPlayers": 5,
  "currentPlayers": 2,
  "trialEnd": "2024-02-01T00:00:00Z",
  "currentPeriodEnd": "2024-02-01T00:00:00Z"
}
```

## UI-komponenter

### SubscriptionManager
Viser abonnementsstatus og tillader admin at vælge en plan.

**Features**:
- Viser aktuel abonnementsstatus hvis aktiv
- Viser alle tilgængelige planer hvis ingen abonnement
- Fremhæver "mest populær" plan (Standard)
- Viser dage tilbage af prøveperiode
- Viser spillerforbrug (2/5 spillere)

### Admin Screen
Opdateret til at inkludere abonnementsstyring.

**Features**:
- Abonnementssektion øverst
- Spillersektion med begrænsningshåndhævelse
- Eksterne kalendere sektion
- Validering før oprettelse af nye spillere

## Context

### SubscriptionContext
Centraliseret state management for abonnementer.

**Provides**:
- `subscriptionStatus`: Aktuel abonnementsstatus
- `subscriptionPlans`: Liste over tilgængelige planer
- `loading`: Loading state
- `refreshSubscription()`: Genindlæs abonnementsstatus
- `createSubscription(planId)`: Opret nyt abonnement

## Fremtidige forbedringer

### Stripe Integration (til production)

For at aktivere betalinger i App Store skal du:

1. **Installer Stripe SDK**:
   ```bash
   npx expo install @stripe/stripe-react-native
   ```

2. **Konfigurer app.json**:
   ```json
   {
     "expo": {
       "plugins": [
         [
           "@stripe/stripe-react-native",
           {
             "merchantIdentifier": "merchant.com.yourapp",
             "enableGooglePay": true
           }
         ]
       ]
     }
   }
   ```

3. **Opret Stripe-produkter**:
   - Log ind på Stripe Dashboard
   - Opret produkter for hver plan
   - Gem price_id'erne i subscription_plans tabellen

4. **Implementer betalingsflow**:
   - Opret Stripe Customer ved signup
   - Opret Stripe Subscription ved planvalg
   - Håndter webhooks for betalingsstatus
   - Opdater subscription status baseret på betalinger

5. **Webhook Edge Function**:
   Opret en Edge Function til at håndtere Stripe webhooks:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### Automatisk abonnementsfornyelse

Implementer en scheduled Edge Function til at:
- Tjekke udløbne prøveperioder
- Opdatere abonnementsstatus
- Sende påmindelser til admin
- Deaktivere konti ved manglende betaling

### Opgraderingsflow

Tillad admin at:
- Opgradere til højere plan
- Nedgradere til lavere plan
- Opsige abonnement

## Testning

### Test prøveperiode

1. Log ind som admin
2. Gå til Admin-siden
3. Vælg en abonnementsplan
4. Verificer at prøveperioden starter
5. Opret spillere op til grænsen
6. Verificer at du ikke kan oprette flere spillere end tilladt

### Test spillerbegrænsning

1. Opret abonnement med Basis-plan (1 spiller)
2. Opret 1 spiller - skal lykkes
3. Forsøg at oprette 2. spiller - skal fejle med fejlbesked
4. Opgrader til Standard-plan (5 spillere)
5. Opret flere spillere - skal lykkes op til 5

## Sikkerhed

- **RLS Policies**: Alle tabeller har Row Level Security aktiveret
- **Admin-only**: Kun admin-brugere kan oprette abonnementer
- **Trigger-validering**: Database-triggers sikrer spillergrænser
- **Edge Function-validering**: Alle Edge Functions validerer brugerroller

## Support

Ved problemer eller spørgsmål:
1. Tjek console logs i Edge Functions
2. Verificer RLS policies i Supabase Dashboard
3. Tjek subscription_plans tabellen for korrekte data
4. Verificer at triggers er aktiveret

## Deployment til App Store

Når du er klar til at deploye:

1. Implementer Stripe-integration (se ovenfor)
2. Test betalingsflow grundigt
3. Konfigurer App Store Connect
4. Tilføj in-app purchase produkter
5. Submit til review med abonnementsinformation
6. Aktivér production mode i Stripe

## Vigtige noter

- Prøveperioden er 14 dage fra oprettelse
- Admin betaler for alle spillere
- Spillere har gratis adgang
- Abonnement kan opsiges når som helst
- Data bevares efter opsigelse (indtil admin sletter konto)
