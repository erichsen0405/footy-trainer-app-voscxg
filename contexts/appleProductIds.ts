export const PRODUCT_IDS = {
  PLAYER_BASIC: 'fc_spiller_monthly',
  PLAYER_PREMIUM: 'fc_player_premium_monthly',
  TRAINER_BASIC: 'fc_trainer_basic_monthly',
  TRAINER_STANDARD: 'fc_trainer_standard_monthly',
  TRAINER_PREMIUM: 'fc_trainer_premium_monthly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];
