-- Runs the whole database setup in the right order.
-- From the project root, in the VS Code terminal:
--     mysql -u root -p < database/00_run_all.sql
-- (SOURCE paths below are relative to the folder you run the command from)

SOURCE database/01_schema.sql;
SOURCE database/02_triggers_procedures.sql;
SOURCE database/03_seed.sql;
SOURCE database/04_views.sql;
SOURCE database/07_auth.sql;
