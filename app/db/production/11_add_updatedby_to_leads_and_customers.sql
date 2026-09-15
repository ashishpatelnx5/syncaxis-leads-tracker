-- Syncaxis Leads Tracker - Migration: add UpdatedBy to Leads and Customers
-- Run this once on the existing production database (does not touch existing data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 11_add_updatedby_to_leads_and_customers.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.Leads ADD UpdatedBy NVARCHAR(200) NULL;
GO

ALTER TABLE dbo.Customers ADD UpdatedBy NVARCHAR(200) NULL;
GO

PRINT 'Done: Leads.UpdatedBy and Customers.UpdatedBy added.';
GO
