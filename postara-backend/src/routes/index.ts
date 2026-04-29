import { Router } from 'express';
import { aiRouter } from './ai.routes';
import { authRouter } from './auth.routes';
import { healthRouter } from './health.routes';

export const apiRouter = Router();

apiRouter.use('/api', healthRouter);
apiRouter.use('/api/auth', authRouter);
apiRouter.use('/api/ai', aiRouter);
