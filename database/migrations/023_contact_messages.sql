CREATE TABLE `contact_messages` (
  `contact_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `full_name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `topic` ENUM('GENERAL','ACCOUNT','ITEM','REPORT','OTHER') NOT NULL,
  `body` VARCHAR(3000) NOT NULL,
  `item_url` VARCHAR(500) NULL,
  `status` ENUM('NEW','HANDLED') NOT NULL DEFAULT 'NEW',
  `created_at` DATETIME NOT NULL,
  `handled_at` DATETIME NULL,
  `handled_by` BIGINT UNSIGNED NULL,
  PRIMARY KEY (`contact_id`),
  KEY `idx_contact_status` (`status`, `created_at`, `contact_id`),
  KEY `idx_contact_messages_user_id` (`user_id`),
  KEY `idx_contact_messages_handled_by` (`handled_by`),
  CONSTRAINT `fk_contact_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_contact_handler` FOREIGN KEY (`handled_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
