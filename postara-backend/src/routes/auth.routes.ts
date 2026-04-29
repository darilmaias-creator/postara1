import { Router } from 'express';
import {
    createGetCurrentUserHandler,
    createLoginHandler,
    createLogoutHandler,
    createRegisterHandler,
    createUpdateMySubscriptionHandler
} from '../modules/auth/auth.controller';
import { authService, requireAuth } from '../modules/auth/auth.shared';

export const authRouter = Router();

authRouter.post('/register', createRegisterHandler(authService));
authRouter.post('/login', createLoginHandler(authService));
authRouter.post('/logout', requireAuth, createLogoutHandler(authService));
authRouter.get('/me', requireAuth, createGetCurrentUserHandler());
authRouter.patch('/me/subscription', requireAuth, createUpdateMySubscriptionHandler(authService));
