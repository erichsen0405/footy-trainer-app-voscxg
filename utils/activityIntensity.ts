export function resolveActivityIntensityEnabled(activityLike: any): boolean {
  if (!activityLike) return false;

  if (typeof activityLike.intensityEnabled === 'boolean') return activityLike.intensityEnabled;
  if (typeof activityLike.intensity_enabled === 'boolean') return activityLike.intensity_enabled;
  if (typeof activityLike.activity_intensity_enabled === 'boolean') return activityLike.activity_intensity_enabled;

  return false;
}

export type ExternalCategoryIntensityCandidate = {
  id: string;
  intensityEnabled?: boolean | null;
  intensity?: number | null;
};

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const hasIntensityValue = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

export function resolveExternalCategoryIntensityTargetIds(
  candidates: ExternalCategoryIntensityCandidate[],
  shouldEnable: boolean
): string[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  const targetIds: string[] = [];

  candidates.forEach(candidate => {
    const id = normalizeId(candidate?.id);
    if (!id || unique.has(id)) {
      return;
    }
    unique.add(id);

    const enabled = candidate?.intensityEnabled === true;
    const completed = hasIntensityValue(candidate?.intensity);

    if (shouldEnable) {
      if (enabled || completed) {
        return;
      }
      targetIds.push(id);
      return;
    }

    if (!enabled || completed) {
      return;
    }
    targetIds.push(id);
  });

  return targetIds;
}
