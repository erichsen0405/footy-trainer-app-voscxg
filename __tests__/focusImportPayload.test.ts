import { buildFocusDbCreatePayload, buildFocusDbUpdatePayload, FocusImportRowForDb } from '@/utils/focusImportPayload';

describe('focus import db payloads', () => {
  const row: FocusImportRowForDb = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Afslutning på første touch',
    difficulty: 4,
    position: 'Central midtbane',
    how_to: ['Timing i løb', 'Afslut i zonen'],
    why_valuable: 'Skaber bedre timing mellem løb og aflevering',
    filename: 'first_touch_finish.mp4',
    drejebog: 'Kant driver og spiller cutback',
    video_key: 'drill-videos/focus/first_touch_finish.mp4',
    video_url: 'https://example.supabase.co/storage/v1/object/public/drill-videos/focus/first_touch_finish.mp4',
    trainer_id: '22222222-2222-4222-8222-222222222222',
  };

  it('builds create payload as system row with null trainer_id', () => {
    const payload = buildFocusDbCreatePayload(row, 'holdtraening_central_midtbane');

    expect(payload.trainer_id).toBeNull();
    expect(payload.is_system).toBe(true);
    expect(payload.id).toBe(row.id);
    expect(payload.video_key).toBe(row.video_key);
    expect(payload.video_url).toBe(row.video_url);
    expect(payload.filename).toBe(row.filename);
    expect(payload.drejebog).toBe(row.drejebog);
  });

  it('keeps update payload scope unchanged', () => {
    const payload = buildFocusDbUpdatePayload(row);

    expect(payload).toEqual({
      video_key: row.video_key,
      video_url: row.video_url,
      filename: row.filename,
      drejebog: row.drejebog,
    });
  });
});
