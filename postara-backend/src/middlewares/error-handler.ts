import { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
    next(
        new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, {
            code: 'ROUTE_NOT_FOUND',
            statusCode: 404
        })
    );
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof AppError) {
        if (error.statusCode >= 500) {
            console.error(`[AppError:${error.code}]`, {
                message: error.message,
                details: error.details
            });
        }

        const errorPayload: Record<string, unknown> = {
            code: error.code,
            message: error.message
        };

        if (error.publicDetails) {
            errorPayload.details = error.publicDetails;
        }

        res.status(error.statusCode).json({
            status: 'error',
            error: errorPayload
        });
        return;
    }

    console.error('[Erro Não Tratado]:', error);

    res.status(500).json({
        status: 'error',
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Ocorreu um erro interno no servidor.'
        }
    });
};
