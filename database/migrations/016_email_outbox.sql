CREATE TABLE `email_outbox` (
  `job_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `event_key` VARCHAR(100) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING','PROCESSING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `next_attempt_at` DATETIME NOT NULL,
  `lease_token` CHAR(36) NULL,
  `lease_until` DATETIME NULL,
  `last_error` VARCHAR(50) NULL,
  `created_at` DATETIME NOT NULL,
  `sent_at` DATETIME NULL,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_email_event` (`user_id`, `event_key`),
  KEY `idx_email_ready` (`status`, `next_attempt_at`, `job_id`),
  KEY `idx_email_lease` (`status`, `lease_until`),
  CONSTRAINT `fk_email_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
