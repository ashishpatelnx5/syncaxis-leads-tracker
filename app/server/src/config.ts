import dotenv from 'dotenv';
import crypto from 'crypto';

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
  auth: {
    // Single shared login for the whole team (not per-user accounts).
    username: process.env.AUTH_USERNAME || 'syncaxis',
    password: process.env.AUTH_PASSWORD || 'changeme',
    // Signs session cookies. Not persisted across restarts unless set via env,
    // which just means everyone's session resets (re-login) when the app restarts.
    sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  },
};
