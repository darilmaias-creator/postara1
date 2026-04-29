import { randomUUID } from 'crypto';
import {
    CreateGenerationHistoryEntryInput,
    GenerationHistoryEntry,
    GenerationHistoryListFilters
} from './ai-history.types';

export interface GenerationHistoryRepository {
    create(input: CreateGenerationHistoryEntryInput): Promise<GenerationHistoryEntry>;
    findById(id: string): Promise<GenerationHistoryEntry | null>;
    list(filters: GenerationHistoryListFilters): Promise<GenerationHistoryEntry[]>;
    count(filters: Omit<GenerationHistoryListFilters, 'limit' | 'page'>): Promise<number>;
}

// Repositório em memória: ótimo para desenvolvimento e fácil de trocar por banco depois.
export class InMemoryGenerationHistoryRepository implements GenerationHistoryRepository {
    private readonly entries: GenerationHistoryEntry[] = [];

    async create(input: CreateGenerationHistoryEntryInput): Promise<GenerationHistoryEntry> {
        const entry: GenerationHistoryEntry = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            request: input.request,
            response: input.response
        };

        this.entries.unshift(entry);

        return entry;
    }

    async findById(id: string): Promise<GenerationHistoryEntry | null> {
        return this.entries.find((entry) => entry.id === id) ?? null;
    }

    async list(filters: GenerationHistoryListFilters): Promise<GenerationHistoryEntry[]> {
        return this.entries
            .filter((entry) => {
                if (filters.userId && entry.request.userId !== filters.userId) {
                    return false;
                }

                if (filters.sessionId && entry.request.sessionId !== filters.sessionId) {
                    return false;
                }

                if (filters.subscriptionPlan && entry.request.subscriptionPlan !== filters.subscriptionPlan) {
                    return false;
                }

                return true;
            })
            .slice((filters.page - 1) * filters.limit, filters.page * filters.limit);
    }

    async count(filters: Omit<GenerationHistoryListFilters, 'limit' | 'page'>): Promise<number> {
        return this.entries.filter((entry) => {
            if (filters.userId && entry.request.userId !== filters.userId) {
                return false;
            }

            if (filters.sessionId && entry.request.sessionId !== filters.sessionId) {
                return false;
            }

            if (filters.subscriptionPlan && entry.request.subscriptionPlan !== filters.subscriptionPlan) {
                return false;
            }

            return true;
        }).length;
    }
}
