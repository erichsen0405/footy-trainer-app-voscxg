import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { AppError, optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';
import { buildProgramEnrollmentTimeline, getProgramItemSchedule } from '../_shared/programEnrollmentPreview.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ['owner', 'admin', 'coach', 'assistant_coach'];
const STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const PROGRAM_LEVELS = new Set(['all', 'beginner', 'intermediate', 'advanced', 'elite']);
const PROGRAM_ITEM_TYPES = new Set(['task_template', 'exercise_template', 'session_template', 'week_template', 'note', 'focus', 'video', 'test']);
const WEEKDAY_INDEX: Record<string, number> = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 };

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
function normalizeWeekday(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const aliases: Record<string, string> = { mon: 'monday', tue: 'tuesday', tues: 'tuesday', wed: 'wednesday', thu: 'thursday', thur: 'thursday', thurs: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
  const candidate = String(value).trim().toLowerCase();
  const normalized = aliases[candidate] ?? candidate;
  if (!(normalized in WEEKDAY_INDEX)) throw new AppError('VALIDATION_ERROR', 'weekday must be Monday, Tuesday, Wednesday, Thursday, Friday, Saturday or Sunday.', 400);
  return normalized;
}
function normalizeProgramItemType(value: unknown): string {
  const raw = text(value, 'item.itemType', true)!;
  const aliases: Record<string, string> = { task: 'task_template', exercise: 'exercise_template', session: 'session_template', week: 'week_template' };
  const normalized = aliases[raw] ?? raw;
  if (!PROGRAM_ITEM_TYPES.has(normalized)) throw new AppError('VALIDATION_ERROR', 'item.itemType is invalid.', 400);
  return normalized;
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
  const items = Array.isArray(body.items) ? body.items : Array.isArray(body.programItems) ? body.programItems : [];
  const title = text(body.title, 'title', true);
  const level = text(body.level, 'level') ?? 'all';
  if (!PROGRAM_LEVELS.has(level)) throw new AppError('VALIDATION_ERROR', 'level must be all, beginner, intermediate, advanced or elite.', 400);
  const phaseIdMap = new Map<string, string>();
  const phaseRows = phases.map((raw: unknown, index: number) => {
    const p = record(raw);
    const clientId = text(p.id ?? p.clientId, 'phase.id') ?? `phase-${index}`;
    const id = UUID.test(clientId) ? clientId : crypto.randomUUID();
    phaseIdMap.set(clientId, id);
    const weekOffset = p.startsInWeek !== undefined
      ? integer(p.startsInWeek, 'phase.startsInWeek', 1, 52) - 1
      : integer(p.weekOffset ?? index, 'phase.weekOffset', 0, 51);
    return { id, owner_account_id: ownerAccountId, program_id: programId,
      title: text(p.title, 'phase.title', true), description: text(p.description, 'phase.description'), week_offset: weekOffset,
      duration_weeks: integer(p.durationWeeks ?? 1, 'phase.durationWeeks', 1, 52), sort_order: index };
  });
  if (phaseRows.some((phase: any) => phase.week_offset + phase.duration_weeks > durationWeeks)) {
    throw new AppError('VALIDATION_ERROR', 'Every phase must fit inside the program duration.', 400);
  }
  const itemRows = items.map((raw: unknown, index: number) => {
    const item = record(raw);
    const clientPhaseId = text(item.phaseId ?? item.phase_id, 'item.phaseId');
    const phaseId = clientPhaseId ? phaseIdMap.get(clientPhaseId) ?? (UUID.test(clientPhaseId) && phaseRows.some((phase: any) => phase.id === clientPhaseId) ? clientPhaseId : null) : null;
    if (!phaseId) throw new AppError('VALIDATION_ERROR', 'Every program item must reference a phase from the same save payload.', 400);
    const phase = phaseRows.find((candidate: any) => candidate.id === phaseId)!;
    const weekday = normalizeWeekday(item.weekday ?? item.dayOfWeek);
    const weekInPhase = weekday ? integer(item.weekInPhase ?? 1, 'item.weekInPhase', 1, phase.duration_weeks) : null;
    const dayOffset = weekday && weekInPhase
      ? phase.week_offset * 7 + (weekInPhase - 1) * 7 + WEEKDAY_INDEX[weekday]
      : integer(item.dayOffset ?? 0, 'item.dayOffset', 0, durationWeeks * 7 - 1);
    const config = item.config && typeof item.config === 'object' && !Array.isArray(item.config) ? { ...item.config } : {};
    config.scheduling = { weekday: weekday ?? Object.keys(WEEKDAY_INDEX)[dayOffset % 7], weekInPhase: weekInPhase ?? Math.max(1, Math.floor((dayOffset - phase.week_offset * 7) / 7) + 1) };
    const itemType = normalizeProgramItemType(item.itemType ?? item.type ?? item.templateType);
    const templateIdValue = item.trainingTemplateId ?? item.templateId ?? item.savedTemplateId;
    const trainingTemplateId = templateIdValue ? uuid(templateIdValue, 'item.trainingTemplateId') : null;
    if (itemType.endsWith('_template') && !trainingTemplateId) throw new AppError('VALIDATION_ERROR', 'Saved task, exercise, session and week items require trainingTemplateId.', 400);
    return { owner_account_id: ownerAccountId, program_id: programId, phase_id: phaseId, item_type: itemType,
      training_template_id: trainingTemplateId, title: text(item.title, 'item.title', true),
      description: text(item.description, 'item.description'), day_offset: dayOffset, sort_order: index, config };
  });
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

async function loadEnrollmentPreview(client: any, userId: string, body: Record<string, any>) {
  const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
  const programId = uuid(body.programId, 'programId');
  const startDate = text(body.startDate, 'startDate', true)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new AppError('VALIDATION_ERROR', 'startDate must use YYYY-MM-DD.', 400);
  await assertStaff(client, userId, ownerAccountId);
  const program = await loadProgram(client, ownerAccountId, programId);

  const { data: ownerPlayers, error: ownerPlayersError } = await client
    .from('owner_players')
    .select('player_id,status')
    .eq('owner_account_id', ownerAccountId)
    .eq('status', 'active');
  if (ownerPlayersError) throw new AppError('INTERNAL_ERROR', ownerPlayersError.message, 500);
  const playerIds = (ownerPlayers ?? []).map((row: any) => row.player_id);
  const [profilesResult, crmResult, ownerResult] = await Promise.all([
    playerIds.length ? client.from('profiles').select('user_id,full_name').in('user_id', playerIds) : Promise.resolve({ data: [], error: null }),
    playerIds.length ? client.from('owner_player_crm_profiles').select('player_id,email').eq('owner_account_id', ownerAccountId).in('player_id', playerIds) : Promise.resolve({ data: [], error: null }),
    client.from('owner_accounts').select('club_id').eq('id', ownerAccountId).single(),
  ]);
  if (profilesResult.error) throw new AppError('INTERNAL_ERROR', profilesResult.error.message, 500);
  if (crmResult.error) throw new AppError('INTERNAL_ERROR', crmResult.error.message, 500);
  if (ownerResult.error) throw new AppError('INTERNAL_ERROR', ownerResult.error.message, 500);
  const profiles = new Map((profilesResult.data ?? []).map((row: any) => [row.user_id, row]));
  const crmProfiles = new Map((crmResult.data ?? []).map((row: any) => [row.player_id, row]));
  const authUsers = new Map<string, any>();
  await Promise.all(playerIds.map(async (playerId: string) => {
    try {
      const { data } = await client.auth.admin.getUserById(playerId);
      if (data?.user) authUsers.set(playerId, data.user);
    } catch {
      // The owner player remains selectable by UUID even if auth metadata lookup fails.
    }
  }));
  const players = playerIds.map((playerId: string) => {
    const profile: any = profiles.get(playerId);
    const crm: any = crmProfiles.get(playerId);
    const authUser = authUsers.get(playerId);
    const metadata = authUser?.user_metadata ?? {};
    return {
      playerId,
      displayName: profile?.full_name || metadata.full_name || metadata.name || crm?.email || authUser?.email || 'Unnamed player',
      email: crm?.email || authUser?.email || null,
      ownerRosterStatus: 'active',
    };
  }).sort((left: any, right: any) => left.displayName.localeCompare(right.displayName));

  let teams: any[] = [];
  if (ownerResult.data?.club_id) {
    const { data: teamRows, error: teamsError } = await client.from('teams').select('id,name').eq('club_id', ownerResult.data.club_id).order('name');
    if (teamsError) throw new AppError('INTERNAL_ERROR', teamsError.message, 500);
    const teamIds = (teamRows ?? []).map((team: any) => team.id);
    const { data: members, error: membersError } = teamIds.length ? await client.from('team_members').select('team_id,player_id').in('team_id', teamIds).in('player_id', playerIds) : { data: [], error: null };
    if (membersError) throw new AppError('INTERNAL_ERROR', membersError.message, 500);
    teams = (teamRows ?? []).map((team: any) => ({ id: team.id, name: team.name, memberCount: (members ?? []).filter((member: any) => member.team_id === team.id).length }));
  }

  return {
    apiVersion: 2,
    ownerAccountId,
    program: buildProgramEnrollmentTimeline(program, startDate),
    startDate,
    players,
    teams,
  };
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
    const rows = program.items.map((item: any) => { const schedule = getProgramItemSchedule(program, startDate, item); return { owner_account_id: ownerAccountId, enrollment_id: enrollment.id, program_item_id: item.id, player_id: playerId, scheduled_date: schedule.scheduledDate, item_type: item.item_type, title: item.title, snapshot: { ...item, resolvedSchedule: schedule } }; });
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
    if (action === 'enrollmentPreview') return successResponse(await loadEnrollmentPreview(client, userId, body));
    if (action === 'upsert') return successResponse(await upsert(client, userId, body));
    if (action === 'publish') return successResponse(await publish(client, userId, ownerAccountId, uuid(body.programId, 'programId')));
    if (action === 'enroll') return successResponse(await enroll(client, userId, body));
    if (action === 'setEnrollmentStatus') { await assertStaff(client, userId, ownerAccountId); const status = text(body.status, 'status', true)!; if (!STATUSES.includes(status)) throw new AppError('VALIDATION_ERROR', 'Invalid enrollment status.', 400);
      await client.from('program_enrollments').update({ status, paused_at: status === 'paused' ? new Date().toISOString() : null, completed_at: status === 'completed' ? new Date().toISOString() : null }).eq('owner_account_id', ownerAccountId).eq('id', uuid(body.enrollmentId, 'enrollmentId')); return successResponse(await payload(client, ownerAccountId)); }
    if (action === 'archive') { await assertStaff(client, userId, ownerAccountId); await client.from('training_programs').update({ status: 'archived', archived_at: new Date().toISOString(), updated_by: userId }).eq('owner_account_id', ownerAccountId).eq('id', uuid(body.programId, 'programId')); return successResponse(await payload(client, ownerAccountId)); }
    if (action === 'delete') {
      await assertStaff(client, userId, ownerAccountId);
      const programId = uuid(body.programId, 'programId');
      await loadProgram(client, ownerAccountId, programId);
      const { count, error: countError } = await client.from('program_enrollments').select('id', { count: 'exact', head: true }).eq('owner_account_id', ownerAccountId).eq('program_id', programId);
      if (countError) throw new AppError('INTERNAL_ERROR', countError.message, 500);
      if ((count ?? 0) > 0) throw new AppError('VALIDATION_ERROR', 'Programs with enrollments cannot be deleted. Archive this program to preserve player history.', 409);
      const { error: deleteError } = await client.from('training_programs').delete().eq('owner_account_id', ownerAccountId).eq('id', programId);
      if (deleteError) throw new AppError('INTERNAL_ERROR', deleteError.message, 500);
      return successResponse(await payload(client, ownerAccountId));
    }
    throw new AppError('VALIDATION_ERROR', 'Unsupported action.', 400);
  } catch (error) { return responseFromError(error); }
});
