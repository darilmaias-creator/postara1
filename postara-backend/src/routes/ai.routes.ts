import { Router } from 'express';
import { getAppDatabase } from '../lib/database';
import { createDescriptionModelCandidates } from '../lib/gemini';
import {
    createGetGenerationHistoryByIdHandler,
    createListGenerationHistoryHandler
} from '../modules/ai/ai-history.controller';
import { GenerationHistoryService } from '../modules/ai/ai-history.service';
import { SqliteGenerationHistoryRepository } from '../modules/ai/ai-history.sqlite.repository';
import { createGenerateDescriptionHandler } from '../modules/ai/ai.controller';
import { AiService } from '../modules/ai/ai.service';
import { optionalAuth, requireAuth } from '../modules/auth/auth.shared';

const aiService = new AiService(createDescriptionModelCandidates());
const generationHistoryRepository = new SqliteGenerationHistoryRepository(getAppDatabase());
const generationHistoryService = new GenerationHistoryService(generationHistoryRepository);

export const aiRouter = Router();

aiRouter.get('/history', requireAuth, createListGenerationHistoryHandler(generationHistoryService));
aiRouter.get('/history/:id', requireAuth, createGetGenerationHistoryByIdHandler(generationHistoryService));
aiRouter.post('/generate-description', optionalAuth, createGenerateDescriptionHandler(aiService, generationHistoryService));
