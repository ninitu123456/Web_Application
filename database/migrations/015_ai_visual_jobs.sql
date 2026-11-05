CREATE TABLE `ai_visual_jobs` (
  `job_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `image_id` BIGINT UNSIGNED NOT NULL,
  `model_id` VARCHAR(120) NOT NULL,
  `model_revision` VARCHAR(80) NOT NULL,
  `status` ENUM('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'QUEUED',
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `available_at` DATETIME NOT NULL,
  `locked_until` DATETIME NULL,
  `lease_token` CHAR(36) NULL,
  `last_error_code` VARCHAR(80) NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`job_id`),
  UNIQUE KEY `uq_ai_visual_job_image_model` (`image_id`, `model_id`, `model_revision`),
  KEY `idx_ai_visual_jobs_ready` (`status`, `available_at`, `job_id`),
  CONSTRAINT `fk_ai_visual_job_image` FOREIGN KEY (`image_id`) REFERENCES `item_images` (`image_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
