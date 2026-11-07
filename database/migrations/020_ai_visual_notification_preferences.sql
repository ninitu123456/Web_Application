CREATE TABLE `ai_visual_notification_preferences` (
  `user_id` BIGINT UNSIGNED NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_ai_visual_preference_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
