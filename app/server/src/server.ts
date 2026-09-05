import { createApp } from './app';
import { config } from './config';
import { getPool } from './db';

async function main() {
  await getPool();
  console.log('Connected to SQL Server:', config.db.server, '/', config.db.database);

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Syncaxis Leads Tracker API listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
