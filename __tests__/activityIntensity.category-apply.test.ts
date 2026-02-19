import { resolveExternalCategoryIntensityTargetIds } from '@/utils/activityIntensity';

describe('resolveExternalCategoryIntensityTargetIds', () => {
  it('returns rows that still need enablement and avoids duplicates', () => {
    const ids = resolveExternalCategoryIntensityTargetIds(
      [
        { id: 'meta-1', intensityEnabled: false, intensity: null },
        { id: 'meta-2', intensityEnabled: true, intensity: null },
        { id: 'meta-3', intensityEnabled: false, intensity: 7 },
        { id: 'meta-4', intensityEnabled: false, intensity: null },
        { id: 'meta-1', intensityEnabled: false, intensity: null },
      ],
      true
    );

    expect(ids).toEqual(['meta-1', 'meta-4']);
  });

  it('returns only open enabled rows when disabling', () => {
    const ids = resolveExternalCategoryIntensityTargetIds(
      [
        { id: 'meta-1', intensityEnabled: false, intensity: null },
        { id: 'meta-2', intensityEnabled: true, intensity: null },
        { id: 'meta-3', intensityEnabled: false, intensity: 6 },
        { id: 'meta-4', intensityEnabled: true, intensity: 8 },
      ],
      false
    );

    expect(ids).toEqual(['meta-2']);
  });

  it('returns empty when candidates are missing usable ids', () => {
    const ids = resolveExternalCategoryIntensityTargetIds(
      [
        { id: '', intensityEnabled: false, intensity: null },
        { id: '   ', intensityEnabled: true, intensity: 5 },
      ],
      true
    );

    expect(ids).toEqual([]);
  });
});
