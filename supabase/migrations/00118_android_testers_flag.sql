-- Add is_android_tester flag to profiles for dynamic PostHog cohort filtering
-- Used to replace hardcoded email list in analytics queries

ALTER TABLE profiles
ADD COLUMN is_android_tester BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient filtering
CREATE INDEX idx_profiles_is_android_tester ON profiles (is_android_tester) WHERE is_android_tester = TRUE;

-- Backfill with the known testers from Google Group kindar-testers
-- These 38 emails are from the Google Group as of 2026-06-12
UPDATE profiles
SET is_android_tester = TRUE
WHERE email IN (
  'bellandrade0505@gmail.com',
  'balinebarros346@gmail.com',
  'nathynathaly.162008@gmail.com',
  'tarcillaandrade@gmail.com',
  'brunamrfono@gmail.com',
  'mecoelho91@gmail.com',
  'luizfernandoricardo11@gmail.com',
  'l.ornellas1407@gmail.com',
  'alexandresoares287282@gmail.com',
  'jhonatanalessandro20072008@gmail.com',
  'crikacast@gmail.com',
  'dias.m.augusto@gmail.com',
  'anselmofreitassouza@gmail.com',
  'irineiadepedro@gmail.com',
  'barbararitto@gmail.com',
  'figueiredotamires942@gmail.com',
  'ag4808353@gmail.com',
  'tecypodz@gmail.com',
  'nathaliacalderaro17@gmail.com',
  '13gpbarbieri@gmail.com',
  'madeira.gabriella@gmail.com',
  'gppvizzotto@gmail.com',
  'martinss.00542@gmail.com',
  'mvpazevedo27@gmail.com',
  'diogolegey@gmail.com',
  'henrique.de.pedro@gmail.com',
  'alexcs05@gmail.com',
  'aluanwebmaster@gmail.com',
  'haillabarros@gmail.com',
  'jeniffernascimento880@gmail.com',
  'gustavoricardo3dev@gmail.com',
  'fpontes@gmail.com',
  'rodriguzeh@gmail.com',
  'mmagalhaesromualdo@gmail.com',
  'vinilive@gmail.com',
  'brunocrestejauclick@gmail.com',
  'brenno.oliveira@beevale.com.br',
  'celma.pedros@gmail.com'
);

-- Comment for clarity
COMMENT ON COLUMN profiles.is_android_tester IS 'Flag marking members of kindar-testers Google Group for analytics cohort filtering. Synced manually or via cron from Google Groups API.';
