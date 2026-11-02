import { beforeAll } from 'vitest';
import { ensureDatabaseRunning } from '../src/db-helper';

beforeAll(async () => {
  await ensureDatabaseRunning();
}, 60000);
