import { FocusMetadataRow, planFocusMetadataSync } from '@/utils/focusExcelMapping';

describe('focus excel mapping sync', () => {
  it('matches by id and updates existing plus creates new rows', () => {
    const existing: FocusMetadataRow[] = [
      {
        id: 'row-1',
        title: 'Old title',
        difficulty: 2,
        position: 'Back',
        how_to: ['old'],
        why_valuable: 'old reason',
        filename: null,
        drejebog: null,
        video_key: null,
      },
    ];

    const incoming: FocusMetadataRow[] = [
      {
        id: 'row-1',
        title: 'Updated title',
        difficulty: 4,
        position: 'Wing',
        how_to: ['step A'],
        why_valuable: 'new reason',
        filename: 'afslutning_01.mp4',
        drejebog: 'Spiller A dribler mod baglinje',
        video_key: 'exercise-videos/focus/updated.mp4',
      },
      {
        id: 'row-2',
        title: 'Brand new',
        difficulty: 3,
        position: 'Midfield',
        how_to: ['step B'],
        why_valuable: 'value',
        filename: null,
        drejebog: null,
        video_key: null,
      },
    ];

    const plan = planFocusMetadataSync(existing, incoming);

    expect(plan.updated).toHaveLength(1);
    expect(plan.updatedIds).toEqual(['row-1']);
    expect(plan.updated[0].title).toBe('Updated title');
    expect(plan.updated[0].filename).toBe('afslutning_01.mp4');
    expect(plan.updated[0].drejebog).toBe('Spiller A dribler mod baglinje');
    expect(plan.updated[0].video_key).toBe('exercise-videos/focus/updated.mp4');

    expect(plan.created).toHaveLength(1);
    expect(plan.createdIds).toEqual(['row-2']);

    expect(plan.nextRows).toHaveLength(2);
    expect(plan.nextRows.find(row => row.id === 'row-2')?.title).toBe('Brand new');
  });
});
