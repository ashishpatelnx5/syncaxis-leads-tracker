-- Syncaxis Leads Tracker - Step 1: Create the database
-- Run this on your production SQL Server (SYNCAXIS-SERVER\SQLEXPRESS) as a sysadmin.
-- Usage (from an elevated/DBA session):
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 01_create_database.sql
-- or open and execute in SQL Server Management Studio (SSMS).

IF DB_ID(N'SYNCAXIS_LEADS') IS NULL
BEGIN
    CREATE DATABASE SYNCAXIS_LEADS;
END
GO

ALTER DATABASE SYNCAXIS_LEADS SET RECOVERY SIMPLE;
GO
