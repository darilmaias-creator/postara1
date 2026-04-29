import { AppError } from '../../errors/app-error';
import { GenerationMode } from './ai.generation';
import { GenerationHistoryRepository } from './ai-history.repository';
import { GenerationHistoryEntry, GenerationHistoryListFilters, GenerationHistoryListResult } from './ai-history.types';
import { GenerateDescriptionInput, GenerateDescriptionResult } from './ai.types';

const normalizeOptionalString = (value: string | undefined): string | undefined => {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : undefined;
};

export class GenerationHistoryService {
    constructor(private readonly repository: GenerationHistoryRepository) {}

    async recordGeneration(
        input: GenerateDescriptionInput,
        result: GenerateDescriptionResult
    ): Promise<GenerationHistoryEntry> {
        return this.repository.create({
            request: {
                productName: input.productName.trim(),
                productFeatures: normalizeOptionalString(input.productFeatures),
                targetAudience: normalizeOptionalString(input.targetAudience),
                tone: normalizeOptionalString(input.tone),
                userId: normalizeOptionalString(input.userId),
                sessionId: normalizeOptionalString(input.sessionId),
                subscriptionPlan: result.subscriptionPlan,
                requestedGenerationMode: input.generationMode,
                appliedGenerationMode: result.generationMode,
                modeAdjusted: result.modeAdjusted
            },
            response: result
        });
    }

    async listHistory(filters: GenerationHistoryListFilters): Promise<GenerationHistoryListResult> {
        const [entries, total] = await Promise.all([
            this.repository.list(filters),
            this.repository.count({
                userId: filters.userId,
                sessionId: filters.sessionId,
                subscriptionPlan: filters.subscriptionPlan
            })
        ]);

        return {
            entries,
            total,
            page: filters.page,
            limit: filters.limit,
            hasNextPage: filters.page * filters.limit < total
        };
    }

    async getHistoryById(id: string): Promise<GenerationHistoryEntry> {
        const entry = await this.repository.findById(id);

        if (!entry) {
            throw new AppError('Histórico de geração não encontrado.', {
                code: 'BAD_REQUEST',
                statusCode: 404
            });
        }

        return entry;
    }

    async getHistoryByIdForUser(id: string, userId: string): Promise<GenerationHistoryEntry> {
        const entry = await this.getHistoryById(id);

        if (entry.request.userId !== userId) {
            throw new AppError('Histórico de geração não encontrado.', {
                code: 'NOT_FOUND',
                statusCode: 404
            });
        }

        return entry;
    }
}

export const getDefaultHistoryLimit = (): number => 20;
export const getMaxHistoryLimit = (): number => 100;
export const getDefaultHistoryPage = (): number => 1;
export const isOptionalGenerationMode = (value: string): value is GenerationMode =>
    value === 'short' || value === 'medium' || value === 'premium';
