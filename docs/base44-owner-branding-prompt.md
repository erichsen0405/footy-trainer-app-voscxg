# Base44 Prompt: Owner Coach Branding

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal og brug ikke Base44-interne entities som source of truth.

## Formaal

Tilfoej brand-indstillinger for baade klubber og private coach businesses i den
eksisterende owner portal. Web og mobil skal kunne redigere de samme
brandfelter:

- display name
- logo
- cover image
- bio
- contact email
- contact phone
- website
- social links
- primary/accent brand colors
- public/private landing status

Tenant scope er altid:

```text
owner_account_id
```

Branding ligger paa `OwnerAccount`, ikke paa en enkelt coach-bruger. Det betyder
at `owner_type = club` og `owner_type = private_coach_business` bruger samme
flow, API og storage-regler.

## Navigation

Genbrug den eksisterende owner-aware KlubAdmin navigation. Brand-opsætning kan
ligge under Settings, Profil eller en eksisterende owner settings-side, men den
skal foeles som en del af den nuvaerende portal.

Mobilappen har samme funktionalitet i CRM-omraadets `Brand` tab for traenere og
admins. Web maa gerne bruge bredere layout, men maa ikke opfinde ekstra
brandfelter, som mobil ikke kan se eller redigere.

## Supabase API

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Function:

```text
manageOwnerBranding
```

RPC for public landing:

```text
get_public_owner_brand_profile
```

Storage bucket:

```text
owner-brand-assets
```

Remote status per 2026-07-08:

- Migration `20260708170000_owner_brand_profiles` er applied paa project
  `lhpczofddvwcyrgotzha`.
- `manageOwnerBranding` er deployed og `ACTIVE`.
- No-auth smoke test for `manageOwnerBranding` returnerer `401` med
  `UNAUTHORIZED_NO_AUTH_HEADER`, ikke `404`, fordi endpointet er
  auth-beskyttet.

Hvis Base44 bruger Supabase JS:

```ts
await supabase.functions.invoke('manageOwnerBranding', { body });
```

Hvis Base44 kalder HTTP direkte:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Service-role key maa aldrig ligge i Base44/browseren.

## Access

Authenticated brand read gives til:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Brand write gives til:

- `owner`
- `admin`
- `coach`

Platform admins maa ogsaa laese og skrive. Brug owner access/RPC'er, ikke kun
globale `user_roles`, fordi samme mail kan have flere roller paa flere
`owner_account_id`.

## Action: Get Brand

Bruges naar brand settings-siden aabnes.

```ts
await supabase.functions.invoke('manageOwnerBranding', {
  body: {
    action: 'get',
    ownerAccountId: selectedOwnerAccountId,
  },
});
```

Response:

```ts
{
  success: true,
  data: {
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    ownerStatus: string;
    ownerName: string;
    displayName: string;
    slug: string;
    bio: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    websiteUrl: string | null;
    socialLinks: Record<string, string>;
    brandColors: {
      primary: string;
      accent: string;
    };
    logoPath: string | null;
    logoUrl: string | null;
    coverPath: string | null;
    coverUrl: string | null;
    isPublic: boolean;
    publicUrlPath: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
}
```

## Action: Save Brand

Base44 skal validere UI-felter foer submit, men Supabase er endelig validation.

```ts
await supabase.functions.invoke('manageOwnerBranding', {
  body: {
    action: 'upsert',
    ownerAccountId: selectedOwnerAccountId,
    profile: {
      displayName: 'Coach Business Name',
      slug: 'coach-business-name',
      bio: 'Short public profile text',
      contactEmail: 'coach@example.com',
      contactPhone: '+45 12345678',
      websiteUrl: 'https://example.com',
      socialLinks: {
        instagram: 'https://instagram.com/example',
        linkedin: 'https://linkedin.com/in/example',
      },
      brandColors: {
        primary: '#2563eb',
        accent: '#16a34a',
      },
      logoPath: 'owner-account-id/logo-123.jpg',
      logoUrl: 'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/owner-brand-assets/owner-account-id/logo-123.jpg',
      coverPath: 'owner-account-id/cover-123.jpg',
      coverUrl: 'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/owner-brand-assets/owner-account-id/cover-123.jpg',
      isPublic: true,
    },
  },
});
```

Validation:

- `displayName` er paakraevet og max 90 tegn.
- `slug` skal vaere 3-64 tegn, lowercase letters, numbers og hyphens.
- `bio` max 800 tegn.
- `contactEmail` skal vaere valid email eller tom.
- `websiteUrl`, `logoUrl`, `coverUrl` og social links skal vaere `http(s)` URLs
  eller tomme.
- `brandColors.primary` og `brandColors.accent` skal vaere hex colors som
  `#2563eb`.

Error handling:

- `400 VALIDATION_ERROR`: vis field-level fejl hvis muligt.
- `401`: bruger skal logge ind igen.
- `403`: bruger har ikke owner adgang eller write role.
- `404 OWNER_ACCOUNT_NOT_FOUND`: valgt workspace findes ikke.
- `409 VALIDATION_ERROR`: slug er allerede i brug.
- `500`: vis generisk fejl og log Supabase message i dev console.

Efter success skal Base44 refetche brand profile fra `manageOwnerBranding`.

## Asset Upload

Upload logo og cover til Supabase Storage med den authenticated user session.
Brug ikke service-role key.

Bucket:

```text
owner-brand-assets
```

Path format:

```text
<ownerAccountId>/logo-<timestamp-or-random>.<ext>
<ownerAccountId>/cover-<timestamp-or-random>.<ext>
```

Eksempel:

```ts
const path = `${ownerAccountId}/logo-${Date.now()}.jpg`;

const { error } = await supabase.storage
  .from('owner-brand-assets')
  .upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });

if (error) throw error;

const { data } = supabase.storage
  .from('owner-brand-assets')
  .getPublicUrl(path);
```

Gem derefter `logoPath/logoUrl` eller `coverPath/coverUrl` via
`manageOwnerBranding`.

Storage RLS tillader kun upload/update/delete naar foerste folder segment er
samme `owner_account_id`, og brugeren er `owner`, `admin` eller `coach` paa den
owner.

## Public Landing

Public landing maa vaere web/public surface. Den skal hente selected public
fields via RPC, ikke via en privat admin payload.

```ts
const { data, error } = await supabase.rpc('get_public_owner_brand_profile', {
  p_slug: slugFromRoute,
});
```

Response er `null`, hvis profilen ikke er public, owner ikke er aktiv, eller
slug ikke findes.

Public payload maa kun bruges til landing/invite/booking/waitlist-visning:

```ts
{
  ownerType: 'club' | 'private_coach_business';
  displayName: string;
  slug: string;
  bio: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
  brandColors: {
    primary: string;
    accent: string;
  };
  logoUrl: string | null;
  coverUrl: string | null;
  isPublic: true;
  updatedAt: string;
}
```

Public landing maa ikke vise interne owner ids, member ids, subscription data,
seat counts, staff emails eller private coach/admin data.

## UI Requirements

Settings-side:

- owner workspace switcher skal genbruges fra eksisterende owner portal
- vis live preview af logo, cover, display name, bio, farver og public path
- upload logo som kvadratisk image crop hvor muligt
- upload cover som bredt image crop hvor muligt
- vis public/private toggle
- vis save state og refetch efter success
- laas write controls for read-only roller som `assistant_coach`

Public landing:

- brug brandets logo/cover/farver
- vis klare CTA'er til invitation, booking eller waitlist naar de eksisterer
- hvis landing er private eller slug mangler, vis 404/not found state
- maatte links skal aabne i ny tab med standard sikkerhedsattributter

Player-facing web/mobile surfaces:

- hvor en spiller/parent modtager invitation, program, feedback eller besked fra
  en owner, skal brand data kunne vises fra samme Supabase profile
- brug fallback til owner name og neutrale farver hvis logo/cover ikke findes

## Done Criteria

- Brand settings kan opdateres paa web og mobil for samme `owner_account_id`.
- Logo og cover uploades til `owner-brand-assets` og vises efter refetch.
- Public landing bruger kun `get_public_owner_brand_profile`.
- Private brand data kan ikke laeses via public landing.
- Base44 bruger ikke interne entities som source of truth.
- Web UX genbruger eksisterende Base44/KlubAdmin flow.
