import sql from 'mssql';
import { config } from './config';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: config.db.server,
      ...(config.db.port ? { port: config.db.port } : {}),
      database: config.db.database,
      user: config.db.user || undefined,
      password: config.db.password || undefined,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
        ...(config.db.instanceName ? { instanceName: config.db.instanceName } : {}),
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    })
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

export { sql };
