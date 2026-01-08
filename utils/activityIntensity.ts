export function resolveActivityIntensityEnabled(activityLike: any): boolean {
  if (!activityLike) return false;

  if (typeof activityLike.intensityEnabled === 'boolean') return activityLike.intensityEnabled;
  if (typeof activityLike.intensity_enabled === 'boolean') return activityLike.intensity_enabled;
  if (typeof activityLike.activity_intensity_enabled === 'boolean') return activityLike.activity_intensity_enabled;

  return false;
}
