import { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';
import { isSubscriptionPlan } from './ai.generation';
import {
    GenerationHistoryService,
    getDefaultHistoryLimit,
    getDefaultHistoryPage,
    getMaxHistoryLimit
} from './ai-history.service';
import { GenerationHistoryListFilters } from './ai-history.types';

const parseOptionalQueryString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : undefined;
};

const parseHistoryListFilters = (query: Record<string, unknown>): GenerationHistoryListFilters => {
    const userId = parseOptionalQueryString(query.userId);
    const sessionId = parseOptionalQueryString(query.sessionId);
    const subscriptionPlanRaw = parseOptionalQueryString(query.subscriptionPlan);
    const limitRaw = parseOptionalQueryString(query.limit);
    const pageRaw = parseOptionalQueryString(query.page);

    if (subscriptionPlanRaw && !isSubscriptionPlan(subscriptionPlanRaw)) {
        throw new AppError('O filtro subscriptionPlan precisa ser "free" ou "premium".', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const subscriptionPlan = subscriptionPlanRaw && isSubscriptionPlan(subscriptionPlanRaw) ? subscriptionPlanRaw : undefined;

    let limit = getDefaultHistoryLimit();
    let page = getDefaultHistoryPage();

    if (limitRaw) {
        const parsedLimit = Number(limitRaw);

        if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
            throw new AppError('O filtro limit precisa ser um inteiro positivo.', {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        limit = Math.min(parsedLimit, getMaxHistoryLimit());
    }

    if (pageRaw) {
        const parsedPage = Number(pageRaw);

        if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
            throw new AppError('O filtro page precisa ser um inteiro positivo.', {
                code: 'BAD_REQUEST',
                statusCode: 400
            });
        }

        page = parsedPage;
    }

    return {
        userId,
        sessionId,
        subscriptionPlan,
        page,
        limit
    };
};

export const createListGenerationHistoryHandler = (
    generationHistoryService: GenerationHistoryService
): RequestHandler => {
    return async (req, res, next) => {
        try {
            if (!req.auth?.user) {
                throw new AppError('Autenticação obrigatória para consultar histórico.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            const filters = parseHistoryListFilters(req.query as Record<string, unknown>);
            const result = await generationHistoryService.listHistory({
                ...filters,
                userId: req.auth.user.id
            });

            res.status(200).json({
                status: 'success',
                data: result.entries,
                meta: {
                    total: result.total,
                    count: result.entries.length,
                    page: result.page,
                    limit: result.limit,
                    hasNextPage: result.hasNextPage
                }
            });
        } catch (error) {
            next(error);
        }
    };
};

export const createGetGenerationHistoryByIdHandler = (
    generationHistoryService: GenerationHistoryService
): RequestHandler => {
    return async (req, res, next) => {
        try {
            if (!req.auth?.user) {
                throw new AppError('Autenticação obrigatória para consultar histórico.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            const historyId = typeof req.params.id === 'string' ? req.params.id.trim() : undefined;

            if (!historyId) {
                throw new AppError('O id do histórico é obrigatório.', {
                    code: 'BAD_REQUEST',
                    statusCode: 400
                });
            }

            const entry = await generationHistoryService.getHistoryByIdForUser(historyId, req.auth.user.id);

            res.status(200).json({
                status: 'success',
                data: entry
            });
        } catch (error) {
            next(error);
        }
    };
};
