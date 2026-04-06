ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Set existing users with groups to completed
UPDATE profiles SET onboarding_step = 4
WHERE id IN (SELECT DISTINCT user_id FROM group_members)
AND (onboarding_step IS NULL OR onboarding_step = 0);
