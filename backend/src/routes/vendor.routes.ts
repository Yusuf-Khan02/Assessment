import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { UserRole } from '@prisma/client';

const router = Router();

// All vendor routes require valid JWT and IT_VENDOR role
router.use(authenticateJWT, requireRole(UserRole.IT_VENDOR));

router.get('/openings', VendorController.getOpenings);
router.get('/openings/:id', VendorController.getOpeningDetails);
router.post('/openings/:id/profiles/presign', VendorController.presignProfiles);
router.post('/openings/:id/profiles/upload', VendorController.submitProfiles);
router.delete('/profiles/:id', VendorController.softDeleteProfile);

export default router;
