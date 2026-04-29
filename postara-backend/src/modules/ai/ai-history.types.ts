import { GenerationMode, SubscriptionPlan } from './ai.generation';
import { GenerateDescriptionResult } from './ai.types';

export interface GenerationHistoryRequestSnapshot {
    productName: string;
    productFeatures?: string;
    targetAudience?: string;
    tone?: string;
    userId?: string;
    sessionId?: string;
    subscriptionPlan: SubscriptionPlan;
    requestedGenerationMode?: GenerationMode;
    appliedGenerationMode: GenerationMode;
    modeAdjusted: boolean;
}

export interface GenerationHistoryEntry {
    id: string;
    createdAt: string;
    request: GenerationHistoryRequestSnapshot;
    response: GenerateDescriptionResult;
}

export interface CreateGenerationHistoryEntryInput {
    request: GenerationHistoryRequestSnapshot;
    response: GenerateDescriptionResult;
}

export interface GenerationHistoryListFilters {
    userId?: string;
    sessionId?: string;
    subscriptionPlan?: SubscriptionPlan;
    page: number;
    limit: number;
}

export interface GenerationHistoryListResult {
    entries: GenerationHistoryEntry[];
    total: number;
    page: number;
    limit: number;
    hasNextPage: boolean;
}
