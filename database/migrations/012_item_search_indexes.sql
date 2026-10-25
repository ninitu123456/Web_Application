CREATE INDEX `idx_items_status_event_date` ON `items` (`status`, `event_date`);
CREATE INDEX `idx_items_type_status` ON `items` (`type`, `status`);
CREATE INDEX `idx_items_created_at` ON `items` (`created_at`);
