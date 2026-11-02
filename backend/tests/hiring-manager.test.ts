import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, OpeningStatus, ProfileStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';

interface ManagerOpeningItem {
  id: string;
  title: string;
}

interface EnrichedProfileItem {
  id: number;
  badge: string;
  recommendationScore: number;
  recommendationConfidence: number;
  recommendationReason: string;
  recommendationLatencyMs: number;
}

describe('Phase 6 — Hiring Manager APIs', () => {
  let tenantId: string;
  let managerAId: string;
  let managerBId: string;
  let vendorId: string;
  let openingAId: string;
  let openingBId: string;
  let profileUnderAId: number;
  let profileUnderBId: number;

  let managerAToken: string;
  let managerBToken: string;

  beforeAll(async () => {
    // 1. Setup Tenant
    const tenant = await prisma.tenants.create({
      data: { name: 'HM Test Tenant' },
    });
    tenantId = tenant.tenantId;

    const passwordHash = await AuthService.hashPassword('Pass123!');

    // 2. Setup Managers and Vendor
    const mA = await prisma.user.create({
      data: {
        tenantId,
        email: `manager-a-${Date.now()}@hm.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Manager Alice',
      },
    });
    managerAId = mA.id;

    const mB = await prisma.user.create({
      data: {
        tenantId,
        email: `manager-b-${Date.now()}@hm.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Manager Bob',
      },
    });
    managerBId = mB.id;

    const v = await prisma.user.create({
      data: {
        tenantId,
        email: `vendor-${Date.now()}@hm.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Vendor One',
      },
    });
    vendorId = v.id;

    // 3. Setup Openings
    const opA = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: managerAId,
        title: 'Alice Opening - React Lead',
        experienceMin: 5,
        status: OpeningStatus.OPEN,
      },
    });
    openingAId = opA.id;

    const opB = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: managerBId,
        title: 'Bob Opening - DevOps Lead',
        experienceMin: 4,
        status: OpeningStatus.OPEN,
      },
    });
    openingBId = opB.id;

    // 4. Setup Profiles with AI evaluation fields
    const profA = await prisma.hiringProfile.create({
      data: {
        openingId: openingAId,
        s3Key: `${tenantId}/${openingAId}/alice_candidate.pdf`,
        uploadedBy: vendorId,
        status: ProfileStatus.SUBMITTED,
        recommended: true,
        recommendationScore: 0.88,
        recommendationConfidence: 0.94,
        recommendationReason: 'Excellent React and Node skills',
        recommendationLatencyMs: 420,
        recommendationVersion: 'v1.0.0-agent',
        recommendedAt: new Date(),
      },
    });
    profileUnderAId = profA.id;

    const profB = await prisma.hiringProfile.create({
      data: {
        openingId: openingBId,
        s3Key: `${tenantId}/${openingBId}/bob_candidate.pdf`,
        uploadedBy: vendorId,
        status: ProfileStatus.SUBMITTED,
        recommended: false,
        recommendationScore: 0.42,
        recommendationConfidence: 0.91,
        recommendationReason: 'Insufficient DevOps experience',
        recommendationLatencyMs: 380,
        recommendationVersion: 'v1.0.0-agent',
        recommendedAt: new Date(),
      },
    });
    profileUnderBId = profB.id;

    // 5. Tokens
    managerAToken = AuthService.generateToken({
      userId: managerAId,
      tenantId,
      role: UserRole.HIRING_MANAGER,
      email: mA.email,
      name: mA.name,
    });

    managerBToken = AuthService.generateToken({
      userId: managerBId,
      tenantId,
      role: UserRole.HIRING_MANAGER,
      email: mB.email,
      name: mB.name,
    });
  });

  afterAll(async () => {
    await prisma.hiringProfile.deleteMany({
      where: { openingId: { in: [openingAId, openingBId] } },
    });
    await prisma.opening.deleteMany({
      where: { id: { in: [openingAId, openingBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [managerAId, managerBId, vendorId] } },
    });
    await prisma.tenants.deleteMany({ where: { tenantId } });
    await prisma.$disconnect();
  });

  describe('GET /api/hiring-manager/openings', () => {
    it('returns only openings belonging to the logged-in manager', async () => {
      const res = await request(app)
        .get('/api/hiring-manager/openings')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.openings)).toBe(true);

      const openingIds = (res.body.openings as ManagerOpeningItem[]).map((o) => o.id);
      expect(openingIds).toContain(openingAId);
      expect(openingIds).not.toContain(openingBId);

      // Verify Manager B can access their own opening
      const resB = await request(app)
        .get('/api/hiring-manager/openings')
        .set('Authorization', `Bearer ${managerBToken}`);
      expect(resB.status).toBe(200);
      const bOpeningIds = (resB.body.openings as ManagerOpeningItem[]).map((o) => o.id);
      expect(bOpeningIds).toContain(openingBId);
      expect(bOpeningIds).not.toContain(openingAId);
    });
  });

  describe('GET /api/hiring-manager/openings/:id/profiles', () => {
    it('returns profiles with AI recommendation fields and badges for own opening', async () => {
      const res = await request(app)
        .get(`/api/hiring-manager/openings/${openingAId}/profiles`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.profiles)).toBe(true);
      expect(res.body.profiles.length).toBe(1);

      const profile = (res.body.profiles as EnrichedProfileItem[])[0];
      expect(profile.id).toBe(profileUnderAId);
      expect(profile.recommendationScore).toBe(0.88);
      expect(profile.recommendationConfidence).toBe(0.94);
      expect(profile.recommendationReason).toBe('Excellent React and Node skills');
      expect(profile.recommendationLatencyMs).toBe(420);
      expect(profile.badge).toBe('Recommended');
    });

    it('blocks Manager A from viewing profiles of Manager B opening (returns 404, no data leak)', async () => {
      const res = await request(app)
        .get(`/api/hiring-manager/openings/${openingBId}/profiles`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.profiles).toBeUndefined();
    });
  });

  describe('POST /api/hiring-manager/profiles/:id/shortlist', () => {
    it('successfully shortlists profile for own opening inside transaction', async () => {
      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profileUnderAId}/shortlist`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profile.status).toBe('SHORTLISTED');
      expect(res.body.profile.shortlistedBy).toBe(managerAId);
      expect(res.body.profile.shortlistedAt).toBeDefined();

      // DB check
      const saved = await prisma.hiringProfile.findUniqueOrThrow({
        where: { id: profileUnderAId },
      });
      expect(saved.status).toBe('SHORTLISTED');
    });

    it('idempotency: repeatedly shortlisting does not corrupt state', async () => {
      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profileUnderAId}/shortlist`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profile.status).toBe('SHORTLISTED');
    });

    it('blocks Manager A from shortlisting a profile belonging to Manager B opening (404/access denied)', async () => {
      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profileUnderBId}/shortlist`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(404);

      // Verify status was NOT changed
      const unchanged = await prisma.hiringProfile.findUniqueOrThrow({
        where: { id: profileUnderBId },
      });
      expect(unchanged.status).toBe('SUBMITTED');
    });
  });

  describe('POST /api/hiring-manager/profiles/:id/reject', () => {
    it('successfully rejects profile for own opening', async () => {
      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profileUnderAId}/reject`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profile.status).toBe('REJECTED');
      expect(res.body.profile.rejectedBy).toBe(managerAId);
      expect(res.body.profile.rejectedAt).toBeDefined();
    });

    it('blocks Manager A from rejecting Manager B profile', async () => {
      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profileUnderBId}/reject`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(404);

      const unchanged = await prisma.hiringProfile.findUniqueOrThrow({
        where: { id: profileUnderBId },
      });
      expect(unchanged.status).toBe('SUBMITTED');
    });
  });
});
