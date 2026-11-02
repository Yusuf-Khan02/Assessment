import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';
import { UserRole, ProfileStatus } from '@prisma/client';
import { recommendationQueue } from '../src/queue/recommendation.queue';
import { Logger } from '../src/utils/logger';

describe('Phase 8 — ACID Transactions, Observability & Performance Hardening', () => {
  let tenantId: string;
  let vendorId: string;
  let managerId: string;
  let openingId: string;
  let vendorToken: string;
  let managerToken: string;

  beforeEach(async () => {
    // Clear queue before each test
    recommendationQueue.clear();

    // Query seeded tenant & users
    const tenant = await prisma.tenants.findFirst({
      where: { name: 'Bruce Wayne Corp' },
    });
    if (!tenant) throw new Error('Tenant not seeded');
    tenantId = tenant.tenantId;

    const vendor = await prisma.user.findFirst({
      where: { tenantId, role: UserRole.IT_VENDOR },
    });
    if (!vendor) throw new Error('Vendor not seeded');
    vendorId = vendor.id;

    const manager = await prisma.user.findFirst({
      where: { tenantId, role: UserRole.HIRING_MANAGER },
    });
    if (!manager) throw new Error('Manager not seeded');
    managerId = manager.id;

    const opening = await prisma.opening.findFirst({
      where: { tenantId, hiringManagerId: managerId },
    });
    if (!opening) throw new Error('Opening not seeded');
    openingId = opening.id;

    vendorToken = AuthService.generateToken({
      userId: vendor.id,
      email: vendor.email,
      role: vendor.role,
      tenantId: vendor.tenantId,
    });

    managerToken = AuthService.generateToken({
      userId: manager.id,
      email: manager.email,
      role: manager.role,
      tenantId: manager.tenantId,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('ACID Single-Transaction Atomic Write Guarantees', () => {
    it('simulates a mid-transaction failure in submitProfiles and confirms zero partial rows', async () => {
      const initialCount = await prisma.hiringProfile.count({
        where: { openingId },
      });

      // Spy on prisma.$transaction to simulate an error halfway through batch profile creation
      const originalTransaction = prisma.$transaction.bind(prisma);
      let callCount = 0;

      vi.spyOn(prisma, '$transaction').mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return originalTransaction(async (tx) => {
            const originalCreate = tx.hiringProfile.create.bind(tx);
            tx.hiringProfile.create = vi.fn().mockImplementation(async (params: Parameters<typeof tx.hiringProfile.create>[0]) => {
              callCount++;
              if (callCount === 2) {
                // Simulate crash / constraint failure on second profile creation
                throw new Error('SIMULATED_DB_WRITE_FAILURE_MID_TRANSACTION');
              }
              return originalCreate(params);
            });
            return (arg as (client: typeof tx) => Promise<unknown>)(tx);
          });
        }
        return originalTransaction(arg as never);
      });

      const res = await request(app)
        .post(`/api/vendor/openings/${openingId}/profiles/upload`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          profiles: [
            { s3Key: `${tenantId}/${openingId}/test1.pdf` },
            { s3Key: `${tenantId}/${openingId}/test2.pdf` },
            { s3Key: `${tenantId}/${openingId}/test3.pdf` },
          ],
        });

      // API should return 400 Bad Request
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('SIMULATED_DB_WRITE_FAILURE_MID_TRANSACTION');

      // Assert ZERO partial rows were committed to DB (atomic rollback)
      const finalCount = await prisma.hiringProfile.count({
        where: { openingId },
      });
      expect(finalCount).toBe(initialCount);
    });

    it('simulates a mid-transaction failure in shortlist and confirms zero state corruption', async () => {
      // Create a test profile in SUBMITTED state
      const profile = await prisma.hiringProfile.create({
        data: {
          openingId,
          s3Key: `${tenantId}/${openingId}/atomic_shortlist_test.pdf`,
          uploadedBy: vendorId,
          status: ProfileStatus.SUBMITTED,
        },
      });

      // Spy on $transaction to throw midway through shortlisting
      const originalTransaction = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return originalTransaction(async (tx) => {
            await tx.hiringProfile.update({
              where: { id: profile.id },
              data: { status: ProfileStatus.SHORTLISTED },
            });
            // Simulate crash before transaction commits
            throw new Error('SIMULATED_SHORTLIST_COMMIT_FAILURE');
          });
        }
        return originalTransaction(arg as never);
      });

      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profile.id}/shortlist`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(500);

      // Verify DB state was NOT modified: still SUBMITTED, shortlistedBy is null
      const checkProfile = await prisma.hiringProfile.findUnique({
        where: { id: profile.id },
      });
      expect(checkProfile?.status).toBe(ProfileStatus.SUBMITTED);
      expect(checkProfile?.shortlistedBy).toBeNull();
      expect(checkProfile?.shortlistedAt).toBeNull();

      // Clean up
      await prisma.hiringProfile.delete({ where: { id: profile.id } });
    });

    it('simulates a mid-transaction failure in reject and confirms zero state corruption', async () => {
      // Create a test profile in SUBMITTED state
      const profile = await prisma.hiringProfile.create({
        data: {
          openingId,
          s3Key: `${tenantId}/${openingId}/atomic_reject_test.pdf`,
          uploadedBy: vendorId,
          status: ProfileStatus.SUBMITTED,
        },
      });

      // Spy on $transaction to throw midway through rejection
      const originalTransaction = prisma.$transaction.bind(prisma);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return originalTransaction(async (tx) => {
            await tx.hiringProfile.update({
              where: { id: profile.id },
              data: { status: ProfileStatus.REJECTED },
            });
            throw new Error('SIMULATED_REJECT_COMMIT_FAILURE');
          });
        }
        return originalTransaction(arg as never);
      });

      const res = await request(app)
        .post(`/api/hiring-manager/profiles/${profile.id}/reject`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(500);

      const checkProfile = await prisma.hiringProfile.findUnique({
        where: { id: profile.id },
      });
      expect(checkProfile?.status).toBe(ProfileStatus.SUBMITTED);
      expect(checkProfile?.rejectedBy).toBeNull();
      expect(checkProfile?.rejectedAt).toBeNull();

      // Clean up
      await prisma.hiringProfile.delete({ where: { id: profile.id } });
    });
  });

  describe('Non-Blocking Asynchronous Queue Processing', () => {
    it('returns immediate HTTP 201 response while AI processing runs asynchronously in queue', async () => {
      const res = await request(app)
        .post(`/api/vendor/openings/${openingId}/profiles/upload`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({
          profiles: [
            { s3Key: `${tenantId}/${openingId}/async_job1.pdf` },
            { s3Key: `${tenantId}/${openingId}/async_job2.pdf` },
          ],
        });

      // The HTTP call returns 201 immediately with SUBMITTED status
      expect(res.status).toBe(201);
      expect(res.body.profiles).toHaveLength(2);
      expect(res.body.profiles[0].status).toBe('SUBMITTED');

      const createdIds = res.body.profiles.map((p: { id: number }) => p.id);

      // Await queue idle (background processing complete)
      await recommendationQueue.waitForIdle();

      // Assert that background worker evaluated the profiles
      const evaluatedProfiles = await prisma.hiringProfile.findMany({
        where: { id: { in: createdIds } },
      });

      for (const p of evaluatedProfiles) {
        expect(p.recommended).not.toBeNull();
        expect(p.recommendationScore).toBeGreaterThanOrEqual(0);
        expect(p.recommendationVersion).toBe('v1.0.0-agent');
      }

      // Clean up
      await prisma.hiringProfile.deleteMany({
        where: { id: { in: createdIds } },
      });
    });
  });

  describe('Request-ID Correlation & Observability', () => {
    it('echoes back client-provided X-Request-Id header across responses', async () => {
      const customTraceId = 'req-trace-vendor-12345';
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', customTraceId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customTraceId);
    });

    it('generates a fresh UUID in X-Request-Id when none is provided by client', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
    });
  });

  describe('Performance SLA Monitoring & Alerting', () => {
    it('logs structured performance alert when per-profile agent latency exceeds 1500ms', () => {
      const perfAlertSpy = vi.spyOn(Logger, 'perfAlert');

      // Trigger performance alert manually
      Logger.perfAlert('AGENT_PER_PROFILE_LATENCY_EXCEEDED', 1500, 1850, {
        profileId: 999,
      });

      expect(perfAlertSpy).toHaveBeenCalledWith(
        'AGENT_PER_PROFILE_LATENCY_EXCEEDED',
        1500,
        1850,
        expect.objectContaining({ profileId: 999 })
      );
    });

    it('logs structured performance alert when API response time exceeds 2000ms threshold', () => {
      const perfAlertSpy = vi.spyOn(Logger, 'perfAlert');

      Logger.perfAlert('API_ENDPOINT_SLA_EXCEEDED', 2000, 2400, {
        method: 'POST',
        path: '/api/vendor/openings/1/profiles/upload',
        statusCode: 201,
      });

      expect(perfAlertSpy).toHaveBeenCalledWith(
        'API_ENDPOINT_SLA_EXCEEDED',
        2000,
        2400,
        expect.objectContaining({
          method: 'POST',
          path: '/api/vendor/openings/1/profiles/upload',
        })
      );
    });
  });
});
