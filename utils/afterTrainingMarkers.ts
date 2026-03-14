const AUTO_AFTER_TRAINING_REGEX = /\[auto-after-training(?::([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}))?\]/gi;
const AUTO_AFTER_TRAINING_CAPTURE_REGEX = /\[auto-after-training:([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})\]/i;

export function stripAfterTrainingMarkers(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/\r\n/g, '\n')
    .replace(AUTO_AFTER_TRAINING_REGEX, '')
    .split('\n')
    .map(line => line.replace(/[^\S\n\r]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseTemplateIdFromMarker(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(AUTO_AFTER_TRAINING_CAPTURE_REGEX);
  return match && match[1] ? match[1] : null;
}

export const extractAfterTrainingTemplateId = parseTemplateIdFromMarker;
