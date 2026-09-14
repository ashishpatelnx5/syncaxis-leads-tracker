-- Syncaxis Leads Tracker - Migration: add AddedBy to Customers
-- Run this once on the existing production database (does not touch existing data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 08_add_addedby_to_customers.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.Customers ADD AddedBy NVARCHAR(200) NULL;
GO

PRINT 'Done: Customers.AddedBy added.';
GO
