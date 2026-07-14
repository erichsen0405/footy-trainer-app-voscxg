import fs from 'fs';
import path from 'path';
import { FunctionsHttpError } from '@supabase/functions-js';
import {
  applyOwnerBulkAssignments,
  createOwnerBulkAssignmentIdempotencyKey,
  fetchOwnerBulkAssignmentBatchDetail,
  fetchOwnerBulkAssignmentContext,
  isOwnerBulkAssignmentPreviewStaleError,
  OWNER_BULK_ASSIGNMENTS_API_VERSION,
  OwnerBulkAssignmentError,
  previewOwnerBulkAssignments,
  rollbackOwnerBulkAssignmentBatch,
  type OwnerBulkAssignmentApplyInput,
  type OwnerBulkAssignmentPreview,
} from '@/services/ownerBulkAssignments';
import {
  ownerBulkFilterMatches,
  resolveOwnerBulkRecipients,
  type OwnerBulkRecipientCommand,
  type OwnerBulkRosterPlayer,
} from '../supabase/functions/_shared/ownerBulkRecipientResolution';

const mockInvoke = jest.fn();

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

const ownerAccountId = '11111111-1111-4111-8111-111111111111';
const playerId = '22222222-2222-4222-8222-222222222222';
const contentId = '33333333-3333-4333-8333-333333333333';
const batchId = '44444444-4444-4444-8444-444444444444';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const compact = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const bulkScreen = read('app/bulk-assignment.tsx');
const sqlStatements = (sql: string) =>
  sql
    .split(';')
    .map(compact)
    .filter(Boolean);

function sqlFunctionNames(sql: string): string[] {
  const chunks = sql.split(/(?=create\s+or\s+replace\s+function\s+public\.)/gi);
  return chunks.flatMap((chunk) => {
    const match = chunk.match(
      /^create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/i,
    );
    return match ? [match[1].toLowerCase()] : [];
  });
}

function securityDefinerFunctionNames(sql: string): string[] {
  return sqlFunctionNames(sql).filter((name) =>
    /\bsecurity\s+definer\b/i.test(sqlFunctionDefinition(sql, name)),
  );
}

function sqlFunctionDefinition(sql: string, functionName: string): string {
  const normalized = compact(sql);
  const marker = `create or replace function public.${functionName}(`;
  const start = normalized.indexOf(marker);
  if (start < 0) return '';
  const rest = normalized.slice(start + marker.length);
  const next = rest.search(/create or replace function public\.[a-z0-9_]+\s*\(/);
  return next < 0 ? normalized.slice(start) : normalized.slice(start, start + marker.length + next);
}

function expectServiceRoleOnlyFunction(sql: string, functionName: string) {
  const statements = sqlStatements(sql);
  const revokes = statements.filter(
    (statement) =>
      statement.includes('revoke all on function ') &&
      statement.includes(`public.${functionName}(`),
  );
  const grants = statements.filter(
    (statement) =>
      statement.includes('grant execute on function ') &&
      statement.includes(`public.${functionName}(`),
  );
  const grant = grants.join(' ');

  expect(revokes.length).toBeGreaterThan(0);
  for (const role of ['public', 'anon', 'authenticated']) {
    expect(revokes.some((statement) => new RegExp(`\\bfrom\\b[^;]*\\b${role}\\b`).test(statement))).toBe(
      true,
    );
  }
  expect(grants.length).toBeGreaterThan(0);
  expect(grant).toMatch(/\bto\s+service_role\b/);
}

const preview: OwnerBulkAssignmentPreview = {
  apiVersion: 1,
  ownerAccountId,
  operation: 'assign',
  content: { type: 'activity', id: contentId, title: 'Finishing' },
  previewToken: 'signed-preview-token',
  expiresAt: '2026-07-13T12:05:00.000Z',
  summary: {
    matched: 1,
    included: 1,
    excluded: 0,
    duplicates: 0,
    conflicts: 0,
    willCreate: 1,
    willUpdate: 0,
    willRemove: 0,
  },
  recipients: [{ playerId, name: 'Test Player', reasons: ['direct'], status: 'create' }],
  excluded: [],
  conflicts: [],
};

const previewInput = {
  ownerAccountId,
  operation: 'assign' as const,
  content: { type: 'activity' as const, id: contentId },
  playerIds: [playerId],
  filters: [{ field: 'position' as const, values: ['Striker'] }],
  exclusions: { teamIds: ['55555555-5555-4555-8555-555555555555'] },
  assignment: { activityDate: '2026-07-20', activityTime: '17:30:00' },
};

describe('owner bulk assignment service contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pins API version 1 and creates scoped idempotency keys', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_721_000_000_000);
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.123456789);

    expect(OWNER_BULK_ASSIGNMENTS_API_VERSION).toBe(1);
    expect(createOwnerBulkAssignmentIdempotencyKey('apply')).toMatch(
      /^owner-bulk-apply-[a-z0-9]+-[a-z0-9]{1,10}$/,
    );
    expect(createOwnerBulkAssignmentIdempotencyKey('rollback')).toMatch(
      /^owner-bulk-rollback-[a-z0-9]+-[a-z0-9]{1,10}$/,
    );

    now.mockRestore();
    random.mockRestore();
  });

  it('opens contextual card assignments directly on the audience step', () => {
    expect(bulkScreen).toContain('isContentType(routeContentType) && routeContentId ? 1 : 0');
    expect(bulkScreen).toContain('if (!routeContentExists) setStep(0)');
  });

  it('invokes context with an optional OwnerAccount selection', async () => {
    mockInvoke.mockResolvedValue({
      data: { success: true, data: { apiVersion: 1, workspaces: [] } },
      error: null,
    });

    await expect(fetchOwnerBulkAssignmentContext(ownerAccountId)).resolves.toMatchObject({
      apiVersion: 1,
    });
    expect(mockInvoke).toHaveBeenLastCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'context', ownerAccountId },
    });

    await fetchOwnerBulkAssignmentContext(null);
    expect(mockInvoke).toHaveBeenLastCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'context' },
    });
  });

  it('forwards the complete owner-scoped preview contract and unwraps success data', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, data: preview }, error: null });

    await expect(previewOwnerBulkAssignments(previewInput)).resolves.toEqual(preview);
    expect(mockInvoke).toHaveBeenCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'preview', ...previewInput },
    });
  });

  it('only requests the entire owner roster through an explicit include-all flag', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, data: preview }, error: null });
    const includeAllInput = {
      ownerAccountId,
      operation: 'assign' as const,
      content: { type: 'activity' as const, id: contentId },
      includeAllPlayers: true,
    };

    await previewOwnerBulkAssignments(includeAllInput);
    expect(mockInvoke).toHaveBeenCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'preview', ...includeAllInput },
    });
  });

  it('requires the preview token and caller idempotency key in apply requests', async () => {
    const input: OwnerBulkAssignmentApplyInput = {
      ...previewInput,
      previewToken: preview.previewToken,
      idempotencyKey: 'apply-command-287',
    };
    const result = {
      apiVersion: 1,
      batch: {
        batchId,
        ownerAccountId,
        status: 'applied',
        operation: 'assign',
        content: previewInput.content,
        summary: {
          matched: 1,
          included: 1,
          excluded: 0,
          duplicates: 0,
          conflicts: 0,
          created: 1,
          updated: 0,
          removed: 0,
          skipped: 0,
          failed: 0,
        },
        createdAt: '2026-07-13T12:00:00.000Z',
        appliedAt: '2026-07-13T12:00:00.000Z',
      },
      items: [],
    };
    mockInvoke.mockResolvedValue({ data: result, error: null });

    await expect(applyOwnerBulkAssignments(input)).resolves.toEqual(result);
    expect(mockInvoke).toHaveBeenCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'apply', ...input },
    });
  });

  it('keeps batch detail and rollback owner-scoped and generates rollback idempotency', async () => {
    mockInvoke.mockResolvedValue({ data: { apiVersion: 1 }, error: null });

    await fetchOwnerBulkAssignmentBatchDetail({ ownerAccountId, batchId });
    expect(mockInvoke).toHaveBeenLastCalledWith('manageOwnerBulkAssignments', {
      body: { action: 'batchDetail', ownerAccountId, batchId },
    });

    await rollbackOwnerBulkAssignmentBatch({ ownerAccountId, batchId });
    expect(mockInvoke).toHaveBeenLastCalledWith('manageOwnerBulkAssignments', {
      body: {
        action: 'rollback',
        ownerAccountId,
        batchId,
        idempotencyKey: expect.stringMatching(/^owner-bulk-rollback-/),
      },
    });

    await rollbackOwnerBulkAssignmentBatch({
      ownerAccountId,
      batchId,
      idempotencyKey: 'rollback-command-287',
    });
    expect(mockInvoke).toHaveBeenLastCalledWith('manageOwnerBulkAssignments', {
      body: {
        action: 'rollback',
        ownerAccountId,
        batchId,
        idempotencyKey: 'rollback-command-287',
      },
    });
  });

  it('preserves structured stale-preview errors from non-2xx Edge responses', async () => {
    const error = new FunctionsHttpError({
      status: 409,
      clone: () => ({
        json: async () => ({
          error: {
            code: 'BULK_PREVIEW_STALE',
            message: 'Recipients changed after preview.',
            details: { retryPreview: true },
          },
        }),
      }),
    });
    mockInvoke.mockResolvedValue({ data: null, error });

    let caught: unknown;
    try {
      await applyOwnerBulkAssignments({
        ...previewInput,
        previewToken: preview.previewToken,
        idempotencyKey: 'apply-command-stale',
      });
    } catch (invokeError) {
      caught = invokeError;
    }

    expect(caught).toBeInstanceOf(OwnerBulkAssignmentError);
    expect(caught).toMatchObject({
      name: 'OwnerBulkAssignmentError',
      code: 'BULK_PREVIEW_STALE',
      status: 409,
      message: 'Recipients changed after preview.',
      details: { retryPreview: true },
    });
    expect(isOwnerBulkAssignmentPreviewStaleError(caught)).toBe(true);
    expect(isOwnerBulkAssignmentPreviewStaleError(new Error('conflict'))).toBe(false);
    expect(
      isOwnerBulkAssignmentPreviewStaleError(
        new OwnerBulkAssignmentError('stale', { code: 'BULK_PREVIEW_STALE' }),
      ),
    ).toBe(true);
    expect(
      isOwnerBulkAssignmentPreviewStaleError(
        new OwnerBulkAssignmentError('key reused', {
          code: 'IDEMPOTENCY_CONFLICT',
          status: 409,
        }),
      ),
    ).toBe(false);
    expect(
      isOwnerBulkAssignmentPreviewStaleError(
        new OwnerBulkAssignmentError('legacy stale response', { status: 409 }),
      ),
    ).toBe(true);
  });

  it('rejects successful transports carrying a business error envelope', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        success: false,
        error: { code: 'IDEMPOTENCY_CONFLICT', message: 'Key reused for another command.' },
      },
      error: null,
    });

    await expect(previewOwnerBulkAssignments(previewInput)).rejects.toMatchObject({
      name: 'OwnerBulkAssignmentError',
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'Key reused for another command.',
    });
  });
});

describe('owner bulk assignment mobile audience layout', () => {
  const mobileScreen = read('app/bulk-assignment.tsx');

  it('shows recipient filters before the individual player list', () => {
    const includeAllAt = mobileScreen.indexOf('title="All eligible players"');
    const teamFiltersAt = mobileScreen.indexOf('title="Teams"');
    const programEnrollmentAt = mobileScreen.indexOf('title="Program enrollment"');
    const individualPlayersAt = mobileScreen.indexOf('title="Add individual players"');

    expect(includeAllAt).toBeGreaterThan(-1);
    expect(teamFiltersAt).toBeGreaterThan(includeAllAt);
    expect(programEnrollmentAt).toBeGreaterThan(teamFiltersAt);
    expect(individualPlayersAt).toBeGreaterThan(programEnrollmentAt);
  });

  it('only exposes enrollment statuses after a program is selected', () => {
    expect(mobileScreen).toContain('{enrollmentProgramId ? (');
    expect(mobileScreen).toContain('Choose a program to select enrollment statuses.');
    expect(mobileScreen).toContain('setEnrollmentStatuses([]);');
  });
});

describe('owner bulk assignment production recipient resolver', () => {
  const roster: OwnerBulkRosterPlayer[] = [
    {
      playerId: 'player-a',
      name: 'Ada',
      age: 13,
      crmStatus: 'active',
      playingLevel: 'academy',
      positions: ['Striker'],
      tags: [{ id: 'tag-finishing' }],
      teams: [{ id: 'team-red' }],
      programEnrollments: [{ programId: 'program-summer', status: 'active' }],
    },
    {
      playerId: 'player-b',
      name: 'Bo',
      age: 14,
      crmStatus: 'lead',
      playingLevel: 'academy',
      positions: ['Goalkeeper'],
      tags: [{ id: 'tag-keeper' }],
      teams: [{ id: 'team-red' }, { id: 'team-blue' }],
      programEnrollments: [{ programId: 'program-summer', status: 'paused' }],
    },
    {
      playerId: 'player-c',
      name: 'Carl',
      age: 15,
      crmStatus: 'active',
      playingLevel: 'recreational',
      positions: ['Striker', 'Winger'],
      tags: [{ id: 'tag-finishing' }, { id: 'tag-speed' }],
      teams: [{ id: 'team-blue' }],
      programEnrollments: [{ programId: 'program-winter', status: 'active' }],
    },
    {
      playerId: 'player-d',
      name: 'Dina',
      age: null,
      crmStatus: null,
      playingLevel: null,
      positions: [],
      tags: [],
      teams: [],
      programEnrollments: [],
    },
  ];
  const dataset = { roster, teams: [{ id: 'team-red' }, { id: 'team-blue' }] };
  const command = (overrides: Partial<OwnerBulkRecipientCommand>): OwnerBulkRecipientCommand => ({
    filters: [],
    playerIds: [],
    includeAllPlayers: false,
    exclusions: { playerIds: [], teamIds: [] },
    ...overrides,
  });

  it('unions direct players with team-filter matches and de-duplicates overlap', () => {
    const result = resolveOwnerBulkRecipients(
      command({
        playerIds: ['player-a', 'player-c'],
        filters: [{ field: 'team', values: ['team-red'], operator: 'in', programId: null }],
      }),
      dataset,
    );

    expect(result.matched.map((player) => player.playerId)).toEqual(['player-a', 'player-b', 'player-c']);
    expect(result.included.map((player) => player.playerId)).toEqual(['player-a', 'player-b', 'player-c']);
  });

  it('ORs tag values inside a group and ANDs separate filter groups', () => {
    const result = resolveOwnerBulkRecipients(
      command({
        filters: [
          { field: 'tag', values: ['tag-finishing', 'tag-speed'], operator: 'in', programId: null },
          { field: 'position', values: ['Striker'], operator: 'in', programId: null },
          { field: 'crm_status', values: ['active'], operator: 'in', programId: null },
        ],
      }),
      dataset,
    );

    expect(result.included.map((player) => player.playerId)).toEqual(['player-a', 'player-c']);
  });

  it('applies individual and team exclusions after include-all/direct/filter selection', () => {
    const result = resolveOwnerBulkRecipients(
      command({
        includeAllPlayers: true,
        playerIds: ['player-b'],
        exclusions: { playerIds: ['player-c', 'player-b'], teamIds: ['team-red'] },
      }),
      dataset,
    );

    expect(result.matched).toHaveLength(4);
    expect(result.included.map((player) => player.playerId)).toEqual(['player-d']);
    expect(result.excluded).toEqual([
      { playerId: 'player-a', name: 'Ada', reasons: ['team_exclusion'] },
      { playerId: 'player-b', name: 'Bo', reasons: ['explicit_exclusion', 'team_exclusion'] },
      { playerId: 'player-c', name: 'Carl', reasons: ['explicit_exclusion'] },
    ]);
  });

  it('covers age ranges and owner-scoped program enrollment status', () => {
    expect(ownerBulkFilterMatches(roster[0], {
      field: 'age', values: [12, 14], operator: 'between', programId: null,
    })).toBe(true);
    expect(ownerBulkFilterMatches(roster[2], {
      field: 'age', values: [12, 14], operator: 'between', programId: null,
    })).toBe(false);
    expect(ownerBulkFilterMatches(roster[0], {
      field: 'program_enrollment', values: ['active'], operator: 'in', programId: 'program-summer',
    })).toBe(true);
    expect(ownerBulkFilterMatches(roster[2], {
      field: 'program_enrollment', values: ['active'], operator: 'in', programId: 'program-summer',
    })).toBe(false);
  });

  it('rejects selected players and exclusions outside the owner roster', () => {
    expect(() => resolveOwnerBulkRecipients(command({ playerIds: ['foreign-player'] }), dataset)).toThrow(
      expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 404 }),
    );
    expect(() => resolveOwnerBulkRecipients(command({
      exclusions: { playerIds: ['foreign-player'], teamIds: [] },
    }), dataset)).toThrow(expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 404 }));
    expect(() => resolveOwnerBulkRecipients(command({
      exclusions: { playerIds: [], teamIds: ['foreign-team'] },
    }), dataset)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', status: 400 }));
  });
});

describe('owner bulk assignment backend security contract', () => {
  let migration: string;
  let edge: string;
  let normalizedMigration: string;
  let normalizedEdge: string;

  beforeAll(() => {
    migration = read('supabase/migrations/20260713120000_owner_bulk_assignments.sql');
    edge = read('supabase/functions/manageOwnerBulkAssignments/index.ts');
    normalizedMigration = compact(migration);
    normalizedEdge = compact(edge);
  });

  it('stores owner-scoped immutable template assignments and batch audit rows', () => {
    for (const table of [
      'training_template_assignments',
      'assignment_batches',
      'assignment_batch_items',
    ]) {
      expect(normalizedMigration).toContain(`create table if not exists public.${table}`);
      expect(normalizedMigration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(normalizedMigration).toMatch(
      /assignment_batches[\s\S]*owner_account_id uuid not null references public\.owner_accounts/,
    );
    expect(normalizedMigration).toContain('requested_by uuid not null');
    expect(normalizedMigration).toContain('canonical_request_hash text not null');
    expect(normalizedMigration).toContain('recipient_fingerprint text not null');
    expect(normalizedMigration).toContain('request_payload jsonb not null');
    expect(normalizedMigration).toContain('summary jsonb not null');
    expect(normalizedMigration).toContain(
      'foreign key (owner_account_id, batch_id) references public.assignment_batches(owner_account_id, id)',
    );
    expect(normalizedMigration).toContain('before_snapshot jsonb null');
    expect(normalizedMigration).toContain('after_snapshot jsonb null');
    expect(normalizedMigration).toContain('rollback_status text not null');
  });

  it('owner-scopes legacy activity and exercise assignment targets end to end', () => {
    expect(normalizedMigration).toContain(
      'add column if not exists assignment_owner_account_id uuid null references public.owner_accounts',
    );
    expect(normalizedMigration).toContain(
      'add column if not exists owner_account_id uuid null references public.owner_accounts',
    );
    expect(normalizedMigration).toContain(
      'activities (assignment_owner_account_id, source_activity_id, user_id)',
    );
    expect(normalizedMigration).toContain(
      'exercise_assignments (owner_account_id, exercise_id, player_id)',
    );

    const provenanceGuards = sqlFunctionNames(migration)
      .map((name) => ({ name, source: sqlFunctionDefinition(migration, name) }))
      .filter(({ source }) =>
        /service_role/.test(source) && /auth\.role\s*\(\s*\)|request\.jwt\.claim\.role/.test(source),
      );
    expect(
      provenanceGuards.some(({ source }) => source.includes('assignment_owner_account_id')),
    ).toBe(true);
    expect(
      provenanceGuards.some(({ source }) => source.includes('exercise_assignments') || source.includes('new.owner_account_id')),
    ).toBe(true);
    expect(normalizedMigration).toMatch(
      /create trigger [a-z0-9_]+ before (?:insert or update(?: of [a-z0-9_, ]+)?|update(?: of [a-z0-9_, ]+)? or insert) on public\.activities[\s\S]{0,220}execute function public\.[a-z0-9_]+/,
    );
    expect(normalizedMigration).toMatch(
      /create trigger [a-z0-9_]+ before (?:insert or update(?: of [a-z0-9_, ]+)?|update(?: of [a-z0-9_, ]+)? or insert) on public\.exercise_assignments[\s\S]{0,220}execute function public\.[a-z0-9_]+/,
    );

    const applyRpcName = securityDefinerFunctionNames(migration).find((name) => /apply/.test(name));
    expect(applyRpcName).toBeDefined();
    const applyRpc = sqlFunctionDefinition(migration, applyRpcName!);
    expect(applyRpc).toMatch(/assignment_owner_account_id[\s\S]{0,500}p_owner_account_id/);
    expect(applyRpc).toMatch(/exercise_assignments[\s\S]{0,500}owner_account_id/);
    expect(applyRpc.match(/assignment_owner_account_id/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    const exerciseBranch = applyRpc.slice(
      applyRpc.indexOf("elsif v_item_status is null and p_content_type = 'exercise'"),
      applyRpc.indexOf("elsif v_item_status is null and p_content_type = 'training_template'"),
    );
    expect(exerciseBranch.match(/owner_account_id/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(normalizedEdge).toContain('assignment_owner_account_id');
    expect(normalizedEdge).toMatch(
      /assignment_owner_account_id[\s\S]{0,1200}command\.owneraccountid/,
    );
    expect(normalizedEdge).toMatch(
      /exercise_assignments[\s\S]{0,700}owner_account_id[\s\S]{0,900}command\.owneraccountid/,
    );
  });

  it('supports every approved content type and operation in the persisted contract', () => {
    for (const contentType of ['activity', 'exercise', 'training_template', 'program']) {
      expect(normalizedMigration).toMatch(
        new RegExp(`content_type[\\s\\S]{0,180}'${contentType}'`),
      );
      expect(normalizedEdge).toMatch(
        new RegExp(`(?:content|supported)[\\s\\S]{0,260}'${contentType}'`),
      );
    }
    for (const operation of ['assign', 'update', 'remove']) {
      expect(normalizedMigration).toMatch(
        new RegExp(`operation[\\s\\S]{0,140}'${operation}'`),
      );
      expect(normalizedEdge).toMatch(
        new RegExp(`operation[\\s\\S]{0,220}'${operation}'`),
      );
    }
  });

  it('makes batch commands idempotent per owner and actor', () => {
    expect(normalizedMigration).toContain(
      'on public.assignment_batches (owner_account_id, requested_by, idempotency_key)',
    );
    expect(normalizedMigration).toContain('where idempotency_key is not null');
    const applyRpcName = securityDefinerFunctionNames(migration).find((name) => /apply/.test(name));
    expect(applyRpcName).toBeDefined();
    const applyRpc = sqlFunctionDefinition(migration, applyRpcName!);
    expect(applyRpc).toContain('pg_advisory_xact_lock');
    expect(applyRpc).toMatch(
      /idempotency_key\s*=\s*p_idempotency_key[\s\S]{0,1300}canonical_request_hash/,
    );
    expect(applyRpc).toMatch(
      /canonical_request_hash[\s\S]{0,500}(?:bulk_idempotency_(?:conflict|mismatch)|idempotency_conflict)/,
    );
    const edgeApply = normalizedEdge.slice(
      normalizedEdge.indexOf('async function applyaction'),
      normalizedEdge.indexOf('async function rollbackaction'),
    );
    const replayLookupAt = edgeApply.indexOf("from('assignment_batches')");
    const rebuildPreviewAt = edgeApply.indexOf('await buildpreview');
    expect(replayLookupAt).toBeGreaterThan(0);
    expect(rebuildPreviewAt).toBeGreaterThan(replayLookupAt);
    expect(edgeApply).toContain(".eq('requested_by', userid)");
    expect(edgeApply).toContain(".eq('idempotency_key', idempotencykey)");
    expect(edgeApply).toContain('existingbatch.canonical_request_hash !== canonicalrequesthash');
    expect(edgeApply).toMatch(/return batchdetailpayload[\s\S]{0,300}existingbatch\.id/);
    expect(normalizedEdge).toContain('idempotencykey');
    expect(normalizedEdge).toMatch(
      /idempotency[\s\S]{0,320}(?:conflict|mismatch|canonical_request_hash|requesthash)/,
    );
  });

  it('keeps all cross-user writes and security-definer RPCs service-role-only', () => {
    const statements = sqlStatements(migration);
    const writeRevoke = statements.find(
      (statement) =>
        statement.startsWith('revoke insert, update, delete on ') &&
        statement.includes('public.training_template_assignments') &&
        statement.includes('public.assignment_batches') &&
        statement.includes('public.assignment_batch_items') &&
        statement.endsWith('from authenticated'),
    );
    const serviceWriteGrant = statements.find(
      (statement) =>
        statement.startsWith('grant all on ') &&
        statement.includes('public.training_template_assignments') &&
        statement.includes('public.assignment_batches') &&
        statement.includes('public.assignment_batch_items') &&
        statement.endsWith('to service_role'),
    );
    expect(writeRevoke).toBeDefined();
    expect(serviceWriteGrant).toBeDefined();

    const functionNames = securityDefinerFunctionNames(migration);
    expect(functionNames.length).toBeGreaterThanOrEqual(3);
    for (const functionName of functionNames) {
      expectServiceRoleOnlyFunction(migration, functionName);
    }

    expect(functionNames.some((name) => /apply/.test(name))).toBe(true);
    expect(functionNames.some((name) => /(?:inspect|detail|preview)/.test(name))).toBe(true);
    expect(functionNames.some((name) => /rollback/.test(name))).toBe(true);
  });

  it('protects the Edge entrypoint and authorizes against the union of OwnerAccount roles', () => {
    expect(edge).toMatch(/requireAuthContext\s*\(\s*req\s*\)/);
    expect(normalizedEdge).toContain('get_owner_account_roles');
    for (const role of ['owner', 'admin', 'coach']) {
      expect(normalizedEdge).toMatch(new RegExp(`(?:role|staff)[\\s\\S]{0,180}'${role}'`));
    }
    expect(normalizedEdge).toContain('owneraccountid');
    expect(normalizedEdge).toMatch(/owner_account_id|p_owner_account_id/);
    expect(normalizedEdge).not.toMatch(/body\.clubid|body\.coachaccountid/);
    expect(normalizedEdge).toContain("'club'");
    expect(normalizedEdge).toContain("'private_coach_business'");
  });

  it('requires explicit recipient selection before the full owner roster can be targeted', () => {
    expect(edge).toContain('../_shared/ownerBulkRecipientResolution.ts');
    expect(normalizedEdge).toContain('resolveownerbulkrecipients');
    expect(normalizedEdge).toContain('includeallplayers');
    expect(normalizedEdge).toMatch(/includeallplayers\s*===\s*true|===\s*true[\s\S]{0,80}includeallplayers/);
    expect(normalizedEdge).toMatch(
      /(?:recipient_selection_required|select at least one|choose at least one|includeallplayers)[\s\S]{0,420}(?:filter|playerids|recipient)/,
    );
  });

  it('keeps preview recipient validation aligned with apply-time owner and progress checks', () => {
    expect(normalizedEdge).toContain('activity_task_subtasks');
    expect(normalizedEdge).toMatch(
      /program_enrollment'\s*\?\s*requireuuid\s*\(\s*filter\.programid/,
    );
    expect(normalizedEdge).toContain('team_scope_invalid');
    expect(normalizedEdge).toMatch(
      /requestedsourceteamid[\s\S]{0,1800}!player\.teams\.some\s*\(/,
    );
  });

  it('uses an expiring authenticated preview fingerprint and rejects stale apply requests', () => {
    expect(normalizedEdge).toMatch(/recipientfingerprint|recipient_fingerprint|resolutionfingerprint/);
    expect(normalizedEdge).toMatch(/canonicalrequesthash|canonical_request_hash|requesthash/);
    expect(normalizedEdge).toContain('previewtoken');
    expect(normalizedEdge).toMatch(/crypto\.subtle|hmac|signpreview|verifypreview/);
    expect(normalizedEdge).toMatch(/expiresat|expires_at|preview_ttl/);
    expect(normalizedEdge).toMatch(/actoruserid\s*:\s*userid/);
    expect(normalizedEdge).toMatch(/token\.actoruserid\s*!==\s*userid/);
    expect(normalizedEdge).toContain('bulk_preview_stale');
    expect(normalizedEdge).toMatch(/bulk_preview_stale[\s\S]{0,180}409|409[\s\S]{0,180}bulk_preview_stale/);
  });

  it('routes apply, inspection and rollback through server-side RPCs', () => {
    expect(normalizedEdge).toMatch(/\.rpc\([^)]*(?:owner_bulk[^)]*apply|apply[^)]*owner_bulk)/);
    expect(normalizedEdge).toMatch(
      /\.rpc\([^)]*(?:owner_bulk[^)]*(?:inspect|detail|preview)|(?:inspect|detail|preview)[^)]*owner_bulk)/,
    );
    expect(normalizedEdge).toMatch(/\.rpc\([^)]*(?:owner_bulk[^)]*rollback|rollback[^)]*owner_bulk)/);
    expect(normalizedEdge).toMatch(/action[\s\S]{0,100}'context'/);
    expect(normalizedEdge).toMatch(/action[\s\S]{0,100}'preview'/);
    expect(normalizedEdge).toMatch(/action[\s\S]{0,100}'apply'/);
    expect(normalizedEdge).toMatch(/action[\s\S]{0,100}'batchdetail'/);
    expect(normalizedEdge).toMatch(/action[\s\S]{0,100}'rollback'/);
    expect(normalizedEdge).not.toMatch(
      /\.from\s*\([^)]*\)\s*\.\s*(?:insert|update|upsert|delete)\s*\(/,
    );
  });

  it('keeps source locking row-scoped and immutable version subtasks self-contained', () => {
    const sourceLock = sqlFunctionDefinition(migration, 'owner_bulk_lock_source_state');
    const trainingTemplates = compact(
      read('supabase/functions/_shared/trainingTemplates.ts'),
    );

    expect(normalizedMigration).not.toContain('lock table');
    expect(sourceLock).toContain('for update');
    expect(sourceLock).toContain('public.training_templates');
    expect(sourceLock).toContain('public.template_versions');
    expect(sourceLock).toContain('public.task_templates');
    expect(sourceLock).toContain('public.task_template_subtasks');
    expect(trainingTemplates).toContain('loadversionsnapshotsubtasks');
    expect(trainingTemplates).toContain('tasktemplatesubtaskscaptured: true');
    expect(trainingTemplates).toContain(".from('task_template_subtasks')");
    expect(normalizedEdge).toMatch(
      /!template\.tasktemplatesubtaskscaptured[\s\S]{0,180}!template\.subtasks\.length/,
    );
    expect(normalizedMigration).toContain('tasktemplatesubtaskscaptured');
  });

  it('keeps target-batch previews exact, paged and aligned with apply no-op outcomes', () => {
    const targetBatchLoader = normalizedEdge.slice(
      normalizedEdge.indexOf('async function loadtargetbatchmap'),
      normalizedEdge.indexOf('async function activitystartedmap'),
    );
    const batchDetail = normalizedEdge.slice(
      normalizedEdge.indexOf('async function batchdetailpayload'),
      normalizedEdge.indexOf('function requireidempotencykey'),
    );

    expect(targetBatchLoader).toContain('loadpagedrows');
    expect(targetBatchLoader).toContain(".order('created_at')");
    expect(targetBatchLoader).toContain(".order('id')");
    expect(targetBatchLoader).toContain(".neq('rollback_status', 'rolled_back')");
    expect(batchDetail).toContain('loadpagedrows');
    expect(batchDetail).toContain('loadrowsinchunks');
    expect(normalizedEdge.match(/allplayercandidates\.some/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(normalizedEdge).toContain('activityupdatehaschanges');
    expect(normalizedEdge).toMatch(
      /content\.type === 'exercise'[\s\S]{0,180}operation === 'update'[\s\S]{0,120}status = 'duplicate'/,
    );
  });

  it('treats downstream exercise-template usage as a rollback conflict', () => {
    const dependencyCheck = sqlFunctionDefinition(
      migration,
      'owner_bulk_exercise_template_has_dependencies',
    );
    const rollbackPreview = sqlFunctionDefinition(
      migration,
      'get_owner_bulk_assignment_rollback_preview',
    );
    const itemRestoreState = sqlFunctionDefinition(
      migration,
      'owner_bulk_assignment_item_restore_state',
    );

    expect(dependencyCheck).toContain('public.external_event_tasks');
    expect(dependencyCheck).toContain('feedback_template_id');
    expect(dependencyCheck).toContain('public.activity_tasks');
    expect(itemRestoreState).toContain(
      'owner_bulk_exercise_template_has_dependencies',
    );
    expect(itemRestoreState).toContain('downstream_dependencies');
    expect(rollbackPreview).toContain('owner_bulk_assignment_item_restore_state');
  });

  it('only rolls back unchanged and unstarted materialized targets with an audit outcome', () => {
    const functions = securityDefinerFunctionNames(migration);
    const rollbackPreviewName = functions.find((name) => name === 'get_owner_bulk_assignment_rollback_preview');
    const rollbackRpcName = functions.find((name) => name === 'rollback_owner_bulk_assignment');
    const rollbackItemStateName = functions.find((name) => name === 'owner_bulk_assignment_item_restore_state');
    const applyRpcName = functions.find((name) => /apply/.test(name));
    expect(rollbackPreviewName).toBeDefined();
    expect(rollbackRpcName).toBeDefined();
    expect(rollbackItemStateName).toBeDefined();
    expect(applyRpcName).toBeDefined();

    const rollbackPreviewRpc = sqlFunctionDefinition(migration, rollbackPreviewName!);
    const rollbackRpc = sqlFunctionDefinition(migration, rollbackRpcName!);
    const rollbackItemState = sqlFunctionDefinition(migration, rollbackItemStateName!);
    const applyRpc = sqlFunctionDefinition(migration, applyRpcName!);
    const templateStateSnapshotName = functions.find(
      (name) => /snapshot/.test(name) && /template/.test(name) && /assignment/.test(name),
    );
    const programStateSnapshotName = functions.find(
      (name) => /snapshot/.test(name) && /program/.test(name) && /enrollment/.test(name),
    );
    const exerciseStateSnapshotName = functions.find(
      (name) => /snapshot/.test(name) && /exercise/.test(name) && /assignment/.test(name),
    );
    expect(templateStateSnapshotName).toBeDefined();
    expect(programStateSnapshotName).toBeDefined();
    expect(exerciseStateSnapshotName).toBeDefined();

    const templateStateSnapshot = sqlFunctionDefinition(migration, templateStateSnapshotName!);
    const programStateSnapshot = sqlFunctionDefinition(migration, programStateSnapshotName!);
    const exerciseStateSnapshot = sqlFunctionDefinition(migration, exerciseStateSnapshotName!);
    expect(normalizedMigration).toContain('owner_bulk_activity_started');
    expect(normalizedMigration).toContain('owner_bulk_program_started');
    expect(normalizedMigration).toContain('owner_bulk_template_assignment_started');
    expect(templateStateSnapshot).toContain('materialized_task_ids');
    expect(templateStateSnapshot).toContain('materialized_activity_ids');
    expect(templateStateSnapshot).toContain('public.tasks');
    expect(templateStateSnapshot).toContain('owner_bulk_snapshot_activity');
    expect(programStateSnapshot).toContain('program_enrollment_items');
    expect(programStateSnapshot).toMatch(/task_id[\s\S]{0,1200}activity_id|activity_id[\s\S]{0,1200}task_id/);
    expect(programStateSnapshot).toContain('public.tasks');
    expect(programStateSnapshot).toContain('owner_bulk_snapshot_activity');
    expect(applyRpc).toContain(templateStateSnapshotName!);
    expect(applyRpc).toContain(programStateSnapshotName!);
    expect(rollbackItemState).toContain(templateStateSnapshotName!);
    expect(rollbackItemState).toContain(programStateSnapshotName!);
    expect(rollbackItemState).toContain('after_snapshot');
    expect(rollbackItemState).toMatch(/assignment_changed|player_progress_or_assignment_changed/);
    expect(rollbackItemState).toMatch(
      /before_snapshot\s*->\s*'assignment'[\s\S]{0,900}exercise_id/,
    );
    expect(exerciseStateSnapshot).toContain("'tasktemplate'");
    expect(exerciseStateSnapshot).toContain("'tasktemplatesubtasks'");
    expect(rollbackItemState).toContain("before_snapshot -> 'tasktemplatesubtasks'");
    expect(rollbackRpc).toContain("before_snapshot -> 'tasktemplatesubtasks'");
    expect(rollbackPreviewRpc).toContain(rollbackItemStateName!);
    expect(rollbackRpc).toContain(rollbackItemStateName!);
    expect(rollbackRpc).toContain('p_idempotency_key');
    expect(rollbackRpc).toContain('pg_advisory_xact_lock');
    expect(rollbackRpc).toMatch(/for update|rollback_status\s*=\s*'rolled_back'/);
    expect(rollbackPreviewRpc).toMatch(/'eligible'\s*,\s*v_eligible_count\s*>\s*0/);
    expect(rollbackPreviewRpc).not.toMatch(
      /'eligible'\s*,\s*v_eligible_count\s*>\s*0\s+and\s+v_conflict_count\s*=\s*0/,
    );
    expect(rollbackRpc).toContain('partially_rolled_back');
    expect(normalizedMigration).toContain("rollback_status in ('not_requested', 'eligible', 'rolled_back', 'conflict', 'not_applicable')");
    expect(normalizedMigration).toContain('rolled_back_at');
    expect(normalizedEdge).toMatch(/rollback[\s\S]{0,260}(?:eligible|conflict)/);
  });
});
