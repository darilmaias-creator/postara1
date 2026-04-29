import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { AuthSession, AuthUser } from './auth.types';

type UserRow = {
    id: string;
    name: string | null;
    email: string;
    subscription_plan: 'free' | 'premium';
    created_at: string;
    updated_at: string;
    password_hash: string;
    password_salt: string;
};

type SessionRow = {
    session_id: string;
    user_id: string;
    token_hash: string;
    created_at: string;
    expires_at: string;
    last_used_at: string;
    revoked_at: string | null;
    id: string;
    name: string | null;
    email: string;
    subscription_plan: 'free' | 'premium';
    user_created_at: string;
    user_updated_at: string;
};

export interface CreateUserRecordInput {
    name?: string;
    email: string;
    passwordHash: string;
    passwordSalt: string;
    subscriptionPlan: 'free' | 'premium';
}

export interface CreateSessionRecordInput {
    userId: string;
    tokenHash: string;
    expiresAt: string;
}

export interface AuthSessionRecord {
    session: AuthSession;
    user: AuthUser;
    passwordHash: string;
    passwordSalt: string;
}

const mapUserRowToUser = (row: Pick<UserRow, 'id' | 'name' | 'email' | 'subscription_plan' | 'created_at' | 'updated_at'>): AuthUser => ({
    id: row.id,
    name: row.name ?? undefined,
    email: row.email,
    subscriptionPlan: row.subscription_plan,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

export class SqliteAuthRepository {
    constructor(private readonly database: DatabaseSync) {
        this.initialize();
    }

    private initialize(): void {
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                subscription_plan TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_used_at TEXT NOT NULL,
                revoked_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash);
        `);
    }

    async createUser(input: CreateUserRecordInput): Promise<AuthUser> {
        const now = new Date().toISOString();
        const userId = randomUUID();
        const statement = this.database.prepare(`
            INSERT INTO users (
                id,
                name,
                email,
                password_hash,
                password_salt,
                subscription_plan,
                created_at,
                updated_at
            ) VALUES (
                :id,
                :name,
                :email,
                :passwordHash,
                :passwordSalt,
                :subscriptionPlan,
                :createdAt,
                :updatedAt
            );
        `);

        statement.run({
            id: userId,
            name: input.name ?? null,
            email: input.email,
            passwordHash: input.passwordHash,
            passwordSalt: input.passwordSalt,
            subscriptionPlan: input.subscriptionPlan,
            createdAt: now,
            updatedAt: now
        });

        return {
            id: userId,
            name: input.name,
            email: input.email,
            subscriptionPlan: input.subscriptionPlan,
            createdAt: now,
            updatedAt: now
        };
    }

    async findUserByEmail(email: string): Promise<(AuthUser & { passwordHash: string; passwordSalt: string }) | null> {
        const statement = this.database.prepare(`
            SELECT id, name, email, subscription_plan, created_at, updated_at, password_hash, password_salt
            FROM users
            WHERE email = :email
            LIMIT 1;
        `);

        const row = statement.get({ email }) as UserRow | undefined;

        if (!row) {
            return null;
        }

        return {
            ...mapUserRowToUser(row),
            passwordHash: row.password_hash,
            passwordSalt: row.password_salt
        };
    }

    async findUserById(id: string): Promise<AuthUser | null> {
        const statement = this.database.prepare(`
            SELECT id, name, email, subscription_plan, created_at, updated_at
            FROM users
            WHERE id = :id
            LIMIT 1;
        `);

        const row = statement.get({ id }) as UserRow | undefined;

        return row ? mapUserRowToUser(row) : null;
    }

    async updateUserSubscriptionPlan(userId: string, subscriptionPlan: 'free' | 'premium'): Promise<AuthUser | null> {
        const updatedAt = new Date().toISOString();

        const updateStatement = this.database.prepare(`
            UPDATE users
            SET subscription_plan = :subscriptionPlan,
                updated_at = :updatedAt
            WHERE id = :userId;
        `);

        const result = updateStatement.run({
            userId,
            subscriptionPlan,
            updatedAt
        });

        if (result.changes === 0) {
            return null;
        }

        return this.findUserById(userId);
    }

    async createSession(input: CreateSessionRecordInput): Promise<AuthSession> {
        const sessionId = randomUUID();
        const createdAt = new Date().toISOString();
        const statement = this.database.prepare(`
            INSERT INTO auth_sessions (
                id,
                user_id,
                token_hash,
                created_at,
                expires_at,
                last_used_at
            ) VALUES (
                :id,
                :userId,
                :tokenHash,
                :createdAt,
                :expiresAt,
                :lastUsedAt
            );
        `);

        statement.run({
            id: sessionId,
            userId: input.userId,
            tokenHash: input.tokenHash,
            createdAt,
            expiresAt: input.expiresAt,
            lastUsedAt: createdAt
        });

        return {
            id: sessionId,
            userId: input.userId,
            tokenHash: input.tokenHash,
            createdAt,
            expiresAt: input.expiresAt,
            lastUsedAt: createdAt
        };
    }

    async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
        const statement = this.database.prepare(`
            SELECT
                s.id as session_id,
                s.user_id,
                s.token_hash,
                s.created_at,
                s.expires_at,
                s.last_used_at,
                s.revoked_at,
                u.id,
                u.name,
                u.email,
                u.subscription_plan,
                u.created_at as user_created_at,
                u.updated_at as user_updated_at,
                u.password_hash,
                u.password_salt
            FROM auth_sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = :tokenHash
              AND s.revoked_at IS NULL
            LIMIT 1;
        `);

        const row = statement.get({ tokenHash }) as (SessionRow & { password_hash: string; password_salt: string }) | undefined;

        if (!row) {
            return null;
        }

        return {
            session: {
                id: row.session_id,
                userId: row.user_id,
                tokenHash: row.token_hash,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                lastUsedAt: row.last_used_at
            },
            user: {
                id: row.id,
                name: row.name ?? undefined,
                email: row.email,
                subscriptionPlan: row.subscription_plan,
                createdAt: row.user_created_at,
                updatedAt: row.user_updated_at
            },
            passwordHash: row.password_hash,
            passwordSalt: row.password_salt
        };
    }

    async touchSession(sessionId: string): Promise<void> {
        const statement = this.database.prepare(`
            UPDATE auth_sessions
            SET last_used_at = :lastUsedAt
            WHERE id = :sessionId;
        `);

        statement.run({
            sessionId,
            lastUsedAt: new Date().toISOString()
        });
    }

    async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
        const statement = this.database.prepare(`
            UPDATE auth_sessions
            SET revoked_at = :revokedAt
            WHERE token_hash = :tokenHash;
        `);

        statement.run({
            tokenHash,
            revokedAt: new Date().toISOString()
        });
    }
}
