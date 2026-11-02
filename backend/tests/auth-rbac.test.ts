import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole, OpeningStatus } from '@prisma/client';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import { AuthService } from '../src/services/auth.service';
import { sanitizeProfileForRole } from '../src/middleware/tenant.middleware';

describe('Phase 2 — Auth, RBAC & Tenant Isolation Middleware', () => {
  let tenantAId: string;
  let tenantBId: string;
  let managerAId: string;
  let managerBId: string;
  let vendorAId: string;
  let openingManagerAId: string;
  let openingManagerBId: string;

  let managerAToken: string;
  let managerBToken: string;
  let vendorAToken: string;

  beforeAll(async () => {
    // 1. Setup isolated test tenants
    const tA = await prisma.tenants.create({ data: { name: 'Auth Test Tenant A' } });
    const tB = await prisma.tenants.create({ data: { name: 'Auth Test Tenant B' } });
    tenantAId = tA.tenantId;
    tenantBId = tB.tenantId;

    const passwordHash = await AuthService.hashPassword('Secret123!');

    // 2. Setup users
    const mA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `managerA-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Manager A',
      },
    });
    managerAId = mA.id;

    const mB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `managerB-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.HIRING_MANAGER,
        name: 'Manager B',
      },
    });
    managerBId = mB.id;

    const vA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `vendorA-${Date.now()}@test.com`,
        passwordHash,
        role: UserRole.IT_VENDOR,
        name: 'Vendor A',
      },
    });
    vendorAId = vA.id;

    // 3. Setup Openings
    const opA = await prisma.opening.create({
      data: {
        tenantId: tenantAId,
        hiringManagerId: managerAId,
        title: 'Manager A Opening',
        experienceMin: 5,
        status: OpeningStatus.OPEN,
      },
    });
    openingManagerAId = opA.id;

    const opB = await prisma.opening.create({
      data: {
        tenantId: tenantBId,
        hiringManagerId: managerBId,
        title: 'Manager B Opening',
        experienceMin: 3,
        status: OpeningStatus.OPEN,
      },
    });
    openingManagerBId = opB.id;

    // 4. Generate tokens
    managerAToken = AuthService.generateToken({
      userId: managerAId,
      tenantId: tenantAId,
      role: UserRole.HIRING_MANAGER,
      email: mA.email,
      name: mA.name,
    });

    managerBToken = AuthService.generateToken({
      userId: managerBId,
      tenantId: tenantBId,
      role: UserRole.HIRING_MANAGER,
      email: mB.email,
      name: mB.name,
    });

    vendorAToken = AuthService.generateToken({
      userId: vendorAId,
      tenantId: tenantAId,
      role: UserRole.IT_VENDOR,
      email: vA.email,
      name: vA.name,
    });
  });

  afterAll(async () => {
    await prisma.opening.deleteMany({ where: { id: { in: [openingManagerAId, openingManagerBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [managerAId, managerBId, vendorAId] } } });
    await prisma.tenants.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  describe('Authentication & Token Generation', () => {
    it('POST /api/auth/login returns valid JWT and user info for valid credentials', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: managerAId } });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'Secret123!' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toMatchObject({
        userId: managerAId,
        tenantId: tenantAId,
        role: UserRole.HIRING_MANAGER,
        email: user.email,
      });

      const decoded = AuthService.verifyToken(res.body.token);
      expect(decoded.userId).toBe(managerAId);
      expect(decoded.tenantId).toBe(tenantAId);
      expect(decoded.role).toBe(UserRole.HIRING_MANAGER);
    });

    it('POST /api/auth/login rejects invalid password with 401', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: managerAId } });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'WrongPassword!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid email or password');
    });

    it('POST /api/auth/login rejects non-existent email with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@nowhere.com', password: 'Secret123!' });

      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('GET /api/auth/me returns 200 with user payload when token is valid', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.userId).toBe(managerAId);
    });
  });

  describe('RBAC Middleware Enforcement', () => {
    it('allows IT_VENDOR to access vendor-only route', async () => {
      const res = await request(app)
        .get('/api/test/vendor-only')
        .set('Authorization', `Bearer ${vendorAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Vendor access granted');
    });

    it('blocks IT_VENDOR from accessing hiring-manager-only route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/test/manager-only')
        .set('Authorization', `Bearer ${vendorAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Insufficient permissions');
    });

    it('allows HIRING_MANAGER to access manager-only route', async () => {
      const res = await request(app)
        .get('/api/test/manager-only')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Hiring manager access granted');
    });

    it('blocks HIRING_MANAGER from accessing vendor-only route (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/test/vendor-only')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Insufficient permissions');
    });
  });

  describe('Tenant & Hiring Manager Resource Isolation (Zero Leakage)', () => {
    it('HIRING_MANAGER A can view their own opening', async () => {
      const res = await request(app)
        .get(`/api/test/openings/${openingManagerAId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.opening.id).toBe(openingManagerAId);
    });

    it('HIRING_MANAGER B can view their own opening', async () => {
      const res = await request(app)
        .get(`/api/test/openings/${openingManagerBId}`)
        .set('Authorization', `Bearer ${managerBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.opening.id).toBe(openingManagerBId);
    });

    it('HIRING_MANAGER A cannot access HIRING_MANAGER B opening (returns 404, no data leaked)', async () => {
      const res = await request(app)
        .get(`/api/test/openings/${openingManagerBId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      // Crucial: 404 prevents enumerating/confirming existence of other openings
      expect(res.status).toBe(404);
      expect(res.body.opening).toBeUndefined();
    });

    it('IT_VENDOR in Tenant A cannot access Tenant B opening (cross-tenant attempt returns 404)', async () => {
      const res = await request(app)
        .get(`/api/test/openings/${openingManagerBId}`)
        .set('Authorization', `Bearer ${vendorAToken}`);

      expect(res.status).toBe(404);
      expect(res.body.opening).toBeUndefined();
    });

    it('IT_VENDOR can access Tenant A opening (same tenant)', async () => {
      const res = await request(app)
        .get(`/api/test/openings/${openingManagerAId}`)
        .set('Authorization', `Bearer ${vendorAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.opening.id).toBe(openingManagerAId);
    });
  });

  describe('Rule Matrix: Profile AI Recommendation Field Sanitization for IT_VENDOR', () => {
    const mockProfile = {
      id: 101,
      openingId: 'op-123',
      s3Key: 'key-123',
      uploadedBy: 'user-vendor',
      submittedAt: new Date(),
      status: 'SUBMITTED' as const,
      shortlistedBy: null,
      shortlistedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      recommended: true,
      recommendationScore: 0.88,
      recommendationReason: 'Excellent skills',
      recommendationLatencyMs: 850,
      recommendationVersion: 'v1.0',
      recommendationConfidence: 0.95,
      recommendedAt: new Date(),
      isDeleted: false,
    };

    it('strips all AI recommendation fields when sanitized for IT_VENDOR', () => {
      const sanitized = sanitizeProfileForRole(mockProfile, UserRole.IT_VENDOR);

      expect(sanitized.id).toBe(101);
      expect(sanitized.s3Key).toBe('key-123');
      expect(sanitized.recommended).toBeUndefined();
      expect(sanitized.recommendationScore).toBeUndefined();
      expect(sanitized.recommendationReason).toBeUndefined();
      expect(sanitized.recommendationConfidence).toBeUndefined();
      expect(sanitized.recommendationLatencyMs).toBeUndefined();
    });

    it('preserves all AI recommendation fields when accessed by HIRING_MANAGER', () => {
      const sanitized = sanitizeProfileForRole(mockProfile, UserRole.HIRING_MANAGER);

      expect(sanitized.recommended).toBe(true);
      expect(sanitized.recommendationScore).toBe(0.88);
      expect(sanitized.recommendationReason).toBe('Excellent skills');
      expect(sanitized.recommendationConfidence).toBe(0.95);
    });
  });
});
