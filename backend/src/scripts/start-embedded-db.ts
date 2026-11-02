import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(__dirname, '../../data/postgres');

async function start() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    persistent: true,
  });

  try {
    console.log('Initializing PostgreSQL cluster at:', dataDir);
    await pg.initialise();
    console.log('PostgreSQL initialized.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Initialise note:', message);
  }

  console.log('Starting PostgreSQL server on port 5432...');
  await pg.start();
  console.log('PostgreSQL started on port 5432!');

  try {
    await pg.createDatabase('assessment_db');
    console.log('Database "assessment_db" ready.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log('Database note:', message);
  }

  console.log('PostgreSQL is running and ready for connections.');

  // Keep Node process alive so the embedded postgres server stays active
  setInterval(() => {}, 1000 * 60 * 60);

  const shutdown = async () => {
    console.log('Shutting down PostgreSQL server...');
    try {
      await pg.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err: unknown) => {
  console.error('Failed to start embedded PostgreSQL:', err);
  process.exit(1);
});
