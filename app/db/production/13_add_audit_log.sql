-- Syncaxis Leads Tracker - Migration: add AuditLog (admin-only activity trail).
-- Run this once on the existing production database.
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 13_add_audit_log.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- One row per tracked user action (auth events, and create/update/delete on
-- leads/customers/followups/attachments, including denied attempts). UserId
-- is syncaxis-iam's numeric user id, not a local FK (this app has no Users
-- table of its own); Username/DisplayName are denormalized so a log entry
-- stays readable even if that account is later renamed or deactivated.
CREATE TABLE dbo.AuditLog (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    UserId       INT           NULL,
    Username     NVARCHAR(200) NULL,
    DisplayName  NVARCHAR(200) NULL,
    Action       NVARCHAR(100) NOT NULL,
    EntityType   NVARCHAR(50)  NULL,
    EntityId     INT           NULL,
    Success      BIT           NOT NULL CONSTRAINT DF_AuditLog_Success DEFAULT 1,
    Details      NVARCHAR(MAX) NULL,
    IpAddress    NVARCHAR(50)  NULL,
    CreatedAt    DATETIME2     NOT NULL CONSTRAINT DF_AuditLog_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_AuditLog_CreatedAt ON dbo.AuditLog(CreatedAt DESC);
CREATE INDEX IX_AuditLog_UserId ON dbo.AuditLog(UserId);
CREATE INDEX IX_AuditLog_Action ON dbo.AuditLog(Action);
CREATE INDEX IX_AuditLog_EntityType_EntityId ON dbo.AuditLog(EntityType, EntityId);
GO

PRINT 'Done: AuditLog created.';
GO
