CREATE TABLE `ai_visual_catalog_state` (
  `state_id` TINYINT UNSIGNED NOT NULL,
  `revision` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`state_id`),
  CONSTRAINT `ck_ai_visual_catalog_singleton` CHECK (state_id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
