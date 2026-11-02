import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, UserRole, OpeningStatus } from '@prisma/client';

const prisma = new PrismaClient();

describe('Phase 1 - Tenant Isolation & Foreign Key Integrity', () => {
  let tenant1Id: string | undefined;
  let tenant2Id: string | undefined;
  let manager1Id: string | undefined;
  let manager2Id: string | undefined;
  let opening1Id: string | undefined;
  let opening2Id: string | undefined;

  beforeAll(async () => {
    // Setup isolated test fixtures
    const t1 = await prisma.tenants.create({ data: { name: 'Tenant One Test Corp' } });
    const t2 = await prisma.tenants.create({ data: { name: 'Tenant Two Test Corp' } });
    tenant1Id = t1.tenantId;
    tenant2Id = t2.tenantId;

    const u1 = await prisma.user.create({
      data: {
        tenantId: tenant1Id,
        email: `u1-${Date.now()}-${Math.random()}@t1.com`,
        passwordHash: 'hash',
        role: UserRole.HIRING_MANAGER,
        name: 'Manager 1',
      },
    });
    manager1Id = u1.id;

    const u2 = await prisma.user.create({
      data: {
        tenantId: tenant2Id,
        email: `u2-${Date.now()}-${Math.random()}@t2.com`,
        passwordHash: 'hash',
        role: UserRole.HIRING_MANAGER,
        name: 'Manager 2',
      },
    });
    manager2Id = u2.id;

    const o1 = await prisma.opening.create({
      data: {
        tenantId: tenant1Id,
        hiringManagerId: manager1Id,
        title: 'T1 Secret Opening',
        experienceMin: 4,
        status: OpeningStatus.OPEN,
      },
    });
    opening1Id = o1.id;

    const o2 = await prisma.opening.create({
      data: {
        tenantId: tenant2Id,
        hiringManagerId: manager2Id,
        title: 'T2 Secret Opening',
        experienceMin: 2,
        status: OpeningStatus.OPEN,
      },
    });
    opening2Id = o2.id;
  });

  afterAll(async () => {
    const openingIds = [opening1Id, opening2Id].filter((id): id is string => Boolean(id));
    if (openingIds.length > 0) {
      await prisma.opening.deleteMany({ where: { id: { in: openingIds } } });
    }

    const userIds = [manager1Id, manager2Id].filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }

    const tenantIds = [tenant1Id, tenant2Id].filter((id): id is string => Boolean(id));
    if (tenantIds.length > 0) {
      await prisma.tenants.deleteMany({ where: { tenantId: { in: tenantIds } } });
    }

    await prisma.$disconnect();
  });

  it('querying openings filtered by tenantId returns ONLY that tenant rows', async () => {
    const t1Openings = await prisma.opening.findMany({
      where: { tenantId: tenant1Id! },
    });

    expect(t1Openings.length).toBe(1);
    expect(t1Openings[0].id).toBe(opening1Id);
    expect(t1Openings[0].tenantId).toBe(tenant1Id);

    // Explicitly verify no Tenant 2 rows are returned
    const leakedT2 = t1Openings.some((o) => o.tenantId === tenant2Id || o.id === opening2Id);
    expect(leakedT2).toBe(false);
  });

  it('querying openings for tenant 2 returns ONLY tenant 2 rows', async () => {
    const t2Openings = await prisma.opening.findMany({
      where: { tenantId: tenant2Id! },
    });

    expect(t2Openings.length).toBe(1);
    expect(t2Openings[0].id).toBe(opening2Id);
    expect(t2Openings[0].tenantId).toBe(tenant2Id);

    const leakedT1 = t2Openings.some((o) => o.tenantId === tenant1Id || o.id === opening1Id);
    expect(leakedT1).toBe(false);
  });

  it('rejects creating an opening referencing a non-existent tenantId (FK constraint)', async () => {
    await expect(
      prisma.opening.create({
        data: {
          tenantId: 'non-existent-tenant-id-0000',
          hiringManagerId: manager1Id!,
          title: 'Orphan Opening',
          experienceMin: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects creating a user referencing a non-existent tenantId (FK constraint)', async () => {
    await expect(
      prisma.user.create({
        data: {
          tenantId: 'non-existent-tenant-id-0000',
          email: 'invalid@test.com',
          passwordHash: 'dummy',
          role: UserRole.IT_VENDOR,
          name: 'Invalid User',
        },
      }),
    ).rejects.toThrow();
  });
});
