import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';
import { UserRole, ProfileStatus } from '@prisma/client';
import { recommendationQueue } from '../src/queue/recommendation.queue';

describe('Phase 9 — Full End-to-End Lifecycle Integration Test', () => {
  it('executes full flow: Vendor Fetch -> Presign -> Submit -> Async AI Evaluate -> Manager Review -> Shortlist/Reject -> Vendor Soft-Delete', async () => {
    // 1. Setup isolated tenant, hiring manager, IT vendor, and opening
    const tenant = await prisma.tenants.create({
      data: { name: `E2E Flow Tenant ${Date.now()}` },
    });
    const tenantId = tenant.tenantId;

    const passwordHash = await AuthService.hashPassword('Password123!');

    const manager = await prisma.user.create({
      data: {
        tenantId,
        email: `manager-e2e-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Bruce Wayne',
      },
    });

    const vendor = await prisma.user.create({
      data: {
        tenantId,
        email: `vendor-e2e-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Lucius Fox (Wayne Enterprises IT)',
      },
    });

    const otherManager = await prisma.user.create({
      data: {
        tenantId,
        email: `other-manager-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Harvey Dent',
      },
    });

    const opening = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: manager.id,
        title: 'Senior Full Stack Engineer (React/Node.js)',
        description: 'Building next-generation enterprise mission systems.',
        location: 'Remote',
        contractType: 'Full-time',
        experienceMin: 4,
        experienceMax: 8,
      },
    });

    // 2. Vendor Authentication
    const vendorLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: vendor.email, password: 'Password123!' });
    expect(vendorLoginRes.status).toBe(200);
    const vendorToken = vendorLoginRes.body.token;
    expect(vendorToken).toBeDefined();

    // 3. Vendor queries openings
    const vendorOpeningsRes = await request(app)
      .get('/api/vendor/openings')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(vendorOpeningsRes.status).toBe(200);
    expect(vendorOpeningsRes.body.openings.some((o: { id: string }) => o.id === opening.id)).toBe(true);

    // 4. Vendor requests presigned upload URLs for 2 candidates
    const presignRes = await request(app)
      .post(`/api/vendor/openings/${opening.id}/profiles/presign`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        files: [
          { filename: 'alice_smith_senior_dev.pdf', contentType: 'application/pdf' },
          { filename: 'bob_jones_junior_dev.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
        ],
      });
    expect(presignRes.status).toBe(200);
    expect(presignRes.body.uploads).toHaveLength(2);
    const s3Key1 = presignRes.body.uploads[0].s3Key;
    const s3Key2 = presignRes.body.uploads[1].s3Key;

    // 5. Vendor submits profiles inside atomic transaction
    const submitRes = await request(app)
      .post(`/api/vendor/openings/${opening.id}/profiles/upload`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        profiles: [
          { s3Key: s3Key1 },
          { s3Key: s3Key2 },
        ],
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.profiles).toHaveLength(2);
    const profileId1 = submitRes.body.profiles[0].id;
    const profileId2 = submitRes.body.profiles[1].id;

    // 6. Vendor views opening details — verify RBAC sanitation (no AI fields leaked)
    const vendorDetailRes = await request(app)
      .get(`/api/vendor/openings/${opening.id}`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(vendorDetailRes.status).toBe(200);
    expect(vendorDetailRes.body.ownProfilesCount).toBe(2);
    expect(vendorDetailRes.body.uploadedProfiles[0]).not.toHaveProperty('recommendationScore');
    expect(vendorDetailRes.body.uploadedProfiles[0]).not.toHaveProperty('recommendationReason');
    expect(vendorDetailRes.body.uploadedProfiles[0]).not.toHaveProperty('recommended');

    // 7. Await async recommendation worker in background
    await recommendationQueue.waitForIdle();

    // 8. Manager Authentication
    const managerLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: manager.email, password: 'Password123!' });
    expect(managerLoginRes.status).toBe(200);
    const managerToken = managerLoginRes.body.token;

    // 9. Manager views openings stats
    const managerOpeningsRes = await request(app)
      .get('/api/hiring-manager/openings')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerOpeningsRes.status).toBe(200);
    const targetOpeningSummary = managerOpeningsRes.body.openings.find((o: { id: string }) => o.id === opening.id);
    expect(targetOpeningSummary.totalProfiles).toBe(2);

    // 10. Manager views candidates detail list with AI enrichments
    const managerProfilesRes = await request(app)
      .get(`/api/hiring-manager/openings/${opening.id}/profiles`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerProfilesRes.status).toBe(200);
    expect(managerProfilesRes.body.profiles).toHaveLength(2);

    const prof1 = managerProfilesRes.body.profiles.find((p: { id: number }) => p.id === profileId1);
    const prof2 = managerProfilesRes.body.profiles.find((p: { id: number }) => p.id === profileId2);

    expect(prof1).toBeDefined();
    expect(prof1.recommended).not.toBeNull();
    expect(prof1.badge).toBeDefined();
    expect(prof1.recommendationScorePercent).toBeGreaterThanOrEqual(0);
    expect(prof1.recommendationConfidencePercent).toBeGreaterThan(0);
    expect(prof1.recommendationReason).toBeDefined();
    expect(prof1.recommendationLatencyMs).toBeDefined();

    expect(prof2).toBeDefined();
    expect(prof2.recommended).not.toBeNull();
    expect(prof2.badge).toBeDefined();

    // 11. Manager shortlists profile 1
    const shortlistRes = await request(app)
      .post(`/api/hiring-manager/profiles/${profileId1}/shortlist`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(shortlistRes.status).toBe(200);
    expect(shortlistRes.body.profile.status).toBe(ProfileStatus.SHORTLISTED);
    expect(shortlistRes.body.profile.shortlistedBy).toBe(manager.id);

    // 12. Manager rejects profile 2
    const rejectRes = await request(app)
      .post(`/api/hiring-manager/profiles/${profileId2}/reject`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.profile.status).toBe(ProfileStatus.REJECTED);
    expect(rejectRes.body.profile.rejectedBy).toBe(manager.id);

    // 13. Negative RBAC Checks:
    // IT Vendor cannot shortlist
    const vendorShortlistAttempt = await request(app)
      .post(`/api/hiring-manager/profiles/${profileId1}/shortlist`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(vendorShortlistAttempt.status).toBe(403);

    // Other Hiring Manager cannot shortlist this profile (access denied/not found)
    const otherManagerToken = AuthService.generateToken({
      userId: otherManager.id,
      email: otherManager.email,
      role: otherManager.role,
      tenantId: otherManager.tenantId,
    });
    const otherManagerAttempt = await request(app)
      .post(`/api/hiring-manager/profiles/${profileId1}/shortlist`)
      .set('Authorization', `Bearer ${otherManagerToken}`);
    expect(otherManagerAttempt.status).toBe(404);

    // 14. Vendor soft-deletes profile 2
    const deleteRes = await request(app)
      .delete(`/api/vendor/profiles/${profileId2}`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(deleteRes.status).toBe(200);

    // Verify soft-deleted profile no longer appears in manager profile list
    const managerAfterDeleteRes = await request(app)
      .get(`/api/hiring-manager/openings/${opening.id}/profiles`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(managerAfterDeleteRes.body.profiles).toHaveLength(1);
    expect(managerAfterDeleteRes.body.profiles[0].id).toBe(profileId1);

    // Clean up
    await prisma.hiringProfile.deleteMany({ where: { openingId: opening.id } });
    await prisma.opening.delete({ where: { id: opening.id } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenants.delete({ where: { tenantId } });
  });
});
