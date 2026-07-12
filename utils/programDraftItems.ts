export interface ProgramDraftPhaseReference {
  id: string;
}

export interface ProgramDraftItemReference {
  id: string;
  phaseId: string;
}

export function partitionProgramDraftItems<T extends ProgramDraftItemReference>(
  phases: readonly ProgramDraftPhaseReference[],
  items: readonly T[],
): { assignedItems: T[]; orphanItems: T[] } {
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const assignedItems: T[] = [];
  const orphanItems: T[] = [];

  items.forEach((item) => {
    (phaseIds.has(item.phaseId) ? assignedItems : orphanItems).push(item);
  });

  return { assignedItems, orphanItems };
}

export function reassignProgramDraftItem<T extends ProgramDraftItemReference>(
  items: readonly T[],
  itemId: string,
  phaseId: string,
): T[] {
  return items.map((item) => item.id === itemId ? { ...item, phaseId } : item);
}

export function removeProgramDraftItem<T extends ProgramDraftItemReference>(
  items: readonly T[],
  itemId: string,
): T[] {
  return items.filter((item) => item.id !== itemId);
}

export function removeProgramDraftPhase<
  P extends ProgramDraftPhaseReference,
  I extends ProgramDraftItemReference,
>(
  phases: readonly P[],
  items: readonly I[],
  phaseId: string,
): { phases: P[]; items: I[] } {
  return {
    phases: phases.filter((phase) => phase.id !== phaseId),
    items: items.filter((item) => item.phaseId !== phaseId),
  };
}
