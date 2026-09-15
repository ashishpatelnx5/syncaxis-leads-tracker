import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// DB_SERVER may be a plain host ("localhost", "SYNCAXIS-SERVER") or a named
// instance in "HOST\INSTANCE" form (e.g. "SYNCAXIS-SERVER\SQLEXPRESS"). Named
// instances are resolved via the SQL Server Browser service (UDP 1434) instead
// of a fixed port, so `port` and `instanceName` are mutually exclusive.
function parseServer(raw: string): { server: string; instanceName?: string } {
  const [server, instanceName] = raw.split('\\');
  return instanceName ? { server, instanceName } : { server };
}

const { server, instanceName } = parseServer(process.env.DB_SERVER || 'localhost');

export const config = {
  port: Number(process.env.PORT) || 4000,
  db: {
    server,
    instanceName,
    port: instanceName ? undefined : Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'SyncaxisLeads',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
  },
  portal: {
    // Base URL of the Syncaxis Company Portal - the source of truth for user
    // accounts and access control (Portal Admin > Roles). This app has no
    // login credentials of its own: it proxies /auth/login to the Portal
    // server-to-server, and periodically re-checks a session against
    // /api/auth/me for as long as it's active.
    apiUrl: (process.env.PORTAL_API_URL || 'http://localhost:8050').replace(/\/$/, ''),
  },
  uploads: {
    // Root folder for lead attachments, organized as <dir>/leads/<leadId>/<file>.
    // Configurable so it can point at any drive/path on the server - keep it
    // outside app/server/dist and app/client/dist so a rebuild never touches it.
    dir: process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads'),
  },
};
