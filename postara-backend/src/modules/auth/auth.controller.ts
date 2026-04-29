import { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';
import { isSubscriptionPlan } from '../ai/ai.generation';
import { AuthService } from './auth.service';
import { LoginUserInput, RegisterUserInput } from './auth.types';

const parseOptionalString = (fieldName: string, value: unknown): string | undefined => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    if (typeof value !== 'string') {
        throw new AppError(`O campo ${fieldName} precisa ser uma string.`, {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const trimmedValue = value.trim();
    return trimmedValue || undefined;
};

const parseRequiredString = (fieldName: string, value: unknown): string => {
    const parsedValue = parseOptionalString(fieldName, value);

    if (!parsedValue) {
        throw new AppError(`O campo ${fieldName} é obrigatório.`, {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    return parsedValue;
};

const parseRegisterInput = (body: unknown): RegisterUserInput => {
    if (!body || typeof body !== 'object') {
        throw new AppError('O corpo da requisição precisa ser um objeto JSON válido.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const payload = body as Record<string, unknown>;

    return {
        name: parseOptionalString('name', payload.name),
        email: parseRequiredString('email', payload.email),
        password: parseRequiredString('password', payload.password)
    };
};

const parseLoginInput = (body: unknown): LoginUserInput => {
    if (!body || typeof body !== 'object') {
        throw new AppError('O corpo da requisição precisa ser um objeto JSON válido.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const payload = body as Record<string, unknown>;

    return {
        email: parseRequiredString('email', payload.email),
        password: parseRequiredString('password', payload.password)
    };
};

const parseSubscriptionPlanUpdate = (body: unknown) => {
    if (!body || typeof body !== 'object') {
        throw new AppError('O corpo da requisição precisa ser um objeto JSON válido.', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    const payload = body as Record<string, unknown>;
    const subscriptionPlan = parseRequiredString('subscriptionPlan', payload.subscriptionPlan);

    if (!isSubscriptionPlan(subscriptionPlan)) {
        throw new AppError('O campo subscriptionPlan precisa ser "free" ou "premium".', {
            code: 'BAD_REQUEST',
            statusCode: 400
        });
    }

    return subscriptionPlan;
};

export const createRegisterHandler = (authService: AuthService): RequestHandler => {
    return async (req, res, next) => {
        try {
            const result = await authService.register(parseRegisterInput(req.body));

            res.status(201).json({
                status: 'success',
                data: result
            });
        } catch (error) {
            next(error);
        }
    };
};

export const createLoginHandler = (authService: AuthService): RequestHandler => {
    return async (req, res, next) => {
        try {
            const result = await authService.login(parseLoginInput(req.body));

            res.status(200).json({
                status: 'success',
                data: result
            });
        } catch (error) {
            next(error);
        }
    };
};

export const createLogoutHandler = (authService: AuthService): RequestHandler => {
    return async (req, res, next) => {
        try {
            if (!req.auth?.token) {
                throw new AppError('Sessão autenticada não encontrada.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            await authService.logout(req.auth.token);

            res.status(200).json({
                status: 'success',
                data: {
                    loggedOut: true
                }
            });
        } catch (error) {
            next(error);
        }
    };
};

export const createGetCurrentUserHandler = (): RequestHandler => {
    return async (req, res, next) => {
        try {
            if (!req.auth?.user) {
                throw new AppError('Usuário autenticado não encontrado.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            res.status(200).json({
                status: 'success',
                data: req.auth.user
            });
        } catch (error) {
            next(error);
        }
    };
};

export const createUpdateMySubscriptionHandler = (authService: AuthService): RequestHandler => {
    return async (req, res, next) => {
        try {
            if (!req.auth?.user) {
                throw new AppError('Usuário autenticado não encontrado.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            const subscriptionPlan = parseSubscriptionPlanUpdate(req.body);
            const updatedUser = await authService.updateSubscriptionPlan(req.auth.user.id, subscriptionPlan);

            req.auth.user = updatedUser;

            res.status(200).json({
                status: 'success',
                data: updatedUser,
                meta: {
                    developmentOnly: true
                }
            });
        } catch (error) {
            next(error);
        }
    };
};
