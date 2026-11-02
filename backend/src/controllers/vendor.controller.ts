import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { S3Service } from '../services/s3.service';
import { getTenantId, getUserId, sanitizeProfilesForRole } from '../middleware/tenant.middleware';
import { UserRole } from '@prisma/client';

const presignSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().optional(),
      })
    )
    .min(1, 'At least one file is required'),
});

const uploadSchema = z.object({
  profiles: z
    .array(
      z.object({
        s3Key: z.string().min(1),
      })
    )
    .min(1, 'At least one profile is required'),
});

export class VendorController {
  /**
   * GET /api/vendor/openings
   * Paginated, tenant-filtered list of openings.
   */
  static async getOpenings(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string) || 10));
      const skip = (page - 1) * limit;

      const [openings, total] = await Promise.all([
        prisma.opening.findMany({
          where: { tenantId },
          skip,
          take: limit,
          orderBy: { postedDate: 'desc' },
          include: {
            hiringManager: {
              select: { id: true, name: true, email: true },
            },
            _count: {
              select: {
                hiringProfiles: { where: { isDeleted: false } },
              },
            },
          },
        }),
        prisma.opening.count({ where: { tenantId } }),
      ]);

      res.status(200).json({
        openings: openings.map((o) => ({
          id: o.id,
          title: o.title,
          description: o.description,
          location: o.location,
          contractType: o.contractType,
          hiringManagerName: o.hiringManager.name,
          experienceMin: o.experienceMin,
          experienceMax: o.experienceMax,
          postedDate: o.postedDate,
          status: o.status,
          totalProfilesCount: o._count.hiringProfiles,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch openings';
      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /api/vendor/openings/:id
   * Details panel: hiring manager name, experience range, profiles count, own uploads only.
   */
  static async getOpeningDetails(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { id } = req.params;

      const opening = await prisma.opening.findFirst({
        where: { id, tenantId },
        include: {
          hiringManager: {
            select: { id: true, name: true, email: true },
          },
          hiringProfiles: {
            where: {
              uploadedBy: userId,
              isDeleted: false,
            },
            orderBy: { submittedAt: 'desc' },
          },
        },
      });

      if (!opening) {
        res.status(404).json({ error: 'Opening not found' });
        return;
      }

      // Sanitize profiles so IT_VENDOR cannot see AI recommendation fields
      const sanitizedProfiles = sanitizeProfilesForRole(opening.hiringProfiles, UserRole.IT_VENDOR);

      res.status(200).json({
        id: opening.id,
        title: opening.title,
        description: opening.description,
        location: opening.location,
        contractType: opening.contractType,
        hiringManagerName: opening.hiringManager.name,
        experienceRange: {
          min: opening.experienceMin,
          max: opening.experienceMax,
        },
        postedDate: opening.postedDate,
        status: opening.status,
        ownProfilesCount: sanitizedProfiles.length,
        uploadedProfiles: sanitizedProfiles,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch opening details';
      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /api/vendor/openings/:id/profiles/presign
   * Issues presigned S3 upload URLs for PDF/PPTX files.
   */
  static async presignProfiles(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const { id: openingId } = req.params;

      // Validate opening ownership within tenant
      const opening = await prisma.opening.findFirst({
        where: { id: openingId, tenantId },
      });

      if (!opening) {
        res.status(404).json({ error: 'Opening not found' });
        return;
      }

      const parseResult = presignSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
        return;
      }

      const { files } = parseResult.data;

      // Validate file extensions
      for (const file of files) {
        if (!S3Service.isAllowedFileType(file.filename, file.contentType)) {
          res.status(400).json({
            error: `Invalid file type for file: ${file.filename}. Only PDF and PPTX files are allowed.`,
          });
          return;
        }
      }

      const presignedItems = await Promise.all(
        files.map((file) =>
          S3Service.getPresignedUploadUrl(tenantId, openingId, file.filename, file.contentType)
        )
      );

      res.status(200).json({ uploads: presignedItems });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate presigned URLs';
      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /api/vendor/openings/:id/profiles/upload
   * Transactional batch submission of profiles.
   */
  static async submitProfiles(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { id: openingId } = req.params;

      const opening = await prisma.opening.findFirst({
        where: { id: openingId, tenantId },
      });

      if (!opening) {
        res.status(404).json({ error: 'Opening not found' });
        return;
      }

      const parseResult = uploadSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
        return;
      }

      const { profiles } = parseResult.data;

      // Execute within a single Prisma transaction (atomic batch write)
      const createdProfiles = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const item of profiles) {
          const profile = await tx.hiringProfile.create({
            data: {
              openingId,
              s3Key: item.s3Key,
              uploadedBy: userId,
              status: 'SUBMITTED',
            },
          });
          results.push(profile);
        }
        return results;
      });

      res.status(201).json({
        message: `Successfully submitted ${createdProfiles.length} profiles`,
        profiles: sanitizeProfilesForRole(createdProfiles, UserRole.IT_VENDOR),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to submit profiles';
      res.status(400).json({ error: message });
    }
  }

  /**
   * DELETE /api/vendor/profiles/:id
   * Soft-delete endpoint, restricted to the uploader within tenant.
   */
  static async softDeleteProfile(req: Request, res: Response): Promise<void> {
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
          uploadedBy: userId,
          opening: { tenantId },
        },
      });

      if (!profile) {
        res.status(404).json({ error: 'Profile not found or access denied' });
        return;
      }

      await prisma.hiringProfile.update({
        where: { id: profileId },
        data: { isDeleted: true },
      });

      res.status(200).json({ message: 'Profile soft-deleted successfully' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete profile';
      res.status(500).json({ error: message });
    }
  }
}
