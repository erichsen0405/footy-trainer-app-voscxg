export function addProgramIsoDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getProgramItemSchedule(program: any, startDate: string, item: any) {
  const phase = (program.phases ?? []).find((candidate: any) => candidate.id === item.phase_id);
  const configuredWeekday = String(item.config?.scheduling?.weekday ?? '').toLowerCase();
  const targetWeekdayIndex = WEEKDAY_NAMES.indexOf(configuredWeekday);
  const configuredWeekInPhase = Number(item.config?.scheduling?.weekInPhase ?? 0);

  if (phase && targetWeekdayIndex >= 0 && Number.isInteger(configuredWeekInPhase) && configuredWeekInPhase >= 1) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const startWeekdayIndex = (start.getUTCDay() + 6) % 7;
    const weekdayDelta = (targetWeekdayIndex - startWeekdayIndex + 7) % 7;
    const calculatedDayOffset = phase.week_offset * 7 + (configuredWeekInPhase - 1) * 7 + weekdayDelta;
    return {
      dayOffset: calculatedDayOffset,
      weekInPhase: configuredWeekInPhase,
      weekday: WEEKDAY_NAMES[targetWeekdayIndex],
      weekdayLabel: WEEKDAY_LABELS[targetWeekdayIndex],
      scheduledDate: addProgramIsoDays(startDate, calculatedDayOffset),
    };
  }

  const legacyDayOffset = Number(item.day_offset ?? 0);
  const relativeDay = phase ? Math.max(0, legacyDayOffset - phase.week_offset * 7) : legacyDayOffset;
  const legacyWeekdayIndex = ((legacyDayOffset % 7) + 7) % 7;
  return {
    dayOffset: legacyDayOffset,
    weekInPhase: Math.floor(relativeDay / 7) + 1,
    weekday: WEEKDAY_NAMES[legacyWeekdayIndex],
    weekdayLabel: WEEKDAY_LABELS[legacyWeekdayIndex],
    scheduledDate: addProgramIsoDays(startDate, legacyDayOffset),
  };
}

export function buildProgramEnrollmentTimeline(program: any, startDate: string) {
  const normalizedItems = (program.items ?? []).map((item: any) => {
    const schedule = getProgramItemSchedule(program, startDate, item);
    return {
      id: item.id,
      phaseId: item.phase_id,
      itemType: item.item_type,
      trainingTemplateId: item.training_template_id,
      title: item.title,
      description: item.description,
      dayOffset: schedule.dayOffset,
      programDay: schedule.dayOffset + 1,
      weekInPhase: schedule.weekInPhase,
      weekday: schedule.weekday,
      weekdayLabel: schedule.weekdayLabel,
      scheduledDate: schedule.scheduledDate,
      sortOrder: item.sort_order,
      config: item.config ?? {},
    };
  });

  const phases = (program.phases ?? []).map((phase: any) => ({
    id: phase.id,
    title: phase.title,
    description: phase.description,
    weekOffset: phase.week_offset,
    durationWeeks: phase.duration_weeks,
    startWeek: phase.week_offset + 1,
    endWeek: phase.week_offset + phase.duration_weeks,
    startDate: addProgramIsoDays(startDate, phase.week_offset * 7),
    endDate: addProgramIsoDays(startDate, (phase.week_offset + phase.duration_weeks) * 7 - 1),
    sortOrder: phase.sort_order,
    items: normalizedItems.filter((item: any) => item.phaseId === phase.id),
  }));

  return {
    id: program.id,
    title: program.title,
    description: program.description,
    audience: program.audience,
    level: program.level,
    durationWeeks: program.duration_weeks,
    status: program.status,
    phases,
    unassignedItems: normalizedItems.filter((item: any) => !item.phaseId),
  };
}
