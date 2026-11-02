import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', AuthController.login);
router.get('/me', authenticateJWT, AuthController.me);

export default router;
