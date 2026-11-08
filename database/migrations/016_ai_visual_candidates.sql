CREATE TABLE `ai_visual_candidates` (
  `candidate_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lost_item_id` BIGINT UNSIGNED NOT NULL,
  `found_item_id` BIGINT UNSIGNED NOT NULL,
  `model_id` VARCHAR(120) NOT NULL,
  `model_revision` VARCHAR(80) NOT NULL,
  `cosine_score` DOUBLE NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`candidate_id`),
  UNIQUE KEY `uq_ai_visual_candidate_pair_model` (`lost_item_id`, `found_item_id`, `model_id`, `model_revision`),
  KEY `idx_ai_visual_candidates_found_item_id` (`found_item_id`),
  CONSTRAINT `fk_ai_visual_candidate_lost` FOREIGN KEY (`lost_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_ai_visual_candidate_found` FOREIGN KEY (`found_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_ai_visual_distinct` CHECK (lost_item_id <> found_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
