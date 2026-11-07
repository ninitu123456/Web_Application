CREATE TABLE `conversations` (
  `conversation_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_low` BIGINT UNSIGNED NOT NULL,
  `user_high` BIGINT UNSIGNED NOT NULL,
  `last_read_low` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `last_read_high` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`conversation_id`),
  UNIQUE KEY `uq_conversation_pair` (`user_low`, `user_high`),
  KEY `idx_conversations_user_high` (`user_high`),
  CONSTRAINT `fk_chat_low` FOREIGN KEY (`user_low`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_chat_high` FOREIGN KEY (`user_high`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_chat_distinct` CHECK (user_low <> user_high)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
