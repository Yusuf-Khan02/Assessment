import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { seed } from '../prisma/seed';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

describe('Phase 1 - Schema Compliance & Seed Verification', () => {
  beforeAll(async () => {
    // Ensure database is seeded with production seed data
    await seed();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Seeding Requirements Verification', () => {
    it('populates exactly 1 tenant named "Bruce Wayne Corp"', async () => {
      const tenants = await prisma.tenants.findMany();
      expect(tenants.length).toBe(1);
      expect(tenants[0].name).toBe('Bruce Wayne Corp');
      expect(typeof tenants[0].tenantId).toBe('string');
      expect(tenants[0].tenantId.length).toBeGreaterThan(0);
    });

    it('populates at least 1 HIRING_MANAGER and at least 1 IT_VENDOR under that tenant', async () => {
      const tenant = await prisma.tenants.findFirstOrThrow();
      const users = await prisma.user.findMany({
        where: { tenantId: tenant.tenantId },
      });

      const hiringManagers = users.filter((u) => u.role === 'HIRING_MANAGER');
      const vendors = users.filter((u) => u.role === 'IT_VENDOR');

      expect(hiringManagers.length).toBeGreaterThanOrEqual(1);
      expect(vendors.length).toBeGreaterThanOrEqual(1);
      expect(users.every((u) => u.tenantId === tenant.tenantId)).toBe(true);
    });

    it('populates at least 12 Opening records with varied attributes under the same tenant', async () => {
      const tenant = await prisma.tenants.findFirstOrThrow();
      const openings = await prisma.opening.findMany({
        where: { tenantId: tenant.tenantId },
        include: {
          tenant: true,
          hiringManager: true,
        },
      });

      expect(openings.length).toBeGreaterThanOrEqual(12);

      // Verify all openings belong to the same tenant
      expect(openings.every((o) => o.tenantId === tenant.tenantId)).toBe(true);

      // Verify varied contract types, experience ranges, locations, statuses
      const contractTypes = new Set(openings.map((o) => o.contractType).filter(Boolean));
      const locations = new Set(openings.map((o) => o.location).filter(Boolean));
      const statuses = new Set(openings.map((o) => o.status));

      expect(contractTypes.size).toBeGreaterThanOrEqual(2);
      expect(locations.size).toBeGreaterThanOrEqual(2);
      expect(statuses.size).toBeGreaterThanOrEqual(2);

      // Verify relations are populated properly
      for (const opening of openings) {
        expect(opening.tenant.name).toBe('Bruce Wayne Corp');
        expect(opening.hiringManager.role).toBe('HIRING_MANAGER');
      }
    });
  });

  describe('Schema Model & Field Verification (matches spec field-for-field)', () => {
    const models = Prisma.dmmf.datamodel.models;
    const modelMap = new Map(models.map((m) => [m.name, m]));

    it('contains all required models: Tenants, User, Opening, hiringProfile', () => {
      expect(modelMap.has('Tenants')).toBe(true);
      expect(modelMap.has('User')).toBe(true);
      expect(modelMap.has('Opening')).toBe(true);
      expect(modelMap.has('hiringProfile')).toBe(true);
    });

    it('Opening model matches spec field-for-field', () => {
      const opening = modelMap.get('Opening')!;
      const fields = new Map(opening.fields.map((f) => [f.name, f]));

      // Required fields from spec:
      // id: String @id @default(uuid())
      expect(fields.get('id')?.type).toBe('String');
      expect(fields.get('id')?.isId).toBe(true);

      // tenantId: String
      expect(fields.get('tenantId')?.type).toBe('String');
      expect(fields.get('tenantId')?.isRequired).toBe(true);

      // title: String
      expect(fields.get('title')?.type).toBe('String');
      expect(fields.get('title')?.isRequired).toBe(true);

      // description: String?
      expect(fields.get('description')?.type).toBe('String');
      expect(fields.get('description')?.isRequired).toBe(false);

      // location: String?
      expect(fields.get('location')?.type).toBe('String');
      expect(fields.get('location')?.isRequired).toBe(false);

      // contractType: String?
      expect(fields.get('contractType')?.type).toBe('String');
      expect(fields.get('contractType')?.isRequired).toBe(false);

      // hiringManagerId: String
      expect(fields.get('hiringManagerId')?.type).toBe('String');
      expect(fields.get('hiringManagerId')?.isRequired).toBe(true);

      // experienceMin: Int
      expect(fields.get('experienceMin')?.type).toBe('Int');
      expect(fields.get('experienceMin')?.isRequired).toBe(true);

      // experienceMax: Int?
      expect(fields.get('experienceMax')?.type).toBe('Int');
      expect(fields.get('experienceMax')?.isRequired).toBe(false);

      // postedDate: DateTime @default(now())
      expect(fields.get('postedDate')?.type).toBe('DateTime');

      // expectedCompletionDate: DateTime?
      expect(fields.get('expectedCompletionDate')?.type).toBe('DateTime');
      expect(fields.get('expectedCompletionDate')?.isRequired).toBe(false);

      // actionDate: DateTime?
      expect(fields.get('actionDate')?.type).toBe('DateTime');
      expect(fields.get('actionDate')?.isRequired).toBe(false);

      // status: OpeningStatus @default(OPEN)
      expect(fields.get('status')?.type).toBe('OpeningStatus');
    });

    it('hiringProfile model matches spec field-for-field', () => {
      const profile = modelMap.get('hiringProfile')!;
      const fields = new Map(profile.fields.map((f) => [f.name, f]));

      // id: Int @id @default(autoincrement())
      expect(fields.get('id')?.type).toBe('Int');
      expect(fields.get('id')?.isId).toBe(true);

      // openingId: String
      expect(fields.get('openingId')?.type).toBe('String');

      // s3Key: String @unique
      expect(fields.get('s3Key')?.type).toBe('String');
      expect(fields.get('s3Key')?.isUnique).toBe(true);

      // uploadedBy: String
      expect(fields.get('uploadedBy')?.type).toBe('String');

      // submittedAt: DateTime @default(now())
      expect(fields.get('submittedAt')?.type).toBe('DateTime');

      // status: ProfileStatus @default(SUBMITTED)
      expect(fields.get('status')?.type).toBe('ProfileStatus');

      // shortlistedBy: String?, shortlistedAt: DateTime?
      expect(fields.get('shortlistedBy')?.type).toBe('String');
      expect(fields.get('shortlistedBy')?.isRequired).toBe(false);
      expect(fields.get('shortlistedAt')?.type).toBe('DateTime');
      expect(fields.get('shortlistedAt')?.isRequired).toBe(false);

      // rejectedBy: String?, rejectedAt: DateTime?
      expect(fields.get('rejectedBy')?.type).toBe('String');
      expect(fields.get('rejectedBy')?.isRequired).toBe(false);
      expect(fields.get('rejectedAt')?.type).toBe('DateTime');
      expect(fields.get('rejectedAt')?.isRequired).toBe(false);

      // AI Agent Fields
      expect(fields.get('recommended')?.type).toBe('Boolean');
      expect(fields.get('recommended')?.isRequired).toBe(false);

      expect(fields.get('recommendationScore')?.type).toBe('Float');
      expect(fields.get('recommendationScore')?.isRequired).toBe(false);

      expect(fields.get('recommendationReason')?.type).toBe('String');
      expect(fields.get('recommendationReason')?.isRequired).toBe(false);

      expect(fields.get('recommendationLatencyMs')?.type).toBe('Int');
      expect(fields.get('recommendationLatencyMs')?.isRequired).toBe(false);

      expect(fields.get('recommendationVersion')?.type).toBe('String');
      expect(fields.get('recommendationVersion')?.isRequired).toBe(false);

      expect(fields.get('recommendationConfidence')?.type).toBe('Float');
      expect(fields.get('recommendationConfidence')?.isRequired).toBe(false);

      expect(fields.get('recommendedAt')?.type).toBe('DateTime');
      expect(fields.get('recommendedAt')?.isRequired).toBe(false);

      // isDeleted: Boolean @default(false)
      expect(fields.get('isDeleted')?.type).toBe('Boolean');
    });

    it('contains all required Enums with exact values', () => {
      const enums = Prisma.dmmf.datamodel.enums;
      const enumMap = new Map(enums.map((e) => [e.name, e.values.map((v) => v.name)]));

      expect(enumMap.get('OpeningStatus')).toEqual(['OPEN', 'CLOSED', 'ON_HOLD']);
      expect(enumMap.get('ProfileStatus')).toEqual(['SUBMITTED', 'SHORTLISTED', 'REJECTED']);
      expect(enumMap.get('UserRole')).toEqual(['IT_VENDOR', 'HIRING_MANAGER']);
    });

    it('verifies DB indexes in PostgreSQL match specification', async () => {
      interface PgIndex {
        indexname: string;
        tablename: string;
        indexdef: string;
      }

      const indexes = await prisma.$queryRawUnsafe<PgIndex[]>(
        "SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public';"
      );

      const indexNames = indexes.map((idx) => idx.indexname);

      // Spec specifies @@index([tenantId]) on Opening
      expect(indexNames).toContain('Opening_tenantId_idx');

      // Spec specifies @@index([openingId]) and @@index([recommended]) on hiringProfile
      expect(indexNames).toContain('hiringProfile_openingId_idx');
      expect(indexNames).toContain('hiringProfile_recommended_idx');

      // Spec specifies unique on s3Key
      expect(indexNames).toContain('hiringProfile_s3Key_key');

      // User model indexes
      expect(indexNames).toContain('User_tenantId_idx');
      expect(indexNames).toContain('User_email_key');
    });

    it('verifies schema.prisma file contains exact required directives', () => {
      const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma');
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');

      expect(schemaContent).toContain('model Tenants');
      expect(schemaContent).toContain('model User');
      expect(schemaContent).toContain('model Opening');
      expect(schemaContent).toContain('model hiringProfile');
      expect(schemaContent).toContain('@@index([tenantId])');
      expect(schemaContent).toContain('@@index([openingId])');
      expect(schemaContent).toContain('@@index([recommended])');
      expect(schemaContent).toContain('@unique');
    });
  });
});
