import fs from 'fs';
import path from 'path';
import { parseOwnerBrandingBody } from '../supabase/functions/_shared/ownerBranding';

const ownerAccountId = '22222222-2222-4222-8222-222222222222';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260708170000_owner_brand_profiles.sql'
);
const sharedFunctionPath = path.join(process.cwd(), 'supabase/functions/_shared/ownerBranding.ts');
const edgeFunctionPath = path.join(process.cwd(), 'supabase/functions/manageOwnerBranding/index.ts');
const servicePath = path.join(process.cwd(), 'services/ownerBrandingService.ts');
const uploadPath = path.join(process.cwd(), 'utils/ownerBrandAssetUpload.ts');
const mobileCrmPath = path.join(process.cwd(), 'app/(tabs)/player-crm.tsx');
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-branding-prompt.md');

describe('owner coach branding contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const sharedFunction = fs.readFileSync(sharedFunctionPath, 'utf8');
  const edgeFunction = fs.readFileSync(edgeFunctionPath, 'utf8');
  const service = fs.readFileSync(servicePath, 'utf8');
  const upload = fs.readFileSync(uploadPath, 'utf8');
  const mobileCrm = fs.readFileSync(mobileCrmPath, 'utf8');
  const base44Prompt = fs.readFileSync(base44PromptPath, 'utf8');

  it('creates owner-scoped brand profiles and public-safe landing data', () => {
    expect(migration).toContain('create table if not exists public.owner_brand_profiles');
    expect(migration).toContain('owner_account_id uuid primary key references public.owner_accounts(id)');
    expect(migration).toContain('display_name text not null');
    expect(migration).toContain('brand_colors jsonb not null');
    expect(migration).toContain('create or replace function public.get_public_owner_brand_profile');
    expect(migration).toContain('where obp.is_public is true');
    expect(migration).toContain("and oa.status = 'active'");
    expect(migration).not.toContain("'ownerAccountId', obp.owner_account_id");
  });

  it('protects private brand settings and owner-scopes asset uploads', () => {
    expect(migration).toContain('alter table public.owner_brand_profiles enable row level security');
    expect(migration).toContain('owner_brand_profiles_public_read');
    expect(migration).toContain('owner_brand_profiles_member_read');
    expect(migration).toContain('owner_brand_profiles_editor_insert');
    expect(migration).toContain('owner_brand_profiles_editor_update');
    expect(migration).toContain("values ('owner-brand-assets', 'owner-brand-assets', true)");
    expect(migration).toContain('public.owner_brand_asset_owner_id(name)');
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("array['owner', 'admin', 'coach']");
  });

  it('parses get and upsert Edge Function payloads', () => {
    expect(
      parseOwnerBrandingBody({
        action: 'get',
        ownerAccountId,
      })
    ).toEqual({
      action: 'get',
      ownerAccountId,
    });

    const profile = {
      displayName: ' FC Test ',
      slug: 'fc-test',
      brandColors: { primary: '#2563eb', accent: '#16a34a' },
      isPublic: true,
    };

    expect(
      parseOwnerBrandingBody({
        action: 'upsert',
        ownerAccountId,
        profile,
      })
    ).toEqual({
      action: 'upsert',
      ownerAccountId,
      profile,
    });

    expect(() => parseOwnerBrandingBody({ action: 'delete', ownerAccountId })).toThrow('action must be get or upsert');
  });

  it('keeps writes behind the service-backed owner branding function', () => {
    expect(sharedFunction).toContain("const BRAND_EDITOR_ROLES = ['owner', 'admin', 'coach']");
    expect(sharedFunction).toContain("const BRAND_READER_ROLES = ['owner', 'admin', 'coach', 'assistant_coach']");
    expect(sharedFunction).toContain('upsertOwnerBrandingAction');
    expect(edgeFunction).toContain('requireAuthContext');
    expect(edgeFunction).toContain('ownerBrandingAction');
    expect(service).toContain("supabase.functions.invoke('manageOwnerBranding'");
    expect(service).toContain('fetchOwnerBranding');
    expect(service).toContain('saveOwnerBranding');
  });

  it('documents Base44 reuse, owner scope, storage and web/mobile parity', () => {
    expect(base44Prompt).toContain('Base44/KlubAdmin');
    expect(base44Prompt).toContain('Byg ikke en ny portal');
    expect(base44Prompt).toContain('owner_account_id');
    expect(base44Prompt).toContain('Branding ligger paa `OwnerAccount`');
    expect(base44Prompt).toContain('manageOwnerBranding');
    expect(base44Prompt).toContain('get_public_owner_brand_profile');
    expect(base44Prompt).toContain('owner-brand-assets');
    expect(base44Prompt).toContain('Web og mobil skal kunne redigere de samme');
    expect(base44Prompt).toContain('Service-role key maa aldrig ligge i Base44/browseren');
    expect(base44Prompt).toContain('Public landing maa ikke vise interne owner ids');
  });

  it('adds mobile brand management to the existing CRM owner workspace', () => {
    expect(mobileCrm).toContain("type CrmTab = 'players' | 'teams' | 'tags' | 'brand'");
    expect(mobileCrm).toContain('BrandSettingsPanel');
    expect(mobileCrm).toContain("{ value: 'brand', label: 'Brand'");
    expect(mobileCrm).toContain('testID={`playerCrm.tab.${tab.value}`}');
    expect(mobileCrm).toContain('playerCrm.brandTab');
    expect(mobileCrm).toContain('saveOwnerBranding');
    expect(mobileCrm).toContain('pickAndUploadOwnerBrandAsset');
    expect(upload).toContain("const OWNER_BRAND_BUCKET = 'owner-brand-assets'");
    expect(upload).toContain('`${ownerAccountId}/${fileName}`');
  });
});
