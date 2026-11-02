import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { verifyOpeningAccess } from '../middleware/tenant.middleware';

const router = Router();

router.get(
  '/vendor-only',
  authenticateJWT,
  requireRole(UserRole.IT_VENDOR),
  (_req: Request, res: Response) => {
    res.status(200).json({ message: 'Vendor access granted' });
  }
);

router.get(
  '/manager-only',
  authenticateJWT,
  requireRole(UserRole.HIRING_MANAGER),
  (_req: Request, res: Response) => {
    res.status(200).json({ message: 'Hiring manager access granted' });
  }
);

router.get(
  '/openings/:id',
  authenticateJWT,
  async (req: Request, res: Response) => {
    const opening = await verifyOpeningAccess(req, req.params.id);
    if (!opening) {
      res.status(404).json({ error: 'Opening not found' });
      return;
    }
    res.status(200).json({ opening });
  }
);

export default router;

