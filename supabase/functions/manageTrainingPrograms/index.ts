import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { AppError, optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ['owner', 'admin', 'coach', 'assistant_coach'];
const STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const PROGRAM_LEVELS = new Set(['all', 'beginner', 'intermediate', 'advanced', 'elite']);

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('VALIDATION_ERROR', 'Invalid request body.', 400);
  return value as Record<string, any>;
}
function uuid(value: unknown, name: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppError('VALIDATION_ERROR', `${name} must be a UUID.`, 400);
  return value;
}
function text(value: unknown, name: string, required = false): string | null {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new AppError('VALIDATION_ERROR', `${name} is required.`, 400);
  return result || null;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new AppError('VALIDATION_ERROR', `${name} is out of range.`, 400);
  return result;
}
async function assertStaff(client: any, userId: string, ownerAccountId: string) {
  const { data, error } = await client.rpc('get_owner_account_roles', { p_owner_account_id: ownerAccountId, p_user_id: userId });
  if (error) throw new AppError('INTERNAL_ERROR', error.message, 500);
  const roles = Array.isArray(data) ? data : [];
  if (!roles.some((role) => STAFF_ROLES.includes(role))) throw new AppError('FORBIDDEN', 'You do not have coach access to this owner.', 403);
  return roles;
}
async function loadProgram(client: any, ownerAccountId: string, programId: string) {
  const [{ data: program, error }, { data: phases }, { data: items }] = await Promise.all([
    client.from('training_programs').select('*').eq('owner_account_id', ownerAccountId).eq('id', programId).maybeSingle(),
    client.from('program_phases').select('*').eq('owner_account_id', ownerAccountId).eq('program_id', programId).order('sort_order'),
    client.from('program_items').select('*').eq('owner_account_id', ownerAccountId).eq('program_id', programId).order('day_offset').order('sort_order'),
  ]);
  if (error) throw new AppError('INTERNAL_ERROR', error.message, 500);
  if (!program) throw new AppError('TRAINING_PROGRAM_NOT_FOUND', 'Training program not found.', 404);
  return { ...program, phases: phases ?? [], items: items ?? [] };
}
async function payload(client: any, ownerAccountId: string) {
  const { data: owner } = await client.from('owner_accounts').select('id,name,owner_type,status,club_id').eq('id', ownerAccountId).single();
  const [{ data: programs }, { data: enrollments }, { data: players }, teamsResult] = await Promise.all([
    client.from('training_programs').select('*').eq('owner_account_id', ownerAccountId).order('updated_at', { ascending: false }),
    client.from('program_enrollments').select('*').eq('owner_account_id', ownerAccountId).order('created_at', { ascending: false }),
    client.from('owner_players').select('player_id,status').eq('owner_account_id', ownerAccountId).eq('status', 'active'),
    owner?.club_id ? client.from('teams').select('id,name').eq('club_id', owner.club_id).order('name') : Promise.resolve({ data: [] }),
  ]);
  const details = await Promise.all((programs ?? []).map((p: any) => loadProgram(client, ownerAccountId, p.id)));
  return { owner, programs: details, enrollments: enrollments ?? [], players: players ?? [], teams: teamsResult.data ?? [] };
}
async function upsert(client: any, userId: string, body: Record<string, any>) {
  const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
  await assertStaff(client, userId, ownerAccountId);
  const programId = body.programId ? uuid(body.programId, 'programId') : crypto.randomUUID();
  const existing = body.programId ? await loadProgram(client, ownerAccountId, programId) : null;
  if (existing && existing.status !== 'draft') throw new AppError('VALIDATION_ERROR', 'Published or archived programs cannot be edited. Duplicate it to create a new draft.', 409);
  const durationWeeks = integer(body.durationWeeks, 'durationWeeks', 1, 52);
  const phases = Array.isArray(body.phases) ? body.phases : [];
  const items = Array.isArray(body.items) ? body.items : [];
  const title = text(body.title, 'title', true);
  const level = text(body.level, 'level') ?? 'all';
  if (!PROGRAM_LEVELS.has(level)) throw new AppError('VALIDATION_ERROR', 'level must be all, beginner, intermediate, advanced or elite.', 400);
  const phaseRows = phases.map((raw: unknown, index: number) => {
    const p = record(raw); return { id: p.id && UUID.test(p.id) ? p.id : crypto.randomUUID(), owner_account_id: ownerAccountId, program_id: programId,
      title: text(p.title, 'phase.title', true), description: text(p.description, 'phase.description'), week_offset: integer(p.weekOffset ?? index, 'phase.weekOffset', 0, 51),
      duration_weeks: integer(p.durationWeeks ?? 1, 'phase.durationWeeks', 1, 52), sort_order: index };
  });
  if (phaseRows.some((phase: any) => phase.week_offset + phase.duration_weeks > durationWeeks)) {
    throw new AppError('VALIDATION_ERROR', 'Every phase must fit inside the program duration.', 400);
  }
  const phaseIds = new Set(phaseRows.map((p: any) => p.id));
  const itemRows = items.map((raw: unknown, index: number) => { const item = record(raw); const phaseId = item.phaseId && phaseIds.has(item.phaseId) ? item.phaseId : null;
    return { owner_account_id: ownerAccountId, program_id: programId, phase_id: phaseId, item_type: text(item.itemType, 'item.itemType', true),
      training_template_id: item.trainingTemplateId ? uuid(item.trainingTemplateId, 'item.trainingTemplateId') : null, title: text(item.title, 'item.title', true),
      description: text(item.description, 'item.description'), day_offset: integer(item.dayOffset ?? 0, 'item.dayOffset', 0, durationWeeks * 7 - 1), sort_order: index,
      config: item.config && typeof item.config === 'object' ? item.config : {} }; });
  const templateIds = [...new Set(itemRows.map((item: any) => item.training_template_id).filter(Boolean))];
  if (templateIds.length) {
    const { data: ownedTemplates, error: templateError } = await client.from('training_templates').select('id').eq('owner_account_id', ownerAccountId).in('id', templateIds);
    if (templateError) throw new AppError('INTERNAL_ERROR', templateError.message, 500);
    if ((ownedTemplates ?? []).length !== templateIds.length) throw new AppError('FORBIDDEN', 'Every selected template must belong to this owner.', 403);
  }
  const { error } = await client.from('training_programs').upsert({
    id: programId, owner_account_id: ownerAccountId, title, description: text(body.description, 'description'),
    audience: text(body.audience, 'audience'), level, duration_weeks: durationWeeks,
    status: 'draft', created_by: existing?.created_by ?? userId, updated_by: userId,
  });
  if (error) throw new AppError('INTERNAL_ERROR', error.message, 500);
  await client.from('program_items').delete().eq('owner_account_id', ownerAccountId).eq('program_id', programId);
  await client.from('program_phases').delete().eq('owner_account_id', ownerAccountId).eq('program_id', programId);
  if (phaseRows.length) { const result = await client.from('program_phases').insert(phaseRows); if (result.error) throw new AppError('INTERNAL_ERROR', result.error.message, 500); }
  if (itemRows.length) { const result = await client.from('program_items').insert(itemRows); if (result.error) throw new AppError('INTERNAL_ERROR', result.error.message, 500); }
  return payload(client, ownerAccountId);
}
async function publish(client: any, userId: string, ownerAccountId: string, programId: string) {
  await assertStaff(client, userId, ownerAccountId);
  const program = await loadProgram(client, ownerAccountId, programId);
  if (program.status !== 'draft') throw new AppError('VALIDATION_ERROR', 'Only draft programs can be published.', 409);
  if (!program.phases.length || !program.items.length) throw new AppError('VALIDATION_ERROR', 'Add at least one phase and one program item before publishing.', 400);
  const version = program.published_version + 1;
  const { error } = await client.from('program_versions').insert({ owner_account_id: ownerAccountId, program_id: programId, version_number: version, snapshot: program, created_by: userId });
  if (error) throw new AppError('INTERNAL_ERROR', error.message, 500);
  await client.from('training_programs').update({ status: 'published', published_version: version, published_at: new Date().toISOString(), updated_by: userId }).eq('id', programId);
  return payload(client, ownerAccountId);
}

async function materializeSessionTemplate(client: any, enrollmentItem: any, programItem: any, playerId: string, scheduledDate: string) {
  if (programItem.item_type !== 'session_template' || !programItem.training_template_id) return;
  const [{ data: template }, { data: templateItems }] = await Promise.all([
    client.from('training_templates').select('id,title,default_activity_category_id').eq('id', programItem.training_template_id).eq('template_type', 'session').maybeSingle(),
    client.from('training_template_items').select('*').eq('template_id', programItem.training_template_id).order('sort_order'),
  ]);
  if (!template) return;
  const { data: activity, error } = await client.from('activities').insert({
    user_id: playerId, player_id: playerId, title: template.title, activity_date: scheduledDate,
    category_id: template.default_activity_category_id, is_external: false,
  }).select('id').single();
  if (error) throw new AppError('INTERNAL_ERROR', `Could not materialize program activity: ${error.message}`, 500);
  const tasks = (templateItems ?? []).filter((item: any) => item.item_type === 'task_template' || item.item_type === 'exercise').map((item: any) => {
    const config = item.config?.task ?? {}; return { activity_id: activity.id, title: item.title, description: item.description ?? '', completed: false,
      reminder_minutes: config.reminderMinutes ?? null, task_template_id: item.source_task_template_id ?? null, training_template_id: item.linked_template_id ?? null };
  });
  if (tasks.length) { const result = await client.from('activity_tasks').insert(tasks); if (result.error) throw new AppError('INTERNAL_ERROR', `Could not materialize program tasks: ${result.error.message}`, 500); }
  await client.from('program_enrollment_items').update({ activity_id: activity.id }).eq('id', enrollmentItem.id);
}
async function enroll(client: any, userId: string, body: Record<string, any>) {
  const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId'); const programId = uuid(body.programId, 'programId');
  await assertStaff(client, userId, ownerAccountId);
  const program = await loadProgram(client, ownerAccountId, programId);
  if (program.status !== 'published') throw new AppError('VALIDATION_ERROR', 'Only published programs can be enrolled.', 409);
  const startDate = text(body.startDate, 'startDate', true)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new AppError('VALIDATION_ERROR', 'startDate must use YYYY-MM-DD.', 400);
  let playerIds = Array.isArray(body.playerIds) ? body.playerIds.map((id: unknown) => uuid(id, 'playerId')) : [];
  const teamId = body.teamId ? uuid(body.teamId, 'teamId') : null;
  if (teamId) {
    const { data: owner } = await client.from('owner_accounts').select('club_id').eq('id', ownerAccountId).single();
    const { data: team } = owner?.club_id ? await client.from('teams').select('id').eq('id', teamId).eq('club_id', owner.club_id).maybeSingle() : { data: null };
    if (!team) throw new AppError('FORBIDDEN', 'The selected team does not belong to this owner.', 403);
    const { data } = await client.from('team_members').select('player_id').eq('team_id', teamId); playerIds.push(...(data ?? []).map((m: any) => m.player_id));
  }
  playerIds = [...new Set(playerIds)];
  if (!playerIds.length) throw new AppError('VALIDATION_ERROR', 'Select at least one player or team.', 400);
  const { data: allowed } = await client.from('owner_players').select('player_id').eq('owner_account_id', ownerAccountId).eq('status', 'active').in('player_id', playerIds);
  if ((allowed ?? []).length !== playerIds.length) throw new AppError('FORBIDDEN', 'Every selected player must be active in this owner.', 403);
  const { data: version } = await client.from('program_versions').select('id,snapshot').eq('program_id', programId).eq('version_number', program.published_version).single();
  for (const playerId of playerIds) {
    const { data: enrollment, error } = await client.from('program_enrollments').insert({ owner_account_id: ownerAccountId, program_id: programId, program_version_id: version.id, player_id: playerId, source_team_id: teamId, start_date: startDate, enrolled_by: userId }).select('id').single();
    if (error) throw new AppError('VALIDATION_ERROR', error.message.includes('duplicate') ? 'This player is already enrolled for that start date.' : error.message, 409);
    const base = new Date(`${startDate}T00:00:00Z`);
    const rows = program.items.map((item: any) => { const date = new Date(base); date.setUTCDate(date.getUTCDate() + item.day_offset); return { owner_account_id: ownerAccountId, enrollment_id: enrollment.id, program_item_id: item.id, player_id: playerId, scheduled_date: date.toISOString().slice(0, 10), item_type: item.item_type, title: item.title, snapshot: item }; });
    if (rows.length) {
      const { data: inserted, error: itemError } = await client.from('program_enrollment_items').insert(rows).select('*');
      if (itemError) throw new AppError('INTERNAL_ERROR', itemError.message, 500);
      for (let index = 0; index < (inserted ?? []).length; index += 1) {
        await materializeSessionTemplate(client, inserted[index], program.items[index], playerId, inserted[index].scheduled_date);
      }
    }
  }
  return payload(client, ownerAccountId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const { serviceClient: client, userId } = await requireAuthContext(req); const body = record(await readJsonBody(req)); const action = text(body.action, 'action', true);
    if (action === 'playerMine') {
      const { data, error } = await client.from('program_enrollments').select('*, training_programs(title,description,duration_weeks), program_enrollment_items(*)').eq('player_id', userId).order('start_date', { ascending: false });
      if (error) throw new AppError('INTERNAL_ERROR', error.message, 500); return successResponse({ enrollments: data ?? [] });
    }
    const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
    if (action === 'list') { await assertStaff(client, userId, ownerAccountId); return successResponse(await payload(client, ownerAccountId)); }
    if (action === 'upsert') return successResponse(await upsert(client, userId, body));
    if (action === 'publish') return successResponse(await publish(client, userId, ownerAccountId, uuid(body.programId, 'programId')));
    if (action === 'enroll') return successResponse(await enroll(client, userId, body));
    if (action === 'setEnrollmentStatus') { await assertStaff(client, userId, ownerAccountId); const status = text(body.status, 'status', true)!; if (!STATUSES.includes(status)) throw new AppError('VALIDATION_ERROR', 'Invalid enrollment status.', 400);
      await client.from('program_enrollments').update({ status, paused_at: status === 'paused' ? new Date().toISOString() : null, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('owner_account_id', ownerAccountId).eq('id', uuid(body.enrollmentId, 'enrollmentId')); return successResponse(await payload(client, ownerAccountId)); }
    if (action === 'archive') { await assertStaff(client, userId, ownerAccountId); await client.from('training_programs').update({ status: 'archived', archived_at: new Date().toISOString(), updated_by: userId }).eq('owner_account_id', ownerAccountId).eq('id', uuid(body.programId, 'programId')); return successResponse(await payload(client, ownerAccountId)); }
    throw new AppError('VALIDATION_ERROR', 'Unsupported action.', 400);
  } catch (error) { return responseFromError(error); }
});
