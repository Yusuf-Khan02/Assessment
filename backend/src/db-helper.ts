import net from 'net';
import path from 'path';
import fs from 'fs';
import EmbeddedPostgres from 'embedded-postgres';
import { prisma } from './prisma';

export async function ensureDatabaseRunning(): Promise<void> {
  const isPortOpen = await new Promise<boolean>((resolve) => {
    const socket = net.createConnection(5432, 'localhost', () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(1000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });

  if (isPortOpen) {
    console.log('[DB] PostgreSQL is already running on port 5432.');
  } else {
    console.log('[DB] PostgreSQL not detected on port 5432. Launching embedded PostgreSQL server...');
    const dataDir = path.resolve(__dirname, '../data/postgres');
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
      await pg.initialise();
    } catch {
      // Cluster directory already initialized
    }

    await pg.start();
    console.log('[DB] Embedded PostgreSQL successfully started on port 5432.');

    try {
      await pg.createDatabase('assessment_db');
      console.log('[DB] Database "assessment_db" verified/created.');
    } catch {
      // Database already exists
    }

    const cleanup = async () => {
      try {
        await pg.stop();
      } catch {
        // Ignore
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  // Connect Prisma client
  await prisma.$connect();
  console.log('[DB] Prisma connected to PostgreSQL successfully.');
}

