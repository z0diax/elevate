ALTER TABLE `awards`
  ADD COLUMN IF NOT EXISTS `is_on_the_spot` TINYINT(1) NOT NULL DEFAULT 0 AFTER `min_qualifying_score`;
