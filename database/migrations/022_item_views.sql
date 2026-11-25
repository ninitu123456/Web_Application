CREATE TABLE `item_views` (
  `view_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `viewer_key` CHAR(64) NOT NULL,
  `viewed_at` DATETIME NOT NULL,
  PRIMARY KEY (`view_id`),
  KEY `idx_item_view_dedupe` (`item_id`, `viewer_key`, `viewed_at`),
  CONSTRAINT `fk_view_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
