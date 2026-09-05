-- Syncaxis Leads Tracker - Step 2: Create the application's SQL login
-- Run this on SYNCAXIS-SERVER\SQLEXPRESS as a sysadmin, AFTER 01_create_database.sql.
-- This requires SQL Server to have "SQL Server and Windows Authentication mode" (mixed mode)
-- enabled. If it's currently Windows-only, enable it in:
--   SSMS -> right-click server -> Properties -> Security -> "SQL Server and Windows Authentication mode"
-- then restart the SQL Server service, before running this script.
--
-- Usage (pass the login's password as a sqlcmd variable - it's never
-- hardcoded in this file):
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -v SqlPassword="<choose a strong password>" -i 02_create_login_and_user.sql

-- Server-level login used by the app to connect.
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'syncaxis_leads_app')
BEGIN
    CREATE LOGIN syncaxis_leads_app
        WITH PASSWORD = N'$(SqlPassword)',
        CHECK_POLICY = ON,
        CHECK_EXPIRATION = OFF;
END
GO

USE SYNCAXIS_LEADS;
GO

-- Database-level user mapped to that login.
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'syncaxis_leads_app')
BEGIN
    CREATE USER syncaxis_leads_app FOR LOGIN syncaxis_leads_app;
END
GO

-- Least-privilege access: the app only reads/writes rows, it never needs to
-- alter the schema, so db_owner is intentionally NOT granted.
ALTER ROLE db_datareader ADD MEMBER syncaxis_leads_app;
ALTER ROLE db_datawriter ADD MEMBER syncaxis_leads_app;
GO
