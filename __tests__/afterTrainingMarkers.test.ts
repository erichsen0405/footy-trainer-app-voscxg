import { stripAfterTrainingMarkers } from '@/utils/afterTrainingMarkers';

describe('afterTrainingMarkers', () => {
  it('preserves author-entered line breaks when removing markers', () => {
    expect(
      stripAfterTrainingMarkers(
        'Første linje\nAnden linje [auto-after-training:123e4567-e89b-12d3-a456-426614174000]\nTredje linje'
      )
    ).toBe('Første linje\nAnden linje\nTredje linje');
  });

  it('normalizes repeated spaces without collapsing separate lines', () => {
    expect(stripAfterTrainingMarkers('En   linje\n\nTo    linje')).toBe('En linje\n\nTo linje');
  });
});
