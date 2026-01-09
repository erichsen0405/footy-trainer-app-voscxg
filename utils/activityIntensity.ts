export function resolveActivityIntensityEnabled(activity: any): boolean {
  const raw =
    activity?.intensity_enabled ??
    activity?.intensityEnabled ??
    activity?.activity_intensity_enabled ??
    activity?.activityIntensityEnabled ??
    activity?.is_intensity_enabled ??
    activity?.isIntensityEnabled;

  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === 'true' || t === '1' || t === 'yes') return true;
    if (t === 'false' || t === '0' || t === 'no') return false;
  }
  return false;
}
