CREATE TABLE `ai_visual_pair_alerts` (
  `alert_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_id` BIGINT UNSIGNED NOT NULL,
  `lost_item_id` BIGINT UNSIGNED NOT NULL,
  `found_item_id` BIGINT UNSIGNED NOT NULL,
  `event_key` VARCHAR(160) NOT NULL,
  `delivered_at` DATETIME NOT NULL,
  PRIMARY KEY (`alert_id`),
  UNIQUE KEY `uq_ai_visual_pair_alert_lifetime` (`recipient_id`, `lost_item_id`, `found_item_id`),
  UNIQUE KEY `uq_ai_visual_pair_alert_event` (`event_key`),
  KEY `idx_ai_visual_pair_alerts_lost_item_id` (`lost_item_id`),
  KEY `idx_ai_visual_pair_alerts_found_item_id` (`found_item_id`),
  CONSTRAINT `fk_ai_visual_alert_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ai_visual_alert_lost` FOREIGN KEY (`lost_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ai_visual_alert_found` FOREIGN KEY (`found_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
