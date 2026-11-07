CREATE TABLE `ai_visual_notification_outbox` (
  `outbox_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `decision_id` BIGINT UNSIGNED NOT NULL,
  `event_key` VARCHAR(160) NOT NULL,
  `status` ENUM('PENDING','PROCESSING','DELIVERED','SUPPRESSED','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `lease_token` CHAR(36) NULL,
  `locked_until` DATETIME NULL,
  `available_at` DATETIME NOT NULL,
  `last_error_code` VARCHAR(80) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`outbox_id`),
  UNIQUE KEY `uq_ai_visual_outbox_decision` (`decision_id`),
  UNIQUE KEY `uq_ai_visual_outbox_event` (`event_key`),
  KEY `idx_ai_visual_outbox_work` (`status`, `available_at`, `outbox_id`),
  CONSTRAINT `fk_ai_visual_outbox_decision` FOREIGN KEY (`decision_id`) REFERENCES `ai_visual_notification_decisions` (`decision_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
