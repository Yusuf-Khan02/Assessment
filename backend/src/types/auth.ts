import { UserRole } from '@prisma/client';

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
