import { parseClubActivityFiltersBody, parseClubActivityMirrorBody } from '../supabase/functions/_shared/clubActivities';

const clubId = '22222222-2222-4222-8222-222222222222';
const memberId = '33333333-3333-4333-8333-333333333333';

describe('club activity backend helpers', () => {
  it('normalizes club activity filters payload', () => {
    expect(
      parseClubActivityFiltersBody({
        clubId,
      })
    ).toEqual({ clubId });
  });

  it('normalizes club activity mirror payload', () => {
    expect(
      parseClubActivityMirrorBody({
        clubId,
        targetType: 'member',
        targetId: memberId,
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      })
    ).toEqual({
      clubId,
      targetType: 'member',
      targetId: memberId,
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
  });

  it('rejects invalid target types', () => {
    expect.assertions(2);

    try {
      parseClubActivityMirrorBody({
        clubId,
        targetType: 'coach',
        targetId: memberId,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(error).toHaveProperty('message', 'targetType must be member or team.');
    }
  });

  it('rejects invalid date strings', () => {
    expect.assertions(2);

    try {
      parseClubActivityMirrorBody({
        clubId,
        targetType: 'team',
        targetId: memberId,
        dateFrom: '03-01-2026',
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(error).toHaveProperty('message', 'dateFrom must be a YYYY-MM-DD date.');
    }
  });
});
