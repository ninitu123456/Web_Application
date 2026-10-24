CREATE TABLE `claims` (
  `claim_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `claimant_id` BIGINT UNSIGNED NOT NULL,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `proof_description` TEXT NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
  `submitted_at` DATETIME NOT NULL,
  `reviewed_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  PRIMARY KEY (`claim_id`),
  UNIQUE KEY `uq_claims_claimant_item` (`claimant_id`, `item_id`),
  KEY `idx_claims_item_id` (`item_id`),
  CONSTRAINT `fk_claims_claimant` FOREIGN KEY (`claimant_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_claims_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
