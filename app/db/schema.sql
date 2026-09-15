-- Syncaxis Leads Tracker - SQL Server schema (local development)
-- Run this against the target database (default: SyncaxisLeads) before starting the app.
-- Usage: sqlcmd -S <server> -d SyncaxisLeads -E -i schema.sql

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.LeadStageHistory', 'U') IS NOT NULL DROP TABLE dbo.LeadStageHistory;
IF OBJECT_ID('dbo.LeadAttachments', 'U') IS NOT NULL DROP TABLE dbo.LeadAttachments;
IF OBJECT_ID('dbo.Followups', 'U') IS NOT NULL DROP TABLE dbo.Followups;
IF OBJECT_ID('dbo.Leads', 'U') IS NOT NULL DROP TABLE dbo.Leads;
IF OBJECT_ID('dbo.Customers', 'U') IS NOT NULL DROP TABLE dbo.Customers;
GO

-- Customer Master: one row per company/contact. A customer can have many leads
-- (enquiries) raised against them over time.
CREATE TABLE dbo.Customers (
    Id                INT IDENTITY(1,1) PRIMARY KEY,
    CustomerCode      NVARCHAR(50)  NULL,
    CompanyName       NVARCHAR(300) NOT NULL,
    Department        NVARCHAR(200) NULL,
    ContactPersonName NVARCHAR(200) NULL,
    Email             NVARCHAR(200) NULL,
    Phone             NVARCHAR(50)  NULL,
    GSTIN             NVARCHAR(15)  NULL,
    Address           NVARCHAR(500) NULL,
    Country           NVARCHAR(100) NULL,
    State             NVARCHAR(100) NULL,
    City              NVARCHAR(100) NULL,
    Pincode           NVARCHAR(10)  NULL,
    AddedBy           NVARCHAR(200) NULL,
    UpdatedBy         NVARCHAR(200) NULL,
    IsDeleted         BIT           NOT NULL CONSTRAINT DF_Customers_IsDeleted DEFAULT 0,
    CreatedAt         DATETIME2     NOT NULL CONSTRAINT DF_Customers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt         DATETIME2     NOT NULL CONSTRAINT DF_Customers_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Leads Master: one row per enquiry, linked to the customer it was raised by/for.
CREATE TABLE dbo.Leads (
    Id                  INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId          INT NOT NULL CONSTRAINT FK_Leads_Customers REFERENCES dbo.Customers(Id),
    EnquiryNumber       NVARCHAR(50)    NULL,
    ApplicationCategory NVARCHAR(200)   NULL,
    ApplicationDetail   NVARCHAR(500)   NULL,
    ProductInterest     NVARCHAR(200)   NULL,
    CardCollected       NVARCHAR(20)    NOT NULL CONSTRAINT DF_Leads_CardCollected DEFAULT 'Not Recorded'
        CONSTRAINT CK_Leads_CardCollected CHECK (CardCollected IN ('Yes','No','Photo Only','Not Recorded')),
    FollowUpStatus      NVARCHAR(50)    NOT NULL CONSTRAINT DF_Leads_FollowUpStatus DEFAULT 'Not Contacted'
        CONSTRAINT CK_Leads_FollowUpStatus CHECK (FollowUpStatus IN ('Not Contacted','Contacted','Meeting Scheduled','Quotation Sent','Awaiting Response','Won','Lost','Not Relevant')),
    Priority            NVARCHAR(20)    NOT NULL CONSTRAINT DF_Leads_Priority DEFAULT 'Warm'
        CONSTRAINT CK_Leads_Priority CHECK (Priority IN ('Hot','Warm','Cold')),
    InquirySource       NVARCHAR(200)   NULL,
    LeadType            NVARCHAR(50)    NOT NULL CONSTRAINT DF_Leads_LeadType DEFAULT 'Other'
        CONSTRAINT CK_Leads_LeadType CHECK (LeadType IN ('Project','Trading','Other')),
    MovedToSourcePro    BIT             NOT NULL CONSTRAINT DF_Leads_MovedToSourcePro DEFAULT 0,
    LeadValue           DECIMAL(18,2)   NULL,
    LeadGeneratedBy     NVARCHAR(200)   NULL,
    EnquiryAssignedTo   NVARCHAR(200)   NULL,
    UpdatedBy           NVARCHAR(200)   NULL,
    NextFollowUpDate    DATE            NULL,
    ErpLeadNumber       NVARCHAR(100)   NULL,
    OrderNo             NVARCHAR(100)   NULL,
    OrderDate           DATE            NULL,
    ReceivedDate        DATE            NULL,
    Notes               NVARCHAR(MAX)   NULL,
    IsDeleted           BIT             NOT NULL CONSTRAINT DF_Leads_IsDeleted DEFAULT 0,
    CreatedAt           DATETIME2       NOT NULL CONSTRAINT DF_Leads_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2       NOT NULL CONSTRAINT DF_Leads_UpdatedAt DEFAULT SYSUTCDATETIME()
);
GO

CREATE TABLE dbo.Followups (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    LeadId          INT NOT NULL CONSTRAINT FK_Followups_Leads REFERENCES dbo.Leads(Id) ON DELETE CASCADE,
    FollowUpDate    DATE NOT NULL,
    FollowUpBy      NVARCHAR(200) NULL,
    Note            NVARCHAR(MAX) NULL,
    CreatedAt       DATETIME2 NOT NULL CONSTRAINT DF_Followups_CreatedAt DEFAULT SYSUTCDATETIME()
);
GO

-- Files attached to a lead (quotes, photos, drawings, etc). The actual bytes
-- live on disk under <UPLOADS_DIR>/leads/<EnquiryNumber>/<FileName> - this
-- table just tracks which files belong to which lead. FileName is the
-- standardized <EnquiryNumber>_<timestamp> name actually on disk (also what's
-- shown/downloaded-as in the UI) - there's no separate "original upload name"
-- kept anywhere.
CREATE TABLE dbo.LeadAttachments (
    Id                INT IDENTITY(1,1) PRIMARY KEY,
    LeadId            INT NOT NULL CONSTRAINT FK_LeadAttachments_Leads REFERENCES dbo.Leads(Id) ON DELETE CASCADE,
    FileName          NVARCHAR(260) NOT NULL,
    ContentType       NVARCHAR(200) NOT NULL,
    FileSizeBytes     BIGINT NOT NULL,
    UploadedBy        NVARCHAR(200) NULL,
    IsDeleted         BIT NOT NULL CONSTRAINT DF_LeadAttachments_IsDeleted DEFAULT 0,
    CreatedAt         DATETIME2 NOT NULL CONSTRAINT DF_LeadAttachments_CreatedAt DEFAULT SYSUTCDATETIME()
);
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

CREATE UNIQUE INDEX UX_Customers_CustomerCode ON dbo.Customers(CustomerCode) WHERE CustomerCode IS NOT NULL;
CREATE INDEX IX_Customers_CompanyName ON dbo.Customers(CompanyName) WHERE IsDeleted = 0;
CREATE INDEX IX_Customers_Email ON dbo.Customers(Email) WHERE IsDeleted = 0;
CREATE INDEX IX_Customers_Phone ON dbo.Customers(Phone) WHERE IsDeleted = 0;

CREATE INDEX IX_Leads_CustomerId ON dbo.Leads(CustomerId) WHERE IsDeleted = 0;
CREATE INDEX IX_Leads_FollowUpStatus ON dbo.Leads(FollowUpStatus) WHERE IsDeleted = 0;
CREATE INDEX IX_Leads_Priority ON dbo.Leads(Priority) WHERE IsDeleted = 0;
CREATE INDEX IX_Leads_NextFollowUpDate ON dbo.Leads(NextFollowUpDate) WHERE IsDeleted = 0;
CREATE INDEX IX_Leads_EnquiryAssignedTo ON dbo.Leads(EnquiryAssignedTo) WHERE IsDeleted = 0;

CREATE INDEX IX_Followups_LeadId ON dbo.Followups(LeadId);

CREATE INDEX IX_LeadAttachments_LeadId ON dbo.LeadAttachments(LeadId) WHERE IsDeleted = 0;

CREATE INDEX IX_LeadStageHistory_LeadId ON dbo.LeadStageHistory(LeadId);
GO
