import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { getTenantId, getUserId } from '../middleware/tenant.middleware';
import { DecisionPolicy } from '../agent/decision-policy';
import { S3Service } from '../services/s3.service';
import { ProfileStatus } from '@prisma/client';

export class HiringManagerController {
  /**
   * GET /api/hiring-manager/openings
   * Returns only openings belonging to the logged-in hiring manager in their tenant.
   */
  static async getOpenings(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);

      const openings = await prisma.opening.findMany({
        where: {
          tenantId,
          hiringManagerId: userId,
        },
        orderBy: { postedDate: 'desc' },
        include: {
          _count: {
            select: {
              hiringProfiles: { where: { isDeleted: false } },
            },
          },
          hiringProfiles: {
            where: { isDeleted: false },
            select: { status: true, recommended: true },
          },
        },
      });

      const response = openings.map((o) => {
        const totalProfiles = o._count.hiringProfiles;
        const submitted = o.hiringProfiles.filter((p) => p.status === 'SUBMITTED').length;
        const shortlisted = o.hiringProfiles.filter((p) => p.status === 'SHORTLISTED').length;
        const rejected = o.hiringProfiles.filter((p) => p.status === 'REJECTED').length;
        const recommendedCount = o.hiringProfiles.filter((p) => p.recommended === true).length;

        return {
          id: o.id,
          title: o.title,
          description: o.description,
          location: o.location,
          contractType: o.contractType,
          experienceMin: o.experienceMin,
          experienceMax: o.experienceMax,
          postedDate: o.postedDate,
          status: o.status,
          totalProfiles,
          stats: {
            submitted,
            shortlisted,
            rejected,
            recommendedCount,
          },
        };
      });

      res.status(200).json({ openings: response });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch openings';
      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /api/hiring-manager/openings/:id/profiles
   * Returns profiles for an opening owned by the hiring manager, including all AI fields.
   */
  static async getOpeningProfiles(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { id: openingId } = req.params;

      // Enforce opening ownership
      const opening = await prisma.opening.findFirst({
        where: {
          id: openingId,
          tenantId,
          hiringManagerId: userId,
        },
      });

      if (!opening) {
        res.status(404).json({ error: 'Opening not found or access denied' });
        return;
      }

      const profiles = await prisma.hiringProfile.findMany({
        where: {
          openingId,
          isDeleted: false,
        },
        orderBy: [{ recommended: 'desc' }, { recommendationScore: 'desc' }],
        include: {
          uploader: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const enrichedProfiles = profiles.map((p) => {
        const score = p.recommendationScore ?? 0;
        const decision = DecisionPolicy.evaluate(score);

        return {
          id: p.id,
          openingId: p.openingId,
          s3Key: p.s3Key,
          fileName: p.s3Key.slice(p.s3Key.lastIndexOf('/') + 1),
          uploadedBy: p.uploadedBy,
          uploaderName: p.uploader.name,
          submittedAt: p.submittedAt,
          status: p.status,
          shortlistedBy: p.shortlistedBy,
          shortlistedAt: p.shortlistedAt,
          rejectedBy: p.rejectedBy,
          rejectedAt: p.rejectedAt,
          // AI Fields
          recommended: p.recommended,
          recommendationScore: p.recommendationScore,
          recommendationScorePercent: p.recommendationScore ? Math.round(p.recommendationScore * 100) : null,
          recommendationReason: p.recommendationReason,
          recommendationConfidence: p.recommendationConfidence,
          recommendationConfidencePercent: p.recommendationConfidence ? Math.round(p.recommendationConfidence * 100) : null,
          recommendationLatencyMs: p.recommendationLatencyMs,
          recommendationVersion: p.recommendationVersion,
          recommendedAt: p.recommendedAt,
          reasoningMetadata: p.reasoningMetadata,
          badge: decision.badgeText,
          badgeBand: decision.decisionBand,
        };
      });

      res.status(200).json({
        opening: {
          id: opening.id,
          title: opening.title,
          experienceMin: opening.experienceMin,
          experienceMax: opening.experienceMax,
          location: opening.location,
        },
        profiles: enrichedProfiles,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch profiles';
      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /api/hiring-manager/profiles/:id/shortlist
   * Sets profile status to SHORTLISTED. Transactional & Idempotent.
   */
  static async shortlistProfile(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const profileId = parseInt(req.params.id);

      if (isNaN(profileId)) {
        res.status(400).json({ error: 'Invalid profile ID' });
        return;
      }

      // Verify profile belongs to an opening owned by the hiring manager in the same tenant
      const profile = await prisma.hiringProfile.findFirst({
        where: {
          id: profileId,
          isDeleted: false,
          opening: {
            tenantId,
            hiringManagerId: userId,
          },
        },
      });

      if (!profile) {
        res.status(404).json({ error: 'Profile not found or access denied' });
        return;
      }

      // Execute within transaction
      const updated = await prisma.$transaction(async (tx) => {
        return tx.hiringProfile.update({
          where: { id: profileId },
          data: {
            status: ProfileStatus.SHORTLISTED,
            shortlistedBy: userId,
            shortlistedAt: new Date(),
            rejectedBy: null,
            rejectedAt: null,
          },
        });
      });

      res.status(200).json({
        message: 'Profile successfully shortlisted',
        profile: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to shortlist profile';
      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /api/hiring-manager/profiles/:id/reject
   * Sets profile status to REJECTED. Transactional & Idempotent.
   */
  static async rejectProfile(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const profileId = parseInt(req.params.id);

      if (isNaN(profileId)) {
        res.status(400).json({ error: 'Invalid profile ID' });
        return;
      }

      // Verify profile belongs to an opening owned by the hiring manager in the same tenant
      const profile = await prisma.hiringProfile.findFirst({
        where: {
          id: profileId,
          isDeleted: false,
          opening: {
            tenantId,
            hiringManagerId: userId,
          },
        },
      });

      if (!profile) {
        res.status(404).json({ error: 'Profile not found or access denied' });
        return;
      }

      // Execute within transaction
      const updated = await prisma.$transaction(async (tx) => {
        return tx.hiringProfile.update({
          where: { id: profileId },
          data: {
            status: ProfileStatus.REJECTED,
            rejectedBy: userId,
            rejectedAt: new Date(),
            shortlistedBy: null,
            shortlistedAt: null,
          },
        });
      });

      res.status(200).json({
        message: 'Profile rejected',
        profile: updated,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reject profile';
      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /api/hiring-manager/profiles/:id/preview
   * Generates secure presigned download/preview URL for candidate resume via backend.
   */
  static async previewProfile(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const profileId = parseInt(req.params.id);

      if (isNaN(profileId)) {
        res.status(400).json({ error: 'Invalid profile ID' });
        return;
      }

      const profile = await prisma.hiringProfile.findFirst({
        where: {
          id: profileId,
          isDeleted: false,
          opening: {
            tenantId,
            hiringManagerId: userId,
          },
        },
      });

      if (!profile) {
        res.status(404).json({ error: 'Profile not found or access denied' });
        return;
      }

      const previewUrl = await S3Service.getPresignedDownloadUrl(profile.s3Key, 3600);
      res.status(200).json({
        profileId: profile.id,
        fileName: profile.s3Key.slice(profile.s3Key.lastIndexOf('/') + 1),
        previewUrl,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate preview URL';
      res.status(500).json({ error: message });
    }
  }
}

