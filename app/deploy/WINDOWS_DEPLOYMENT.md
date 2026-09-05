# Deploying Syncaxis Leads Tracker on your Windows Server

The app is a single Node.js process: it serves the REST API under `/api/*` and the
built React app for everything else, on one port (`8057` by default). There's nothing
else to run — no separate frontend server, no IIS required (though you can optionally
put IIS in front of it for SSL/port 80, see the bottom of this doc).

`start.bat` and `stop.bat` in the repo root control it as a Windows Service and are
used throughout this guide.

## 1. Prerequisites on the server

- **Node.js 20 LTS** (or newer) installed — https://nodejs.org, "Windows Installer (.msi)".
  Verify with `node -v` and `npm -v` in a new PowerShell/Command Prompt window.
- Network line-of-sight from this server to `SYNCAXIS-SERVER\SQLEXPRESS` (same box is
  fine too), with the SQL Server prerequisites from `app/db/production/README.md`
  already done (mixed-mode auth, TCP/IP enabled, SQL Browser running, firewall).
- The three scripts in `app/db/production/` already run against `SYNCAXIS_LEADS`.
- **NSSM** downloaded from https://nssm.cc/download and `nssm.exe` (the `win64` build)
  placed at `C:\Tools\nssm.exe` — used by `start.bat` to run the app as a Windows
  Service. If you put it somewhere else, edit the `NSSM` path near the top of
  `start.bat` and `stop.bat`.

## 2. Copy the project to the server

Copy the whole project folder to the server, e.g. to `C:\Apps\SyncaxisLeadsTracker`.
(Via git clone, a zip copy, or a shared drive — whatever your team normally uses to move
code to this box.) `start.bat`/`stop.bat` find `app\server` relative to their own
location, so it doesn't matter exactly where you put it.

## 3. Build the server

```powershell
cd C:\Apps\SyncaxisLeadsTracker\app\server
npm install
copy .env.example .env
notepad .env
```

Edit `.env` to match production:

```
PORT=8057

DB_SERVER=SYNCAXIS-SERVER\SQLEXPRESS
DB_NAME=SYNCAXIS_LEADS
DB_USER=syncaxis_leads_app
DB_PASSWORD=<the password you set for syncaxis_leads_app in db/production/02_create_login_and_user.sql>
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

AUTH_USERNAME=syncaxis
AUTH_PASSWORD=<choose a password for the team login>
SESSION_SECRET=
```

`SESSION_SECRET` can be left blank — a random one is generated at startup — but if you
leave it blank, everyone is signed out whenever the service restarts (a redeploy, a
server reboot). Set it to a fixed random string here to avoid that.

Then compile the TypeScript server:

```powershell
npm run build
```

## 4. Build the client

```powershell
cd C:\Apps\SyncaxisLeadsTracker\app\client
npm install
npm run build
```

This produces `app/client/dist`, which the server serves automatically — no separate
web server needed for the frontend.

## 5. One-time: import the existing Excel leads (optional)

If you want your existing leads from the spreadsheet in the new system instead of
starting empty:

```powershell
cd C:\Apps\SyncaxisLeadsTracker\app\server
npm run import-excel
```

This reads the workbook under `app/resources/` and inserts each row as a lead
(deduplicating customers), plus turns the "Notes Log" column into individual follow-up
entries. Only run this once against an empty `Leads` table — running it twice will
duplicate everything.

## 6. Start it

From the repo root, double-click **`start.bat`** (or run it from a terminal). The first
time you run it, it installs the Windows Service automatically — registering it with
NSSM, pointing its logs at `app\server\logs\out.log` / `err.log`, and setting it to
auto-start on boot — then starts it. Every time after that, it just starts the
already-installed service.

```
C:\Apps\SyncaxisLeadsTracker> start.bat
```

Check it's up: open `http://localhost:8057` in a browser on the server, or
`http://<server-name>:8057` from another machine on the network.

## 7. Stop it

Double-click **`stop.bat`** (or run it from a terminal) to stop the service. Files, the
database, and `.env` are untouched — `start.bat` will start it right back up again.

```
C:\Apps\SyncaxisLeadsTracker> stop.bat
```

You can also use Windows' built-in **Services** app (`services.msc`) — look for
"SyncaxisLeadsTracker" — to start/stop it from a GUI, or check its status alongside
other services.

## 8. Firewall

Allow inbound TCP on port 8057 (or whatever `PORT` you set in `.env`):

```powershell
New-NetFirewallRule -DisplayName "Syncaxis Leads Tracker" -Direction Inbound -Protocol TCP -LocalPort 8057 -Action Allow
```

Your sales/marketing team can then reach it at `http://<server-name>:8057` from their
browsers on the office network.

## 9. Optional: put IIS in front (for a friendlier URL, or HTTPS)

If you'd rather your team visit `http://leads.company.local` (port 80) or a proper HTTPS
URL instead of `:8057`, install IIS with the **Application Request Routing (ARR)** and
**URL Rewrite** modules, then set up a reverse-proxy site that forwards everything to
`http://localhost:8057`. This is optional — the app works fine without IIS.

## 10. Updating the app later

```
C:\Apps\SyncaxisLeadsTracker> stop.bat
```

1. Copy in the updated files (or `git pull`).
2. Rebuild: `npm install && npm run build` in `app\server`, and `npm install && npm run build`
   in `app\client`.
3. `start.bat`

## 11. Removing the service entirely

If you ever need to reinstall it with different settings, remove the existing service
first (this doesn't touch your files, database, or `.env`):

```powershell
C:\Tools\nssm.exe stop SyncaxisLeadsTracker
C:\Tools\nssm.exe remove SyncaxisLeadsTracker confirm
```

`start.bat` will register it fresh the next time you run it.
