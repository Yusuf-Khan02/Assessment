import { Request } from 'express';
import { UserRole, hiringProfile } from '@prisma/client';
import { prisma } from '../prisma';

export function getTenantId(req: Request): string {
  if (!req.user?.tenantId) {
    throw new Error('Tenant context missing from authenticated request');
  }
  return req.user.tenantId;
}

export function getUserId(req: Request): string {
  if (!req.user?.userId) {
    throw new Error('User context missing from authenticated request');
  }
  return req.user.userId;
}

/**
 * Tenant scoping for Openings queries:
 * - IT_VENDOR can view all openings under their tenantId
 * - HIRING_MANAGER can ONLY view openings where hiringManagerId === req.user.userId AND tenantId === req.user.tenantId
 */
export function getOpeningWhereScope(req: Request) {
  const tenantId = getTenantId(req);
  const user = req.user!;

  if (user.role === UserRole.HIRING_MANAGER) {
    return {
      tenantId,
      hiringManagerId: user.userId,
    };
  }

  // IT_VENDOR
  return {
    tenantId,
  };
}

/**
 * Validates and retrieves an Opening ensuring strict tenant and role isolation.
 * Throws or returns null if not accessible, preventing cross-tenant and cross-manager leakage.
 */
export async function verifyOpeningAccess(req: Request, openingId: string) {
  const whereScope = getOpeningWhereScope(req);

  const opening = await prisma.opening.findFirst({
    where: {
      id: openingId,
      ...whereScope,
    },
    include: {
      tenant: true,
      hiringManager: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return opening;
}

/**
 * Sanitize profile data based on caller role:
 * Spec Rule: IT_VENDOR **cannot** view AI recommendation fields.
 */
export function sanitizeProfileForRole(profile: hiringProfile, role: UserRole): Partial<hiringProfile> {
  if (role === UserRole.IT_VENDOR) {
    const safeProfile = { ...profile };
    delete safeProfile.recommended;
    delete safeProfile.recommendationScore;
    delete safeProfile.recommendationReason;
    delete safeProfile.recommendationLatencyMs;
    delete safeProfile.recommendationVersion;
    delete safeProfile.recommendationConfidence;
    delete safeProfile.recommendedAt;
    return safeProfile;
  }

  return profile;
}

export function sanitizeProfilesForRole(profiles: hiringProfile[], role: UserRole): Partial<hiringProfile>[] {
  return profiles.map((p) => sanitizeProfileForRole(p, role));
}
