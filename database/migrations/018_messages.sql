CREATE TABLE `messages` (
  `message_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `sender_id` BIGINT UNSIGNED NOT NULL,
  `client_id` CHAR(36) NOT NULL,
  `content` VARCHAR(2000) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`message_id`),
  UNIQUE KEY `uq_message_retry` (`sender_id`, `client_id`),
  KEY `idx_messages_conversation_id` (`conversation_id`),
  KEY `idx_message_history` (`conversation_id`, `message_id`),
  KEY `idx_message_unread` (`conversation_id`, `sender_id`, `message_id`),
  CONSTRAINT `fk_message_chat` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`conversation_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_message_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
