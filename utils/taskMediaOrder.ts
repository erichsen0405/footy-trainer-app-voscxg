export function reorderTaskMediaUrls(urls: string[], fromIndex: number, toIndex: number): string[] {
  if (!Array.isArray(urls) || urls.length <= 1) return Array.isArray(urls) ? [...urls] : [];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return [...urls];
  if (fromIndex < 0 || fromIndex >= urls.length) return [...urls];

  const clampedToIndex = Math.max(0, Math.min(urls.length - 1, toIndex));
  if (fromIndex === clampedToIndex) return [...urls];

  const next = [...urls];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedToIndex, 0, moved);
  return next;
}
