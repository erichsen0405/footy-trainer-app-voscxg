import {
  partitionProgramDraftItems,
  reassignProgramDraftItem,
  removeProgramDraftItem,
  removeProgramDraftPhase,
} from '@/utils/programDraftItems';

type Item = { id: string; phaseId: string; title: string };

const phases = [
  { id: 'phase-1', title: 'Foundation' },
  { id: 'phase-2', title: 'Progression' },
];

const items: Item[] = [
  { id: 'assigned-1', phaseId: 'phase-1', title: 'Warm-up' },
  { id: 'orphan-1', phaseId: '', title: 'Legacy session' },
  { id: 'orphan-2', phaseId: 'deleted-phase', title: 'Legacy task' },
  { id: 'assigned-2', phaseId: 'phase-2', title: 'Finishing' },
];

describe('program draft item phase repair', () => {
  it('partitions assigned and orphaned items without losing their order or data', () => {
    const result = partitionProgramDraftItems(phases, items);

    expect(result.assignedItems.map((item) => item.id)).toEqual(['assigned-1', 'assigned-2']);
    expect(result.orphanItems.map((item) => item.id)).toEqual(['orphan-1', 'orphan-2']);
    expect(result.orphanItems[0].title).toBe('Legacy session');
  });

  it('repairs an orphan by assigning it to an existing phase', () => {
    const repaired = reassignProgramDraftItem(items, 'orphan-1', 'phase-2');
    const result = partitionProgramDraftItems(phases, repaired);

    expect(repaired.find((item) => item.id === 'orphan-1')?.phaseId).toBe('phase-2');
    expect(result.assignedItems.map((item) => item.id)).toContain('orphan-1');
    expect(items.find((item) => item.id === 'orphan-1')?.phaseId).toBe('');
  });

  it('removes an orphan explicitly without changing the other items', () => {
    const remaining = removeProgramDraftItem(items, 'orphan-2');

    expect(remaining.map((item) => item.id)).toEqual(['assigned-1', 'orphan-1', 'assigned-2']);
  });

  it('removes a phase and only the items assigned to that phase', () => {
    const result = removeProgramDraftPhase(phases, items, 'phase-1');

    expect(result.phases.map((phase) => phase.id)).toEqual(['phase-2']);
    expect(result.items.map((item) => item.id)).toEqual(['orphan-1', 'orphan-2', 'assigned-2']);
  });
});
