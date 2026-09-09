-- Syncaxis Leads Tracker - Migration: add Address and Pincode to Customers
-- Run this once on the existing production database (does not touch existing data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 06_add_address_pincode_to_customers.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.Customers ADD Address NVARCHAR(500) NULL;
GO
ALTER TABLE dbo.Customers ADD Pincode NVARCHAR(10) NULL;
GO

PRINT 'Done: Customers.Address and Customers.Pincode added.';
GO
