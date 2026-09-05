# Production database setup — SYNCAXIS-SERVER\SQLEXPRESS

Run these three scripts, in order, on the production server (via SSMS or `sqlcmd`), as a
SQL Server sysadmin (typically a Windows account that's an admin on that machine):

1. `01_create_database.sql` — creates the `SYNCAXIS_LEADS` database.
2. `02_create_login_and_user.sql` — creates the `syncaxis_leads_app` SQL login the app
   connects with, and grants it `db_datareader` + `db_datawriter` only on `SYNCAXIS_LEADS`
   (not `db_owner` — the app never needs to change the schema at runtime).
3. `03_create_schema.sql` — creates the `Customers`, `Leads`, and `Followups` tables and their indexes.

```powershell
sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 01_create_database.sql
sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -v SqlPassword="<choose a strong password>" -i 02_create_login_and_user.sql
sqlcmd -S SYNCAXIS-SERVER\SQLEXPRESS -E -i 03_create_schema.sql
```

Whatever you pass as `SqlPassword` above is what you'll then put in `DB_PASSWORD` in
`app/server/.env` (step "After running these scripts" below) — it's never written to
disk by this script itself.

(`-E` uses your current Windows login, which must be a sysadmin on the instance. Run these
directly on the server, or from a machine that already has network/firewall access to it.)

## Prerequisites specific to SQL Server Express + named instances

A default **SQLEXPRESS** install usually needs a few things turned on before any app
(not just this one) can reach it over the network — check these on the server:

1. **Mixed-mode authentication** — the app connects with a SQL login (`syncaxis_leads_app`),
   not a Windows account, so the instance must allow SQL Server authentication:
   SSMS → right-click the server → **Properties** → **Security** →
   "SQL Server and Windows Authentication mode" → OK → restart the SQL Server service.
2. **TCP/IP protocol enabled** — Express edition ships with TCP/IP off by default:
   open **SQL Server Configuration Manager** → SQL Server Network Configuration →
   Protocols for SQLEXPRESS → enable **TCP/IP** → restart the SQL Server service.
3. **SQL Server Browser service running** — named instances (`\SQLEXPRESS`) listen on a
   dynamic port; the Browser service lets clients resolve it by instance name. In
   **Services** (services.msc), find **SQL Server Browser**, set it to **Automatic**, and
   start it.
4. **Firewall** — allow inbound traffic to:
   - the SQL Server TCP port (`sqlservr.exe`, or a specific port if you set one static), and
   - UDP 1434 (for the Browser service), if the app server is a different machine than
     SYNCAXIS-SERVER.

If you'd rather avoid the Browser service/dynamic-port dance, you can instead set a fixed
TCP port on the SQLEXPRESS instance (e.g. 1433) in Configuration Manager, open just that
port in the firewall, and set `DB_PORT` in the app's `.env` accordingly — the app already
supports connecting by host+port with no instance name in that case.

## After running these scripts

The app's `app/server/.env` should contain:

```
DB_SERVER=SYNCAXIS-SERVER\SQLEXPRESS
DB_NAME=SYNCAXIS_LEADS
DB_USER=syncaxis_leads_app
DB_PASSWORD=<the SqlPassword you chose above>
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

Once the tables exist, you can optionally migrate the existing Excel tracker
(under `app/resources/`) into this database by running, from the `app/server` folder
on a machine that can reach SYNCAXIS-SERVER:

```
npm run import-excel
```

This is safe to run once against an empty `Leads` table; re-running it will insert
duplicate rows, since it doesn't check for existing enquiry numbers.
