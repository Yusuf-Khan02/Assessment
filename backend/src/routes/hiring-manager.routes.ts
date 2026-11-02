import { Router } from 'express';
import { HiringManagerController } from '../controllers/hiring-manager.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All Hiring Manager routes require valid JWT and HIRING_MANAGER role
router.use(authenticateJWT, requireRole(UserRole.HIRING_MANAGER));

router.get('/openings', HiringManagerController.getOpenings);
router.get('/openings/:id/profiles', HiringManagerController.getOpeningProfiles);
router.post('/profiles/:id/shortlist', HiringManagerController.shortlistProfile);
router.post('/profiles/:id/reject', HiringManagerController.rejectProfile);

export default router;
