CREATE TABLE `ai_visual_demo_entities` (
  `demo_entity_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id` CHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NULL,
  `item_id` BIGINT UNSIGNED NULL,
  `entity_role` ENUM('LOST_OWNER','FOUND_OWNER','LOST_ITEM','FOUND_ITEM') NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`demo_entity_id`),
  UNIQUE KEY `uq_ai_visual_demo_run_entity` (`run_id`, `entity_role`, `user_id`, `item_id`),
  KEY `idx_ai_visual_demo_run` (`run_id`, `entity_role`),
  KEY `idx_ai_visual_demo_entities_user_id` (`user_id`),
  KEY `idx_ai_visual_demo_entities_item_id` (`item_id`),
  CONSTRAINT `fk_ai_visual_demo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ai_visual_demo_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
