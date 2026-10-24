CREATE TABLE `matches` (
  `match_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lost_item_id` BIGINT UNSIGNED NOT NULL,
  `found_item_id` BIGINT UNSIGNED NOT NULL,
  `match_score` DECIMAL(5,2) NOT NULL,
  `reasons` JSON NULL,
  `status` ENUM('POTENTIAL','CONFIRMED','REJECTED') NOT NULL DEFAULT 'POTENTIAL',
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`match_id`),
  UNIQUE KEY `uq_matches_pair` (`lost_item_id`, `found_item_id`),
  KEY `idx_matches_found_item_id` (`found_item_id`),
  CONSTRAINT `fk_matches_lost` FOREIGN KEY (`lost_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_matches_found` FOREIGN KEY (`found_item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_matches_score` CHECK (match_score >= 0 AND match_score <= 100),
  CONSTRAINT `ck_matches_distinct` CHECK (lost_item_id <> found_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
