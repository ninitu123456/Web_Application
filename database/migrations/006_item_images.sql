CREATE TABLE `item_images` (
  `image_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `item_id` BIGINT UNSIGNED NOT NULL,
  `image_url` VARCHAR(1000) NOT NULL,
  `cloudinary_public_id` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`image_id`),
  KEY `idx_item_images_item_id` (`item_id`),
  CONSTRAINT `fk_images_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
