import { RequestHandler } from 'express';
import { AppError } from '../../errors/app-error';
import { AuthService } from './auth.service';

const readBearerToken = (authorizationHeader: string | undefined): string | null => {
    if (!authorizationHeader) {
        return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return null;
    }

    return token.trim();
};

export const createOptionalAuthMiddleware = (authService: AuthService): RequestHandler => {
    return async (req, _res, next) => {
        try {
            const token = readBearerToken(req.header('authorization'));

            if (!token) {
                next();
                return;
            }

            const user = await authService.authenticate(token);

            req.auth = {
                token,
                user
            };

            next();
        } catch (error) {
            next(error);
        }
    };
};

export const createRequireAuthMiddleware = (authService: AuthService): RequestHandler => {
    return async (req, _res, next) => {
        try {
            const token = readBearerToken(req.header('authorization'));

            if (!token) {
                throw new AppError('Autenticação obrigatória para acessar este recurso.', {
                    code: 'UNAUTHORIZED',
                    statusCode: 401
                });
            }

            const user = await authService.authenticate(token);

            req.auth = {
                token,
                user
            };

            next();
        } catch (error) {
            next(error);
        }
    };
};
