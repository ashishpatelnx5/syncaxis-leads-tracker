-- Syncaxis Leads Tracker - Migration: rename "Enquiry" to "Inquiry" throughout
-- (Leads columns, their index, and the LeadStageHistory.Stage value + its
-- CHECK constraint). Run this once on the existing production database.
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 12_rename_enquiry_to_inquiry.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

EXEC sp_rename 'dbo.Leads.EnquiryNumber', 'InquiryNumber', 'COLUMN';
GO
EXEC sp_rename 'dbo.Leads.EnquiryAssignedTo', 'InquiryAssignedTo', 'COLUMN';
GO
EXEC sp_rename 'dbo.Leads.IX_Leads_EnquiryAssignedTo', 'IX_Leads_InquiryAssignedTo', 'INDEX';
GO

-- The CHECK constraint has to come off before the data update below, or the
-- update itself gets rejected for writing a value ('Inquiry') the old
-- constraint doesn't allow yet.
ALTER TABLE dbo.LeadStageHistory DROP CONSTRAINT CK_LeadStageHistory_Stage;
GO

UPDATE dbo.LeadStageHistory SET Stage = 'Inquiry' WHERE Stage = 'Enquiry';
GO

ALTER TABLE dbo.LeadStageHistory ADD CONSTRAINT CK_LeadStageHistory_Stage CHECK (Stage IN ('Inquiry','Discovery','Quotation','SalesOrder','Closed'));
GO

PRINT 'Done: Enquiry renamed to Inquiry (Leads columns, index, LeadStageHistory data + constraint).';
GO
