import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';
import { UserRole } from '@prisma/client';
import { recommendationQueue } from '../src/queue/recommendation.queue';
import { performance } from 'node:perf_hooks';

describe('Phase 9 — Performance & Load SLA Validation', () => {
  it('simulates 100 profiles submitted in rapid batches and validates P95 latency < 2000ms and no blocking call > 2000ms', async () => {
    // 1. Setup isolated tenant and opening
    const tenant = await prisma.tenants.create({
      data: { name: `Load Test Tenant ${Date.now()}` },
    });
    const tenantId = tenant.tenantId;

    const passwordHash = await AuthService.hashPassword('Password123!');

    const manager = await prisma.user.create({
      data: {
        tenantId,
        email: `manager-load-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Load Test Manager',
      },
    });

    const vendor = await prisma.user.create({
      data: {
        tenantId,
        email: `vendor-load-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Load Test Vendor',
      },
    });

    const opening = await prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId: manager.id,
        title: 'Staff Distributed Systems Engineer',
        description: 'High-throughput low-latency microservices architecture.',
        location: 'Remote',
        contractType: 'Full-time',
        experienceMin: 5,
        experienceMax: 10,
      },
    });

    const vendorToken = AuthService.generateToken({
      userId: vendor.id,
      email: vendor.email,
      role: vendor.role,
      tenantId: vendor.tenantId,
    });

    const TOTAL_PROFILES = 100;
    const BATCH_SIZE = 10;
    const BATCH_COUNT = TOTAL_PROFILES / BATCH_SIZE;

    const httpLatencies: number[] = [];
    const submittedProfileIds: number[] = [];

    // 2. Submit 100 profiles across 10 concurrent/rapid batches
    const batchPromises = [];

    for (let b = 0; b < BATCH_COUNT; b++) {
      const batchProfiles = Array.from({ length: BATCH_SIZE }, (_, i) => ({
        s3Key: `${tenantId}/${opening.id}/load_candidate_batch_${b}_prof_${i}.pdf`,
      }));

      const sendBatch = async () => {
        const start = performance.now();
        const res = await request(app)
          .post(`/api/vendor/openings/${opening.id}/profiles/upload`)
          .set('Authorization', `Bearer ${vendorToken}`)
          .send({ profiles: batchProfiles });
        const elapsed = performance.now() - start;

        httpLatencies.push(elapsed);
        expect(res.status).toBe(201);
        expect(res.body.profiles).toHaveLength(BATCH_SIZE);

        for (const p of res.body.profiles) {
          submittedProfileIds.push(p.id);
        }
      };

      batchPromises.push(sendBatch());
    }

    await Promise.all(batchPromises);

    // 3. SLA Validation 1: No HTTP blocking call exceeds 2000ms
    const maxHttpLatency = Math.max(...httpLatencies);
    console.log(`[LOAD_TEST] Total Batches: ${BATCH_COUNT}, Max HTTP Duration: ${maxHttpLatency.toFixed(1)}ms`);
    expect(maxHttpLatency).toBeLessThan(2000);

    // 4. Await asynchronous AI recommendation processing for all 100 profiles
    const queueStart = performance.now();
    await recommendationQueue.waitForIdle();
    const totalQueueDuration = performance.now() - queueStart;
    console.log(`[LOAD_TEST] All 100 profiles processed asynchronously by queue in ${totalQueueDuration.toFixed(1)}ms`);

    // 5. Query all 100 profiles and extract per-profile recommendation latency
    const evaluatedProfiles = await prisma.hiringProfile.findMany({
      where: { id: { in: submittedProfileIds } },
    });

    expect(evaluatedProfiles).toHaveLength(TOTAL_PROFILES);

    const latencies: number[] = evaluatedProfiles.map((p) => p.recommendationLatencyMs ?? 0);
    latencies.sort((a, b) => a - b);

    const p50Index = Math.floor(TOTAL_PROFILES * 0.5);
    const p95Index = Math.floor(TOTAL_PROFILES * 0.95);
    const p99Index = Math.floor(TOTAL_PROFILES * 0.99);

    const p50Latency = latencies[p50Index];
    const p95Latency = latencies[p95Index];
    const p99Latency = latencies[p99Index];
    const avgLatency = latencies.reduce((acc, v) => acc + v, 0) / TOTAL_PROFILES;

    console.log(`[LOAD_TEST_RESULTS] Profile Count: ${TOTAL_PROFILES}`);
    console.log(`[LOAD_TEST_RESULTS] P50 Latency: ${p50Latency}ms`);
    console.log(`[LOAD_TEST_RESULTS] P95 Latency: ${p95Latency}ms`);
    console.log(`[LOAD_TEST_RESULTS] P99 Latency: ${p99Latency}ms`);
    console.log(`[LOAD_TEST_RESULTS] Avg Latency: ${avgLatency.toFixed(1)}ms`);

    // 6. SLA Validation 2: P95 recommendation latency must be < 2000ms
    expect(p95Latency).toBeLessThan(2000);

    // 7. Verify all records have valid deterministic AI scores and decisions
    for (const p of evaluatedProfiles) {
      expect(p.recommended).not.toBeNull();
      expect(p.recommendationScore).toBeGreaterThanOrEqual(0);
      expect(p.recommendationScore).toBeLessThanOrEqual(1);
      expect(p.recommendationConfidence).toBeGreaterThanOrEqual(0);
      expect(p.recommendationReason).toBeDefined();
      expect(p.recommendationVersion).toBe('v1.0.0-agent');
      expect(p.recommendedAt).not.toBeNull();
    }

    // Clean up
    await prisma.hiringProfile.deleteMany({ where: { openingId: opening.id } });
    await prisma.opening.delete({ where: { id: opening.id } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenants.delete({ where: { tenantId } });
  });
});

