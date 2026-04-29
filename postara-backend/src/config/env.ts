import dotenv from 'dotenv';
import { AppError } from '../errors/app-error';

dotenv.config();

type AiFallbackMode = 'disabled' | 'template';

const DEFAULT_GEMINI_PRIMARY_MODEL = 'gemini-2.5-flash';
const DEFAULT_GEMINI_BACKUP_MODEL = 'gemini-2.5-flash-lite';

const parsePort = (rawPort: string | undefined): number => {
    if (!rawPort) {
        return 3333;
    }

    const parsedPort = Number(rawPort);

    if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
        throw new AppError('A variável PORT precisa ser um número inteiro positivo.', {
            code: 'INVALID_CONFIGURATION',
            statusCode: 500
        });
    }

    return parsedPort;
};

const readRequiredEnv = (key: 'GEMINI_API_KEY'): string => {
    const value = process.env[key]?.trim();

    if (!value || value === 'COLE_AQUI_A_SUA_CHAVE' || value === 'COLE_AQUI_A_SUA_NOVA_CHAVE_GERADA') {
        throw new AppError(`A variável ${key} precisa ser configurada com um valor válido no arquivo .env.`, {
            code: 'INVALID_CONFIGURATION',
            statusCode: 500
        });
    }

    return value;
};

const parseAllowedOrigins = (rawOrigins: string | undefined): true | string[] => {
    if (!rawOrigins || rawOrigins.trim() === '*' || rawOrigins.trim() === '') {
        return true;
    }

    return rawOrigins
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
};

const parseAiFallbackMode = (rawMode: string | undefined): AiFallbackMode => {
    const normalizedMode = rawMode?.trim().toLowerCase();

    if (!normalizedMode || normalizedMode === 'disabled') {
        return 'disabled';
    }

    if (normalizedMode === 'template') {
        return 'template';
    }

    throw new AppError('A variável AI_FALLBACK_MODE deve ser "disabled" ou "template".', {
        code: 'INVALID_CONFIGURATION',
        statusCode: 500
    });
};

const parseBoolean = (rawValue: string | undefined, defaultValue: boolean): boolean => {
    if (!rawValue) {
        return defaultValue;
    }

    const normalizedValue = rawValue.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalizedValue)) {
        return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalizedValue)) {
        return false;
    }

    throw new AppError(`Valor booleano inválido: ${rawValue}`, {
        code: 'INVALID_CONFIGURATION',
        statusCode: 500
    });
};

const parsePositiveInteger = (rawValue: string | undefined, defaultValue: number, fieldName: string): number => {
    if (!rawValue) {
        return defaultValue;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        throw new AppError(`A variável ${fieldName} precisa ser um inteiro positivo.`, {
            code: 'INVALID_CONFIGURATION',
            statusCode: 500
        });
    }

    return parsedValue;
};

const parseGeminiPrimaryModel = (): string => {
    const explicitPrimaryModel = process.env.GEMINI_PRIMARY_MODEL?.trim();
    const legacyPrimaryModel = process.env.GEMINI_MODEL?.trim();

    return explicitPrimaryModel || legacyPrimaryModel || DEFAULT_GEMINI_PRIMARY_MODEL;
};

const parseGeminiBackupModel = (): string | null => {
    const rawBackupModel = process.env.GEMINI_BACKUP_MODEL?.trim();

    if (rawBackupModel?.toLowerCase() === 'disabled') {
        return null;
    }

    if (rawBackupModel) {
        return rawBackupModel;
    }

    return DEFAULT_GEMINI_BACKUP_MODEL;
};

// Centralizamos a leitura do ambiente para evitar validações espalhadas pelo projeto.
export const env = Object.freeze({
    port: parsePort(process.env.PORT),
    geminiApiKey: readRequiredEnv('GEMINI_API_KEY'),
    geminiPrimaryModel: parseGeminiPrimaryModel(),
    geminiBackupModel: parseGeminiBackupModel(),
    allowedOrigins: parseAllowedOrigins(process.env.CORS_ORIGIN),
    aiFallbackMode: parseAiFallbackMode(process.env.AI_FALLBACK_MODE),
    historyDatabasePath: process.env.HISTORY_DB_PATH?.trim() || './data/postara.sqlite',
    authSessionTtlDays: parsePositiveInteger(process.env.AUTH_SESSION_TTL_DAYS, 30, 'AUTH_SESSION_TTL_DAYS'),
    enableDevSubscriptionManagement: parseBoolean(process.env.ENABLE_DEV_SUBSCRIPTION_MANAGEMENT, true)
});
