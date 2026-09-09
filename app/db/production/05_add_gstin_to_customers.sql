-- Syncaxis Leads Tracker - Migration: add GSTIN to Customers
-- Run this once on the existing production database (does not touch existing data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 05_add_gstin_to_customers.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.Customers ADD GSTIN NVARCHAR(15) NULL;
GO

PRINT 'Done: Customers.GSTIN added.';
GO
