import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';
import { UserRole, ProfileStatus } from '@prisma/client';
import { RecommendationService } from '../src/services/recommendation.service';

describe('Phase 2.1 & 2.2 — Secure File Preview & Reasoning Metadata Persistence', () => {
  let tenantId: string;
  let managerAId: string;
  let managerBId: string;
  let vendorA1Id: string;
  let vendorA2Id: string;
  let openingAId: string;
  let openingBId: string;
  let profile1Id: number;
  let profile2Id: number;

  let vendorA1Token: string;
  let _vendorA2Token: string;
  let managerAToken: string;
  let _managerBToken: string;

  beforeAll(async () => {
    const tenant = await prisma.tenants.create({
      data: { name: `Preview Test Tenant ${Date.now()}` },
    });
    tenantId = tenant.tenantId;

    const passwordHash = await AuthService.hashPassword('Pass123!');

    const mA = await prisma.user.create({
      data: { tenantId, name: 'Manager A', email: `ma-${Date.now()}@test.com`, passwordHash, role: UserRole.HIRING_MANAGER },
    });
    managerAId = mA.id;

    const mB = await prisma.user.create({
      data: { tenantId, name: 'Manager B', email: `mb-${Date.now()}@test.com`, passwordHash, role: UserRole.HIRING_MANAGER },
    });
    managerBId = mB.id;

    const v1 = await prisma.user.create({
      data: { tenantId, name: 'Vendor 1', email: `v1-${Date.now()}@test.com`, passwordHash, role: UserRole.IT_VENDOR },
    });
    vendorA1Id = v1.id;

    const v2 = await prisma.user.create({
      data: { tenantId, name: 'Vendor 2', email: `v2-${Date.now()}@test.com`, passwordHash, role: UserRole.IT_VENDOR },
    });
    vendorA2Id = v2.id;

    const opA = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: managerAId,
        title: 'Backend Engineer',
        experienceMin: 3,
        experienceMax: 7,
        location: 'Remote',
      },
    });
    openingAId = opA.id;

    const opB = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: managerBId,
        title: 'Security Lead',
        experienceMin: 5,
        location: 'Onsite',
      },
    });
    openingBId = opB.id;

    const prof1 = await prisma.hiringProfile.create({
      data: {
        openingId: openingAId,
        s3Key: `${tenantId}/${openingAId}/resume_v1.pdf`,
        uploadedBy: vendorA1Id,
        status: ProfileStatus.SUBMITTED,
      },
    });
    profile1Id = prof1.id;

    const prof2 = await prisma.hiringProfile.create({
      data: {
        openingId: openingBId,
        s3Key: `${tenantId}/${openingBId}/resume_v2.pdf`,
        uploadedBy: vendorA2Id,
        status: ProfileStatus.SUBMITTED,
      },
    });
    profile2Id = prof2.id;

    vendorA1Token = AuthService.generateToken({ userId: vendorA1Id, email: v1.email, role: v1.role, tenantId });
    _vendorA2Token = AuthService.generateToken({ userId: vendorA2Id, email: v2.email, role: v2.role, tenantId });
    managerAToken = AuthService.generateToken({ userId: managerAId, email: mA.email, role: mA.role, tenantId });
    _managerBToken = AuthService.generateToken({ userId: managerBId, email: mB.email, role: mB.role, tenantId });
  });

  afterAll(async () => {
    if (openingAId && openingBId) {
      await prisma.hiringProfile.deleteMany({ where: { openingId: { in: [openingAId, openingBId] } } });
      await prisma.opening.deleteMany({ where: { id: { in: [openingAId, openingBId] } } });
    }
    if (tenantId) {
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.tenants.delete({ where: { tenantId } });
    }
  });

  describe('Secure File Preview Endpoints', () => {
    it('allows IT Vendor to preview their own uploaded resume', async () => {
      const res = await request(app)
        .get(`/api/vendor/profiles/${profile1Id}/preview`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.profileId).toBe(profile1Id);
      expect(res.body.fileName).toBe('resume_v1.pdf');
      expect(res.body.previewUrl).toContain('resume_v1.pdf');
    });

    it('blocks IT Vendor from previewing files uploaded by another vendor', async () => {
      const res = await request(app)
        .get(`/api/vendor/profiles/${profile2Id}/preview`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('access denied');
    });

    it('allows Hiring Manager to preview candidate resumes under their own opening', async () => {
      const res = await request(app)
        .get(`/api/hiring-manager/profiles/${profile1Id}/preview`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.profileId).toBe(profile1Id);
      expect(res.body.previewUrl).toBeDefined();
    });

    it('blocks Hiring Manager from previewing candidate resumes under another manager opening', async () => {
      const res = await request(app)
        .get(`/api/hiring-manager/profiles/${profile2Id}/preview`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('access denied');
    });

    it('blocks unauthenticated requests to preview endpoints', async () => {
      const res = await request(app).get(`/api/vendor/profiles/${profile1Id}/preview`);
      expect(res.status).toBe(401);
    });

    it('streams candidate resume file with PDF headers and inline disposition for vendor', async () => {
      const res = await request(app)
        .get(`/api/vendor/profiles/${profile1Id}/preview/file`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.body.toString().slice(0, 5)).toContain('%PDF');
    });

    it('streams candidate resume file for hiring manager and supports query token', async () => {
      const res = await request(app)
        .get(`/api/hiring-manager/profiles/${profile1Id}/preview/file?token=${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('inline');
      expect(res.body.toString().slice(0, 5)).toContain('%PDF');
    });

    it('blocks unauthorized access to file stream endpoints', async () => {
      const resCrossVendor = await request(app)
        .get(`/api/vendor/profiles/${profile2Id}/preview/file`)
        .set('Authorization', `Bearer ${vendorA1Token}`);
      expect(resCrossVendor.status).toBe(404);

      const resUnauth = await request(app).get(`/api/vendor/profiles/${profile1Id}/preview/file`);
      expect(resUnauth.status).toBe(401);
    });
  });

  describe('Intermediate Reasoning Metadata Persistence', () => {
    it('persists structured intermediate reasoning metadata during AI evaluation', async () => {
      await RecommendationService.evaluateProfile(profile1Id);

      const updated = await prisma.hiringProfile.findUnique({
        where: { id: profile1Id },
      });

      expect(updated?.recommended).not.toBeNull();
      expect(updated?.reasoningMetadata).toBeDefined();

      const metadata = updated?.reasoningMetadata as Record<string, unknown>;
      expect(metadata).toHaveProperty('skillMatchScore');
      expect(metadata).toHaveProperty('experienceMatchScore');
      expect(metadata).toHaveProperty('locationMatchScore');

      // Verify Hiring Manager profiles API returns reasoningMetadata
      const apiRes = await request(app)
        .get(`/api/hiring-manager/openings/${openingAId}/profiles`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(apiRes.status).toBe(200);
      const profItem = apiRes.body.profiles.find((p: { id: number }) => p.id === profile1Id);
      expect(profItem.reasoningMetadata).toBeDefined();
    });
  });
});
