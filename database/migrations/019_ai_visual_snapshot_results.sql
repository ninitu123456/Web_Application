CREATE TABLE `ai_visual_snapshot_results` (
  `result_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `snapshot_id` BIGINT UNSIGNED NOT NULL,
  `found_item_id` BIGINT UNSIGNED NOT NULL,
  `cosine_score` DOUBLE NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`result_id`),
  UNIQUE KEY `uq_ai_visual_snapshot_result_pair` (`snapshot_id`, `found_item_id`),
  KEY `idx_ai_visual_snapshot_results_found_item_id` (`found_item_id`),
  CONSTRAINT `fk_ai_visual_result_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `ai_visual_snapshots` (`snapshot_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ai_visual_result_found` FOREIGN KEY (`found_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
