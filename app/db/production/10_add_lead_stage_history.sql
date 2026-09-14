-- Syncaxis Leads Tracker - Migration: add LeadStageHistory (per-stage aging
-- for the Leads pipeline/board view).
-- Run this once on the existing production database.
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 10_add_lead_stage_history.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- One row per stage a lead has ever entered (Enquiry/Discovery/Quotation/
-- SalesOrder/Closed), timestamped - lets the pipeline view compute how long
-- a lead spent in each stage ("aging"), not just its current status.
CREATE TABLE dbo.LeadStageHistory (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    LeadId      INT NOT NULL CONSTRAINT FK_LeadStageHistory_Leads REFERENCES dbo.Leads(Id) ON DELETE CASCADE,
    Stage       NVARCHAR(20) NOT NULL
        CONSTRAINT CK_LeadStageHistory_Stage CHECK (Stage IN ('Enquiry','Discovery','Quotation','SalesOrder','Closed')),
    EnteredAt   DATETIME2 NOT NULL CONSTRAINT DF_LeadStageHistory_EnteredAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_LeadStageHistory_LeadId ON dbo.LeadStageHistory(LeadId);
GO

-- Backfill: one row per existing lead, for its current stage, backdated to
-- UpdatedAt (the closest thing to "when it last changed status" available
-- today). Aging before this migration is only approximate; everything from
-- here on is tracked precisely as stage changes happen.
INSERT INTO dbo.LeadStageHistory (LeadId, Stage, EnteredAt)
SELECT
    Id,
    CASE
        WHEN FollowUpStatus IN ('Not Contacted', 'Contacted') THEN 'Enquiry'
        WHEN FollowUpStatus = 'Meeting Scheduled' THEN 'Discovery'
        WHEN FollowUpStatus IN ('Quotation Sent', 'Awaiting Response') THEN 'Quotation'
        WHEN FollowUpStatus = 'Won' THEN 'SalesOrder'
        ELSE 'Closed'
    END,
    UpdatedAt
FROM dbo.Leads
WHERE IsDeleted = 0;
GO

PRINT 'Done: LeadStageHistory created and backfilled.';
GO
