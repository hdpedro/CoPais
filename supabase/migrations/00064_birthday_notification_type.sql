-- Birthday reminder notification type
-- Used by cron `/api/cron/birthday-reminders` (runs daily) to push a reminder
-- 7 days before each child's birthday to all members of the child's group.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'birthday_reminder';
