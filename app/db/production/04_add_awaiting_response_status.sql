-- Syncaxis Leads Tracker - Migration: add 'Awaiting Response' follow-up status
-- Run this once on the existing production database (does not touch any data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 04_add_awaiting_response_status.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE dbo.Leads DROP CONSTRAINT CK_Leads_FollowUpStatus;
GO

ALTER TABLE dbo.Leads ADD CONSTRAINT CK_Leads_FollowUpStatus
    CHECK (FollowUpStatus IN ('Not Contacted','Contacted','Meeting Scheduled','Quotation Sent','Awaiting Response','Won','Lost','Not Relevant'));
GO

PRINT 'Done: FollowUpStatus now accepts ''Awaiting Response''.';
GO
