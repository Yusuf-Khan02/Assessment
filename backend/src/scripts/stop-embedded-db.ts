import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';

const dataDir = path.resolve(__dirname, '../../data/postgres');

async function stop() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: 5432,
    persistent: true,
  });

  console.log('Stopping PostgreSQL server...');
  await pg.stop();
  console.log('PostgreSQL server stopped.');
}

stop().catch((err: unknown) => {
  console.error('Failed to stop PostgreSQL:', err);
  process.exit(1);
});

