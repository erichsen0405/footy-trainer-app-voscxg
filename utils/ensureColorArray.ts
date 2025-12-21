
/**
 * Sikrer at en color-værdi ALTID er et array
 * Bruges før LinearGradient, styles og direkte indexering
 */
export function ensureColorArray(
  value: unknown,
  fallback: string = '#000'
): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    return [value, value];
  }

  return [fallback, fallback];
}
