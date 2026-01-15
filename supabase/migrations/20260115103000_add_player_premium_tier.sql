-- Add Premium player tier and normalize legacy player tier values
UPDATE profiles
SET subscription_tier = 'player_basic'
WHERE subscription_tier = 'player';

COMMENT ON COLUMN profiles.subscription_tier IS 'Apple IAP subscription tier: player_basic, player_premium, trainer_basic, trainer_standard, trainer_premium';
