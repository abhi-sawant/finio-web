-- Finio Backend Database Schema
-- Run this entire file once in cPanel > phpMyAdmin after creating your database.

CREATE TABLE IF NOT EXISTS `users` (
    `id`                  INT          NOT NULL AUTO_INCREMENT,
    `name`                VARCHAR(100) NOT NULL,
    `email`               VARCHAR(255) NOT NULL,
    `password_hash`       VARCHAR(255) NOT NULL,
    `is_verified`         TINYINT(1)   NOT NULL DEFAULT 0,
    `otp_hash`            VARCHAR(64)  NULL DEFAULT NULL,
    `otp_expires`         DATETIME     NULL DEFAULT NULL,
    `reset_token_hash`    VARCHAR(255) NULL DEFAULT NULL,
    `reset_token_expires` DATETIME     NULL DEFAULT NULL,
    `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backups` (
    `id`          INT  NOT NULL AUTO_INCREMENT,
    `user_id`     INT  NOT NULL,
    `backup_date` DATE NOT NULL,
    `file_size`   INT  NOT NULL DEFAULT 0,
    `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_user_date` (`user_id`, `backup_date`),
    CONSTRAINT `fk_backups_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
