import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, OpeningStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';

interface OpeningItem {
  id: string;
  title: string;
  hiringManagerName: string;
  experienceMin: number;
}

interface ProfileItem {
  id: number;
  s3Key: string;
}

describe('Phase 3 — S3 Integration & IT Vendor Upload APIs', () => {
  let tenantAId: string;
  let tenantBId: string;
  let managerAId: string;
  let vendorA1Id: string;
  let vendorA2Id: string;
  let openingAId: string;
  let openingBId: string;

  let vendorA1Token: string;
  let vendorA2Token: string;

  beforeAll(async () => {
    // 1. Setup isolated tenants
    const tA = await prisma.tenants.create({ data: { name: 'Vendor Test Tenant A' } });
    const tB = await prisma.tenants.create({ data: { name: 'Vendor Test Tenant B' } });
    tenantAId = tA.tenantId;
    tenantBId = tB.tenantId;

    const passwordHash = await AuthService.hashPassword('Pass123!');

    // 2. Setup Manager and Vendors
    const mA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `manager-a-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Manager A',
      },
    });
    managerAId = mA.id;

    const vA1 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `vendor-a1-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Vendor A1',
      },
    });
    vendorA1Id = vA1.id;

    const vA2 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `vendor-a2-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Vendor A2',
      },
    });
    vendorA2Id = vA2.id;

    // 3. Setup Openings
    const opA = await prisma.opening.create({
      data: {
        tenantId: tenantAId,
        hiringManagerId: managerAId,
        title: 'Backend Engineer Contract',
        experienceMin: 4,
        experienceMax: 8,
        contractType: 'C2C',
        location: 'Remote',
        status: OpeningStatus.OPEN,
      },
    });
    openingAId = opA.id;

    const opB = await prisma.opening.create({
      data: {
        tenantId: tenantBId,
        hiringManagerId: managerAId, // Opening in Tenant B
        title: 'Tenant B Opening',
        experienceMin: 2,
        status: OpeningStatus.OPEN,
      },
    });
    openingBId = opB.id;

    // Tokens
    vendorA1Token = AuthService.generateToken({
      userId: vendorA1Id,
      tenantId: tenantAId,
      role: UserRole.IT_VENDOR,
      email: vA1.email,
      name: vA1.name,
    });

    vendorA2Token = AuthService.generateToken({
      userId: vendorA2Id,
      tenantId: tenantAId,
      role: UserRole.IT_VENDOR,
      email: vA2.email,
      name: vA2.name,
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
      where: { id: { in: [managerAId, vendorA1Id, vendorA2Id] } },
    });
    await prisma.tenants.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
    await prisma.$disconnect();
  });

  describe('GET /api/vendor/openings', () => {
    it('returns paginated openings filtered by vendor tenant', async () => {
      const res = await request(app)
        .get('/api/vendor/openings?page=1&limit=10')
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.openings)).toBe(true);
      expect(res.body.pagination).toBeDefined();

      // Check tenant filtering
      const item = (res.body.openings as OpeningItem[]).find((o) => o.id === openingAId);
      expect(item).toBeDefined();
      expect(item?.hiringManagerName).toBe('Manager A');
      expect(item?.experienceMin).toBe(4);

      // Verify Tenant B opening is not present
      const leaked = (res.body.openings as OpeningItem[]).find((o) => o.id === openingBId);
      expect(leaked).toBeUndefined();
    });
  });

  describe('POST /api/vendor/openings/:id/profiles/presign', () => {
    it('generates presigned URLs for valid PDF and PPTX files', async () => {
      const res = await request(app)
        .post(`/api/vendor/openings/${openingAId}/profiles/presign`)
        .set('Authorization', `Bearer ${vendorA1Token}`)
        .send({
          files: [
            { filename: 'candidate_resume.pdf', contentType: 'application/pdf' },
            { filename: 'presentation.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.uploads.length).toBe(2);

      const [pdfUpload, pptxUpload] = res.body.uploads;
      expect(pdfUpload.presignedUrl).toBeDefined();
      expect(pdfUpload.s3Key).toMatch(new RegExp(`^${tenantAId}/${openingAId}/\\d+_candidate_resume\\.pdf$`));
      expect(pptxUpload.s3Key).toMatch(new RegExp(`^${tenantAId}/${openingAId}/\\d+_presentation\\.pptx$`));
    });

    it('rejects unsupported file formats (.docx, .exe, .png) with 400', async () => {
      const res = await request(app)
        .post(`/api/vendor/openings/${openingAId}/profiles/presign`)
        .set('Authorization', `Bearer ${vendorA1Token}`)
        .send({
          files: [{ filename: 'candidate.docx' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Only PDF and PPTX files are allowed');
    });

    it('rejects presign attempt for opening in another tenant with 404', async () => {
      const res = await request(app)
        .post(`/api/vendor/openings/${openingBId}/profiles/presign`)
        .set('Authorization', `Bearer ${vendorA1Token}`)
        .send({
          files: [{ filename: 'candidate.pdf' }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Opening not found');
    });
  });

  describe('POST /api/vendor/openings/:id/profiles/upload (Transactional Submission)', () => {
    it('creates hiringProfile rows with SUBMITTED status inside a transaction', async () => {
      const key1 = `${tenantAId}/${openingAId}/${Date.now()}_candidate1.pdf`;
      const key2 = `${tenantAId}/${openingAId}/${Date.now()}_candidate2.pptx`;

      const res = await request(app)
        .post(`/api/vendor/openings/${openingAId}/profiles/upload`)
        .set('Authorization', `Bearer ${vendorA1Token}`)
        .send({
          profiles: [{ s3Key: key1 }, { s3Key: key2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.profiles.length).toBe(2);
      expect(res.body.profiles[0].status).toBe('SUBMITTED');
      expect(res.body.profiles[0].s3Key).toBe(key1);
    });

    it('rolls back ENTIRE transaction when any record in the batch violates unique constraints', async () => {
      const duplicateKey = `${tenantAId}/${openingAId}/duplicate_key_test.pdf`;

      // 1. First insert single profile
      await prisma.hiringProfile.create({
        data: {
          openingId: openingAId,
          s3Key: duplicateKey,
          uploadedBy: vendorA1Id,
          status: 'SUBMITTED',
        },
      });

      const initialCount = await prisma.hiringProfile.count({
        where: { openingId: openingAId },
      });

      // 2. Try to submit a batch where the second item has the duplicate key
      const newKey = `${tenantAId}/${openingAId}/${Date.now()}_unique_candidate.pdf`;

      const res = await request(app)
        .post(`/api/vendor/openings/${openingAId}/profiles/upload`)
        .set('Authorization', `Bearer ${vendorA1Token}`)
        .send({
          profiles: [{ s3Key: newKey }, { s3Key: duplicateKey }],
        });

      // Must fail
      expect(res.status).toBe(400);

      // Verify rollback: count should NOT have increased by 1 (no partial write)
      const afterCount = await prisma.hiringProfile.count({
        where: { openingId: openingAId },
      });
      expect(afterCount).toBe(initialCount);

      // Verify newKey was NOT saved
      const orphaned = await prisma.hiringProfile.findUnique({
        where: { s3Key: newKey },
      });
      expect(orphaned).toBeNull();
    });
  });

  describe('Vendor Upload Isolation & Soft Delete', () => {
    let profileVendorA1Id: number;
    let profileVendorA2Id: number;

    beforeAll(async () => {
      // Create one profile uploaded by Vendor A1, one by Vendor A2 under same opening
      const p1 = await prisma.hiringProfile.create({
        data: {
          openingId: openingAId,
          s3Key: `${tenantAId}/${openingAId}/v1_profile_${Date.now()}.pdf`,
          uploadedBy: vendorA1Id,
          status: 'SUBMITTED',
        },
      });
      profileVendorA1Id = p1.id;

      const p2 = await prisma.hiringProfile.create({
        data: {
          openingId: openingAId,
          s3Key: `${tenantAId}/${openingAId}/v2_profile_${Date.now()}.pdf`,
          uploadedBy: vendorA2Id,
          status: 'SUBMITTED',
        },
      });
      profileVendorA2Id = p2.id;
    });

    it('Vendor A1 cannot see Vendor A2 uploads in GET /api/vendor/openings/:id', async () => {
      const res = await request(app)
        .get(`/api/vendor/openings/${openingAId}`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.uploadedProfiles).toBeDefined();

      const profileIds = (res.body.uploadedProfiles as ProfileItem[]).map((p) => p.id);
      expect(profileIds).toContain(profileVendorA1Id);
      expect(profileIds).not.toContain(profileVendorA2Id);
    });

    it('Vendor A2 cannot soft-delete Vendor A1 profile (404/access denied)', async () => {
      const res = await request(app)
        .delete(`/api/vendor/profiles/${profileVendorA1Id}`)
        .set('Authorization', `Bearer ${vendorA2Token}`);

      expect(res.status).toBe(404);

      // Verify it was NOT soft-deleted
      const check = await prisma.hiringProfile.findUniqueOrThrow({
        where: { id: profileVendorA1Id },
      });
      expect(check.isDeleted).toBe(false);
    });

    it('Vendor A1 can soft-delete their own profile', async () => {
      const res = await request(app)
        .delete(`/api/vendor/profiles/${profileVendorA1Id}`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);

      const check = await prisma.hiringProfile.findUniqueOrThrow({
        where: { id: profileVendorA1Id },
      });
      expect(check.isDeleted).toBe(true);
    });

    it('Soft-deleted profiles are excluded from default list queries', async () => {
      const res = await request(app)
        .get(`/api/vendor/openings/${openingAId}`)
        .set('Authorization', `Bearer ${vendorA1Token}`);

      expect(res.status).toBe(200);
      const profileIds = (res.body.uploadedProfiles as ProfileItem[]).map((p) => p.id);
      expect(profileIds).not.toContain(profileVendorA1Id);
    });
  });
});
