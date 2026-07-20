import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { requireAuthContext } from '../_shared/auth.ts';
import { AppError, optionsResponse, readJsonBody, responseFromError, successResponse } from '../_shared/http.ts';
import { buildProgramEnrollmentPlayerPlans, DEFAULT_PROGRAM_ACTIVITY_TIME, readProgramTemplates, serializeProgramTemplates, type ProgramTemplateMaterialization } from '../_shared/programEnrollmentMaterialization.ts';
import { addProgramIsoDays, buildProgramEnrollmentTimeline, getUnassignedProgramItems } from '../_shared/programEnrollmentPreview.ts';
import { buildPlayerProgramExperience } from '../_shared/playerProgramExperience.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ['owner', 'admin', 'coach', 'assistant_coach'];
const STATUSES = ['active', 'paused', 'completed', 'cancelled'];
const PROGRAM_LEVELS = new Set(['all', 'beginner', 'intermediate', 'advanced', 'elite']);
const PROGRAM_ITEM_TYPES = new Set(['task_template', 'exercise_template', 'session_template', 'week_template', 'note', 'focus', 'video', 'test']);
const TEMPLATE_TYPE_BY_PROGRAM_ITEM: Record<string, string> = { task_template: 'task', exercise_template: 'exercise', session_template: 'session', week_template: 'week' };
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

async function loadPlayerProgramExperience(client: any, userId: string) {
  const { data: enrollmentRows, error: enrollmentError } = await client
    .from('program_enrollments')
    .select('id,owner_account_id,program_id,program_version_id,start_date,status,training_programs(title,description,duration_weeks),program_enrollment_items(id,program_item_id,scheduled_date,item_type,title,status,activity_id,task_id)')
    .eq('player_id', userId)
    .order('start_date', { ascending: false });
  if (enrollmentError) throw new AppError('INTERNAL_ERROR', enrollmentError.message, 500);

  const enrollments = enrollmentRows ?? [];
  const ownerIds = [...new Set(enrollments.map((enrollment: any) => enrollment.owner_account_id).filter(Boolean))];
  const items = enrollments.flatMap((enrollment: any) => Array.isArray(enrollment.program_enrollment_items) ? enrollment.program_enrollment_items : []);
  const taskIds = [...new Set(items.map((item: any) => item.task_id).filter(Boolean))];
  const activityIds = [...new Set(items.map((item: any) => item.activity_id).filter(Boolean))];
  const versionIds = [...new Set(enrollments.map((enrollment: any) => enrollment.program_version_id).filter(Boolean))];

  const [ownersResult, brandsResult, tasksResult, activityTasksResult, versionsResult] = await Promise.all([
    ownerIds.length
      ? client.from('owner_accounts').select('id,name,owner_type').in('id', ownerIds).eq('status', 'active')
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? client.from('owner_brand_profiles').select('owner_account_id,display_name,brand_colors,logo_url').in('owner_account_id', ownerIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? client.from('tasks').select('id,title,description,reminder_minutes,category_ids,completed').eq('user_id', userId).in('id', taskIds)
      : Promise.resolve({ data: [], error: null }),
    activityIds.length
      ? client.from('activity_tasks').select('activity_id,completed').in('activity_id', activityIds)
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? client.from('program_versions').select('id,snapshot').in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [ownersResult, brandsResult, tasksResult, activityTasksResult, versionsResult]) {
    if (result.error) throw new AppError('INTERNAL_ERROR', result.error.message, 500);
  }

  const activityCompletion = new Map<string, boolean[]>();
  for (const task of activityTasksResult.data ?? []) {
    const rows = activityCompletion.get(task.activity_id) ?? [];
    rows.push(task.completed === true);
    activityCompletion.set(task.activity_id, rows);
  }
  const completedActivityIds = new Set(
    [...activityCompletion.entries()]
      .filter(([, completed]) => completed.length > 0 && completed.every(Boolean))
      .map(([activityId]) => activityId),
  );
  const now = new Date();
  const versionById = new Map((versionsResult.data ?? []).map((version: any) => [version.id, version]));

  return buildPlayerProgramExperience({
    enrollments: enrollments.map((enrollment: any) => ({
      ...enrollment,
      program_version: versionById.get(enrollment.program_version_id) ?? null,
    })),
    owners: ownersResult.data ?? [],
    brandProfiles: brandsResult.data ?? [],
    taskDetails: tasksResult.data ?? [],
    completedTaskIds: new Set((tasksResult.data ?? []).filter((task: any) => task.completed === true).map((task: any) => task.id)),
    completedActivityIds,
    today: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
  });
}

async function setPlayerProgramItemCompletion(client: any, userId: string, body: Record<string, any>) {
  const itemId = uuid(body.itemId, 'itemId');
  if (typeof body.completed !== 'boolean') throw new AppError('VALIDATION_ERROR', 'completed must be a boolean.', 400);
  const { data: item, error: itemError } = await client
    .from('program_enrollment_items')
    .select('id,player_id,scheduled_date,task_id,activity_id')
    .eq('id', itemId)
    .eq('player_id', userId)
    .maybeSingle();
  if (itemError) throw new AppError('INTERNAL_ERROR', itemError.message, 500);
  if (!item) throw new AppError('TRAINING_PROGRAM_ITEM_NOT_FOUND', 'Program item not found.', 404);
  if (!item.task_id || item.activity_id) throw new AppError('VALIDATION_ERROR', 'Only standalone player tasks can be completed here.', 409);

  const { data: task, error: taskError } = await client
    .from('tasks')
    .update({ completed: body.completed, updated_at: new Date().toISOString() })
    .eq('id', item.task_id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (taskError) throw new AppError('INTERNAL_ERROR', taskError.message, 500);
  if (!task) throw new AppError('TRAINING_PROGRAM_ITEM_NOT_FOUND', 'Linked player task not found.', 404);

  const today = new Date().toISOString().slice(0, 10);
  const { error: statusError } = await client
    .from('program_enrollment_items')
    .update({ status: body.completed ? 'completed' : item.scheduled_date <= today ? 'available' : 'upcoming' })
    .eq('id', item.id)
    .eq('player_id', userId);
  if (statusError) throw new AppError('INTERNAL_ERROR', statusError.message, 500);
  return loadPlayerProgramExperience(client, userId);
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
    if (phaseIdMap.has(clientId)) throw new AppError('VALIDATION_ERROR', 'Every phase ID must be unique in the save payload.', 400);
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
    const { data: ownedTemplates, error: templateError } = await client.from('training_templates').select('id,template_type').eq('owner_account_id', ownerAccountId).in('id', templateIds);
    if (templateError) throw new AppError('INTERNAL_ERROR', templateError.message, 500);
    if ((ownedTemplates ?? []).length !== templateIds.length) throw new AppError('FORBIDDEN', 'Every selected template must belong to this owner.', 403);
    const templateTypeById = new Map((ownedTemplates ?? []).map((template: any) => [template.id, template.template_type]));
    if (itemRows.some((item: any) => item.training_template_id && templateTypeById.get(item.training_template_id) !== TEMPLATE_TYPE_BY_PROGRAM_ITEM[item.item_type])) {
      throw new AppError('VALIDATION_ERROR', 'Every saved program item must match its selected task, exercise, session or week template type.', 400);
    }
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
  const result = await payload(client, ownerAccountId);
  const savedProgram = result.programs.find((program: any) => program.id === programId) ?? await loadProgram(client, ownerAccountId, programId);
  return {
    ...result,
    savedProgramId: programId,
    savedProgram,
    phaseIdMap: Object.fromEntries(phaseIdMap),
  };
}
async function publish(client: any, userId: string, ownerAccountId: string, programId: string) {
  await assertStaff(client, userId, ownerAccountId);
  const program = await loadProgram(client, ownerAccountId, programId);
  if (program.status !== 'draft') throw new AppError('VALIDATION_ERROR', 'Only draft programs can be published.', 409);
  if (!program.phases.length || !program.items.length) throw new AppError('VALIDATION_ERROR', 'Add at least one phase and one program item before publishing.', 400);
  if (getUnassignedProgramItems(program).length) throw new AppError('VALIDATION_ERROR', 'Every program item must be attached to a phase in this program before publishing.', 400);
  const version = program.published_version + 1;
  const templates = await loadProgramTemplateMaterializations(client, ownerAccountId, program);
  const versionSnapshot = {
    ...program,
    enrollmentMaterialization: {
      activityTime: DEFAULT_PROGRAM_ACTIVITY_TIME,
      templates: serializeProgramTemplates(templates),
    },
  };
  const { error } = await client.from('program_versions').insert({ owner_account_id: ownerAccountId, program_id: programId, version_number: version, snapshot: versionSnapshot, created_by: userId });
  if (error) throw new AppError('INTERNAL_ERROR', error.message, 500);
  await client.from('training_programs').update({ status: 'published', published_version: version, published_at: new Date().toISOString(), updated_by: userId }).eq('id', programId);
  return payload(client, ownerAccountId);
}

async function loadProgramTemplateMaterializations(client: any, ownerAccountId: string, program: Record<string, any>) {
  const templateIds = [...new Set((program.items ?? [])
    .filter((item: any) => TEMPLATE_TYPE_BY_PROGRAM_ITEM[item.item_type])
    .map((item: any) => item.training_template_id)
    .filter(Boolean)
    .map(String))];
  const result = new Map<string, ProgramTemplateMaterialization>();
  if (!templateIds.length) return result;

  const [templatesResult, itemsResult] = await Promise.all([
    client.from('training_templates').select('id,title,description,default_activity_category_id,default_activity_category_name,template_type,source_task_template_id,metadata').eq('owner_account_id', ownerAccountId).in('id', templateIds),
    client.from('training_template_items').select('id,template_id,item_type,title,description,source_task_template_id,linked_template_id,config,sort_order').eq('owner_account_id', ownerAccountId).in('template_id', templateIds).order('sort_order'),
  ]);
  if (templatesResult.error) throw new AppError('INTERNAL_ERROR', templatesResult.error.message, 500);
  if (itemsResult.error) throw new AppError('INTERNAL_ERROR', itemsResult.error.message, 500);

  const linkedTemplateIds = [...new Set((itemsResult.data ?? []).map((item: any) => item.linked_template_id).filter(Boolean).map(String))];
  const linkedTemplatesResult = linkedTemplateIds.length
    ? await client.from('training_templates').select('id,template_type,source_task_template_id,metadata').eq('owner_account_id', ownerAccountId).in('id', linkedTemplateIds)
    : { data: [], error: null };
  if (linkedTemplatesResult.error) throw new AppError('INTERNAL_ERROR', linkedTemplatesResult.error.message, 500);
  const linkedTemplates = new Map((linkedTemplatesResult.data ?? []).map((template: any) => [template.id, template]));
  const sourceTaskTemplateIds = [...new Set([
    ...(templatesResult.data ?? []).map((template: any) => template.source_task_template_id),
    ...(itemsResult.data ?? []).map((item: any) => item.source_task_template_id ?? linkedTemplates.get(item.linked_template_id)?.source_task_template_id),
  ].filter(Boolean).map(String))];
  const subtasksResult = sourceTaskTemplateIds.length
    ? await client.from('task_template_subtasks').select('task_template_id,title,sort_order').in('task_template_id', sourceTaskTemplateIds).order('sort_order')
    : { data: [], error: null };
  if (subtasksResult.error) throw new AppError('INTERNAL_ERROR', subtasksResult.error.message, 500);
  const subtasksFor = (taskTemplateId: string | null | undefined) => (subtasksResult.data ?? [])
    .filter((subtask: any) => taskTemplateId && subtask.task_template_id === taskTemplateId)
    .map((subtask: any) => ({ title: subtask.title, sortOrder: subtask.sort_order }));

  for (const templateId of templateIds) {
    const template = (templatesResult.data ?? []).find((candidate: any) => candidate.id === templateId);
    const programItem = (program.items ?? []).find((item: any) => item.training_template_id === templateId);
    const expectedType = TEMPLATE_TYPE_BY_PROGRAM_ITEM[programItem?.item_type];
    if (!template || !expectedType || template.template_type !== expectedType) {
      throw new AppError('VALIDATION_ERROR', 'A saved template used by this published program is unavailable or has the wrong type.', 409);
    }
    result.set(templateId, {
      id: template.id,
      templateType: template.template_type,
      title: template.title,
      description: template.description ?? null,
      defaultActivityCategoryId: template.default_activity_category_id ?? null,
      defaultActivityCategoryName: template.default_activity_category_name ?? null,
      sourceTaskTemplateId: template.source_task_template_id ?? null,
      metadata: template.metadata && typeof template.metadata === 'object' ? template.metadata : {},
      subtasks: subtasksFor(template.source_task_template_id),
      items: (itemsResult.data ?? []).filter((item: any) => item.template_id === templateId).map((item: any) => {
        const linkedTemplate = linkedTemplates.get(item.linked_template_id);
        const config = item.config && typeof item.config === 'object' ? { ...item.config } : {};
        if ((!config.task || typeof config.task !== 'object') && linkedTemplate?.metadata?.task) config.task = linkedTemplate.metadata.task;
        if ((!config.timer || typeof config.timer !== 'object') && linkedTemplate?.metadata?.timer) config.timer = linkedTemplate.metadata.timer;
        const sourceTaskTemplateId = item.source_task_template_id ?? linkedTemplate?.source_task_template_id ?? null;
        return {
          id: item.id,
          itemType: item.item_type,
          title: item.title,
          description: item.description ?? null,
          sourceTaskTemplateId,
          linkedTemplateId: item.linked_template_id ?? null,
          config,
          sortOrder: Number(item.sort_order ?? 0),
          subtasks: subtasksFor(sourceTaskTemplateId),
        };
      }),
    });
  }
  return result;
}

async function loadPlayerDirectory(client: any, ownerAccountId: string, rawPlayerIds: string[]) {
  const playerIds = [...new Set(rawPlayerIds.filter(Boolean))];
  const [profilesResult, crmResult, rosterResult] = await Promise.all([
    playerIds.length ? client.from('profiles').select('user_id,full_name').in('user_id', playerIds) : Promise.resolve({ data: [], error: null }),
    playerIds.length ? client.from('owner_player_crm_profiles').select('player_id,email').eq('owner_account_id', ownerAccountId).in('player_id', playerIds) : Promise.resolve({ data: [], error: null }),
    playerIds.length ? client.from('owner_players').select('player_id,status').eq('owner_account_id', ownerAccountId).in('player_id', playerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (profilesResult.error) throw new AppError('INTERNAL_ERROR', profilesResult.error.message, 500);
  if (crmResult.error) throw new AppError('INTERNAL_ERROR', crmResult.error.message, 500);
  if (rosterResult.error) throw new AppError('INTERNAL_ERROR', rosterResult.error.message, 500);
  const profiles = new Map((profilesResult.data ?? []).map((row: any) => [row.user_id, row]));
  const crmProfiles = new Map((crmResult.data ?? []).map((row: any) => [row.player_id, row]));
  const roster = new Map((rosterResult.data ?? []).map((row: any) => [row.player_id, row.status]));
  const authUsers = new Map<string, any>();
  await Promise.all(playerIds.map(async (playerId: string) => {
    try {
      const { data } = await client.auth.admin.getUserById(playerId);
      if (data?.user) authUsers.set(playerId, data.user);
    } catch {
      // Preserve the player UUID even when optional auth metadata is unavailable.
    }
  }));
  return new Map(playerIds.map((playerId) => {
    const profile: any = profiles.get(playerId);
    const crm: any = crmProfiles.get(playerId);
    const authUser = authUsers.get(playerId);
    const metadata = authUser?.user_metadata ?? {};
    return [playerId, {
      playerId,
      displayName: profile?.full_name || metadata.full_name || metadata.name || crm?.email || authUser?.email || 'Unnamed player',
      email: crm?.email || authUser?.email || null,
      ownerRosterStatus: roster.get(playerId) ?? 'inactive',
    }];
  }));
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
  const [playerDirectory, ownerResult] = await Promise.all([
    loadPlayerDirectory(client, ownerAccountId, playerIds),
    client.from('owner_accounts').select('club_id').eq('id', ownerAccountId).single(),
  ]);
  if (ownerResult.error) throw new AppError('INTERNAL_ERROR', ownerResult.error.message, 500);
  const players = playerIds.map((playerId: string) => ({ ...playerDirectory.get(playerId), ownerRosterStatus: 'active' }))
    .sort((left: any, right: any) => left.displayName.localeCompare(right.displayName));

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

async function loadProgramEnrollments(client: any, userId: string, body: Record<string, any>) {
  const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
  const programId = uuid(body.programId, 'programId');
  await assertStaff(client, userId, ownerAccountId);
  const program = await loadProgram(client, ownerAccountId, programId);
  const { data: enrollmentRows, error: enrollmentError } = await client
    .from('program_enrollments')
    .select('id,program_id,program_version_id,player_id,source_team_id,start_date,status,paused_at,completed_at,created_at,updated_at')
    .eq('owner_account_id', ownerAccountId)
    .eq('program_id', programId)
    .order('created_at', { ascending: false });
  if (enrollmentError) throw new AppError('INTERNAL_ERROR', enrollmentError.message, 500);
  const enrollments = enrollmentRows ?? [];
  const enrollmentIds = enrollments.map((enrollment: any) => enrollment.id);
  const playerIds = enrollments.map((enrollment: any) => enrollment.player_id);
  const teamIds = [...new Set(enrollments.map((enrollment: any) => enrollment.source_team_id).filter(Boolean))];
  const { data: owner, error: ownerError } = await client.from('owner_accounts').select('club_id').eq('id', ownerAccountId).single();
  if (ownerError) throw new AppError('INTERNAL_ERROR', ownerError.message, 500);
  const versionIds = [...new Set(enrollments.map((enrollment: any) => enrollment.program_version_id).filter(Boolean))];
  const [itemsResult, versionsResult, playerDirectory, teamsResult] = await Promise.all([
    enrollmentIds.length
      ? client.from('program_enrollment_items').select('id,enrollment_id,program_item_id,player_id,scheduled_date,item_type,title,status,activity_id,task_id,created_at,updated_at').eq('owner_account_id', ownerAccountId).in('enrollment_id', enrollmentIds).order('scheduled_date').order('created_at')
      : Promise.resolve({ data: [], error: null }),
    versionIds.length
      ? client.from('program_versions').select('id,version_number,snapshot').eq('owner_account_id', ownerAccountId).eq('program_id', programId).in('id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    loadPlayerDirectory(client, ownerAccountId, playerIds),
    teamIds.length && owner?.club_id
      ? client.from('teams').select('id,name').eq('club_id', owner.club_id).in('id', teamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsResult.error) throw new AppError('INTERNAL_ERROR', itemsResult.error.message, 500);
  if (versionsResult.error) throw new AppError('INTERNAL_ERROR', versionsResult.error.message, 500);
  if (teamsResult.error) throw new AppError('INTERNAL_ERROR', teamsResult.error.message, 500);
  const teams = new Map((teamsResult.data ?? []).map((team: any) => [team.id, team.name]));
  const versions = new Map((versionsResult.data ?? []).map((version: any) => [version.id, version]));

  return {
    apiVersion: 1,
    ownerAccountId,
    program: { id: program.id, title: program.title, durationWeeks: Number(program.duration_weeks), status: program.status },
    enrollments: enrollments.map((enrollment: any) => {
      const items = (itemsResult.data ?? []).filter((item: any) => item.enrollment_id === enrollment.id).map((item: any) => ({
        id: item.id,
        programItemId: item.program_item_id,
        scheduledDate: item.scheduled_date,
        itemType: item.item_type,
        title: item.title,
        status: item.status,
        activityId: item.activity_id,
        taskId: item.task_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));
      const version: any = versions.get(enrollment.program_version_id);
      const durationWeeks = Math.max(1, Number(version?.snapshot?.duration_weeks ?? program.duration_weeks ?? 1));
      const allowedActions = enrollment.status === 'active'
        ? ['pause', 'complete', 'cancel']
        : enrollment.status === 'paused' ? ['resume', 'complete', 'cancel'] : [];
      return {
        enrollmentId: enrollment.id,
        programId: enrollment.program_id,
        programVersionId: enrollment.program_version_id,
        versionNumber: Number(version?.version_number ?? 0),
        player: playerDirectory.get(enrollment.player_id) ?? { playerId: enrollment.player_id, displayName: 'Unnamed player', email: null, ownerRosterStatus: 'inactive' },
        sourceTeam: enrollment.source_team_id ? { teamId: enrollment.source_team_id, name: teams.get(enrollment.source_team_id) ?? null } : null,
        startDate: enrollment.start_date,
        endDate: addProgramIsoDays(enrollment.start_date, durationWeeks * 7 - 1),
        durationWeeks,
        status: enrollment.status,
        pausedAt: enrollment.paused_at,
        completedAt: enrollment.completed_at,
        createdAt: enrollment.created_at,
        updatedAt: enrollment.updated_at,
        items,
        scheduledItemCount: items.length,
        linkedActivityItemCount: items.filter((item: any) => Boolean(item.activityId)).length,
        linkedTaskItemCount: items.filter((item: any) => Boolean(item.taskId)).length,
        allowedActions,
      };
    }),
    summary: {
      total: enrollments.length,
      active: enrollments.filter((enrollment: any) => enrollment.status === 'active').length,
      paused: enrollments.filter((enrollment: any) => enrollment.status === 'paused').length,
      completed: enrollments.filter((enrollment: any) => enrollment.status === 'completed').length,
      cancelled: enrollments.filter((enrollment: any) => enrollment.status === 'cancelled').length,
    },
  };
}

async function setEnrollmentStatus(client: any, userId: string, body: Record<string, any>) {
  const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
  const enrollmentId = uuid(body.enrollmentId, 'enrollmentId');
  const nextStatus = text(body.status, 'status', true)!;
  if (!STATUSES.includes(nextStatus)) throw new AppError('VALIDATION_ERROR', 'Invalid enrollment status.', 400);
  await assertStaff(client, userId, ownerAccountId);
  const { data: enrollment, error: enrollmentError } = await client.from('program_enrollments')
    .select('id,status').eq('owner_account_id', ownerAccountId).eq('id', enrollmentId).maybeSingle();
  if (enrollmentError) throw new AppError('INTERNAL_ERROR', enrollmentError.message, 500);
  if (!enrollment) throw new AppError('PROGRAM_ENROLLMENT_NOT_FOUND', 'Program enrollment not found.', 404);
  const allowedTransitions: Record<string, string[]> = {
    active: ['paused', 'completed', 'cancelled'],
    paused: ['active', 'completed', 'cancelled'],
    completed: [],
    cancelled: [],
  };
  if (!allowedTransitions[enrollment.status]?.includes(nextStatus)) {
    throw new AppError('VALIDATION_ERROR', `Enrollment cannot change from ${enrollment.status} to ${nextStatus}.`, 409);
  }
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await client.from('program_enrollments').update({
    status: nextStatus,
    paused_at: nextStatus === 'paused' ? now : null,
    completed_at: nextStatus === 'completed' ? now : null,
  }).eq('owner_account_id', ownerAccountId).eq('id', enrollmentId).eq('status', enrollment.status).select('id').maybeSingle();
  if (updateError) throw new AppError('INTERNAL_ERROR', updateError.message, 500);
  if (!updated) throw new AppError('VALIDATION_ERROR', 'Enrollment changed while this action was being processed. Refresh and try again.', 409);
  return payload(client, ownerAccountId);
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
  const { data: version, error: versionError } = await client.from('program_versions').select('id,snapshot').eq('owner_account_id', ownerAccountId).eq('program_id', programId).eq('version_number', program.published_version).single();
  if (versionError || !version?.id || !version?.snapshot || typeof version.snapshot !== 'object') {
    throw new AppError('INTERNAL_ERROR', versionError?.message || 'Published program version is unavailable.', 500);
  }
  const snapshotProgram = version.snapshot as Record<string, any>;
  if (snapshotProgram.id !== programId || !Array.isArray(snapshotProgram.phases) || !Array.isArray(snapshotProgram.items)) {
    throw new AppError('INTERNAL_ERROR', 'Published program version is invalid.', 500);
  }
  // Versions published before atomic enrollment did not embed template
  // materialization. Keep a legacy fallback so those immutable programs remain
  // enrollable, while all newly published versions use their embedded snapshot.
  const embeddedTemplates = readProgramTemplates(snapshotProgram);
  const requiredTemplateIds = [...new Set(snapshotProgram.items
    .filter((item: any) => TEMPLATE_TYPE_BY_PROGRAM_ITEM[item.item_type])
    .map((item: any) => item.training_template_id)
    .filter(Boolean)
    .map(String))];
  const missingEmbeddedTemplate = requiredTemplateIds.some((templateId) => !embeddedTemplates?.has(templateId));
  let templates = embeddedTemplates;
  if (!templates || missingEmbeddedTemplate) {
    const compatibilityTemplates = await loadProgramTemplateMaterializations(client, ownerAccountId, snapshotProgram);
    templates = new Map([...compatibilityTemplates, ...(embeddedTemplates ?? new Map())]);
  }
  let playerPlans;
  try {
    playerPlans = buildProgramEnrollmentPlayerPlans({ program: snapshotProgram, startDate, playerIds, templates });
  } catch (cause) {
    throw new AppError('VALIDATION_ERROR', cause instanceof Error ? cause.message : 'Program materialization plan is invalid.', 409);
  }
  const { error: enrollmentError } = await client.rpc('enroll_training_program_atomic', {
    p_owner_account_id: ownerAccountId,
    p_program_id: programId,
    p_program_version_id: version.id,
    p_source_team_id: teamId,
    p_start_date: startDate,
    p_enrolled_by: userId,
    p_player_plans: playerPlans,
  });
  if (enrollmentError) {
    const message = String(enrollmentError.message ?? 'Program enrollment failed.');
    if (message.includes('PROGRAM_ENROLLMENT_EXISTS:')) {
      throw new AppError('VALIDATION_ERROR', message.split('PROGRAM_ENROLLMENT_EXISTS:')[1]?.trim() || 'Enrollment already exists for this player and start date.', 409);
    }
    if (message.includes('PROGRAM_ENROLLMENT_PLAN_INVALID:')) {
      throw new AppError('VALIDATION_ERROR', message.split('PROGRAM_ENROLLMENT_PLAN_INVALID:')[1]?.trim() || 'Program enrollment plan is invalid.', 400);
    }
    throw new AppError('INTERNAL_ERROR', `Could not enroll program atomically: ${message}`, 500);
  }
  return payload(client, ownerAccountId);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  try {
    const { serviceClient: client, userId } = await requireAuthContext(req); const body = record(await readJsonBody(req)); const action = text(body.action, 'action', true);
    if (action === 'playerExperience') return successResponse(await loadPlayerProgramExperience(client, userId));
    if (action === 'setPlayerItemCompletion') return successResponse(await setPlayerProgramItemCompletion(client, userId, body));
    if (action === 'playerMine') {
      const { data, error } = await client.from('program_enrollments').select('*, training_programs(title,description,duration_weeks), program_enrollment_items(*)').eq('player_id', userId).order('start_date', { ascending: false });
      if (error) throw new AppError('INTERNAL_ERROR', error.message, 500); return successResponse({ enrollments: data ?? [] });
    }
    const ownerAccountId = uuid(body.ownerAccountId, 'ownerAccountId');
    if (action === 'list') { await assertStaff(client, userId, ownerAccountId); return successResponse(await payload(client, ownerAccountId)); }
    if (action === 'enrollmentPreview') return successResponse(await loadEnrollmentPreview(client, userId, body));
    if (action === 'programEnrollments') return successResponse(await loadProgramEnrollments(client, userId, body));
    if (action === 'upsert') return successResponse(await upsert(client, userId, body));
    if (action === 'publish') return successResponse(await publish(client, userId, ownerAccountId, uuid(body.programId, 'programId')));
    if (action === 'enroll') return successResponse(await enroll(client, userId, body));
    if (action === 'setEnrollmentStatus') return successResponse(await setEnrollmentStatus(client, userId, body));
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
