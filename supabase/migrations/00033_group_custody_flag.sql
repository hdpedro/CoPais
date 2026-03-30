-- Migration: Add custody_enabled flag to groups
-- Supports progressive disclosure: new groups start without custody features,
-- which are activated when users configure a custody schedule or accept the prompt.
-- Existing groups retain custody enabled for retrocompatibility.

ALTER TABLE coparenting_groups
  ADD COLUMN custody_enabled BOOLEAN NOT NULL DEFAULT false;

-- All existing groups keep custody enabled (they were created under the coparenting model)
UPDATE coparenting_groups SET custody_enabled = true;
