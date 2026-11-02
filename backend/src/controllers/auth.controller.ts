import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const { email, password } = parsed.data;
      const result = await AuthService.login(email, password);

      res.status(200).json({
        message: 'Login successful',
        token: result.token,
        user: result.user,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      res.status(401).json({ error: message });
    }
  }

  static async me(req: Request, res: Response): Promise<void> {
    res.status(200).json({ user: req.user });
  }
}
