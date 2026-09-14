-- Syncaxis Leads Tracker - Migration: add LeadAttachments (file uploads on leads)
-- Run this once on the existing production database (does not touch existing data).
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 07_add_lead_attachments.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Files attached to a lead (quotes, photos, drawings, etc). The actual bytes
-- live on disk under <UPLOADS_DIR>/leads/<LeadId>/<StoredFileName> - this table
-- just tracks which files belong to which lead. StoredFileName is the
-- sanitized-original-name-on-disk (renamed only on collision), so the folder
-- stays human-browsable outside the app; OriginalFileName is what's shown/
-- downloaded-as in the UI.
CREATE TABLE dbo.LeadAttachments (
    Id                INT IDENTITY(1,1) PRIMARY KEY,
    LeadId            INT NOT NULL CONSTRAINT FK_LeadAttachments_Leads REFERENCES dbo.Leads(Id) ON DELETE CASCADE,
    OriginalFileName  NVARCHAR(260) NOT NULL,
    StoredFileName    NVARCHAR(260) NOT NULL,
    ContentType       NVARCHAR(200) NOT NULL,
    FileSizeBytes     BIGINT NOT NULL,
    UploadedBy        NVARCHAR(200) NULL,
    IsDeleted         BIT NOT NULL CONSTRAINT DF_LeadAttachments_IsDeleted DEFAULT 0,
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_LeadAttachments_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_LeadAttachments_LeadId ON dbo.LeadAttachments(LeadId) WHERE IsDeleted = 0;
GO

PRINT 'Done: LeadAttachments table created.';
GO
