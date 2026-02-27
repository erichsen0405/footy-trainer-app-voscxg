export type ExercisePositionDefinition = {
  id: string;
  name: string;
  icon: { ios: string; android: string };
};

export const HOLDTRAINING_POSITIONS: readonly ExercisePositionDefinition[] = [
  { id: 'holdtraening_faelles', name: 'Fælles (alle positioner)', icon: { ios: 'star.fill', android: 'star' } },
  { id: 'holdtraening_maalmand', name: 'Målmand', icon: { ios: 'hand.raised.fill', android: 'sports_soccer' } },
  { id: 'holdtraening_back', name: 'Back', icon: { ios: 'arrow.left.and.right.circle', android: 'swap_horiz' } },
  { id: 'holdtraening_midterforsvarer', name: 'Midterforsvarer', icon: { ios: 'shield.fill', android: 'shield' } },
  { id: 'holdtraening_central_midtbane', name: 'Central midtbane (6/8)', icon: { ios: 'circle.grid.cross.fill', android: 'grid_on' } },
  { id: 'holdtraening_offensiv_midtbane', name: 'Offensiv midtbane (10)', icon: { ios: 'sparkles', android: 'flare' } },
  { id: 'holdtraening_kant', name: 'Kant', icon: { ios: 'arrow.triangle.turn.up.right.circle.fill', android: 'open_with' } },
  { id: 'holdtraening_angriber', name: 'Angriber', icon: { ios: 'flame.fill', android: 'whatshot' } },
];

export type ExercisePositionOption = {
  label: string;
  value: string | null;
};

export const buildExercisePositionOptions = (): ExercisePositionOption[] => [
  { label: 'Ingen', value: null },
  ...HOLDTRAINING_POSITIONS.map((position) => ({ label: position.name, value: position.name })),
];
