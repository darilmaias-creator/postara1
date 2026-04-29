import { AppError } from '../../errors/app-error';
import { env } from '../../config/env';
import { hashPassword, verifyPassword, createSessionToken, hashSessionToken, normalizeEmail } from './auth.crypto';
import { SqliteAuthRepository } from './auth.repository';
import { AuthResult, AuthUser, LoginUserInput, RegisterUserInput } from './auth.types';
import { SubscriptionPlan } from '../ai/ai.generation';

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createSessionExpiryDate = (): string => {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.authSessionTtlDays);
    return expiresAt.toISOString();
};

const validatePassword = (password: string): void => {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new AppError(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`, {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }
};

const validateEmail = (email: string): void => {
    if (!EMAIL_REGEX.test(email)) {
        throw new AppError('O e-mail informado é inválido.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }
};

const validateName = (name: string | undefined): string | undefined => {
    const trimmedName = name?.trim();

    if (!trimmedName) {
        return undefined;
    }

    if (trimmedName.length < 2) {
        throw new AppError('O nome precisa ter pelo menos 2 caracteres.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    return trimmedName;
};

export class AuthService {
    constructor(private readonly repository: SqliteAuthRepository) {}

    private async createAuthResult(user: AuthUser): Promise<AuthResult> {
        const token = createSessionToken();
        const tokenHash = hashSessionToken(token);
        const expiresAt = createSessionExpiryDate();

        await this.repository.createSession({
            userId: user.id,
            tokenHash,
            expiresAt
        });

        return {
            token,
            tokenType: 'Bearer',
            expiresAt,
            user
        };
    }

    async register(input: RegisterUserInput): Promise<AuthResult> {
        const email = normalizeEmail(input.email);
        const name = validateName(input.name);
        validateEmail(email);
        validatePassword(input.password);

        const existingUser = await this.repository.findUserByEmail(email);

        if (existingUser) {
            throw new AppError('Já existe uma conta cadastrada com esse e-mail.', {
                code: 'CONFLICT',
                statusCode: 409
            });
        }

        const { salt, passwordHash } = hashPassword(input.password);
        const user = await this.repository.createUser({
            name,
            email,
            passwordHash,
            passwordSalt: salt,
            subscriptionPlan: 'free'
        });

        return this.createAuthResult(user);
    }

    async login(input: LoginUserInput): Promise<AuthResult> {
        const email = normalizeEmail(input.email);
        validateEmail(email);
        validatePassword(input.password);

        const userRecord = await this.repository.findUserByEmail(email);

        if (!userRecord || !verifyPassword(input.password, userRecord.passwordSalt, userRecord.passwordHash)) {
            throw new AppError('E-mail ou senha inválidos.', {
                code: 'UNAUTHORIZED',
                statusCode: 401
            });
        }

        return this.createAuthResult(userRecord);
    }

    async authenticate(token: string): Promise<AuthUser> {
        const sessionRecord = await this.repository.findSessionByTokenHash(hashSessionToken(token));

        if (!sessionRecord) {
            throw new AppError('Sessão inválida ou inexistente.', {
                code: 'UNAUTHORIZED',
                statusCode: 401
            });
        }

        if (new Date(sessionRecord.session.expiresAt).getTime() <= Date.now()) {
            await this.repository.revokeSessionByTokenHash(sessionRecord.session.tokenHash);
            throw new AppError('Sua sessão expirou. Faça login novamente.', {
                code: 'UNAUTHORIZED',
                statusCode: 401
            });
        }

        await this.repository.touchSession(sessionRecord.session.id);

        return sessionRecord.user;
    }

    async logout(token: string): Promise<void> {
        await this.repository.revokeSessionByTokenHash(hashSessionToken(token));
    }

    async updateSubscriptionPlan(userId: string, subscriptionPlan: SubscriptionPlan): Promise<AuthUser> {
        if (!env.enableDevSubscriptionManagement) {
            throw new AppError('A atualização manual de assinatura está desabilitada neste ambiente.', {
                code: 'FORBIDDEN',
                statusCode: 403
            });
        }

        const updatedUser = await this.repository.updateUserSubscriptionPlan(userId, subscriptionPlan);

        if (!updatedUser) {
            throw new AppError('Usuário não encontrado para atualização de assinatura.', {
                code: 'NOT_FOUND',
                statusCode: 404
            });
        }

        return updatedUser;
    }
}
