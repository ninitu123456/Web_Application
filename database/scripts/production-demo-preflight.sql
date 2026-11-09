-- READ ONLY. Run each statement separately in Railway MySQL > Data > Query.
-- Uses findit_db explicitly; the Data UI may default to a different database.
-- Share only metadata/count results, never credentials or SELECT * FROM users.
SELECT @@server_uuid AS server_uuid, @@version AS mysql_version,
       @@read_only AS server_read_only, @@log_bin AS binlog_enabled;

SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'findit_db';

SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'findit_db' ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'findit_db'
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'findit_db' AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT version, checksum, status FROM findit_db._schema_migrations ORDER BY version;
SELECT state_id, revision FROM findit_db.ai_visual_catalog_state;
SELECT role_id, name FROM findit_db.roles ORDER BY role_id;
SELECT category_id, name, is_active FROM findit_db.categories ORDER BY category_id;
SELECT location_id, name, is_active FROM findit_db.locations ORDER BY location_id;

SELECT (SELECT COUNT(*) FROM findit_db.users) AS users,
       (SELECT COUNT(*) FROM findit_db.items) AS items,
       (SELECT COUNT(*) FROM findit_db.item_images) AS item_images,
       (SELECT COUNT(*) FROM findit_db.items WHERE type='LOST') AS lost,
       (SELECT COUNT(*) FROM findit_db.items WHERE type='FOUND') AS found,
       (SELECT COUNT(*) FROM findit_db.items WHERE private_identifiers LIKE 'findit:production-demo:v1:%') AS demo_items;

SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='findit_db';
SELECT EVENT_NAME, STATUS FROM information_schema.EVENTS WHERE EVENT_SCHEMA='findit_db';
SHOW GRANTS FOR CURRENT_USER;

-- These two rows are synthetic owner reservations; only return booleans/counts.
SELECT COUNT(*) AS reserved_demo_emails_already_used FROM findit_db.users
WHERE email IN ('lost-owner@demo.findit.invalid','found-owner@demo.findit.invalid');
