-- Syncaxis Leads Tracker - Migration: drop LeadAttachments.OriginalFileName,
-- rename StoredFileName to FileName.
-- Run this once on the existing production database.
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 09_simplify_lead_attachments_filename.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.LeadAttachments DROP COLUMN OriginalFileName;
GO

EXEC sp_rename 'dbo.LeadAttachments.StoredFileName', 'FileName', 'COLUMN';
GO

PRINT 'Done: LeadAttachments.OriginalFileName dropped, StoredFileName renamed to FileName.';
GO
