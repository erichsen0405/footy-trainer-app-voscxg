import { buildExercisePositionOptions, HOLDTRAINING_POSITIONS } from '../utils/exercisePositions';

describe('exercise position options', () => {
  it('builds nullable options list with labels and values', () => {
    const options = buildExercisePositionOptions();

    expect(options[0]).toEqual({ label: 'Ingen', value: null });
    expect(options).toHaveLength(HOLDTRAINING_POSITIONS.length + 1);

    const nonNullOptions = options.slice(1);
    nonNullOptions.forEach((option, index) => {
      expect(option.label).toBe(HOLDTRAINING_POSITIONS[index].name);
      expect(option.value).toBe(HOLDTRAINING_POSITIONS[index].name);
    });
  });
});
