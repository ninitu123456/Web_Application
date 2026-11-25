CREATE TABLE `item_verification_questions` (
  `question_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `position` TINYINT UNSIGNED NOT NULL,
  `question` VARCHAR(200) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`question_id`),
  UNIQUE KEY `uq_question_position` (`item_id`, `position`),
  CONSTRAINT `fk_question_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_question_position` CHECK (position >= 1 AND position <= 3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
