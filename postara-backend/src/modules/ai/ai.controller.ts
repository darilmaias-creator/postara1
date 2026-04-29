import { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';
import { GenerationHistoryService } from './ai-history.service';
import { isGenerationMode, isSubscriptionPlan } from './ai.generation';
import { AiService } from './ai.service';
import { GenerateDescriptionInput } from './ai.types';

const parseGenerateDescriptionInput = (body: unknown): GenerateDescriptionInput => {
    if (!body || typeof body !== 'object') {
        throw new AppError('O corpo da requisição precisa ser um objeto JSON válido.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const payload = body as Record<string, unknown>;

    if (typeof payload.productName !== 'string') {
        throw new AppError('O campo productName precisa ser uma string.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const assertOptionalString = (fieldName: string, value: unknown): string | undefined => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        if (typeof value !== 'string') {
            throw new AppError(`O campo ${fieldName} precisa ser uma string quando informado.`, {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        return value;
    };

    const assertOptionalIdentifier = (fieldName: string, value: unknown): string | undefined => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        if (typeof value !== 'string') {
            throw new AppError(`O campo ${fieldName} precisa ser uma string quando informado.`, {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        const trimmedValue = value.trim();

        if (!trimmedValue) {
            return undefined;
        }

        return trimmedValue;
    };

    const assertOptionalSubscriptionPlan = (value: unknown) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        if (typeof value !== 'string' || !isSubscriptionPlan(value)) {
            throw new AppError('O campo subscriptionPlan precisa ser "free" ou "premium".', {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        return value;
    };

    const assertOptionalGenerationMode = (value: unknown) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        if (typeof value !== 'string' || !isGenerationMode(value)) {
            throw new AppError('O campo generationMode precisa ser "short", "medium" ou "premium".', {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        return value;
    };

    return {
        productName: payload.productName,
        productFeatures: assertOptionalString('productFeatures', payload.productFeatures),
        targetAudience: assertOptionalString('targetAudience', payload.targetAudience),
        tone: assertOptionalString('tone', payload.tone),
        subscriptionPlan: assertOptionalSubscriptionPlan(payload.subscriptionPlan),
        generationMode: assertOptionalGenerationMode(payload.generationMode),
        userId: assertOptionalIdentifier('userId', payload.userId),
        sessionId: assertOptionalIdentifier('sessionId', payload.sessionId)
    };
};

export const createGenerateDescriptionHandler = (
    aiService: AiService,
    generationHistoryService: GenerationHistoryService
): RequestHandler => {
    return async (req, res, next) => {
        try {
            // O parse explícito evita depender da estrutura do Express dentro da regra de negócio.
            const input = parseGenerateDescriptionInput(req.body);
            const effectiveInput: GenerateDescriptionInput = {
                ...input,
                userId: req.auth?.user.id,
                subscriptionPlan: req.auth?.user.subscriptionPlan ?? 'free'
            };
            const result = await aiService.generateDescription(effectiveInput);
            const historyEntry = await generationHistoryService.recordGeneration(effectiveInput, result);

            res.status(200).json({
                status: 'success',
                data: result,
                meta: {
                    historyId: historyEntry.id,
                    createdAt: historyEntry.createdAt
                }
            });
        } catch (error) {
            next(error);
        }
    };
};
