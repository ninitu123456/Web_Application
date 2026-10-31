ALTER TABLE `notifications`
  ADD COLUMN `event_key` VARCHAR(100) NULL,
  ADD UNIQUE KEY `uq_notifications_user_event` (`user_id`, `event_key`),
  ADD INDEX `idx_notifications_user_read_created` (`user_id`, `is_read`, `created_at`, `notification_id`);
ALTER TABLE `reports`
  ADD COLUMN `active_target_key` VARCHAR(64) GENERATED ALWAYS AS (CASE WHEN status IN ('PENDING','REVIEWING') THEN CONCAT(target_type, ':', COALESCE(item_id, reported_user_id, claim_id)) ELSE NULL END) STORED,
  ADD UNIQUE KEY `uq_reports_active_target` (`reporter_id`, `active_target_key`),
  ADD INDEX `idx_reports_status_created` (`status`, `created_at`, `report_id`),
  ADD INDEX `idx_reports_reporter_created` (`reporter_id`, `created_at`, `report_id`);
