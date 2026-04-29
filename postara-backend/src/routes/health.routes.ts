import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Postara API operacional.',
        timestamp: new Date().toISOString()
    });
});
