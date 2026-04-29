import cors from 'cors';
import express from 'express';
import { resolve } from 'path';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { apiRouter } from './routes';

export const app = express();
const publicDirectory = resolve(process.cwd(), 'public');

app.use(
    cors({
        origin: env.allowedOrigins
    })
);

// Mantemos um limite modesto para reduzir payloads inválidos sem atrapalhar o app web.
app.use(express.json({ limit: '1mb' }));

app.use(express.static(publicDirectory));
app.use(apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
