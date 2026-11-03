import { beforeAll } from 'vitest';
import { ensureDatabaseRunning } from '../src/db-helper';
import { prisma } from '../src/prisma';
import { seed } from '../prisma/seed';

beforeAll(async () => {
  await ensureDatabaseRunning();
  // Ensure default tenant and seed data exist if database is fresh
  const existingTenant = await prisma.tenants.findFirst({
    where: { name: 'Bruce Wayne Corp' },
  });
  if (!existingTenant) {
    await seed();
  }
}, 60000);
