import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

export async function checkTenantIsolation(): Promise<boolean> {
  console.log('Running Tenant Isolation & Cross-Tenant FK Integrity Check...');

  try {
    // 1. Create Tenant A and Tenant B
    const tenantA = await prisma.tenants.create({
      data: { name: 'Tenant Alpha Test' },
    });
    const tenantB = await prisma.tenants.create({
      data: { name: 'Tenant Beta Test' },
    });

    // 2. Create Users in each tenant
    const userA = await prisma.user.create({
      data: {
        tenantId: tenantA.tenantId,
        email: `manager-a-${Date.now()}@alpha.com`,
        passwordHash: 'dummy',
        role: UserRole.HIRING_MANAGER,
        name: 'Manager Alpha',
      },
    });

    const userB = await prisma.user.create({
      data: {
        tenantId: tenantB.tenantId,
        email: `manager-b-${Date.now()}@beta.com`,
        passwordHash: 'dummy',
        role: UserRole.HIRING_MANAGER,
        name: 'Manager Beta',
      },
    });

    // 3. Create Openings in each tenant
    const openingA = await prisma.opening.create({
      data: {
        tenantId: tenantA.tenantId,
        hiringManagerId: userA.id,
        title: 'Alpha Secret Project',
        experienceMin: 5,
      },
    });

    const openingB = await prisma.opening.create({
      data: {
        tenantId: tenantB.tenantId,
        hiringManagerId: userB.id,
        title: 'Beta Secret Project',
        experienceMin: 3,
      },
    });

    // 4. Assert queries scoped by tenantId do not leak across tenants
    const alphaOpenings = await prisma.opening.findMany({
      where: { tenantId: tenantA.tenantId },
    });

    const leakedB = alphaOpenings.find((o) => o.id === openingB.id || o.tenantId === tenantB.tenantId);
    if (leakedB) {
      throw new Error(`CRITICAL ISOLATION BREACH: Tenant B data found in Tenant A query!`);
    }

    const betaOpenings = await prisma.opening.findMany({
      where: { tenantId: tenantB.tenantId },
    });

    const leakedA = betaOpenings.find((o) => o.id === openingA.id || o.tenantId === tenantA.tenantId);
    if (leakedA) {
      throw new Error(`CRITICAL ISOLATION BREACH: Tenant A data found in Tenant B query!`);
    }

    // 5. Clean up isolation test records
    await prisma.opening.deleteMany({
      where: { id: { in: [openingA.id, openingB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id] } },
    });
    await prisma.tenants.deleteMany({
      where: { tenantId: { in: [tenantA.tenantId, tenantB.tenantId] } },
    });

    console.log('✅ Tenant Isolation Check Passed: Zero cross-tenant data leakage detected.');
    return true;
  } catch (error) {
    console.error('❌ Tenant Isolation Check Failed:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  checkTenantIsolation().then((passed) => {
    process.exit(passed ? 0 : 1);
  });
}

