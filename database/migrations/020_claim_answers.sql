CREATE TABLE `claim_answers` (
  `answer_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `claim_id` BIGINT UNSIGNED NOT NULL,
  `question_id` BIGINT UNSIGNED NOT NULL,
  `answer` VARCHAR(300) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`answer_id`),
  UNIQUE KEY `uq_claim_answer` (`claim_id`, `question_id`),
  KEY `idx_claim_answers_question_id` (`question_id`),
  CONSTRAINT `fk_answer_claim` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`claim_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_answer_question` FOREIGN KEY (`question_id`) REFERENCES `item_verification_questions` (`question_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
