# Syncaxis Leads Tracker

An internal tool for the sales/marketing team to create, update, delete, and follow up on
leads, backed by SQL Server. Data is normalized into three tables: a **Customer Master**
(one row per company/contact), a **Leads Master** (one row per enquiry, linked to a
customer), and **Followups** (the dated follow-up history for a lead).

## Project layout

The root only holds this file, `start.bat`/`stop.bat`, and the `app/` folder —
everything else lives inside it.

```
start.bat / stop.bat     Start/stop the Windows Service (see Production deployment below)
app/
  server/                Node.js + Express + TypeScript API, serves the built client too
    src/                 Application source (routes, auth, db access, mappers)
    db/import-from-excel.ts  One-time migration script (run via `npm run import-excel`)
  client/                React + Vite + TypeScript single-page app
    src/                 Pages, components, charts, API client
  db/
    schema.sql           Schema for local development (run against any throwaway dev DB)
    production/          Numbered DDL scripts to run yourself against SYNCAXIS-SERVER\SQLEXPRESS
  deploy/
    WINDOWS_DEPLOYMENT.md  Full step-by-step production deployment guide
  resources/             Original Excel tracker (read by the import script)
```

## Features

- Leads list with search (company/contact/email/phone/enquiry #) and filters
  (status, priority, lead type, assignee), sortable, paginated.
- Add / edit / delete leads (delete is a soft-delete — rows are hidden, not destroyed).
  Adding a lead uses a search-or-create customer picker: search existing customers by
  company/contact/email/phone, or fill in new details to create one on the fly.
- Lead detail page showing every field from the original tracker, with a link through to
  the linked customer.
- Follow-up log per lead: add a dated follow-up note (who, what, optionally advance the
  status and set the next follow-up date), see the full history, delete individual entries.
- Customer Master: a separate "Customers" section to search/list customers, view/edit a
  customer's contact details, and see every lead ever raised against them in one place.
- One-time import script that migrates the existing Excel tracker into SQL Server,
  deduplicating customers (by Customer ID, or company name when that's blank) and turning
  the "Notes Log" column into individual follow-up entries.
- Dashboard homepage: pipeline/financial/operational KPI tiles, status/priority/source/
  assignee breakdowns, and a product win-loss table — every number links through to the
  matching filtered leads list.
- Single shared team login (not per-user accounts) gating the whole app.

## Database

You run all DDL yourself — see `app/db/production/README.md` for the three scripts
(create database → create login → create tables) and the SQL Server Express
connectivity prerequisites (mixed-mode auth, TCP/IP, SQL Browser, firewall).

For local development against a throwaway SQL Server, `app/db/schema.sql` creates just
the tables (assumes the database and a login already exist).

## Local development

```powershell
# Terminal 1 - API server
cd app\server
npm install
copy .env.example .env   # then edit with your DB connection details
npm run dev               # http://localhost:4000

# Terminal 2 - client (hot reload, proxies /api to :4000)
cd app\client
npm install
npm run dev                # http://localhost:5173
```

## Production deployment

See `app/deploy/WINDOWS_DEPLOYMENT.md` for the full step-by-step: building both halves,
firewall rules, and optionally fronting it with IIS.

Once built, day-to-day control is just the two scripts in the repo root:

```
start.bat   # installs the Windows Service the first time, starts it every time after
stop.bat    # stops it
```
