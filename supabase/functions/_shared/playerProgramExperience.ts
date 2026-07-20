type Row = Record<string, any>;

export type PlayerProgramExperienceInput = {
  enrollments: Row[];
  owners: Row[];
  brandProfiles: Row[];
  taskDetails?: Row[];
  completedTaskIds: Set<string>;
  completedActivityIds: Set<string>;
  today: string;
  generatedAt: string;
};

function addIsoDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function safeColors(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    primary: typeof record.primary === 'string' ? record.primary : '#162634',
    accent: typeof record.accent === 'string' ? record.accent : '#4CAF50',
  };
}

function effectiveItemStatus(
  item: Row,
  completedTaskIds: Set<string>,
  completedActivityIds: Set<string>,
  today: string,
) {
  const completed = item.status === 'completed'
    || (item.task_id && completedTaskIds.has(item.task_id))
    || (item.activity_id && completedActivityIds.has(item.activity_id));
  if (completed) return 'completed';
  if (item.status === 'skipped') return 'skipped';
  if (item.scheduled_date < today) return 'overdue';
  if (item.scheduled_date === today) return 'today';
  return 'upcoming';
}

export function buildPlayerProgramExperience(input: PlayerProgramExperienceInput) {
  const ownerById = new Map(input.owners.map((owner) => [owner.id, owner]));
  const brandByOwnerId = new Map(input.brandProfiles.map((profile) => [profile.owner_account_id, profile]));
  const taskById = new Map((input.taskDetails ?? []).map((task) => [task.id, task]));

  const enrollments = input.enrollments.map((enrollment) => {
    const program = enrollment.training_programs ?? {};
    const versionSnapshot = enrollment.program_version?.snapshot ?? {};
    const snapshotItems = Array.isArray(versionSnapshot.items) ? versionSnapshot.items : [];
    const snapshotPhases = Array.isArray(versionSnapshot.phases) ? versionSnapshot.phases : [];
    const owner = ownerById.get(enrollment.owner_account_id) ?? {};
    const brand = brandByOwnerId.get(enrollment.owner_account_id) ?? {};
    const items = (Array.isArray(enrollment.program_enrollment_items)
      ? enrollment.program_enrollment_items
      : [])
      .map((item: Row) => {
        const snapshotItem = snapshotItems.find((candidate: Row) => candidate.id === item.program_item_id) ?? {};
        const phase = snapshotPhases.find((candidate: Row) => candidate.id === snapshotItem.phase_id) ?? {};
        const task = item.task_id ? taskById.get(item.task_id) ?? {} : {};
        const scheduledMs = new Date(`${item.scheduled_date}T00:00:00.000Z`).getTime();
        const startMs = new Date(`${enrollment.start_date}T00:00:00.000Z`).getTime();
        return {
          id: item.id,
          scheduledDate: item.scheduled_date,
          itemType: item.item_type,
          title: item.title,
          description: task.description ?? snapshotItem.description ?? null,
          reminderMinutes: task.reminder_minutes ?? null,
          categoryIds: Array.isArray(task.category_ids) ? task.category_ids : [],
          phaseTitle: phase.title ?? null,
          weekNumber: Math.max(1, Math.floor((scheduledMs - startMs) / 604800000) + 1),
          status: effectiveItemStatus(
            item,
            input.completedTaskIds,
            input.completedActivityIds,
            input.today,
          ),
          activityId: item.activity_id ?? null,
          taskId: item.task_id ?? null,
        };
      })
      .sort((a: Row, b: Row) => a.scheduledDate.localeCompare(b.scheduledDate));
    // Context-only focus/note rows are not completable work and must not inflate progress.
    const progressItems = items.filter((item: Row) => Boolean(item.taskId || item.activityId));
    const completedItems = progressItems.filter((item: Row) => item.status === 'completed').length;
    const actionableItems = progressItems.filter((item: Row) => !['completed', 'skipped'].includes(item.status));
    const nextItem = actionableItems.find((item: Row) => item.scheduledDate <= input.today)
      ?? actionableItems[0]
      ?? null;
    const totalItems = progressItems.length;

    return {
      id: enrollment.id,
      owner: {
        id: enrollment.owner_account_id,
        ownerType: owner.owner_type === 'club' ? 'club' : 'private_coach_business',
        name: owner.name ?? brand.display_name ?? 'Coach',
        displayName: brand.display_name ?? owner.name ?? 'Coach',
        logoUrl: brand.logo_url ?? null,
        brandColors: safeColors(brand.brand_colors),
      },
      program: {
        id: enrollment.program_id,
        title: program.title ?? 'Training program',
        description: program.description ?? null,
        durationWeeks: Number(program.duration_weeks ?? 0),
      },
      startDate: enrollment.start_date,
      endDate: addIsoDays(enrollment.start_date, Math.max(1, Number(program.duration_weeks ?? 1)) * 7 - 1),
      status: enrollment.status,
      progress: {
        completedItems,
        totalItems,
        percent: totalItems ? Math.round((completedItems / totalItems) * 100) : 0,
      },
      nextItem,
      items,
    };
  });

  const statusOrder: Record<string, number> = { active: 0, paused: 1, completed: 2, cancelled: 3 };
  enrollments.sort((a, b) =>
    (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
      || b.startDate.localeCompare(a.startDate)
  );
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status === 'active');
  const activeEnrollment = activeEnrollments.find((enrollment) =>
    enrollment.startDate <= input.today && enrollment.endDate >= input.today
  ) ?? activeEnrollments
    .filter((enrollment) => enrollment.startDate > input.today)
    .sort((left, right) => left.startDate.localeCompare(right.startDate))[0]
    ?? activeEnrollments[0]
    ?? null;

  return {
    apiVersion: 2,
    generatedAt: input.generatedAt,
    today: input.today,
    activeEnrollmentId: activeEnrollment?.id ?? null,
    nextAction: activeEnrollment?.nextItem
      ? { enrollmentId: activeEnrollment.id, ...activeEnrollment.nextItem }
      : null,
    enrollments,
  };
}
