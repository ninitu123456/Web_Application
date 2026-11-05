CREATE TABLE `item_image_embeddings` (
  `embedding_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `image_id` BIGINT UNSIGNED NOT NULL,
  `model_id` VARCHAR(120) NOT NULL,
  `model_revision` VARCHAR(80) NOT NULL,
  `dimensions` SMALLINT UNSIGNED NOT NULL,
  `embedding_data` BLOB NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`embedding_id`),
  UNIQUE KEY `uq_image_embedding_model` (`image_id`, `model_id`, `model_revision`),
  CONSTRAINT `fk_embedding_image` FOREIGN KEY (`image_id`) REFERENCES `item_images` (`image_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ck_embedding_dimensions` CHECK (dimensions = 512)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
