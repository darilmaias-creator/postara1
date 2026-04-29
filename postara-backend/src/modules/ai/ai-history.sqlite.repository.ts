import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';
import { AppError } from '../../errors/app-error';
import { GenerationHistoryRepository } from './ai-history.repository';
import {
    CreateGenerationHistoryEntryInput,
    GenerationHistoryEntry,
    GenerationHistoryListFilters
} from './ai-history.types';

type GenerationHistoryRow = {
    id: string;
    created_at: string;
    request_json: string;
    response_json: string;
};

export class SqliteGenerationHistoryRepository implements GenerationHistoryRepository {
    constructor(private readonly database: DatabaseSync) {
        this.initialize();
    }

    private initialize(): void {
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS generation_history (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                user_id TEXT,
                session_id TEXT,
                subscription_plan TEXT NOT NULL,
                requested_generation_mode TEXT,
                applied_generation_mode TEXT NOT NULL,
                mode_adjusted INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                product_features TEXT,
                target_audience TEXT,
                tone TEXT,
                response_source TEXT NOT NULL,
                response_provider TEXT NOT NULL,
                response_model TEXT NOT NULL,
                fallback_used INTEGER NOT NULL,
                request_json TEXT NOT NULL,
                response_json TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_generation_history_created_at
                ON generation_history(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_generation_history_user_id
                ON generation_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_generation_history_session_id
                ON generation_history(session_id);
            CREATE INDEX IF NOT EXISTS idx_generation_history_subscription_plan
                ON generation_history(subscription_plan);
        `);
    }

    private mapRowToEntry(row: GenerationHistoryRow): GenerationHistoryEntry {
        try {
            return {
                id: row.id,
                createdAt: row.created_at,
                request: JSON.parse(row.request_json),
                response: JSON.parse(row.response_json)
            };
        } catch {
            throw new AppError('Falha ao ler um item do histórico persistido.', {
                code: 'INVALID_CONFIGURATION',
                statusCode: 500
            });
        }
    }

    private buildWhereClause(filters: Omit<GenerationHistoryListFilters, 'limit' | 'page'>): {
        clause: string;
        params: Record<string, string>;
    } {
        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.userId) {
            conditions.push('user_id = :userId');
            params.userId = filters.userId;
        }

        if (filters.sessionId) {
            conditions.push('session_id = :sessionId');
            params.sessionId = filters.sessionId;
        }

        if (filters.subscriptionPlan) {
            conditions.push('subscription_plan = :subscriptionPlan');
            params.subscriptionPlan = filters.subscriptionPlan;
        }

        return {
            clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
            params
        };
    }

    async create(input: CreateGenerationHistoryEntryInput): Promise<GenerationHistoryEntry> {
        const entry: GenerationHistoryEntry = {
            id: randomUUID(),
            createdAt: new Date().toISOString(),
            request: input.request,
            response: input.response
        };

        const insertStatement = this.database.prepare(`
            INSERT INTO generation_history (
                id,
                created_at,
                user_id,
                session_id,
                subscription_plan,
                requested_generation_mode,
                applied_generation_mode,
                mode_adjusted,
                product_name,
                product_features,
                target_audience,
                tone,
                response_source,
                response_provider,
                response_model,
                fallback_used,
                request_json,
                response_json
            ) VALUES (
                :id,
                :createdAt,
                :userId,
                :sessionId,
                :subscriptionPlan,
                :requestedGenerationMode,
                :appliedGenerationMode,
                :modeAdjusted,
                :productName,
                :productFeatures,
                :targetAudience,
                :tone,
                :responseSource,
                :responseProvider,
                :responseModel,
                :fallbackUsed,
                :requestJson,
                :responseJson
            );
        `);

        insertStatement.run({
            id: entry.id,
            createdAt: entry.createdAt,
            userId: entry.request.userId ?? null,
            sessionId: entry.request.sessionId ?? null,
            subscriptionPlan: entry.request.subscriptionPlan,
            requestedGenerationMode: entry.request.requestedGenerationMode ?? null,
            appliedGenerationMode: entry.request.appliedGenerationMode,
            modeAdjusted: entry.request.modeAdjusted ? 1 : 0,
            productName: entry.request.productName,
            productFeatures: entry.request.productFeatures ?? null,
            targetAudience: entry.request.targetAudience ?? null,
            tone: entry.request.tone ?? null,
            responseSource: entry.response.source,
            responseProvider: entry.response.provider,
            responseModel: entry.response.model,
            fallbackUsed: entry.response.fallbackUsed ? 1 : 0,
            requestJson: JSON.stringify(entry.request),
            responseJson: JSON.stringify(entry.response)
        });

        return entry;
    }

    async findById(id: string): Promise<GenerationHistoryEntry | null> {
        const statement = this.database.prepare(`
            SELECT id, created_at, request_json, response_json
            FROM generation_history
            WHERE id = :id
            LIMIT 1;
        `);

        const row = statement.get({ id }) as GenerationHistoryRow | undefined;

        return row ? this.mapRowToEntry(row) : null;
    }

    async list(filters: GenerationHistoryListFilters): Promise<GenerationHistoryEntry[]> {
        const { clause, params } = this.buildWhereClause(filters);
        const offset = (filters.page - 1) * filters.limit;

        const statement = this.database.prepare(`
            SELECT id, created_at, request_json, response_json
            FROM generation_history
            ${clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset;
        `);

        const rows = statement.all({
            ...params,
            limit: filters.limit,
            offset
        }) as GenerationHistoryRow[];

        return rows.map((row) => this.mapRowToEntry(row));
    }

    async count(filters: Omit<GenerationHistoryListFilters, 'limit' | 'page'>): Promise<number> {
        const { clause, params } = this.buildWhereClause(filters);
        const statement = this.database.prepare(`
            SELECT COUNT(*) as total
            FROM generation_history
            ${clause};
        `);

        const row = statement.get(params) as { total: number } | undefined;
        return row?.total ?? 0;
    }
}
