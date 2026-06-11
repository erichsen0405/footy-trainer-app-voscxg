export type ExercisePositionDefinition = {
  id: string;
  name: string;
  icon: { ios: string; android: string };
};

export const HOLDTRAINING_POSITIONS: readonly ExercisePositionDefinition[] = [
  { id: 'holdtraening_faelles', name: 'Shared (all positions)', icon: { ios: 'star.fill', android: 'star' } },
  { id: 'holdtraening_maalmand', name: 'Goalkeeper', icon: { ios: 'hand.raised.fill', android: 'sports_soccer' } },
  { id: 'holdtraening_back', name: 'Fullback', icon: { ios: 'arrow.left.and.right.circle', android: 'swap_horiz' } },
  { id: 'holdtraening_midterforsvarer', name: 'Center back', icon: { ios: 'shield.fill', android: 'shield' } },
  { id: 'holdtraening_central_midtbane', name: 'Central midfielder (6/8)', icon: { ios: 'circle.grid.cross.fill', android: 'grid_on' } },
  { id: 'holdtraening_offensiv_midtbane', name: 'Attacking midfielder (10)', icon: { ios: 'sparkles', android: 'flare' } },
  { id: 'holdtraening_kant', name: 'Winger', icon: { ios: 'arrow.triangle.turn.up.right.circle.fill', android: 'open_with' } },
  { id: 'holdtraening_angriber', name: 'Striker', icon: { ios: 'flame.fill', android: 'whatshot' } },
];

export type ExercisePositionOption = {
  label: string;
  value: string | null;
};

export const buildExercisePositionOptions = (): ExercisePositionOption[] => [
  { label: 'None', value: null },
  ...HOLDTRAINING_POSITIONS.map((position) => ({ label: position.name, value: position.name })),
];
