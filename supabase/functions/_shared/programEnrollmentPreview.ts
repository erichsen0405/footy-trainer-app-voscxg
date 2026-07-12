export function addProgramIsoDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildProgramEnrollmentTimeline(program: any, startDate: string) {
  const normalizedItems = (program.items ?? []).map((item: any) => ({
    id: item.id,
    phaseId: item.phase_id,
    itemType: item.item_type,
    trainingTemplateId: item.training_template_id,
    title: item.title,
    description: item.description,
    dayOffset: item.day_offset,
    programDay: item.day_offset + 1,
    scheduledDate: addProgramIsoDays(startDate, item.day_offset),
    sortOrder: item.sort_order,
    config: item.config ?? {},
  }));

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
