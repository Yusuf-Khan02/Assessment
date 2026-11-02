import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    return;
  }

  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    return;
  }
}
