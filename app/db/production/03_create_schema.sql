-- Syncaxis Leads Tracker - Step 3: Create tables and indexes
-- Run this on SYNCAXIS-SERVER\SQLEXPRESS, AFTER 01_create_database.sql and 02_create_login_and_user.sql.
-- Usage:
--   sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 03_create_schema.sql

USE SYNCAXIS_LEADS;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

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
    Country           NVARCHAR(100) NULL,
    State             NVARCHAR(100) NULL,
    City              NVARCHAR(100) NULL,
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
        CONSTRAINT CK_Leads_FollowUpStatus CHECK (FollowUpStatus IN ('Not Contacted','Contacted','Meeting Scheduled','Quotation Sent','Won','Lost','Not Relevant')),
    Priority            NVARCHAR(20)    NOT NULL CONSTRAINT DF_Leads_Priority DEFAULT 'Warm'
        CONSTRAINT CK_Leads_Priority CHECK (Priority IN ('Hot','Warm','Cold')),
    InquirySource       NVARCHAR(200)   NULL,
    LeadType            NVARCHAR(50)    NOT NULL CONSTRAINT DF_Leads_LeadType DEFAULT 'Other'
        CONSTRAINT CK_Leads_LeadType CHECK (LeadType IN ('Project','Trading','Other')),
    MovedToSourcePro    BIT             NOT NULL CONSTRAINT DF_Leads_MovedToSourcePro DEFAULT 0,
    LeadValue           DECIMAL(18,2)   NULL,
    LeadGeneratedBy     NVARCHAR(200)   NULL,
    EnquiryAssignedTo   NVARCHAR(200)   NULL,
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
GO
