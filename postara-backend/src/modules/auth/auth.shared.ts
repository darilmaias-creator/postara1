import { getAppDatabase } from '../../lib/database';
import { SqliteAuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { createOptionalAuthMiddleware, createRequireAuthMiddleware } from './auth.middleware';

const authRepository = new SqliteAuthRepository(getAppDatabase());

export const authService = new AuthService(authRepository);
export const optionalAuth = createOptionalAuthMiddleware(authService);
export const requireAuth = createRequireAuthMiddleware(authService);
