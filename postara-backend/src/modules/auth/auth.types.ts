import { SubscriptionPlan } from '../ai/ai.generation';

export interface AuthUser {
    id: string;
    name?: string;
    email: string;
    subscriptionPlan: SubscriptionPlan;
    createdAt: string;
    updatedAt: string;
}

export interface AuthSession {
    id: string;
    userId: string;
    tokenHash: string;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string;
}

export interface AuthenticatedSession {
    session: AuthSession;
    user: AuthUser;
}

export interface RegisterUserInput {
    name?: string;
    email: string;
    password: string;
}

export interface LoginUserInput {
    email: string;
    password: string;
}

export interface AuthResult {
    token: string;
    tokenType: 'Bearer';
    expiresAt: string;
    user: AuthUser;
}
