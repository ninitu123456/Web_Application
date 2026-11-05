CREATE TABLE `password_reset_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_password_reset_tokens_user_id` (`user_id`),
  CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
