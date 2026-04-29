export type AppErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'CONFLICT'
    | 'NOT_FOUND'
    | 'INVALID_CONFIGURATION'
    | 'ROUTE_NOT_FOUND'
    | 'EMPTY_AI_RESPONSE'
    | 'INVALID_AI_RESPONSE'
    | 'AI_PROVIDER_ERROR'
    | 'AI_PROVIDER_UNAVAILABLE';

type AppErrorOptions = {
    code: AppErrorCode;
    statusCode: number;
    details?: unknown;
    publicDetails?: unknown;
};

export class AppError extends Error {
    public readonly code: AppErrorCode;
    public readonly statusCode: number;
    public readonly details?: unknown;
    public readonly publicDetails?: unknown;

    constructor(message: string, options: AppErrorOptions) {
        super(message);
        this.name = 'AppError';
        this.code = options.code;
        this.statusCode = options.statusCode;
        this.details = options.details;
        this.publicDetails = options.publicDetails;
    }
}
